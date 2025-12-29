/**
 * Cloudflare Worker entry point for OV-MCP server
 * Handles HTTP requests and provides MCP server functionality
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// Environment interface for Cloudflare Worker
interface Env {
  GTFS_CACHE: KVNamespace;
  ENVIRONMENT: string;
}

// Cache configuration
const CACHE_TTL = 60 * 60 * 24; // 24 hours in seconds
const GTFS_DATA_KEY = 'gtfs:data';

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
          description: 'Search for public transport stops in the Netherlands',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query for stop name or location',
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
      ],
    };
  }

  private async handleToolCall(params: any) {
    const { name, arguments: args } = params;

    switch (name) {
      case 'get_stops':
        return this.getStops(args);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private async getStops(args: { query: string; limit?: number }) {
    const { query, limit = 10 } = args;

    // Try to get cached GTFS data
    const cachedData = await this.getCachedGTFSData();

    if (!cachedData) {
      return {
        content: [
          {
            type: 'text',
            text: 'GTFS data not available. Please ensure data is loaded into KV storage.',
          },
        ],
      };
    }

    // Mock implementation - replace with actual GTFS parsing
    const stops = [
      {
        id: 'stop_1',
        name: `Stop matching "${query}"`,
        location: { lat: 52.3676, lon: 4.9041 },
      },
    ];

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(stops.slice(0, limit), null, 2),
        },
      ],
    };
  }

  private async getCachedGTFSData(): Promise<any | null> {
    try {
      const cached = await this.env.GTFS_CACHE.get(GTFS_DATA_KEY, 'json');
      return cached;
    } catch (error) {
      console.error('Error fetching from KV:', error);
      return null;
    }
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
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          environment: env.ENVIRONMENT || 'development',
          timestamp: new Date().toISOString(),
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

    // Admin endpoint to update GTFS cache
    if (url.pathname === '/admin/update-gtfs' && request.method === 'POST') {
      // This would be protected by auth in production
      const data = await request.json();
      await env.GTFS_CACHE.put(GTFS_DATA_KEY, JSON.stringify(data), {
        expirationTtl: CACHE_TTL,
      });
      
      return new Response(
        JSON.stringify({ success: true, message: 'GTFS data updated' }),
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
          version: '0.1.0',
          endpoints: {
            health: '/health',
            mcp: '/mcp (POST)',
            admin: '/admin/update-gtfs (POST)',
          },
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
