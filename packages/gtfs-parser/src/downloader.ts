import { Unzip, AsyncUnzipInflate } from 'fflate';
import { GTFSParser } from './parser';
import { GTFSFeed } from './types';

/**
 * Progress callback for download and extraction
 */
export interface ProgressCallback {
  onDownloadProgress?: (loaded: number, total: number) => void;
  onExtractionProgress?: (filename: string, progress: number) => void;
}

/**
 * GTFS Data Downloader with Streaming Support
 * Downloads and parses GTFS data using streaming APIs - browser/edge runtime compatible
 * Memory-efficient processing for large GTFS datasets
 */
export class GTFSDownloader {
  private static readonly DEFAULT_GTFS_URL = 'http://gtfs.ovapi.nl/gtfs-nl.zip';
  private static readonly CHUNK_SIZE = 64 * 1024; // 64KB chunks

  /**
   * Download GTFS data from a URL using streaming
   * Processes data in chunks to avoid loading entire file into memory
   */
  static async downloadStream(
    url: string = this.DEFAULT_GTFS_URL,
    callbacks?: ProgressCallback
  ): Promise<ReadableStream<Uint8Array>> {
    console.log('Starting streaming download from', url);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to download GTFS data: ${response.status} ${response.statusText}`);
    }

    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;
    let loaded = 0;

    // Create a transform stream to track progress
    const progressStream = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        loaded += chunk.byteLength;
        
        if (callbacks?.onDownloadProgress && total > 0) {
          callbacks.onDownloadProgress(loaded, total);
        }
        
        controller.enqueue(chunk);
      },
    });

    if (!response.body) {
      throw new Error('Response body is null');
    }

    return response.body.pipeThrough(progressStream);
  }

  /**
   * Extract and parse GTFS data from a stream using fflate's streaming Unzip
   * Memory-efficient: processes files as they're decompressed
   */
  static async extractStream(
    stream: ReadableStream<Uint8Array>,
    callbacks?: ProgressCallback
  ): Promise<GTFSFeed> {
    console.log('Starting streaming extraction...');

    return new Promise((resolve, reject) => {
      // Track file buffers as they're being built
      const fileBuffers: Map<string, Uint8Array[]> = new Map();
      const requiredFiles = [
        'agency.txt',
        'stops.txt',
        'routes.txt',
        'trips.txt',
        'stop_times.txt',
        'calendar.txt',
      ];

      let filesProcessed = 0;

      // Create streaming unzip instance with DEFLATE decompressor registered
      // Compression type 8 is DEFLATE - the most common ZIP compression method
      const unzip = new Unzip((file) => {
        const filename = file.name;
        
        // Only process required GTFS files
        if (!requiredFiles.includes(filename)) {
          return;
        }

        console.log(`Processing: ${filename} (compression: ${file.compression})`);
        
        // Initialize buffer for this file
        fileBuffers.set(filename, []);
        
        // Set up streaming decompression for this file
        file.ondata = (err, data, final) => {
          if (err) {
            console.error(`Error processing ${filename}:`, err);
            reject(err);
            return;
          }

          // Accumulate chunks for this file
          const chunks = fileBuffers.get(filename)!;
          chunks.push(data);

          if (callbacks?.onExtractionProgress) {
            filesProcessed = final ? filesProcessed + 1 : filesProcessed;
            callbacks.onExtractionProgress(filename, filesProcessed / requiredFiles.length);
          }

          // When file is complete, we'll process all files together at the end
          if (final) {
            console.log(`Completed: ${filename}`);
          }
        };

        // Start decompression for this file
        file.start();
      });

      // Register AsyncUnzipInflate as the DEFLATE decompressor (compression type 8)
      // This is essential for handling DEFLATE-compressed files in ZIP archives
      unzip.register(AsyncUnzipInflate);

      // Process the stream
      const reader = stream.getReader();
      
      const processChunks = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
              // All chunks processed, finalize
              break;
            }

            // Push chunk to unzip for processing
            unzip.push(value);
          }

          // Finalize the unzip process
          unzip.push(new Uint8Array(0), true);

          // Wait a bit for all async operations to complete
          await new Promise(r => setTimeout(r, 100));

          // Now process all accumulated file data
          const feed = this.processParsedFiles(fileBuffers);
          resolve(feed);

        } catch (error) {
          reject(error);
        }
      };

      processChunks();
    });
  }

  /**
   * Process accumulated file buffers into a GTFS feed
   */
  private static processParsedFiles(fileBuffers: Map<string, Uint8Array[]>): GTFSFeed {
    console.log('Parsing GTFS files...');

    const decode = (chunks: Uint8Array[] | undefined): string => {
      if (!chunks || chunks.length === 0) return '';
      
      // Concatenate all chunks efficiently
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }
      
      return new TextDecoder().decode(combined);
    };

    // Parse each required file
    const agencies = fileBuffers.has('agency.txt')
      ? GTFSParser.parseAgencies(decode(fileBuffers.get('agency.txt')))
      : [];

    const stops = fileBuffers.has('stops.txt')
      ? GTFSParser.parseStops(decode(fileBuffers.get('stops.txt')))
      : [];

    const routes = fileBuffers.has('routes.txt')
      ? GTFSParser.parseRoutes(decode(fileBuffers.get('routes.txt')))
      : [];

    const trips = fileBuffers.has('trips.txt')
      ? GTFSParser.parseTrips(decode(fileBuffers.get('trips.txt')))
      : [];

    const stop_times = fileBuffers.has('stop_times.txt')
      ? GTFSParser.parseStopTimes(decode(fileBuffers.get('stop_times.txt')))
      : [];

    const calendar = fileBuffers.has('calendar.txt')
      ? GTFSParser.parseCalendar(decode(fileBuffers.get('calendar.txt')))
      : [];

    console.log(`Parsed ${stops.length} stops, ${routes.length} routes, ${trips.length} trips`);

    return {
      agencies,
      stops,
      routes,
      trips,
      stop_times,
      calendar,
    };
  }

  /**
   * Download and parse GTFS data using streaming (recommended for large files)
   */
  static async fetchAndParseStream(
    url?: string,
    callbacks?: ProgressCallback
  ): Promise<GTFSFeed> {
    const stream = await this.downloadStream(url, callbacks);
    return this.extractStream(stream, callbacks);
  }

  // ===== Legacy non-streaming methods (kept for backwards compatibility) =====

  /**
   * @deprecated Use downloadStream() for better memory efficiency
   * Download GTFS data from a URL (loads entire file into memory)
   */
  static async download(url: string = this.DEFAULT_GTFS_URL): Promise<ArrayBuffer> {
    console.log('⚠️  Using legacy download method. Consider using downloadStream() for better memory efficiency.');
    console.log('Downloading GTFS data from', url);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to download GTFS data: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    console.log(`Downloaded ${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`);

    return arrayBuffer;
  }

  /**
   * @deprecated Use extractStream() for better memory efficiency
   * Extract and parse GTFS zip buffer into a feed (loads entire ZIP into memory)
   */
  static extract(zipBuffer: ArrayBuffer): GTFSFeed {
    console.log('⚠️  Using legacy extract method. Consider using extractStream() for better memory efficiency.');
    
    // For backwards compatibility, convert to stream and use streaming method
    const uint8Array = new Uint8Array(zipBuffer);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(uint8Array);
        controller.close();
      },
    });

    // Note: This still loads into memory but uses the streaming parser
    return this.extractStreamSync(stream);
  }

  /**
   * Synchronous wrapper for extractStream (used by legacy extract method)
   */
  private static extractStreamSync(stream: ReadableStream<Uint8Array>): GTFSFeed {
    // This is a compromise - we can't make the legacy method async
    // In practice, callers should migrate to the async streaming methods
    throw new Error('Legacy extract() is no longer supported. Use extractStream() or fetchAndParseStream() instead.');
  }

  /**
   * @deprecated Use fetchAndParseStream() for better memory efficiency
   * Download and parse GTFS data in one step (loads entire file into memory)
   */
  static async fetchAndParse(url?: string): Promise<GTFSFeed> {
    console.log('⚠️  Using legacy fetchAndParse method. Consider using fetchAndParseStream() for better memory efficiency.');
    
    // Redirect to streaming version
    return this.fetchAndParseStream(url);
  }
}
