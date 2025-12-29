#!/usr/bin/env bun
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { GTFSLoader } from "./gtfs-loader.js";
import { findStops, planJourney, getRealtimeInfo } from "./tools.js";
import { logger } from "./logger.js";

/**
 * OV-MCP Server
 * Model Context Protocol server for Dutch public transport (OV) data
 * 
 * This server provides LLM agents with tools to:
 * - Search for public transport stops across the Netherlands
 * - Plan journeys between stations (especially Amsterdam)
 * - Get realtime departure and arrival information
 * 
 * Data source: GTFS feeds from gtfs.ovapi.nl
 */
class OVMCPServer {
  private server: Server;
  private gtfsLoader: GTFSLoader;

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

    this.gtfsLoader = new GTFSLoader();
    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: Tool[] = [
        {
          name: "find_stops",
          description:
            "Search for public transport stops in the Netherlands by name or location. " +
            "Returns stop details including ID, name, location coordinates, and type. " +
            "Useful for finding specific stations before planning a journey. " +
            "Examples: 'Amsterdam Centraal', 'Utrecht', 'Schiphol Airport'",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description:
                  "Search query for stop name. Can be partial (e.g., 'Amsterdam' will find 'Amsterdam Centraal', 'Amsterdam Zuid', etc.)",
              },
              limit: {
                type: "number",
                description: "Maximum number of results to return (default: 10, max: 50)",
                default: 10,
              },
            },
            required: ["query"],
          },
        },
        {
          name: "plan_journey",
          description:
            "Plan a journey between two public transport stops in the Netherlands. " +
            "Provides route information including transfers, travel time, and departure times. " +
            "Especially useful for planning trips between Amsterdam stations. " +
            "Note: Use 'find_stops' first to get exact stop IDs for best results.",
          inputSchema: {
            type: "object",
            properties: {
              from: {
                type: "string",
                description:
                  "Starting stop name or ID. Examples: 'Amsterdam Centraal', 'Amsterdam Zuid'",
              },
              to: {
                type: "string",
                description:
                  "Destination stop name or ID. Examples: 'Utrecht Centraal', 'Rotterdam Centraal'",
              },
              date: {
                type: "string",
                description:
                  "Departure date in ISO format (YYYY-MM-DD). Defaults to today if not specified.",
              },
              time: {
                type: "string",
                description:
                  "Departure time in HH:MM format. Defaults to current time if not specified.",
              },
            },
            required: ["from", "to"],
          },
        },
        {
          name: "get_realtime_info",
          description:
            "Get real-time departure and arrival information for a specific stop. " +
            "Shows upcoming departures with platform information, delays, and destination. " +
            "Useful for checking when the next train/bus/tram leaves. " +
            "Note: Use 'find_stops' first to get the exact stop ID.",
          inputSchema: {
            type: "object",
            properties: {
              stop_id: {
                type: "string",
                description:
                  "Stop ID or name. Get this from 'find_stops' tool for accuracy.",
              },
              limit: {
                type: "number",
                description:
                  "Number of upcoming departures to show (default: 5, max: 20)",
                default: 5,
              },
            },
            required: ["stop_id"],
          },
        },
      ];

      return { tools };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        logger.info(`Tool called: ${name}`, { args });

        // Ensure GTFS data is loaded
        if (!this.gtfsLoader.isLoaded()) {
          logger.info("GTFS data not loaded, loading now...");
          await this.gtfsLoader.load();
        }

        const gtfsData = this.gtfsLoader.getData();

        switch (name) {
          case "find_stops":
            return await findStops(args, gtfsData);

          case "plan_journey":
            return await planJourney(args, gtfsData);

          case "get_realtime_info":
            return await getRealtimeInfo(args, gtfsData);

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        logger.error(`Error handling tool ${name}:`, error);
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  async run(): Promise<void> {
    try {
      // Preload GTFS data
      logger.info("Preloading GTFS data...");
      await this.gtfsLoader.load();
      logger.info("GTFS data loaded successfully");

      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      logger.info("OV-MCP Server running on stdio");
    } catch (error) {
      logger.error("Failed to start server:", error);
      throw error;
    }
  }
}

// Start the server
const server = new OVMCPServer();
server.run().catch((error) => {
  logger.error("Fatal error:", error);
  process.exit(1);
});
