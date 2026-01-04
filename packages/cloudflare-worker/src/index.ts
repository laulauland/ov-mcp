/**
 * OV-MCP Server - Cloudflare Worker
 * Dutch Public Transport MCP Server using Cloudflare Agents SDK
 *
 * Uses createMcpHandler from agents/mcp for Streamable HTTP transport
 * Note: Local dev (wrangler dev) fails due to cloudflare:email import in agents SDK
 * Deploy with `wrangler deploy` to test
 * 
 * ARCHITECTURE:
 * - Worker: Handles API requests, KV caching, and MCP protocol
 * - GTFS_PROCESSOR Container: Handles heavy 186MB GTFS file processing
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler } from "agents/mcp";
import { z } from "zod";

import { GTFSFeed, GTFSStop, GTFSRoute, GTFSQuery } from '@ov-mcp/gtfs-parser';

// Cache configuration
const CACHE_TTL = 60 * 60 * 24; // 24 hours in seconds
const GTFS_DATA_KEY = 'gtfs:data:v1';
const GTFS_METADATA_KEY = 'gtfs:metadata:v1';

// Container timeout (30 seconds for heavy processing)
const CONTAINER_TIMEOUT_MS = 30000;

// Environment interface for Cloudflare Worker
export interface Env {
  GTFS_CACHE?: KVNamespace;
  GTFS_PROCESSOR?: Fetcher; // Container binding for GTFS processing
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
 * Process GTFS data using the GTFS_PROCESSOR container
 * The container handles the heavy 186MB file processing
 */
async function processGTFSInContainer(feedUrl: string): Promise<GTFSFeed> {
  if (!globalEnv?.GTFS_PROCESSOR) {
    throw new Error('GTFS_PROCESSOR container binding not configured');
  }

  console.log(`[Container] Sending GTFS processing request to container for: ${feedUrl}`);
  const startTime = Date.now();

  try {
    // Create request to container with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONTAINER_TIMEOUT_MS);

    const response = await globalEnv.GTFS_PROCESSOR.fetch('http://gtfs-processor/process', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        feedUrl: feedUrl,
        options: {
          includeProgress: true,
        }
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Container processing failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json() as {
      success: boolean;
      feed?: GTFSFeed;
      metadata?: {
        processingTimeMs: number;
        stopCount: number;
        routeCount: number;
        tripCount: number;
        agencyCount: number;
      };
      error?: string;
    };

    const duration = Date.now() - startTime;
    
    if (!result.success || !result.feed) {
      throw new Error(`Container processing failed: ${result.error || 'Unknown error'}`);
    }

    console.log(`[Container] Processing complete in ${duration}ms`);
    if (result.metadata) {
      console.log(`[Container] Stats: ${result.metadata.stopCount} stops, ${result.metadata.routeCount} routes, ${result.metadata.tripCount} trips, ${result.metadata.agencyCount} agencies`);
    }

    return result.feed;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[Container] Error after ${duration}ms:`, error);
    
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Container processing timed out after ${CONTAINER_TIMEOUT_MS}ms`);
    }
    
    throw error;
  }
}

/**
 * Get GTFS data from KV cache, with lazy loading via container on first request
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

    // Lazy load: Use container to process GTFS data on first request
    console.log('GTFS data not in cache, delegating to container for processing...');
    const feedUrl = globalEnv.GTFS_FEED_URL || 'http://gtfs.ovapi.nl/gtfs-nl.zip';
    
    const startTime = Date.now();
    
    // Delegate heavy processing to container
    const feed = await processGTFSInContainer(feedUrl);

    const duration = Date.now() - startTime;
    
    console.log(`[Worker] Total processing time: ${duration}ms`);
    console.log(`[Worker] Storing processed data in KV cache...`);

    // Store in KV for future requests
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
      processingTimeMs: duration,
      processedBy: 'container',
    };
    await globalEnv.GTFS_CACHE.put(GTFS_METADATA_KEY, JSON.stringify(metadata), {
      expirationTtl: CACHE_TTL * 7,
    });

    console.log('[Worker] GTFS data cached successfully');
    return feed;
  } catch (error) {
    console.error('[Worker] Failed to fetch GTFS data:', error);
    
    // Provide helpful error messages
    if (error instanceof Error) {
      if (error.message.includes('GTFS_PROCESSOR')) {
        console.error('[Worker] Container binding error. Ensure GTFS_PROCESSOR is configured in wrangler.toml');
      } else if (error.message.includes('timeout')) {
        console.error('[Worker] Container processing timed out. The 186MB GTFS file may require more time to process.');
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
    version: "0.3.0",
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
    let containerConfigured = !!env.GTFS_PROCESSOR;

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
        container_configured: containerConfigured,
        gtfs_data_available: metadata !== null,
        gtfs_metadata: metadata,
        architecture: {
          worker: 'Handles API requests and KV caching',
          container: 'Processes heavy 186MB GTFS files',
        },
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
        version: '0.3.0',
        description: 'Model Context Protocol server for Dutch public transport data',
        mcp_endpoint: '/mcp',
        endpoints: {
          health: 'GET /health',
          mcp: 'POST /mcp (MCP protocol via Streamable HTTP transport)',
        },
        transports: {
          streamable_http: '/mcp (recommended)',
        },
        architecture: {
          worker: 'Handles API requests and KV caching',
          container: 'GTFS_PROCESSOR handles heavy GTFS file processing',
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
   * Scheduled handler for automatic GTFS data updates using container
   * Triggered by cron: every Sunday at 3am UTC
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('[Scheduled] GTFS update triggered at:', new Date(event.scheduledTime).toISOString());

    if (!env.GTFS_CACHE) {
      console.error('[Scheduled] GTFS_CACHE KV namespace not configured - skipping scheduled update');
      return;
    }

    if (!env.GTFS_PROCESSOR) {
      console.error('[Scheduled] GTFS_PROCESSOR container not configured - skipping scheduled update');
      return;
    }

    try {
      // Delegate GTFS processing to container
      const feedUrl = env.GTFS_FEED_URL || 'http://gtfs.ovapi.nl/gtfs-nl.zip';
      console.log('[Scheduled] Delegating GTFS processing to container:', feedUrl);

      const startTime = Date.now();

      // Use container for heavy processing
      const feed = await processGTFSInContainer(feedUrl);

      const duration = Date.now() - startTime;
      
      console.log(`[Scheduled] Container processing complete in ${duration}ms`);
      console.log(`[Scheduled] Received: ${feed.stops.length} stops, ${feed.routes.length} routes, ${feed.trips.length} trips, ${feed.agencies.length} agencies`);

      // Store in KV
      console.log('[Scheduled] Storing processed data in KV cache...');
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
        processingTimeMs: duration,
        processedBy: 'container',
      };
      await env.GTFS_CACHE.put(GTFS_METADATA_KEY, JSON.stringify(metadata), {
        expirationTtl: CACHE_TTL * 7,
      });

      console.log('[Scheduled] GTFS data updated successfully:', metadata);
    } catch (error) {
      console.error('[Scheduled] Failed to update GTFS data:', error);
      
      if (error instanceof Error) {
        if (error.message.includes('GTFS_PROCESSOR')) {
          console.error('[Scheduled] Container binding error. Ensure GTFS_PROCESSOR is configured in wrangler.toml');
        } else if (error.message.includes('timeout')) {
          console.error('[Scheduled] Container processing timed out. Consider increasing CONTAINER_TIMEOUT_MS.');
        }
      }
      
      throw error; // Re-throw to mark the scheduled event as failed
    }
  },
};
