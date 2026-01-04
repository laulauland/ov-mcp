/**
 * GTFS Container Server
 * Bun-based server for processing GTFS data with KV storage integration
 * 
 * Features:
 * - GTFS data parsing from URLs or direct uploads
 * - ZIP file extraction using Bun's native APIs
 * - KV storage for caching parsed data
 * - Streaming support for large datasets
 * - Health checks and monitoring
 */

import { unzipSync } from 'bun';
import { GTFSParser } from '../../gtfs-parser/src/parser';
import type { GTFSFeed, GTFSStop, GTFSRoute, GTFSTrip, GTFSStopTime, GTFSAgency, GTFSCalendar } from '../../gtfs-parser/src/types';

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const KV_NAMESPACE = process.env.KV_NAMESPACE || 'GTFS_DATA';
const CACHE_TTL = parseInt(process.env.CACHE_TTL || '86400', 10); // 24 hours default

// KV Storage interface (compatible with Cloudflare KV)
interface KVStorage {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number }): Promise<{ keys: Array<{ name: string }> }>;
}

// In-memory KV storage for development
class InMemoryKV implements KVStorage {
  private store = new Map<string, { value: string; expires?: number }>();

  async get(key: string): Promise<string | null> {
    const item = this.store.get(key);
    if (!item) return null;
    if (item.expires && item.expires < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }

  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    const expires = options?.expirationTtl ? Date.now() + options.expirationTtl * 1000 : undefined;
    this.store.set(key, { value, expires });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(options?: { prefix?: string; limit?: number }): Promise<{ keys: Array<{ name: string }> }> {
    const keys = Array.from(this.store.keys())
      .filter(k => !options?.prefix || k.startsWith(options.prefix))
      .slice(0, options?.limit || 1000)
      .map(name => ({ name }));
    return { keys };
  }
}

// Initialize KV storage
const kv: KVStorage = new InMemoryKV();

interface GTFSProcessRequest {
  url?: string;
  data?: string;
  operation: 'parse' | 'validate' | 'transform' | 'query';
  options?: {
    cache?: boolean;
    cacheKey?: string;
    files?: string[]; // Specific files to parse
  };
  query?: {
    type: 'stops' | 'routes' | 'trips' | 'nearby';
    params?: Record<string, any>;
  };
}

interface GTFSProcessResponse {
  success: boolean;
  operation: string;
  data?: any;
  stats?: {
    stops?: number;
    routes?: number;
    trips?: number;
    stopTimes?: number;
    agencies?: number;
    calendar?: number;
    processingTime: number;
  };
  cached?: boolean;
  cacheKey?: string;
  error?: string;
  timestamp: string;
}

/**
 * Download GTFS ZIP file from URL
 */
async function downloadGTFS(url: string): Promise<ArrayBuffer> {
  console.log(`📥 Downloading GTFS from ${url}`);
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to download GTFS: ${response.status} ${response.statusText}`);
  }
  
  const contentType = response.headers.get('content-type');
  if (contentType && !contentType.includes('zip') && !contentType.includes('octet-stream')) {
    console.warn(`⚠️  Unexpected content type: ${contentType}`);
  }
  
  return await response.arrayBuffer();
}

/**
 * Extract and parse GTFS ZIP file using Bun's native unzip
 */
async function extractGTFS(zipBuffer: ArrayBuffer): Promise<Map<string, string>> {
  console.log('📦 Extracting GTFS ZIP file');
  const files = new Map<string, string>();
  
  try {
    // Convert ArrayBuffer to Uint8Array
    const uint8Array = new Uint8Array(zipBuffer);
    
    // Use Bun's native unzip
    const unzipped = unzipSync(uint8Array);
    
    // Convert files to string map
    for (const [filename, content] of Object.entries(unzipped)) {
      if (filename.endsWith('.txt')) {
        const decoder = new TextDecoder('utf-8');
        files.set(filename, decoder.decode(content as Uint8Array));
        console.log(`  ✓ Extracted ${filename}`);
      }
    }
    
    console.log(`✅ Extracted ${files.size} GTFS files`);
    return files;
  } catch (error) {
    console.error('❌ Failed to extract ZIP:', error);
    throw new Error(`ZIP extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Parse extracted GTFS files into typed objects
 */
function parseGTFSFiles(files: Map<string, string>, requestedFiles?: string[]): Partial<GTFSFeed> {
  console.log('🔍 Parsing GTFS files');
  const feed: Partial<GTFSFeed> = {};
  const startTime = performance.now();
  
  const fileParsers: Record<string, (csv: string) => any[]> = {
    'stops.txt': GTFSParser.parseStops,
    'routes.txt': GTFSParser.parseRoutes,
    'trips.txt': GTFSParser.parseTrips,
    'stop_times.txt': GTFSParser.parseStopTimes,
    'agency.txt': GTFSParser.parseAgencies,
    'calendar.txt': GTFSParser.parseCalendar,
  };
  
  for (const [filename, parser] of Object.entries(fileParsers)) {
    if (requestedFiles && !requestedFiles.includes(filename)) {
      continue;
    }
    
    const content = files.get(filename);
    if (content) {
      try {
        const parsed = parser(content);
        const key = filename.replace('.txt', '').replace('_', '') as keyof GTFSFeed;
        
        if (key === 'stoptimes') {
          feed.stop_times = parsed as GTFSStopTime[];
        } else if (key === 'agencies') {
          feed.agencies = parsed as GTFSAgency[];
        } else {
          (feed as any)[key] = parsed;
        }
        
        console.log(`  ✓ Parsed ${filename}: ${parsed.length} records`);
      } catch (error) {
        console.error(`  ❌ Failed to parse ${filename}:`, error);
      }
    }
  }
  
  const duration = performance.now() - startTime;
  console.log(`✅ Parsing completed in ${duration.toFixed(2)}ms`);
  
  return feed;
}

/**
 * Validate GTFS data structure
 */
function validateGTFS(feed: Partial<GTFSFeed>): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Required files check
  if (!feed.agencies || feed.agencies.length === 0) {
    errors.push('Missing required file: agency.txt');
  }
  if (!feed.stops || feed.stops.length === 0) {
    errors.push('Missing required file: stops.txt');
  }
  if (!feed.routes || feed.routes.length === 0) {
    errors.push('Missing required file: routes.txt');
  }
  if (!feed.trips || feed.trips.length === 0) {
    errors.push('Missing required file: trips.txt');
  }
  if (!feed.stop_times || feed.stop_times.length === 0) {
    errors.push('Missing required file: stop_times.txt');
  }
  
  // Data integrity checks
  if (feed.stops) {
    const invalidStops = feed.stops.filter(s => !s.stop_id || isNaN(s.stop_lat) || isNaN(s.stop_lon));
    if (invalidStops.length > 0) {
      warnings.push(`Found ${invalidStops.length} stops with invalid coordinates`);
    }
  }
  
  if (feed.routes) {
    const invalidRoutes = feed.routes.filter(r => !r.route_id || (!r.route_short_name && !r.route_long_name));
    if (invalidRoutes.length > 0) {
      warnings.push(`Found ${invalidRoutes.length} routes without names`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Get statistics from parsed GTFS data
 */
function getGTFSStats(feed: Partial<GTFSFeed>, processingTime: number) {
  return {
    stops: feed.stops?.length || 0,
    routes: feed.routes?.length || 0,
    trips: feed.trips?.length || 0,
    stopTimes: feed.stop_times?.length || 0,
    agencies: feed.agencies?.length || 0,
    calendar: feed.calendar?.length || 0,
    processingTime: Math.round(processingTime)
  };
}

/**
 * Query GTFS data
 */
function queryGTFS(feed: Partial<GTFSFeed>, query: NonNullable<GTFSProcessRequest['query']>): any {
  switch (query.type) {
    case 'stops':
      if (query.params?.search) {
        const search = query.params.search.toLowerCase();
        return feed.stops?.filter(s => 
          s.stop_name.toLowerCase().includes(search) ||
          s.stop_id.toLowerCase().includes(search)
        ).slice(0, query.params.limit || 100);
      }
      return feed.stops?.slice(0, query.params?.limit || 100);
      
    case 'routes':
      if (query.params?.search) {
        const search = query.params.search.toLowerCase();
        return feed.routes?.filter(r => 
          r.route_short_name?.toLowerCase().includes(search) ||
          r.route_long_name?.toLowerCase().includes(search)
        ).slice(0, query.params.limit || 100);
      }
      return feed.routes?.slice(0, query.params?.limit || 100);
      
    case 'trips':
      if (query.params?.route_id) {
        return feed.trips?.filter(t => t.route_id === query.params.route_id)
          .slice(0, query.params.limit || 100);
      }
      return feed.trips?.slice(0, query.params?.limit || 100);
      
    case 'nearby':
      if (!query.params?.lat || !query.params?.lon) {
        throw new Error('Nearby query requires lat and lon parameters');
      }
      
      const { lat, lon, radius = 1000 } = query.params;
      const nearby = feed.stops?.filter(stop => {
        const distance = haversineDistance(lat, lon, stop.stop_lat, stop.stop_lon);
        return distance <= radius;
      }).sort((a, b) => {
        const distA = haversineDistance(lat, lon, a.stop_lat, a.stop_lon);
        const distB = haversineDistance(lat, lon, b.stop_lat, b.stop_lon);
        return distA - distB;
      }).slice(0, query.params.limit || 20);
      
      return nearby;
      
    default:
      throw new Error(`Unknown query type: ${query.type}`);
  }
}

/**
 * Calculate haversine distance between two coordinates
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Process GTFS data with caching support
 */
async function processGTFS(request: GTFSProcessRequest): Promise<GTFSProcessResponse> {
  const startTime = performance.now();
  const cacheKey = request.options?.cacheKey || (request.url ? `gtfs:${request.url}` : undefined);
  
  try {
    // Check cache first
    if (request.options?.cache !== false && cacheKey) {
      const cached = await kv.get(cacheKey);
      if (cached) {
        console.log(`✅ Cache hit for ${cacheKey}`);
        const cachedData = JSON.parse(cached);
        return {
          ...cachedData,
          cached: true,
          cacheKey,
          timestamp: new Date().toISOString()
        };
      }
    }
    
    // Download GTFS data
    let zipBuffer: ArrayBuffer;
    if (request.url) {
      zipBuffer = await downloadGTFS(request.url);
    } else if (request.data) {
      // Assume base64 encoded ZIP data
      const binaryString = atob(request.data);
      zipBuffer = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        (zipBuffer as Uint8Array)[i] = binaryString.charCodeAt(i);
      }
    } else {
      throw new Error('Either url or data must be provided');
    }
    
    // Extract and parse GTFS
    const files = await extractGTFS(zipBuffer);
    const feed = parseGTFSFiles(files, request.options?.files);
    
    // Process based on operation
    let result: any;
    let validation: ReturnType<typeof validateGTFS> | undefined;
    
    switch (request.operation) {
      case 'parse':
        result = feed;
        break;
        
      case 'validate':
        validation = validateGTFS(feed);
        result = validation;
        break;
        
      case 'transform':
        // Transform to simplified format
        result = {
          agencies: feed.agencies,
          routes: feed.routes,
          stops: feed.stops?.map(s => ({
            id: s.stop_id,
            name: s.stop_name,
            lat: s.stop_lat,
            lon: s.stop_lon,
            code: s.stop_code
          }))
        };
        break;
        
      case 'query':
        if (!request.query) {
          throw new Error('Query operation requires query parameter');
        }
        result = queryGTFS(feed, request.query);
        break;
        
      default:
        throw new Error(`Unknown operation: ${request.operation}`);
    }
    
    const processingTime = performance.now() - startTime;
    
    const response: GTFSProcessResponse = {
      success: true,
      operation: request.operation,
      data: result,
      stats: getGTFSStats(feed, processingTime),
      timestamp: new Date().toISOString()
    };
    
    // Cache the result
    if (request.options?.cache !== false && cacheKey) {
      await kv.put(cacheKey, JSON.stringify(response), {
        expirationTtl: CACHE_TTL
      });
      console.log(`💾 Cached result with key: ${cacheKey}`);
    }
    
    return response;
    
  } catch (error) {
    const processingTime = performance.now() - startTime;
    console.error('❌ Processing failed:', error);
    
    return {
      success: false,
      operation: request.operation,
      error: error instanceof Error ? error.message : 'Unknown error',
      stats: { processingTime: Math.round(processingTime) },
      timestamp: new Date().toISOString()
    };
  }
}

// Create Bun server
const server = Bun.serve({
  port: PORT,
  hostname: HOST,
  
  async fetch(req: Request) {
    const url = new URL(req.url);
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: '1.0.0'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Cache management endpoints
    if (url.pathname === '/cache') {
      if (req.method === 'GET') {
        const prefix = url.searchParams.get('prefix') || undefined;
        const list = await kv.list({ prefix, limit: 100 });
        return new Response(JSON.stringify({
          keys: list.keys,
          count: list.keys.length
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      if (req.method === 'DELETE') {
        const key = url.searchParams.get('key');
        if (!key) {
          return new Response(JSON.stringify({ error: 'key parameter required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        await kv.delete(key);
        return new Response(JSON.stringify({ success: true, key }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }
    
    // GTFS processing endpoint
    if (url.pathname === '/process' && req.method === 'POST') {
      try {
        const body = await req.json() as GTFSProcessRequest;
        const result = await processGTFS(body);
        
        return new Response(JSON.stringify(result), {
          status: result.success ? 200 : 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }
    
    // Root endpoint
    if (url.pathname === '/') {
      return new Response(JSON.stringify({
        service: 'GTFS Container',
        version: '1.0.0',
        runtime: 'Bun',
        endpoints: {
          health: 'GET /health',
          process: 'POST /process',
          cache: 'GET /cache, DELETE /cache?key=<key>'
        },
        features: [
          'GTFS ZIP parsing',
          'KV storage caching',
          'Data validation',
          'Query support',
          'Nearby search'
        ]
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    return new Response('Not Found', { 
      status: 404,
      headers: corsHeaders
    });
  },
  
  error(error: Error) {
    console.error('Server error:', error);
    return new Response(JSON.stringify({
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

console.log('🚀 GTFS Container Server');
console.log(`   ├─ URL: http://${HOST}:${PORT}`);
console.log(`   ├─ Runtime: Bun ${Bun.version}`);
console.log(`   ├─ KV Namespace: ${KV_NAMESPACE}`);
console.log(`   └─ Cache TTL: ${CACHE_TTL}s`);

// Graceful shutdown
const shutdown = (signal: string) => {
  console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
  server.stop();
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
