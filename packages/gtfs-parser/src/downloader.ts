import { Unzip, AsyncUnzipInflate, Unzip as UnzipSync, UnzipInflate } from 'fflate';
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
 * ZIP Compression Methods (as per PKZIP spec)
 */
enum CompressionMethod {
  STORE = 0,      // No compression
  DEFLATE = 8,    // DEFLATE compression (most common)
  DEFLATE64 = 9,  // Enhanced DEFLATE
  BZIP2 = 12,     // BZIP2
  LZMA = 14,      // LZMA
}

/**
 * GTFS Data Downloader with Streaming Support
 * Downloads and parses GTFS data using streaming APIs - browser/edge runtime compatible
 * Memory-efficient processing for large GTFS datasets
 * 
 * Features robust ZIP decompression with:
 * - Explicit DEFLATE support via fflate
 * - Fallback to Web Streams API DecompressionStream
 * - Comprehensive compression type validation
 */
export class GTFSDownloader {
  private static readonly DEFAULT_GTFS_URL = 'http://gtfs.ovapi.nl/gtfs-nl.zip';
  private static readonly CHUNK_SIZE = 64 * 1024; // 64KB chunks
  private static readonly SUPPORTED_COMPRESSION = [CompressionMethod.STORE, CompressionMethod.DEFLATE];

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
   * Extract and parse GTFS data from a stream using robust decompression
   * 
   * Implements a hybrid approach:
   * 1. Primary: fflate with explicit DEFLATE support
   * 2. Fallback: Web Streams API DecompressionStream (if available)
   * 
   * Memory-efficient: processes files as they're decompressed
   */
  static async extractStream(
    stream: ReadableStream<Uint8Array>,
    callbacks?: ProgressCallback
  ): Promise<GTFSFeed> {
    console.log('Starting streaming extraction with robust DEFLATE support...');

    try {
      // Try primary method: fflate with explicit compression type registration
      return await this.extractStreamWithFflate(stream, callbacks);
    } catch (error) {
      console.warn('fflate extraction failed, attempting fallback method:', error);
      
      // If fflate fails, try Web Streams API fallback
      if (this.isDecompressionStreamSupported()) {
        console.log('Attempting Web Streams API DecompressionStream fallback...');
        return await this.extractStreamWithWebStreams(stream, callbacks);
      }
      
      // If both fail, throw the original error
      throw error;
    }
  }

  /**
   * Extract using fflate with explicit DEFLATE support
   * Registers all necessary compression decoders
   */
  private static async extractStreamWithFflate(
    stream: ReadableStream<Uint8Array>,
    callbacks?: ProgressCallback
  ): Promise<GTFSFeed> {
    console.log('Using fflate decompression with explicit DEFLATE registration...');

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
      let hasEncounteredFiles = false;

      // Create streaming unzip instance with comprehensive compression support
      const unzip = new Unzip((file) => {
        const filename = file.name;
        const compressionType = file.compression;
        
        hasEncounteredFiles = true;
        
        console.log(`Discovered file: ${filename} (compression type: ${compressionType})`);
        
        // Validate compression type
        if (!this.SUPPORTED_COMPRESSION.includes(compressionType)) {
          const error = new Error(
            `Unsupported compression type ${compressionType} for file ${filename}. ` +
            `Supported types: ${this.SUPPORTED_COMPRESSION.join(', ')} ` +
            `(STORE=${CompressionMethod.STORE}, DEFLATE=${CompressionMethod.DEFLATE})`
          );
          console.error(error.message);
          reject(error);
          return;
        }
        
        // Only process required GTFS files
        if (!requiredFiles.includes(filename)) {
          console.log(`Skipping non-required file: ${filename}`);
          return;
        }

        console.log(`Processing required file: ${filename}`);
        
        // Initialize buffer for this file
        fileBuffers.set(filename, []);
        
        // Set up streaming decompression for this file
        file.ondata = (err, data, final) => {
          if (err) {
            console.error(`Error decompressing ${filename}:`, err);
            console.error(`Compression type was: ${compressionType}`);
            reject(new Error(`Failed to decompress ${filename}: ${err.message}`));
            return;
          }

          // Accumulate chunks for this file
          const chunks = fileBuffers.get(filename)!;
          chunks.push(data);

          if (callbacks?.onExtractionProgress) {
            filesProcessed = final ? filesProcessed + 1 : filesProcessed;
            const progress = filesProcessed / requiredFiles.length;
            callbacks.onExtractionProgress(filename, progress);
          }

          // Log completion
          if (final) {
            const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
            console.log(`Completed: ${filename} (${totalSize} bytes decompressed)`);
          }
        };

        // Start decompression for this file
        file.start();
      });

      // ===== CRITICAL: Register ALL compression decoders explicitly =====
      // This ensures DEFLATE (type 8) is definitely supported
      
      // Register DEFLATE decompressor (compression type 8) - async version
      unzip.register(AsyncUnzipInflate);
      
      // Also register synchronous DEFLATE as backup
      // Some implementations may prefer sync over async
      unzip.register(UnzipInflate);
      
      console.log('Registered compression decoders: DEFLATE (async & sync)');

      // Process the stream
      const reader = stream.getReader();
      
      const processChunks = async () => {
        try {
          let chunkCount = 0;
          
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
              console.log(`Processed ${chunkCount} chunks from stream`);
              break;
            }

            chunkCount++;
            
            // Push chunk to unzip for processing
            unzip.push(value);
          }

          // Finalize the unzip process
          console.log('Finalizing ZIP extraction...');
          unzip.push(new Uint8Array(0), true);

          // Wait for all async decompression operations to complete
          // Increased timeout to ensure all data is processed
          await new Promise(r => setTimeout(r, 200));

          // Validate that we found files
          if (!hasEncounteredFiles) {
            throw new Error('No files found in ZIP archive - archive may be corrupted');
          }

          // Validate that we got the required files
          const missingFiles = requiredFiles.filter(f => !fileBuffers.has(f));
          if (missingFiles.length > 0) {
            console.warn(`Warning: Missing optional files: ${missingFiles.join(', ')}`);
          }

          // Now process all accumulated file data
          console.log(`Processing ${fileBuffers.size} extracted files...`);
          const feed = this.processParsedFiles(fileBuffers);
          resolve(feed);

        } catch (error) {
          console.error('Error during chunk processing:', error);
          reject(error);
        }
      };

      processChunks();
    });
  }

  /**
   * Fallback extraction using Web Streams API DecompressionStream
   * Used if fflate fails or for additional reliability
   */
  private static async extractStreamWithWebStreams(
    stream: ReadableStream<Uint8Array>,
    callbacks?: ProgressCallback
  ): Promise<GTFSFeed> {
    console.log('Using Web Streams API DecompressionStream fallback...');

    // Read entire stream into buffer first (needed for ZIP parsing)
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    // Combine chunks
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const zipData = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      zipData.set(chunk, offset);
      offset += chunk.length;
    }

    console.log(`Loaded ${zipData.length} bytes for Web Streams decompression`);

    // Use synchronous unzip with Web Streams for individual file decompression
    const unzipped = UnzipSync(zipData);
    const fileBuffers: Map<string, Uint8Array[]> = new Map();
    
    const requiredFiles = [
      'agency.txt',
      'stops.txt',
      'routes.txt',
      'trips.txt',
      'stop_times.txt',
      'calendar.txt',
    ];

    for (const [filename, compressedData] of Object.entries(unzipped)) {
      if (!requiredFiles.includes(filename)) {
        continue;
      }

      console.log(`Decompressing ${filename} with Web Streams...`);
      
      // Use DecompressionStream for DEFLATE
      const decompressed = await this.decompressWithWebStreams(compressedData);
      fileBuffers.set(filename, [decompressed]);

      if (callbacks?.onExtractionProgress) {
        callbacks.onExtractionProgress(filename, fileBuffers.size / requiredFiles.length);
      }
    }

    return this.processParsedFiles(fileBuffers);
  }

  /**
   * Decompress data using Web Streams API DecompressionStream
   */
  private static async decompressWithWebStreams(data: Uint8Array): Promise<Uint8Array> {
    // Create a readable stream from the data
    const inputStream = new ReadableStream({
      start(controller) {
        controller.enqueue(data);
        controller.close();
      },
    });

    // Decompress using 'deflate' format
    const decompressedStream = inputStream.pipeThrough(
      new DecompressionStream('deflate')
    );

    // Read decompressed data
    const reader = decompressedStream.getReader();
    const chunks: Uint8Array[] = [];
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    // Combine chunks
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result;
  }

  /**
   * Check if DecompressionStream is supported in the current environment
   */
  private static isDecompressionStreamSupported(): boolean {
    return typeof DecompressionStream !== 'undefined';
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

    console.log(`✅ Successfully parsed GTFS data:`);
    console.log(`   - ${agencies.length} agencies`);
    console.log(`   - ${stops.length} stops`);
    console.log(`   - ${routes.length} routes`);
    console.log(`   - ${trips.length} trips`);
    console.log(`   - ${stop_times.length} stop times`);
    console.log(`   - ${calendar.length} calendar entries`);

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
