#!/usr/bin/env bun
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

/**
 * OV-MCP Server
 * Model Context Protocol server for Dutch public transport (OV) data
 */
class OVMCPServer {
  private server: Server;

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
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: Tool[] = [
        {
          name: "get_stops",
          description: "Get public transport stops in the Netherlands",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Search query for stop name or location",
              },
              limit: {
                type: "number",
                description: "Maximum number of results to return",
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

      switch (name) {
        case "get_stops":
          return this.handleGetStops(args);

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  private async handleGetStops(args: any) {
    // TODO: Implement actual GTFS data fetching using gtfs-parser package
    const query = args.query as string;
    const limit = (args.limit as number) || 10;

    return {
      content: [
        {
          type: "text",
          text: `Searching for stops matching "${query}" (limit: ${limit})...\n\nThis is a placeholder. GTFS parser integration coming soon.`,
        },
      ],
    };
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
