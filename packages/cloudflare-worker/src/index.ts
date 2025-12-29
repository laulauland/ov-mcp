/**
 * Cloudflare Worker entry point for OV-MCP server
 * Handles HTTP requests and provides MCP server functionality
 */

import { GTFSParser, GTFSQuery, GTFSFeed, GTFSStop, GTFSRoute } from '@ov-mcp/gtfs-parser';

// Environment interface for Cloudflare Worker
interface Env {
  GTFS_CACHE: KVNamespace;
  ENVIRONMENT?: string;
  GTFS_UPDATE_SECRET?: string;
}

// Cache configuration
const CACHE_TTL = 60 * 60 * 24; // 24 hours in seconds
const GTFS_DATA_KEY = 'gtfs:data:v1';
const GTFS_METADATA_KEY = 'gtfs:metadata:v1';

/**
 * HTTP Transport for MCP over HTTP
 */
class HTTPTransport {
  constructor(private request: Request, private env: Env) {}

  async start(): Promise<Response> {
    try {
      const body = await this.request.json();
      const response = await this.handleMCPRequest(body);
      
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: 'Invalid request',
          message: error instanceof Error ? error.message : 'Unknown error',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  }

  private async handleMCPRequest(body: any) {
    // Handle MCP protocol messages
    const { method, params } = body;

    switch (method) {
      case 'initialize':
        return this.handleInitialize();
      case 'tools/list':
        return this.handleToolsList();
      case 'tools/call':
        return this.handleToolCall(params);
      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  private handleInitialize() {
    return {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
      },
      serverInfo: {
        name: '@ov-mcp/server',
        version: '0.1.0',
      },
    };
  }

  private handleToolsList() {
    return {
      tools: [
        {
          name: 'get_stops',
          description: 'Search for public transport stops in the Netherlands by name',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query for stop name',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results to return',
                default: 10,
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'get_stop_by_id',
          description: 'Get detailed information about a specific stop by its ID',
          inputSchema: {
            type: 'object',
            properties: {
              stop_id: {
                type: 'string',
                description: 'The unique GTFS stop ID',
              },
            },
            required: ['stop_id'],
          },
        },
        {
          name: 'find_stops_nearby',
          description: 'Find public transport stops near a specific coordinate',
          inputSchema: {
            type: 'object',
            properties: {
              latitude: {
                type: 'number',
                description: 'Latitude coordinate',
              },
              longitude: {
                type: 'number',
                description: 'Longitude coordinate',
              },
              radius_km: {
                type: 'number',
                description: 'Search radius in kilometers',
                default: 1,
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results',
                default: 10,
              },
            },
            required: ['latitude', 'longitude'],
          },
        },
        {
          name: 'get_routes',
          description: 'Search for public transport routes by name or number',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query for route name or number',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results',
                default: 10,
              },
            },
            required: ['query'],
          },
        },
      ],
    };
  }

  private async handleToolCall(params: any) {
    const { name, arguments: args } = params;

    switch (name) {
      case 'get_stops':
        return await this.getStops(args);
      case 'get_stop_by_id':
        return await this.getStopById(args);
      case 'find_stops_nearby':
        return await this.findStopsNearby(args);
      case 'get_routes':
        return await this.getRoutes(args);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private async getStops(args: { query: string; limit?: number }) {
    const { query, limit = 10 } = args;

    try {
      const feed = await this.getCachedGTFSData();

      if (!feed) {
        return {
          content: [
            {
              type: 'text',
              text: 'GTFS data not available. Please ensure data is loaded into KV storage.',
            },
          ],
        };
      }

      const stops = GTFSQuery.searchStopsByName(feed.stops, query, Math.min(limit, 100));

      if (stops.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No stops found matching "${query}".`,
            },
          ],
        };
      }

      const formattedStops = stops.map(stop => ({
        id: stop.stop_id,
        name: stop.stop_name,
        code: stop.stop_code,
        location: {
          latitude: stop.stop_lat,
          longitude: stop.stop_lon,
        },
        type: this.getStopType(stop.location_type),
        wheelchair_accessible: stop.wheelchair_boarding === '1',
      }));

      return {
        content: [
          {
            type: 'text',
            text: `Found ${stops.length} stop(s):\n\n${JSON.stringify(formattedStops, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  private async getStopById(args: { stop_id: string }) {
    const { stop_id } = args;

    try {
      const feed = await this.getCachedGTFSData();

      if (!feed) {
        return {
          content: [
            {
              type: 'text',
              text: 'GTFS data not available.',
            },
          ],
        };
      }

      const stop = GTFSQuery.getStopById(feed.stops, stop_id);

      if (!stop) {
        return {
          content: [
            {
              type: 'text',
              text: `Stop with ID "${stop_id}" not found.`,
            },
          ],
        };
      }

      const formattedStop = {
        id: stop.stop_id,
        code: stop.stop_code,
        name: stop.stop_name,
        description: stop.stop_desc,
        location: {
          latitude: stop.stop_lat,
          longitude: stop.stop_lon,
        },
        type: this.getStopType(stop.location_type),
        wheelchair_accessible: stop.wheelchair_boarding === '1',
        parent_station: stop.parent_station,
        platform_code: stop.platform_code,
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(formattedStop, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  private async findStopsNearby(args: { latitude: number; longitude: number; radius_km?: number; limit?: number }) {
    const { latitude, longitude, radius_km = 1, limit = 10 } = args;

    try {
      const feed = await this.getCachedGTFSData();

      if (!feed) {
        return {
          content: [
            {
              type: 'text',
              text: 'GTFS data not available.',
            },
          ],
        };
      }

      const stops = GTFSQuery.findStopsNear(
        feed.stops, 
        latitude, 
        longitude, 
        Math.min(radius_km, 10),
        Math.min(limit, 50)
      );

      if (stops.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No stops found within ${radius_km}km of (${latitude}, ${longitude}).`,
            },
          ],
        };
      }

      const formattedStops = stops.map(stop => ({
        id: stop.stop_id,
        name: stop.stop_name,
        code: stop.stop_code,
        location: {
          latitude: stop.stop_lat,
          longitude: stop.stop_lon,
        },
        type: this.getStopType(stop.location_type),
      }));

      return {
        content: [
          {
            type: 'text',
            text: `Found ${stops.length} stop(s) within ${radius_km}km:\n\n${JSON.stringify(formattedStops, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  private async getRoutes(args: { query: string; limit?: number }) {
    const { query, limit = 10 } = args;

    try {
      const feed = await this.getCachedGTFSData();

      if (!feed) {
        return {
          content: [
            {
              type: 'text',
              text: 'GTFS data not available.',
            },
          ],
        };
      }

      const lowerQuery = query.toLowerCase();
      const routes = feed.routes
        .filter(route => 
          route.route_short_name.toLowerCase().includes(lowerQuery) ||
          route.route_long_name.toLowerCase().includes(lowerQuery)
        )
        .slice(0, Math.min(limit, 100));

      if (routes.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No routes found matching "${query}".`,
            },
          ],
        };
      }

      const formattedRoutes = routes.map(route => ({
        id: route.route_id,
        short_name: route.route_short_name,
        long_name: route.route_long_name,
        type: this.getRouteType(route.route_type),
        color: route.route_color ? `#${route.route_color}` : undefined,
      }));

      return {
        content: [
          {
            type: 'text',
            text: `Found ${routes.length} route(s):\n\n${JSON.stringify(formattedRoutes, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  private async getCachedGTFSData(): Promise<GTFSFeed | null> {
    try {
      const cached = await this.env.GTFS_CACHE.get(GTFS_DATA_KEY, 'json');
      return cached as GTFSFeed | null;
    } catch (error) {
      console.error('Error fetching from KV:', error);
      return null;
    }
  }

  private getStopType(locationType?: string): string {
    switch (locationType) {
      case '0': return 'stop';
      case '1': return 'station';
      case '2': return 'entrance/exit';
      case '3': return 'generic node';
      case '4': return 'boarding area';
      default: return 'stop';
    }
  }

  private getRouteType(routeType: string): string {
    const typeMap: Record<string, string> = {
      '0': 'Tram',
      '1': 'Metro',
      '2': 'Rail',
      '3': 'Bus',
      '4': 'Ferry',
      '700': 'Bus Service',
      '1000': 'Water Transport',
    };
    return typeMap[routeType] || `Route Type ${routeType}`;
  }
}

/**
 * Download and cache GTFS data from gtfs.ovapi.nl
 */
async function downloadAndCacheGTFS(env: Env): Promise<Response> {
  try {
    console.log('Downloading GTFS data from gtfs.ovapi.nl...');
    const response = await fetch('http://gtfs.ovapi.nl/gtfs-nl.zip');
    
    if (!response.ok) {
      throw new Error(`Failed to download GTFS: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    console.log(`Downloaded ${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`);

    // Extract and parse GTFS data
    // Note: In a real Cloudflare Worker, you'd need to use a WASM-based unzip
    // or pre-process the data. For now, we assume pre-processed JSON data.
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'GTFS download initiated. Use the upload endpoint to complete caching.',
        size: arrayBuffer.byteLength 
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * Main Worker handler
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    // Health check endpoint
    if (url.pathname === '/health') {
      const metadata = await env.GTFS_CACHE.get(GTFS_METADATA_KEY, 'json');
      
      return new Response(
        JSON.stringify({
          status: 'ok',
          environment: env.ENVIRONMENT || 'development',
          timestamp: new Date().toISOString(),
          gtfs_data_available: metadata !== null,
          gtfs_metadata: metadata,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // MCP endpoint
    if (url.pathname === '/mcp' && request.method === 'POST') {
      const transport = new HTTPTransport(request, env);
      return transport.start();
    }

    // Admin endpoint to update GTFS cache (requires secret)
    if (url.pathname === '/admin/update-gtfs' && request.method === 'POST') {
      // Check authentication
      const authHeader = request.headers.get('Authorization');
      const secret = env.GTFS_UPDATE_SECRET;
      
      if (secret && authHeader !== `Bearer ${secret}`) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      const data = await request.json() as GTFSFeed;
      
      // Validate data structure
      if (!data.stops || !data.routes) {
        return new Response(
          JSON.stringify({ error: 'Invalid GTFS data structure' }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      // Store data in KV
      await env.GTFS_CACHE.put(GTFS_DATA_KEY, JSON.stringify(data), {
        expirationTtl: CACHE_TTL,
      });

      // Store metadata
      const metadata = {
        lastUpdated: new Date().toISOString(),
        stopCount: data.stops.length,
        routeCount: data.routes.length,
        tripCount: data.trips.length,
      };
      await env.GTFS_CACHE.put(GTFS_METADATA_KEY, JSON.stringify(metadata), {
        expirationTtl: CACHE_TTL,
      });
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'GTFS data updated',
          metadata,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Admin endpoint to download GTFS from source
    if (url.pathname === '/admin/download-gtfs' && request.method === 'POST') {
      const authHeader = request.headers.get('Authorization');
      const secret = env.GTFS_UPDATE_SECRET;
      
      if (secret && authHeader !== `Bearer ${secret}`) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      return await downloadAndCacheGTFS(env);
    }

    // Root path - API info
    if (url.pathname === '/') {
      return new Response(
        JSON.stringify({
          name: 'OV-MCP Server',
          version: '0.1.0',
          description: 'Model Context Protocol server for Dutch public transport data',
          endpoints: {
            health: 'GET /health',
            mcp: 'POST /mcp',
            admin: {
              update: 'POST /admin/update-gtfs (requires Authorization header)',
              download: 'POST /admin/download-gtfs (requires Authorization header)',
            },
          },
          documentation: 'https://github.com/laulauland/ov-mcp',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response('Not Found', { status: 404 });
  },
};
