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
 * GTFS Data Downloader with Multi-Library Fallback System
 * 
 * Downloads and parses GTFS data using streaming APIs - browser/edge runtime compatible
 * Memory-efficient processing for large GTFS datasets
 * 
 * Features a robust three-tier ZIP decompression fallback system:
 * 1. **Primary: fflate** - Fast, lightweight, streaming-capable
 * 2. **Secondary: @zip.js/zip.js** - Comprehensive compression support, handles edge cases
 * 3. **Tertiary: jszip** - Battle-tested, wide compatibility
 * 
 * This multi-library approach ensures robust handling of any ZIP compression scenario,
 * including DEFLATE, DEFLATE64, STORE, and other compression methods.
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
   * Extract and parse GTFS data from a stream using multi-library fallback
   * 
   * Implements a three-tier fallback approach:
   * 1. **fflate**: Fast, streaming-capable, good for standard DEFLATE
   * 2. **@zip.js/zip.js**: Robust compression support, handles complex ZIPs
   * 3. **jszip**: Battle-tested, maximum compatibility
   * 
   * Memory-efficient: processes files as they're decompressed (where possible)
   */
  static async extractStream(
    stream: ReadableStream<Uint8Array>,
    callbacks?: ProgressCallback
  ): Promise<GTFSFeed> {
    console.log('🔧 Starting ZIP extraction with multi-library fallback system...');

    // Read stream into buffer (needed for all ZIP libraries)
    const zipData = await this.streamToBuffer(stream);
    console.log(`📦 Loaded ${(zipData.length / 1024 / 1024).toFixed(2)} MB ZIP data`);

    const errors: Array<{library: string, error: Error}> = [];

    // ==================== TIER 1: fflate ====================
    try {
      console.log('📚 [Tier 1] Attempting extraction with fflate (fast & lightweight)...');
      const result = await this.extractWithFflate(zipData, callbacks);
      console.log('✅ [Tier 1] Successfully extracted with fflate!');
      return result;
    } catch (error) {
      const err = error as Error;
      console.warn(`⚠️  [Tier 1] fflate extraction failed: ${err.message}`);
      errors.push({library: 'fflate', error: err});
    }

    // ==================== TIER 2: @zip.js/zip.js ====================
    try {
      console.log('📚 [Tier 2] Attempting extraction with @zip.js/zip.js (robust compression support)...');
      const result = await this.extractWithZipJs(zipData, callbacks);
      console.log('✅ [Tier 2] Successfully extracted with @zip.js/zip.js!');
      return result;
    } catch (error) {
      const err = error as Error;
      console.warn(`⚠️  [Tier 2] @zip.js/zip.js extraction failed: ${err.message}`);
      errors.push({library: '@zip.js/zip.js', error: err});
    }

    // ==================== TIER 3: jszip ====================
    try {
      console.log('📚 [Tier 3] Attempting extraction with jszip (maximum compatibility)...');
      const result = await this.extractWithJSZip(zipData, callbacks);
      console.log('✅ [Tier 3] Successfully extracted with jszip!');
      return result;
    } catch (error) {
      const err = error as Error;
      console.warn(`⚠️  [Tier 3] jszip extraction failed: ${err.message}`);
      errors.push({library: 'jszip', error: err});
    }

    // ==================== ALL METHODS FAILED ====================
    console.error('❌ All ZIP extraction methods failed!');
    console.error('Error summary:');
    errors.forEach(({library, error}) => {
      console.error(`  - ${library}: ${error.message}`);
    });

    throw new Error(
      `Failed to extract ZIP with all available libraries (fflate, @zip.js/zip.js, jszip). ` +
      `Errors: ${errors.map(e => `${e.library}: ${e.error.message}`).join('; ')}`
    );
  }

  // ==================== TIER 1: fflate Implementation ====================
  
  /**
   * Extract using fflate - fast, lightweight, streaming-capable
   * Best for standard DEFLATE compressed ZIPs
   */
  private static async extractWithFflate(
    zipData: Uint8Array,
    callbacks?: ProgressCallback
  ): Promise<GTFSFeed> {
    console.log('  🔍 Using fflate with explicit DEFLATE registration...');

    return new Promise((resolve, reject) => {
      try {
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
          
          console.log(`    📄 File: ${filename} (compression: ${compressionType})`);
          
          // Validate compression type
          if (!this.SUPPORTED_COMPRESSION.includes(compressionType)) {
            const error = new Error(
              `Unsupported compression type ${compressionType} for file ${filename}. ` +
              `fflate supports: ${this.SUPPORTED_COMPRESSION.join(', ')}`
            );
            reject(error);
            return;
          }
          
          // Only process required GTFS files
          if (!requiredFiles.includes(filename)) {
            console.log(`    ⏭️  Skipping: ${filename}`);
            return;
          }

          console.log(`    ✓ Processing: ${filename}`);
          
          // Initialize buffer for this file
          fileBuffers.set(filename, []);
          
          // Set up streaming decompression for this file
          file.ondata = (err, data, final) => {
            if (err) {
              console.error(`    ❌ Error decompressing ${filename}:`, err);
              reject(new Error(`fflate failed to decompress ${filename}: ${err.message}`));
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

            if (final) {
              const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
              console.log(`    ✅ Completed: ${filename} (${(totalSize / 1024).toFixed(1)} KB)`);
            }
          };

          // Start decompression for this file
          file.start();
        });

        // Register DEFLATE decompressors
        unzip.register(AsyncUnzipInflate);
        unzip.register(UnzipInflate);
        
        console.log('  🔧 Registered: AsyncUnzipInflate, UnzipInflate');

        // Push data to unzip
        unzip.push(zipData, true);

        // Wait for async operations to complete
        setTimeout(() => {
          try {
            // Validate that we found files
            if (!hasEncounteredFiles) {
              throw new Error('No files found in ZIP archive');
            }

            // Check for required files
            const missingFiles = requiredFiles.filter(f => !fileBuffers.has(f));
            if (missingFiles.length > 0) {
              console.warn(`  ⚠️  Missing files: ${missingFiles.join(', ')}`);
            }

            // Process files and resolve
            const feed = this.processParsedFiles(fileBuffers);
            resolve(feed);
          } catch (error) {
            reject(error);
          }
        }, 200);

      } catch (error) {
        reject(error);
      }
    });
  }

  // ==================== TIER 2: @zip.js/zip.js Implementation ====================
  
  /**
   * Extract using @zip.js/zip.js - robust, handles complex compression
   * Excellent for DEFLATE, DEFLATE64, and other compression methods
   */
  private static async extractWithZipJs(
    zipData: Uint8Array,
    callbacks?: ProgressCallback
  ): Promise<GTFSFeed> {
    console.log('  🔍 Using @zip.js/zip.js for robust compression handling...');

    try {
      // Dynamically import @zip.js/zip.js
      const { ZipReader, BlobReader, BlobWriter, TextWriter } = await import('@zip.js/zip.js');

      // Create a Blob from the zip data
      const zipBlob = new Blob([zipData]);
      const zipReader = new ZipReader(new BlobReader(zipBlob));

      // Get all entries
      const entries = await zipReader.getEntries();
      console.log(`  📋 Found ${entries.length} entries in ZIP`);

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

      // Process each entry
      for (const entry of entries) {
        const filename = entry.filename;
        
        // Skip directories
        if (entry.directory) {
          continue;
        }

        console.log(`    📄 File: ${filename} (${(entry.compressedSize / 1024).toFixed(1)} KB compressed)`);

        // Only process required GTFS files
        if (!requiredFiles.includes(filename)) {
          console.log(`    ⏭️  Skipping: ${filename}`);
          continue;
        }

        console.log(`    ✓ Processing: ${filename}`);

        // Extract file data as Uint8Array
        const blobWriter = new BlobWriter();
        const blob = await entry.getData!(blobWriter);
        const arrayBuffer = await blob.arrayBuffer();
        const data = new Uint8Array(arrayBuffer);

        fileBuffers.set(filename, [data]);

        filesProcessed++;
        if (callbacks?.onExtractionProgress) {
          callbacks.onExtractionProgress(filename, filesProcessed / requiredFiles.length);
        }

        console.log(`    ✅ Completed: ${filename} (${(data.length / 1024).toFixed(1)} KB)`);
      }

      // Close the reader
      await zipReader.close();

      // Check for required files
      const missingFiles = requiredFiles.filter(f => !fileBuffers.has(f));
      if (missingFiles.length > 0) {
        console.warn(`  ⚠️  Missing files: ${missingFiles.join(', ')}`);
      }

      // Process files
      const feed = this.processParsedFiles(fileBuffers);
      return feed;

    } catch (error) {
      const err = error as Error;
      throw new Error(`@zip.js/zip.js extraction failed: ${err.message}`);
    }
  }

  // ==================== TIER 3: jszip Implementation ====================
  
  /**
   * Extract using jszip - battle-tested, maximum compatibility
   * Fallback for when other methods fail
   */
  private static async extractWithJSZip(
    zipData: Uint8Array,
    callbacks?: ProgressCallback
  ): Promise<GTFSFeed> {
    console.log('  🔍 Using jszip for maximum compatibility...');

    try {
      // Dynamically import jszip
      const JSZip = (await import('jszip')).default;

      // Load the ZIP
      const zip = await JSZip.loadAsync(zipData);
      console.log(`  📋 Loaded ZIP with ${Object.keys(zip.files).length} files`);

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

      // Process each file
      for (const [filename, zipEntry] of Object.entries(zip.files)) {
        // Skip directories
        if (zipEntry.dir) {
          continue;
        }

        console.log(`    📄 File: ${filename}`);

        // Only process required GTFS files
        if (!requiredFiles.includes(filename)) {
          console.log(`    ⏭️  Skipping: ${filename}`);
          continue;
        }

        console.log(`    ✓ Processing: ${filename}`);

        // Extract file data as Uint8Array
        const data = await zipEntry.async('uint8array');
        fileBuffers.set(filename, [data]);

        filesProcessed++;
        if (callbacks?.onExtractionProgress) {
          callbacks.onExtractionProgress(filename, filesProcessed / requiredFiles.length);
        }

        console.log(`    ✅ Completed: ${filename} (${(data.length / 1024).toFixed(1)} KB)`);
      }

      // Check for required files
      const missingFiles = requiredFiles.filter(f => !fileBuffers.has(f));
      if (missingFiles.length > 0) {
        console.warn(`  ⚠️  Missing files: ${missingFiles.join(', ')}`);
      }

      // Process files
      const feed = this.processParsedFiles(fileBuffers);
      return feed;

    } catch (error) {
      const err = error as Error;
      throw new Error(`jszip extraction failed: ${err.message}`);
    }
  }

  // ==================== Helper Methods ====================

  /**
   * Convert a ReadableStream to a Uint8Array buffer
   */
  private static async streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    // Combine chunks efficiently
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const buffer = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.length;
    }

    return buffer;
  }

  /**
   * Process accumulated file buffers into a GTFS feed
   */
  private static processParsedFiles(fileBuffers: Map<string, Uint8Array[]>): GTFSFeed {
    console.log('🔄 Parsing GTFS files...');

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

  // ==================== Legacy Methods (Backwards Compatibility) ====================

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
    throw new Error('Legacy extract() is no longer supported. Use extractStream() or fetchAndParseStream() instead.');
  }

  /**
   * @deprecated Use fetchAndParseStream() for better memory efficiency
   * Download and parse GTFS data in one step (loads entire file into memory)
   */
  static async fetchAndParse(url?: string): Promise<GTFSFeed> {
    console.log('⚠️  Using legacy fetchAndParse method. Consider using fetchAndParseStream() for better memory efficiency.');
    
    // Redirect to streaming version with multi-library fallback
    return this.fetchAndParseStream(url);
  }
}
