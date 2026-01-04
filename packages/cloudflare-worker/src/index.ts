/**
 * OV-MCP Server - Cloudflare Worker
 * Dutch Public Transport MCP Server using Cloudflare Agents SDK
 *
 * Uses createMcpHandler from agents/mcp for Streamable HTTP transport
 * Note: Local dev (wrangler dev) fails due to cloudflare:email import in agents SDK
 * Deploy with `wrangler deploy` to test
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler } from "agents/mcp";
import { z } from "zod";

import { GTFSFeed, GTFSStop, GTFSRoute, GTFSQuery, GTFSDownloader } from '@ov-mcp/gtfs-parser';

// Cache configuration
const CACHE_TTL = 60 * 60 * 24; // 24 hours in seconds
const GTFS_DATA_KEY = 'gtfs:data:v1';
const GTFS_METADATA_KEY = 'gtfs:metadata:v1';

// Memory limit threshold (in MB) for Cloudflare Worker
const MEMORY_LIMIT_WARNING_MB = 100;

// Environment interface for Cloudflare Worker
export interface Env {
  GTFS_CACHE?: KVNamespace;
  ENVIRONMENT?: string;
  GTFS_FEED_URL?: string;
}

// Global variable to store env for use in tools
let globalEnv: Env | null = null;

/**
 * Helper functions for formatting
 */
function getStopType(locationType?: string): string {
  switch (locationType) {
    case '0': return 'stop';
    case '1': return 'station';
    case '2': return 'entrance/exit';
    case '3': return 'generic node';
    case '4': return 'boarding area';
    default: return 'stop';
  }
}

function getRouteType(routeType: string): string {
  const typeMap: Record<string, string> = {
    '0': 'Tram',
    '1': 'Metro',
    '2': 'Rail',
    '3': 'Bus',
    '4': 'Ferry',
    '5': 'Cable tram',
    '6': 'Aerial lift',
    '7': 'Funicular',
    '11': 'Trolleybus',
    '12': 'Monorail',
    '700': 'Bus Service',
    '1000': 'Water Transport',
  };
  return typeMap[routeType] || `Route Type ${routeType}`;
}

function formatStop(stop: GTFSStop) {
  return {
    id: stop.stop_id,
    name: stop.stop_name,
    code: stop.stop_code,
    location: {
      latitude: stop.stop_lat,
      longitude: stop.stop_lon,
    },
    type: getStopType(stop.location_type),
    wheelchair_accessible: stop.wheelchair_boarding === '1',
    parent_station: stop.parent_station,
    platform_code: stop.platform_code,
  };
}

function formatRoute(route: GTFSRoute) {
  return {
    id: route.route_id,
    short_name: route.route_short_name,
    long_name: route.route_long_name,
    type: getRouteType(route.route_type),
    color: route.route_color ? `#${route.route_color}` : undefined,
    agency_id: route.agency_id,
  };
}

/**
 * Estimate memory usage (rough approximation)
 */
function getEstimatedMemoryUsageMB(): number {
  if (typeof performance !== 'undefined' && (performance as any).memory) {
    return (performance as any).memory.usedJSHeapSize / (1024 * 1024);
  }
  return 0;
}

/**
 * Get GTFS data from KV cache, with lazy loading on first request using streaming
 */
async function getGTFSData(): Promise<GTFSFeed | null> {
  if (!globalEnv?.GTFS_CACHE) {
    console.error('GTFS_CACHE KV namespace not configured');
    return null;
  }

  try {
    // Check if data exists in KV
    const cached = await globalEnv.GTFS_CACHE.get(GTFS_DATA_KEY, 'json');
    if (cached) {
      console.log('GTFS data loaded from cache');
      return cached as GTFSFeed;
    }

    // Lazy load: download and parse GTFS data on first request using streaming
    console.log('GTFS data not in cache, fetching from source using streaming...');
    const feedUrl = globalEnv.GTFS_FEED_URL || 'http://gtfs.ovapi.nl/gtfs-nl.zip';
    
    const startTime = Date.now();
    const initialMemory = getEstimatedMemoryUsageMB();
    
    console.log(`[Progress] Starting GTFS download from ${feedUrl}`);
    console.log(`[Memory] Initial usage: ${initialMemory.toFixed(2)} MB`);

    // Use streaming method with progress logging
    const feed = await GTFSDownloader.fetchAndParseStream(feedUrl, {
      onDownloadProgress: (loaded: number, total: number) => {
        const currentMemory = getEstimatedMemoryUsageMB();
        const percentComplete = total > 0 ? ((loaded / total) * 100).toFixed(1) : '0';
        console.log(`[Progress] Downloading: ${(loaded / 1024 / 1024).toFixed(2)} MB / ${(total / 1024 / 1024).toFixed(2)} MB (${percentComplete}%) (Memory: ${currentMemory.toFixed(2)} MB)`);
        
        // Check memory limits
        if (currentMemory > MEMORY_LIMIT_WARNING_MB) {
          console.warn(`[Memory Warning] Usage exceeds ${MEMORY_LIMIT_WARNING_MB} MB: ${currentMemory.toFixed(2)} MB`);
        }
      },
      onExtractionProgress: (filename: string, progress: number) => {
        const currentMemory = getEstimatedMemoryUsageMB();
        const percentComplete = (progress * 100).toFixed(1);
        console.log(`[Progress] Extracting ${filename}: ${percentComplete}% complete (Memory: ${currentMemory.toFixed(2)} MB)`);
      }
    });

    const endTime = Date.now();
    const finalMemory = getEstimatedMemoryUsageMB();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log(`[Progress] GTFS parsing complete in ${duration}s`);
    console.log(`[Memory] Final usage: ${finalMemory.toFixed(2)} MB (Delta: ${(finalMemory - initialMemory).toFixed(2)} MB)`);
    console.log(`[Summary] Fetched: ${feed.stops.length} stops, ${feed.routes.length} routes, ${feed.trips.length} trips, ${feed.agencies.length} agencies`);

    // Store in KV for future requests
    console.log('[Progress] Storing GTFS data in KV cache...');
    await globalEnv.GTFS_CACHE.put(GTFS_DATA_KEY, JSON.stringify(feed), {
      expirationTtl: CACHE_TTL * 7, // 7 days
    });

    // Update metadata
    const metadata = {
      lastUpdated: new Date().toISOString(),
      stopCount: feed.stops.length,
      routeCount: feed.routes.length,
      tripCount: feed.trips.length,
      agencyCount: feed.agencies.length,
      triggeredBy: 'lazy-load',
      processingTimeSeconds: parseFloat(duration),
      memoryUsageMB: finalMemory,
    };
    await globalEnv.GTFS_CACHE.put(GTFS_METADATA_KEY, JSON.stringify(metadata), {
      expirationTtl: CACHE_TTL * 7,
    });

    console.log('[Progress] GTFS data cached successfully');
    return feed;
  } catch (error) {
    const currentMemory = getEstimatedMemoryUsageMB();
    console.error('[Error] Failed to fetch GTFS data:', error);
    console.error(`[Memory] Memory usage at error: ${currentMemory.toFixed(2)} MB`);
    
    // Check if error is memory-related
    if (error instanceof Error) {
      if (error.message.includes('memory') || error.message.includes('heap') || 
          error.message.includes('allocation') || currentMemory > MEMORY_LIMIT_WARNING_MB) {
        console.error('[Memory Error] Possible memory limit exceeded. Consider optimizing data processing or increasing worker limits.');
      }
    }
    
    return null;
  }
}

/**
 * Create the MCP Server with all tools registered
 */
function createServer(): McpServer {
  const server = new McpServer({
    name: "ov-mcp",
    version: "0.2.0",
  });

  // Tool: Search for stops by name
  server.tool(
    "get_stops",
    "Search for public transport stops in the Netherlands by name. Returns stop details including coordinates, type, and accessibility info.",
    {
      query: z.string().describe("Search query for stop name (e.g., 'Amsterdam Centraal', 'Rotterdam')"),
      limit: z.number().min(1).max(100).default(10).describe("Maximum number of results to return"),
    },
    async ({ query, limit }) => {
      const feed = await getGTFSData();

      if (!feed) {
        return {
          content: [{ type: "text", text: "GTFS data not available. Please ensure data is loaded into KV storage." }],
        };
      }

      const stops = GTFSQuery.searchStopsByName(feed.stops, query, limit);

      if (stops.length === 0) {
        return {
          content: [{ type: "text", text: `No stops found matching "${query}".` }],
        };
      }

      const formattedStops = stops.map(formatStop);
      return {
        content: [{
          type: "text",
          text: `Found ${stops.length} stop(s):\n\n${JSON.stringify(formattedStops, null, 2)}`
        }],
      };
    }
  );

  // Tool: Get stop by ID
  server.tool(
    "get_stop_by_id",
    "Get detailed information about a specific stop by its GTFS ID.",
    {
      stop_id: z.string().describe("The unique GTFS stop ID"),
    },
    async ({ stop_id }) => {
      const feed = await getGTFSData();

      if (!feed) {
        return {
          content: [{ type: "text", text: "GTFS data not available." }],
        };
      }

      const stop = GTFSQuery.getStopById(feed.stops, stop_id);

      if (!stop) {
        return {
          content: [{ type: "text", text: `Stop with ID "${stop_id}" not found.` }],
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(formatStop(stop), null, 2) }],
      };
    }
  );

  // Tool: Find stops nearby
  server.tool(
    "find_stops_nearby",
    "Find public transport stops near a specific geographic coordinate within a given radius.",
    {
      latitude: z.number().min(-90).max(90).describe("Latitude coordinate"),
      longitude: z.number().min(-180).max(180).describe("Longitude coordinate"),
      radius_km: z.number().min(0.1).max(10).default(1).describe("Search radius in kilometers"),
      limit: z.number().min(1).max(50).default(10).describe("Maximum number of results"),
    },
    async ({ latitude, longitude, radius_km, limit }) => {
      const feed = await getGTFSData();

      if (!feed) {
        return {
          content: [{ type: "text", text: "GTFS data not available." }],
        };
      }

      const stops = GTFSQuery.findStopsNear(feed.stops, latitude, longitude, radius_km, limit);

      if (stops.length === 0) {
        return {
          content: [{ type: "text", text: `No stops found within ${radius_km}km of (${latitude}, ${longitude}).` }],
        };
      }

      const formattedStops = stops.map(formatStop);
      return {
        content: [{
          type: "text",
          text: `Found ${stops.length} stop(s) within ${radius_km}km:\n\n${JSON.stringify(formattedStops, null, 2)}`
        }],
      };
    }
  );

  // Tool: Search routes
  server.tool(
    "get_routes",
    "Search for public transport routes (lines) by name or number.",
    {
      query: z.string().describe("Search query for route name or number (e.g., 'Intercity', 'Bus 15', 'Tram 2')"),
      limit: z.number().min(1).max(100).default(10).describe("Maximum number of results"),
    },
    async ({ query, limit }) => {
      const feed = await getGTFSData();

      if (!feed) {
        return {
          content: [{ type: "text", text: "GTFS data not available." }],
        };
      }

      const lowerQuery = query.toLowerCase();
      const routes = feed.routes
        .filter(route =>
          route.route_short_name.toLowerCase().includes(lowerQuery) ||
          route.route_long_name.toLowerCase().includes(lowerQuery)
        )
        .slice(0, limit);

      if (routes.length === 0) {
        return {
          content: [{ type: "text", text: `No routes found matching "${query}".` }],
        };
      }

      const formattedRoutes = routes.map(formatRoute);
      return {
        content: [{
          type: "text",
          text: `Found ${routes.length} route(s):\n\n${JSON.stringify(formattedRoutes, null, 2)}`
        }],
      };
    }
  );

  return server;
}

// Create the MCP server instance
const mcpServer = createServer();

// Create the MCP handler using createMcpHandler from Cloudflare Agents SDK
// This provides Streamable HTTP transport for remote MCP clients
const mcpHandler = createMcpHandler(mcpServer, {
  route: "/mcp",
  corsOptions: {
    origin: '*',
    headers: 'Content-Type, Accept, Authorization, mcp-session-id, MCP-Protocol-Version',
    methods: 'GET, POST, DELETE, OPTIONS',
    exposeHeaders: 'mcp-session-id',
    maxAge: 86400,
  },
});

/**
 * Utility endpoints handler (health check and API info)
 */
async function handleUtilityRequest(request: Request, env: Env, url: URL): Promise<Response | null> {
  // Health check endpoint
  if (url.pathname === '/health') {
    let metadata = null;
    let kvConfigured = false;

    if (env.GTFS_CACHE) {
      kvConfigured = true;
      try {
        metadata = await env.GTFS_CACHE.get(GTFS_METADATA_KEY, 'json');
      } catch (error) {
        console.error('Error fetching metadata from KV:', error);
      }
    }

    return new Response(
      JSON.stringify({
        status: 'ok',
        environment: env.ENVIRONMENT || 'development',
        timestamp: new Date().toISOString(),
        kv_configured: kvConfigured,
        gtfs_data_available: metadata !== null,
        gtfs_metadata: metadata,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // Root path - API info
  if (url.pathname === '/') {
    return new Response(
      JSON.stringify({
        name: 'OV-MCP Server',
        version: '0.2.0',
        description: 'Model Context Protocol server for Dutch public transport data',
        mcp_endpoint: '/mcp',
        endpoints: {
          health: 'GET /health',
          mcp: 'POST /mcp (MCP protocol via Streamable HTTP transport)',
        },
        transports: {
          streamable_http: '/mcp (recommended)',
        },
        documentation: 'https://github.com/laulauland/ov-mcp',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return null;
}

/**
 * Main Worker export using Cloudflare Agents SDK pattern
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Store env globally for tools to access
    globalEnv = env;

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, mcp-session-id, MCP-Protocol-Version, Accept',
          'Access-Control-Expose-Headers': 'mcp-session-id',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Check for utility endpoints first (health, root)
    const utilityResponse = await handleUtilityRequest(request, env, url);
    if (utilityResponse) {
      return utilityResponse;
    }

    // Route MCP requests through createMcpHandler
    if (url.pathname === '/mcp') {
      try {
        return await mcpHandler(request, env, ctx);
      } catch (error) {
        console.error('MCP handler error:', error);
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: error instanceof Error ? error.message : 'Internal server error',
            },
            id: null,
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
    }

    return new Response('Not Found', { status: 404 });
  },

  /**
   * Scheduled handler for automatic GTFS data updates using streaming
   * Triggered by cron: every Sunday at 3am UTC
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('Scheduled GTFS update triggered at:', new Date(event.scheduledTime).toISOString());

    if (!env.GTFS_CACHE) {
      console.error('GTFS_CACHE KV namespace not configured - skipping scheduled update');
      return;
    }

    try {
      // Download and parse fresh GTFS data using streaming
      const feedUrl = env.GTFS_FEED_URL || 'http://gtfs.ovapi.nl/gtfs-nl.zip';
      console.log('[Scheduled] Downloading GTFS data from:', feedUrl);

      const startTime = Date.now();
      const initialMemory = getEstimatedMemoryUsageMB();
      console.log(`[Scheduled][Memory] Initial usage: ${initialMemory.toFixed(2)} MB`);

      // Use streaming method with progress logging
      const feed = await GTFSDownloader.fetchAndParseStream(feedUrl, {
        onDownloadProgress: (loaded: number, total: number) => {
          const currentMemory = getEstimatedMemoryUsageMB();
          const percentComplete = total > 0 ? ((loaded / total) * 100).toFixed(1) : '0';
          console.log(`[Scheduled][Progress] Downloading: ${(loaded / 1024 / 1024).toFixed(2)} MB / ${(total / 1024 / 1024).toFixed(2)} MB (${percentComplete}%) (Memory: ${currentMemory.toFixed(2)} MB)`);
          
          // Check memory limits
          if (currentMemory > MEMORY_LIMIT_WARNING_MB) {
            console.warn(`[Scheduled][Memory Warning] Usage exceeds ${MEMORY_LIMIT_WARNING_MB} MB: ${currentMemory.toFixed(2)} MB`);
          }
        },
        onExtractionProgress: (filename: string, progress: number) => {
          const currentMemory = getEstimatedMemoryUsageMB();
          const percentComplete = (progress * 100).toFixed(1);
          console.log(`[Scheduled][Progress] Extracting ${filename}: ${percentComplete}% complete (Memory: ${currentMemory.toFixed(2)} MB)`);
        }
      });

      const endTime = Date.now();
      const finalMemory = getEstimatedMemoryUsageMB();
      const duration = ((endTime - startTime) / 1000).toFixed(2);
      
      console.log(`[Scheduled][Progress] GTFS parsing complete in ${duration}s`);
      console.log(`[Scheduled][Memory] Final usage: ${finalMemory.toFixed(2)} MB (Delta: ${(finalMemory - initialMemory).toFixed(2)} MB)`);
      console.log(`[Scheduled][Summary] Downloaded: ${feed.stops.length} stops, ${feed.routes.length} routes, ${feed.trips.length} trips, ${feed.agencies.length} agencies`);

      // Store in KV
      console.log('[Scheduled][Progress] Storing GTFS data in KV cache...');
      await env.GTFS_CACHE.put(GTFS_DATA_KEY, JSON.stringify(feed), {
        expirationTtl: CACHE_TTL * 7, // 7 days for scheduled updates
      });

      // Update metadata
      const metadata = {
        lastUpdated: new Date().toISOString(),
        stopCount: feed.stops.length,
        routeCount: feed.routes.length,
        tripCount: feed.trips.length,
        agencyCount: feed.agencies.length,
        triggeredBy: 'scheduled',
        processingTimeSeconds: parseFloat(duration),
        memoryUsageMB: finalMemory,
      };
      await env.GTFS_CACHE.put(GTFS_METADATA_KEY, JSON.stringify(metadata), {
        expirationTtl: CACHE_TTL * 7,
      });

      console.log('[Scheduled][Success] GTFS data updated successfully:', metadata);
    } catch (error) {
      const currentMemory = getEstimatedMemoryUsageMB();
      console.error('[Scheduled][Error] Failed to update GTFS data:', error);
      console.error(`[Scheduled][Memory] Memory usage at error: ${currentMemory.toFixed(2)} MB`);
      
      // Check if error is memory-related
      if (error instanceof Error) {
        if (error.message.includes('memory') || error.message.includes('heap') || 
            error.message.includes('allocation') || currentMemory > MEMORY_LIMIT_WARNING_MB) {
          console.error('[Scheduled][Memory Error] Possible memory limit exceeded. Consider optimizing data processing or increasing worker limits.');
        }
      }
      
      throw error; // Re-throw to mark the scheduled event as failed
    }
  },
};
