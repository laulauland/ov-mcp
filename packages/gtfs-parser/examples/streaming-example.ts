/**
 * Streaming GTFS Parser Examples
 * 
 * This file demonstrates how to use the new streaming API
 * for memory-efficient GTFS data processing.
 */

import { GTFSDownloader } from '../src/downloader';

// ============================================================================
// Example 1: Basic streaming usage (simplest approach)
// ============================================================================

async function basicStreamingExample() {
  console.log('\n=== Example 1: Basic Streaming ===\n');
  
  const feed = await GTFSDownloader.fetchAndParseStream();
  
  console.log(`✓ Loaded ${feed.stops.length} stops`);
  console.log(`✓ Loaded ${feed.routes.length} routes`);
  console.log(`✓ Loaded ${feed.trips.length} trips`);
}

// ============================================================================
// Example 2: With progress tracking
// ============================================================================

async function progressTrackingExample() {
  console.log('\n=== Example 2: Progress Tracking ===\n');
  
  let lastProgress = 0;
  
  const feed = await GTFSDownloader.fetchAndParseStream(undefined, {
    onDownloadProgress: (loaded, total) => {
      const progress = Math.floor((loaded / total) * 100);
      
      // Only log every 10%
      if (progress >= lastProgress + 10) {
        console.log(`⬇️  Download: ${progress}% (${(loaded / 1024 / 1024).toFixed(1)} MB / ${(total / 1024 / 1024).toFixed(1)} MB)`);
        lastProgress = progress;
      }
    },
    
    onExtractionProgress: (filename, progress) => {
      console.log(`📦 Extracting: ${filename} (${(progress * 100).toFixed(0)}% complete)`);
    },
  });
  
  console.log(`\n✓ Processing complete!`);
  console.log(`  ${feed.stops.length} stops`);
  console.log(`  ${feed.routes.length} routes`);
  console.log(`  ${feed.trips.length} trips`);
  console.log(`  ${feed.stop_times.length} stop times`);
}

// ============================================================================
// Example 3: Custom URL with error handling
// ============================================================================

async function customUrlExample() {
  console.log('\n=== Example 3: Custom URL ===\n');
  
  const customUrl = 'http://gtfs.ovapi.nl/gtfs-nl.zip';
  
  try {
    const feed = await GTFSDownloader.fetchAndParseStream(customUrl, {
      onDownloadProgress: (loaded, total) => {
        // Simple progress bar
        const percent = (loaded / total) * 100;
        const barLength = 40;
        const filled = Math.floor((percent / 100) * barLength);
        const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
        
        process.stdout.write(`\r[${bar}] ${percent.toFixed(1)}%`);
      },
    });
    
    console.log('\n✓ Successfully loaded GTFS data');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// ============================================================================
// Example 4: Memory-efficient processing with streaming download
// ============================================================================

async function lowLevelStreamingExample() {
  console.log('\n=== Example 4: Low-Level Streaming API ===\n');
  
  // Step 1: Get the streaming download
  console.log('Starting download...');
  const stream = await GTFSDownloader.downloadStream(undefined, {
    onDownloadProgress: (loaded, total) => {
      if (loaded % (5 * 1024 * 1024) < 65536) { // Log every ~5MB
        console.log(`  Downloaded: ${(loaded / 1024 / 1024).toFixed(1)} MB`);
      }
    },
  });
  
  // Step 2: Process the stream with extraction
  console.log('Starting extraction...');
  const feed = await GTFSDownloader.extractStream(stream, {
    onExtractionProgress: (filename, progress) => {
      console.log(`  Processing ${filename}...`);
    },
  });
  
  console.log('✓ Complete!');
  
  return feed;
}

// ============================================================================
// Example 5: Comparing memory usage (legacy vs streaming)
// ============================================================================

async function memoryComparisonExample() {
  console.log('\n=== Example 5: Memory Usage Comparison ===\n');
  
  // Helper to get memory usage
  const getMemoryMB = () => {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
    }
    return 'N/A';
  };
  
  console.log(`Initial memory: ${getMemoryMB()} MB`);
  
  // Streaming method (recommended)
  console.log('\nTesting streaming method...');
  const startMemStreaming = getMemoryMB();
  
  const feed1 = await GTFSDownloader.fetchAndParseStream();
  
  const peakMemStreaming = getMemoryMB();
  console.log(`  Peak memory: ${peakMemStreaming} MB`);
  console.log(`  Loaded: ${feed1.stops.length} stops`);
  
  // Force garbage collection if available (run with --expose-gc)
  if (typeof global !== 'undefined' && (global as any).gc) {
    (global as any).gc();
  }
  
  console.log(`\n✓ Streaming method used ~${peakMemStreaming} MB`);
  
  // Note: Legacy methods now redirect to streaming, so comparison isn't meaningful
  console.log('\nℹ️  Legacy methods now automatically use streaming for better memory efficiency');
}

// ============================================================================
// Example 6: Production-ready implementation with retry logic
// ============================================================================

async function productionExample() {
  console.log('\n=== Example 6: Production-Ready Implementation ===\n');
  
  const maxRetries = 3;
  let attempt = 0;
  
  while (attempt < maxRetries) {
    try {
      console.log(`Attempt ${attempt + 1}/${maxRetries}...`);
      
      const feed = await GTFSDownloader.fetchAndParseStream(undefined, {
        onDownloadProgress: (loaded, total) => {
          const percent = ((loaded / total) * 100).toFixed(1);
          process.stdout.write(`\r  Download: ${percent}%`);
        },
        onExtractionProgress: (filename, progress) => {
          if (progress === 1) {
            console.log(`\n  ✓ ${filename}`);
          }
        },
      });
      
      console.log('\n\n✓ Success!');
      console.log(`  Agencies: ${feed.agencies.length}`);
      console.log(`  Stops: ${feed.stops.length}`);
      console.log(`  Routes: ${feed.routes.length}`);
      console.log(`  Trips: ${feed.trips.length}`);
      
      return feed;
      
    } catch (error) {
      attempt++;
      console.error(`\n❌ Attempt ${attempt} failed:`, error);
      
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        console.log(`Retrying in ${delay / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error('Max retries reached. Giving up.');
        throw error;
      }
    }
  }
}

// ============================================================================
// Example 7: Integration with existing code (migration pattern)
// ============================================================================

async function migrationExample() {
  console.log('\n=== Example 7: Migration Pattern ===\n');
  
  // Old code (commented out)
  /*
  const buffer = await GTFSDownloader.download();
  const feed = GTFSDownloader.extract(buffer);
  */
  
  // New code (drop-in replacement)
  const feed = await GTFSDownloader.fetchAndParseStream();
  
  // Rest of your code works the same
  console.log('Processing stops...');
  for (const stop of feed.stops.slice(0, 5)) {
    console.log(`  - ${stop.stop_name} (${stop.stop_id})`);
  }
  
  console.log('\n✓ Migration complete! Same API, better performance.');
}

// ============================================================================
// Run all examples
// ============================================================================

async function runAllExamples() {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║   GTFS Streaming Parser - Usage Examples      ║');
  console.log('╚════════════════════════════════════════════════╝');
  
  try {
    // Run examples sequentially
    await basicStreamingExample();
    await progressTrackingExample();
    await customUrlExample();
    await lowLevelStreamingExample();
    await memoryComparisonExample();
    await productionExample();
    await migrationExample();
    
    console.log('\n✅ All examples completed successfully!\n');
    
  } catch (error) {
    console.error('\n❌ Error running examples:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples();
}

// Export for use in other modules
export {
  basicStreamingExample,
  progressTrackingExample,
  customUrlExample,
  lowLevelStreamingExample,
  memoryComparisonExample,
  productionExample,
  migrationExample,
};
