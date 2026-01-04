/**
 * OV-MCP Server - Cloudflare Worker
 * Dutch Public Transport MCP Server using Cloudflare Agents SDK
 *
 * Uses createMcpHandler from agents/mcp for Streamable HTTP transport
 * Note: Local dev (wrangler dev) fails due to cloudflare:email import in agents SDK
 * Deploy with `wrangler deploy` to test
 * 
 * ARCHITECTURE:
 * - Worker: Lightweight proxy handling API requests, delegates to Container
 * - Container: Handles all GTFS processing and caching
 * - KV Storage: Managed entirely by the Container
 * - All memory-intensive operations (download, parse, cache) happen in the Container
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler } from "agents/mcp";
import { z } from "zod";
import { DurableObject } from "cloudflare:workers";
import { getContainer } from "@cloudflare/containers";

import { GTFSFeed, GTFSStop, GTFSRoute } from '@ov-mcp/gtfs-parser';

// Container timeout configuration
const CONTAINER_TIMEOUT_MS = 180000; // 3 minutes for container operations

// Environment interface for Cloudflare Worker
export interface Env {
  GTFS_CONTAINER: DurableObjectNamespace; // Durable Object namespace binding
  ENVIRONMENT?: string;
}

/**
 * GTFSContainer Durable Object
 * Handles all GTFS processing and forwards requests to localhost:8080
 */
export class GTFSContainer extends DurableObject {
  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
  }

  async fetch(request: Request): Promise<Response> {
    // Forward all requests to localhost:8080
    const url = new URL(request.url);
    const forwardUrl = `http://localhost:8080${url.pathname}${url.search}`;
    
    try {
      const response = await fetch(forwardUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });
      
      return response;
    } catch (error) {
      console.error('[GTFSContainer] Error forwarding to localhost:8080:', error);
      return new Response(
        JSON.stringify({
          error: 'Failed to forward request',
          message: error instanceof Error ? error.message : 'Unknown error',
        }),
        {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  }
}

/**
 * Container interface - now represents Durable Object calls
 * This provides a clean abstraction for accessing the GTFS Durable Object
 */
interface IGTFSContainer {
  getGTFSData(): Promise<GTFSFeed | null>;
  updateGTFSData(): Promise<{ success: boolean; metadata?: any; error?: string }>;
  getMetadata(): Promise<any | null>;
}

/**
 * Container client using Durable Object pattern
 * All GTFS processing happens in the Durable Object
 * Uses proper Worker-to-DO communication via namespace.get(id).fetch()
 */
class GTFSContainerClient implements IGTFSContainer {
  private namespace: DurableObjectNamespace;
  private objectId: DurableObjectId;

  constructor(namespace: DurableObjectNamespace, objectId: DurableObjectId) {
    this.namespace = namespace;
    this.objectId = objectId;
  }

  /**
   * Make request to Durable Object with timeout and error handling
   * Uses namespace.get(id).fetch() for proper Worker-to-DO communication
   */
  private async callContainer<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    // Create request with full URL (required for DO fetch)
    const url = `https://dummy-host${endpoint}`;
    
    console.log(`[Container Client] Calling Durable Object: ${endpoint}`);
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONTAINER_TIMEOUT_MS);

      // Use Durable Object pattern: get stub and fetch
      const stub = this.namespace.get(this.objectId);
      const response = await stub.fetch(url, {
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
        throw new Error(`Durable Object error (${response.status}): ${errorText}`);
      }

      const data = await response.json() as T;
      return data;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[Container Client] Error after ${duration}ms:`, error);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Durable Object timeout after ${CONTAINER_TIMEOUT_MS}ms`);
      }

      throw error;
    }
  }

  /**
   * Get GTFS data from Durable Object
   * DO handles all caching and lazy loading
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
   * Trigger GTFS data update in Durable Object
   * DO handles download, processing, and storage
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
   * Get metadata from Durable Object
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
          content: [{ type: "text", text: "GTFS data not available. The Durable Object may be initializing or experiencing issues." }],
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
        container_binding: 'GTFS_CONTAINER (Durable Object Namespace)',
        gtfs_data_available: metadata !== null,
        gtfs_metadata: metadata,
        architecture: {
          mode: 'cloudflare-durable-object',
          worker_role: 'lightweight-proxy',
          container_role: 'durable-object-handles-all-processing',
          description: 'Worker delegates all GTFS operations to Durable Object via namespace.get(id).fetch()',
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
          mode: 'cloudflare-durable-object',
          worker_role: 'lightweight-proxy',
          container_role: 'durable-object-handles-all-processing',
          description: 'All GTFS download, parsing, and caching happens in the Durable Object. Worker is a lightweight proxy using proper DO pattern.',
        },
        documentation: 'https://github.com/laulauland/ov-mcp',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return null;
}

/**
 * Main Worker export using official @cloudflare/containers package
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Use official @cloudflare/containers package
    const container = getContainer(env, { name: 'GTFS_CONTAINER' });
    return container.fetch(request);
  },

  /**
   * Scheduled handler for automatic GTFS data updates
   * Triggered by cron: every Sunday at 3am UTC
   * Delegates to Durable Object which handles all processing
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('[Scheduled] GTFS update triggered at:', new Date(event.scheduledTime).toISOString());

    if (!env.GTFS_CONTAINER) {
      console.error('[Scheduled] GTFS_CONTAINER namespace binding not configured - skipping scheduled update');
      return;
    }

    // Get container client for scheduled job
    const container = new GTFSContainerClient(
      env.GTFS_CONTAINER,
      env.GTFS_CONTAINER.idFromName('gtfs-container')
    );

    try {
      console.log('[Scheduled] Calling Durable Object to update GTFS data...');
      const result = await container.updateGTFSData();
      
      if (result.success) {
        console.log('[Scheduled] GTFS data updated successfully by Durable Object:', result.metadata);
      } else {
        console.error('[Scheduled] Durable Object failed to update GTFS data:', result.error);
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('[Scheduled] Unexpected error during Durable Object call:', error);
      throw error; // Re-throw to mark the scheduled event as failed
    }
  },
};
