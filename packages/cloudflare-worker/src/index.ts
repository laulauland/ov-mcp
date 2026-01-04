/**
 * OV-MCP Server - Cloudflare Worker
 * Dutch Public Transport MCP Server using Cloudflare Agents SDK
 *
 * Uses createMcpHandler from agents/mcp for Streamable HTTP transport
 * Note: Local dev (wrangler dev) fails due to cloudflare:email import in agents SDK
 * Deploy with `wrangler deploy` to test
 * 
 * ARCHITECTURE:
 * - Worker: Lightweight proxy handling API requests, delegates to container service
 * - Container Service: 8GB service that handles all GTFS processing and caching
 * - KV Storage: Managed entirely by the container service
 * - All memory-intensive operations (download, parse, cache) happen in the container
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler } from "agents/mcp";
import { z } from "zod";

import { GTFSFeed, GTFSStop, GTFSRoute } from '@ov-mcp/gtfs-parser';

// Container service configuration
const CONTAINER_TIMEOUT_MS = 180000; // 3 minutes for container operations

// Environment interface for Cloudflare Worker
export interface Env {
  GTFS_CONTAINER: Fetcher; // Cloudflare Container Service binding
  ENVIRONMENT?: string;
}

/**
 * Container interface - now represents HTTP service calls
 * This provides a clean abstraction for accessing the remote GTFS container service
 */
interface IGTFSContainer {
  getGTFSData(): Promise<GTFSFeed | null>;
  updateGTFSData(): Promise<{ success: boolean; metadata?: any; error?: string }>;
  getMetadata(): Promise<any | null>;
}

/**
 * Container client using Cloudflare Service Binding
 * All GTFS processing happens in the 8GB container service
 * Uses proper Worker-to-Container communication via service binding
 */
class GTFSContainerClient implements IGTFSContainer {
  private container: Fetcher;

  constructor(container: Fetcher) {
    this.container = container;
  }

  /**
   * Make request to container service with timeout and error handling
   * Uses container.fetch() for direct Worker-to-Container communication
   */
  private async callContainer<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    // Container bindings use relative URLs
    const url = `http://container${endpoint}`;
    
    console.log(`[Container Client] Calling container service: ${endpoint}`);
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONTAINER_TIMEOUT_MS);

      // Use container binding's fetch method for Worker-to-Container communication
      const response = await this.container.fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      const duration = Date.now() - startTime;
      console.log(`[Container Client] Response received in ${duration}ms, status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Container service error (${response.status}): ${errorText}`);
      }

      const data = await response.json() as T;
      return data;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[Container Client] Error after ${duration}ms:`, error);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Container service timeout after ${CONTAINER_TIMEOUT_MS}ms`);
      }

      throw error;
    }
  }

  /**
   * Get GTFS data from container service
   * Container handles all caching and lazy loading
   */
  async getGTFSData(): Promise<GTFSFeed | null> {
    try {
      const response = await this.callContainer<{ data: GTFSFeed | null }>('/api/gtfs/data');
      return response.data;
    } catch (error) {
      console.error('[Container Client] Failed to get GTFS data:', error);
      return null;
    }
  }

  /**
   * Trigger GTFS data update in container service
   * Container handles download, processing, and storage
   */
  async updateGTFSData(): Promise<{ success: boolean; metadata?: any; error?: string }> {
    try {
      const response = await this.callContainer<{
        success: boolean;
        metadata?: any;
        error?: string;
      }>('/api/gtfs/update', {
        method: 'POST',
      });
      return response;
    } catch (error) {
      console.error('[Container Client] Failed to update GTFS data:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get metadata from container service
   */
  async getMetadata(): Promise<any | null> {
    try {
      const response = await this.callContainer<{ metadata: any | null }>('/api/gtfs/metadata');
      return response.metadata;
    } catch (error) {
      console.error('[Container Client] Failed to get metadata:', error);
      return null;
    }
  }
}

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
 * Haversine distance calculation for nearby stops
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Get container client - creates client using the service binding
 */
function getContainer(env: Env): IGTFSContainer {
  if (!env.GTFS_CONTAINER) {
    throw new Error('GTFS_CONTAINER binding not configured');
  }
  return new GTFSContainerClient(env.GTFS_CONTAINER);
}

/**
 * Create the MCP Server with all tools registered
 */
function createServer(container: IGTFSContainer): McpServer {
  const server = new McpServer({
    name: "ov-mcp",
    version: "0.4.0",
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
      const feed = await container.getGTFSData();

      if (!feed) {
        return {
          content: [{ type: "text", text: "GTFS data not available. The container service may be initializing or experiencing issues." }],
        };
      }

      // Simple search implementation (matching original GTFSQuery.searchStopsByName behavior)
      const lowerQuery = query.toLowerCase();
      const stops = feed.stops
        .filter(stop => stop.stop_name.toLowerCase().includes(lowerQuery))
        .slice(0, limit);

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
      const feed = await container.getGTFSData();

      if (!feed) {
        return {
          content: [{ type: "text", text: "GTFS data not available." }],
        };
      }

      const stop = feed.stops.find(s => s.stop_id === stop_id);

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
      const feed = await container.getGTFSData();

      if (!feed) {
        return {
          content: [{ type: "text", text: "GTFS data not available." }],
        };
      }

      // Calculate distances and filter
      const stopsWithDistance = feed.stops
        .map(stop => ({
          stop,
          distance: calculateDistance(latitude, longitude, stop.stop_lat, stop.stop_lon),
        }))
        .filter(item => item.distance <= radius_km)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, limit);

      if (stopsWithDistance.length === 0) {
        return {
          content: [{ type: "text", text: `No stops found within ${radius_km}km of (${latitude}, ${longitude}).` }],
        };
      }

      const formattedStops = stopsWithDistance.map(item => ({
        ...formatStop(item.stop),
        distance_km: Math.round(item.distance * 100) / 100,
      }));

      return {
        content: [{
          type: "text",
          text: `Found ${stopsWithDistance.length} stop(s) within ${radius_km}km:\n\n${JSON.stringify(formattedStops, null, 2)}`
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
      const feed = await container.getGTFSData();

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

/**
 * Utility endpoints handler (health check and API info)
 */
async function handleUtilityRequest(request: Request, container: IGTFSContainer, env: Env, url: URL): Promise<Response | null> {
  // Health check endpoint
  if (url.pathname === '/health') {
    const metadata = await container.getMetadata();
    const containerConfigured = !!env.GTFS_CONTAINER;

    return new Response(
      JSON.stringify({
        status: 'ok',
        environment: env.ENVIRONMENT || 'development',
        timestamp: new Date().toISOString(),
        container_configured: containerConfigured,
        container_binding: 'GTFS_CONTAINER (Service Binding)',
        gtfs_data_available: metadata !== null,
        gtfs_metadata: metadata,
        architecture: {
          mode: 'cloudflare-service-binding',
          worker_role: 'lightweight-proxy',
          container_role: '8GB-service-handles-all-processing',
          description: 'Worker delegates all GTFS operations to container service via Cloudflare Service Binding',
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
        version: '0.4.0',
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
          mode: 'cloudflare-service-binding',
          worker_role: 'lightweight-proxy',
          container_role: '8GB-service-handles-all-processing',
          description: 'All GTFS download, parsing, and caching happens in the container service. Worker is a lightweight proxy using Cloudflare Service Binding.',
        },
        documentation: 'https://github.com/laulauland/ov-mcp',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return null;
}

/**
 * Main Worker export using Cloudflare Service Binding pattern
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Validate container service binding
    if (!env.GTFS_CONTAINER) {
      console.error('[Worker] GTFS_CONTAINER binding not configured');
      return new Response(
        JSON.stringify({
          error: 'Container service not configured',
          message: 'GTFS_CONTAINER service binding is required. Please configure it in wrangler.toml',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Get container client for this request
    const container = getContainer(env);

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
    const utilityResponse = await handleUtilityRequest(request, container, env, url);
    if (utilityResponse) {
      return utilityResponse;
    }

    // Route MCP requests through createMcpHandler
    if (url.pathname === '/mcp') {
      try {
        // Create MCP server with container client
        const mcpServer = createServer(container);
        
        // Create handler with the server
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
   * Scheduled handler for automatic GTFS data updates
   * Triggered by cron: every Sunday at 3am UTC
   * Delegates to container service which handles all processing
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('[Scheduled] GTFS update triggered at:', new Date(event.scheduledTime).toISOString());

    if (!env.GTFS_CONTAINER) {
      console.error('[Scheduled] GTFS_CONTAINER binding not configured - skipping scheduled update');
      return;
    }

    // Get container client for scheduled job
    const container = getContainer(env);

    try {
      console.log('[Scheduled] Calling container service to update GTFS data...');
      const result = await container.updateGTFSData();
      
      if (result.success) {
        console.log('[Scheduled] GTFS data updated successfully by container service:', result.metadata);
      } else {
        console.error('[Scheduled] Container service failed to update GTFS data:', result.error);
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('[Scheduled] Unexpected error during container service call:', error);
      throw error; // Re-throw to mark the scheduled event as failed
    }
  },
};
