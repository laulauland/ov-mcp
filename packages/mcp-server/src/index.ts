#!/usr/bin/env bun
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { GTFSDownloader, GTFSQuery, GTFSFeed } from "@ov-mcp/gtfs-parser";
import * as fs from "fs/promises";
import * as path from "path";

/**
 * Local file system cache for GTFS data (for mcp-server only)
 */
class GTFSCache {
  private static readonly CACHE_DIR = './data/gtfs-cache';
  private static readonly CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

  static async save(feed: GTFSFeed): Promise<void> {
    try {
      await fs.mkdir(this.CACHE_DIR, { recursive: true });

      const cacheFile = path.join(this.CACHE_DIR, 'gtfs-feed.json');
      const metaFile = path.join(this.CACHE_DIR, 'metadata.json');

      await fs.writeFile(cacheFile, JSON.stringify(feed));
      await fs.writeFile(metaFile, JSON.stringify({
        lastUpdated: new Date().toISOString(),
        stopCount: feed.stops.length,
        routeCount: feed.routes.length,
        tripCount: feed.trips.length,
      }));

      console.error(`Cached GTFS data to ${cacheFile}`);
    } catch (error) {
      console.error('Error saving to cache:', error);
    }
  }

  static async load(): Promise<GTFSFeed | null> {
    try {
      const cacheFile = path.join(this.CACHE_DIR, 'gtfs-feed.json');
      const metaFile = path.join(this.CACHE_DIR, 'metadata.json');

      // Check if cache exists
      try {
        await fs.access(cacheFile);
      } catch {
        return null;
      }

      // Check cache age
      const metadata = JSON.parse(await fs.readFile(metaFile, 'utf-8'));
      const lastUpdated = new Date(metadata.lastUpdated);
      const now = new Date();

      if (now.getTime() - lastUpdated.getTime() > this.CACHE_DURATION_MS) {
        console.error('Cache expired');
        return null;
      }

      // Load and return cached data
      const data = await fs.readFile(cacheFile, 'utf-8');
      console.error('Loaded GTFS data from cache');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading from cache:', error);
      return null;
    }
  }
}

/**
 * OV-MCP Server
 * Model Context Protocol server for Dutch public transport (OV) data
 */
class OVMCPServer {
  private server: Server;
  private gtfsFeed: GTFSFeed | null = null;
  private isLoading = false;

  constructor() {
    this.server = new Server(
      {
        name: "ov-mcp",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
    this.initializeGTFSData();
  }

  /**
   * Initialize GTFS data on startup
   */
  private async initializeGTFSData(): Promise<void> {
    if (this.isLoading || this.gtfsFeed) return;

    this.isLoading = true;
    console.error('Initializing GTFS data...');

    try {
      // Try to load from cache first
      const cached = await GTFSCache.load();
      if (cached) {
        this.gtfsFeed = cached;
      } else {
        // Download fresh data
        console.error('Cache miss - downloading fresh GTFS data...');
        this.gtfsFeed = await GTFSDownloader.fetchAndParse();
        await GTFSCache.save(this.gtfsFeed);
      }

      console.error('GTFS data loaded successfully');
      console.error(`- ${this.gtfsFeed.stops.length} stops`);
      console.error(`- ${this.gtfsFeed.routes.length} routes`);
      console.error(`- ${this.gtfsFeed.agencies.length} agencies`);
    } catch (error) {
      console.error('Failed to load GTFS data:', error);
      console.error('Server will continue with limited functionality');
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Ensure GTFS data is loaded
   */
  private async ensureGTFSData(): Promise<GTFSFeed> {
    if (this.gtfsFeed) {
      return this.gtfsFeed;
    }

    if (this.isLoading) {
      // Wait for loading to complete
      await new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (!this.isLoading) {
            clearInterval(checkInterval);
            resolve(null);
          }
        }, 100);
      });
      
      if (this.gtfsFeed) {
        return this.gtfsFeed;
      }
    }

    // Try to load again
    await this.initializeGTFSData();
    
    if (!this.gtfsFeed) {
      throw new Error('GTFS data is not available');
    }

    return this.gtfsFeed;
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: Tool[] = [
        {
          name: "get_stops",
          description: "Search for public transport stops in the Netherlands by name. Returns stop details including coordinates and type.",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Search query for stop name (e.g., 'Amsterdam Centraal', 'Rotterdam', 'Schiphol')",
              },
              limit: {
                type: "number",
                description: "Maximum number of results to return (default: 10, max: 100)",
                default: 10,
              },
            },
            required: ["query"],
          },
        },
        {
          name: "get_stop_by_id",
          description: "Get detailed information about a specific stop by its ID",
          inputSchema: {
            type: "object",
            properties: {
              stop_id: {
                type: "string",
                description: "The unique GTFS stop ID",
              },
            },
            required: ["stop_id"],
          },
        },
        {
          name: "find_stops_nearby",
          description: "Find public transport stops near a specific coordinate within a given radius",
          inputSchema: {
            type: "object",
            properties: {
              latitude: {
                type: "number",
                description: "Latitude coordinate",
              },
              longitude: {
                type: "number",
                description: "Longitude coordinate",
              },
              radius_km: {
                type: "number",
                description: "Search radius in kilometers (default: 1, max: 10)",
                default: 1,
              },
              limit: {
                type: "number",
                description: "Maximum number of results to return (default: 10, max: 50)",
                default: 10,
              },
            },
            required: ["latitude", "longitude"],
          },
        },
        {
          name: "get_routes",
          description: "Search for public transport routes (lines) by name or number",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Search query for route name or number (e.g., 'Intercity', '1', 'Tram 2')",
              },
              limit: {
                type: "number",
                description: "Maximum number of results to return (default: 10, max: 100)",
                default: 10,
              },
            },
            required: ["query"],
          },
        },
      ];

      return { tools };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "get_stops":
            return await this.handleGetStops(args);

          case "get_stop_by_id":
            return await this.handleGetStopById(args);

          case "find_stops_nearby":
            return await this.handleFindStopsNearby(args);

          case "get_routes":
            return await this.handleGetRoutes(args);

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  private async handleGetStops(args: any) {
    const query = args.query as string;
    const limit = Math.min((args.limit as number) || 10, 100);

    try {
      const feed = await this.ensureGTFSData();
      const stops = GTFSQuery.searchStopsByName(feed.stops, query, limit);

      if (stops.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No stops found matching "${query}". Try a different search term or check the spelling.`,
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
        parent_station: stop.parent_station,
      }));

      return {
        content: [
          {
            type: "text",
            text: `Found ${stops.length} stop(s) matching "${query}":\n\n${JSON.stringify(formattedStops, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to search stops: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async handleGetStopById(args: any) {
    const stopId = args.stop_id as string;

    try {
      const feed = await this.ensureGTFSData();
      const stop = GTFSQuery.getStopById(feed.stops, stopId);

      if (!stop) {
        return {
          content: [
            {
              type: "text",
              text: `Stop with ID "${stopId}" not found.`,
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
        url: stop.stop_url,
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(formattedStop, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to get stop: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async handleFindStopsNearby(args: any) {
    const latitude = args.latitude as number;
    const longitude = args.longitude as number;
    const radiusKm = Math.min((args.radius_km as number) || 1, 10);
    const limit = Math.min((args.limit as number) || 10, 50);

    try {
      const feed = await this.ensureGTFSData();
      const stops = GTFSQuery.findStopsNear(feed.stops, latitude, longitude, radiusKm, limit);

      if (stops.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No stops found within ${radiusKm}km of coordinates (${latitude}, ${longitude}). Try increasing the search radius.`,
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
            type: "text",
            text: `Found ${stops.length} stop(s) within ${radiusKm}km:\n\n${JSON.stringify(formattedStops, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to find nearby stops: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async handleGetRoutes(args: any) {
    const query = args.query as string;
    const limit = Math.min((args.limit as number) || 10, 100);

    try {
      const feed = await this.ensureGTFSData();
      const lowerQuery = query.toLowerCase();
      
      const routes = feed.routes
        .filter(route => 
          route.route_short_name.toLowerCase().includes(lowerQuery) ||
          route.route_long_name.toLowerCase().includes(lowerQuery)
        )
        .slice(0, limit);

      if (routes.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No routes found matching "${query}". Try a different search term.`,
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
        agency_id: route.agency_id,
      }));

      return {
        content: [
          {
            type: "text",
            text: `Found ${routes.length} route(s) matching "${query}":\n\n${JSON.stringify(formattedRoutes, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to search routes: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      '5': 'Cable car',
      '6': 'Gondola',
      '7': 'Funicular',
      '100': 'Railway Service',
      '102': 'Long Distance Trains',
      '103': 'Inter Regional Rail',
      '109': 'Suburban Railway',
      '400': 'Urban Railway Service',
      '700': 'Bus Service',
      '715': 'Demand and Response Bus',
      '1000': 'Water Transport Service',
    };
    return typeMap[routeType] || `Route Type ${routeType}`;
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("OV-MCP Server running on stdio");
  }
}

// Start the server
const server = new OVMCPServer();
server.run().catch(console.error);
