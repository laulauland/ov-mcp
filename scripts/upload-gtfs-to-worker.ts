#!/usr/bin/env bun
/**
 * Upload GTFS data to Cloudflare Worker KV storage
 * 
 * Usage:
 *   bun run scripts/upload-gtfs-to-worker.ts
 * 
 * Environment variables:
 *   CLOUDFLARE_WORKER_URL - URL of deployed worker (required)
 *   GTFS_UPDATE_SECRET - Authorization secret (required)
 */

import { GTFSDownloader } from '../packages/gtfs-parser/src/downloader';

const WORKER_URL = process.env.CLOUDFLARE_WORKER_URL;
const UPDATE_SECRET = process.env.GTFS_UPDATE_SECRET;

if (!WORKER_URL) {
  console.error('Error: CLOUDFLARE_WORKER_URL environment variable is required');
  console.error('Example: export CLOUDFLARE_WORKER_URL=https://your-worker.workers.dev');
  process.exit(1);
}

if (!UPDATE_SECRET) {
  console.error('Error: GTFS_UPDATE_SECRET environment variable is required');
  console.error('This should match the secret set in your Cloudflare Worker environment');
  process.exit(1);
}

async function uploadGTFSData() {
  console.log('Starting GTFS data upload process...');
  console.log('Worker URL:', WORKER_URL);
  console.log('');

  try {
    // Step 1: Download and parse GTFS data
    console.log('[1/3] Downloading GTFS data from gtfs.ovapi.nl...');
    const feed = await GTFSDownloader.fetchAndParse();
    console.log('✓ Downloaded and parsed successfully');
    console.log(`  - ${feed.stops.length} stops`);
    console.log(`  - ${feed.routes.length} routes`);
    console.log(`  - ${feed.trips.length} trips`);
    console.log(`  - ${feed.agencies.length} agencies`);
    console.log('');

    // Step 2: Upload to worker
    console.log('[2/3] Uploading to Cloudflare Worker...');
    const uploadUrl = `${WORKER_URL}/admin/update-gtfs`;
    
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${UPDATE_SECRET}`,
      },
      body: JSON.stringify(feed),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Upload failed: ${response.status} ${response.statusText}\n${error}`);
    }

    const result = await response.json();
    console.log('✓ Upload successful');
    console.log('  Response:', JSON.stringify(result, null, 2));
    console.log('');

    // Step 3: Verify upload
    console.log('[3/3] Verifying upload...');
    const healthUrl = `${WORKER_URL}/health`;
    const healthResponse = await fetch(healthUrl);
    
    if (!healthResponse.ok) {
      throw new Error('Health check failed');
    }

    const health = await healthResponse.json();
    console.log('✓ Verification successful');
    console.log('  Worker status:', health.status);
    console.log('  GTFS data available:', health.gtfs_data_available);
    if (health.gtfs_metadata) {
      console.log('  GTFS metadata:', JSON.stringify(health.gtfs_metadata, null, 2));
    }
    console.log('');

    console.log('✅ GTFS data upload completed successfully!');
    console.log('');
    console.log('Your Cloudflare Worker is now ready to serve GTFS data.');
    console.log(`Test it at: ${WORKER_URL}/mcp`);
  } catch (error) {
    console.error('');
    console.error('❌ Upload failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Run the upload
uploadGTFSData();
