# OV-MCP Server

A Model Context Protocol (MCP) server for Dutch public transport (OV) data, providing LLM agents with tools to search stops, plan journeys, and get real-time information.

## Features

- **Find Stops**: Search for public transport stops across the Netherlands by name or location
- **Plan Journeys**: Plan routes between any two stops with transfer information
- **Realtime Info**: Get live departure and arrival times for any stop
- **GTFS Data**: Automatic loading and caching of GTFS data from gtfs.ovapi.nl
- **LLM-Friendly**: Comprehensive tool descriptions optimized for LLM agents
- **Error Handling**: Robust error handling with helpful error messages
- **Caching**: Smart caching system to minimize data downloads

## Installation

```bash
# Install dependencies
bun install

# Build the server
bun run build
```

## Usage

### Running the Server

The server runs using the stdio transport for MCP:

```bash
bun run start
```

For development with auto-reload:

```bash
bun run dev
```

### Configuration in Claude Desktop

Add this to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "ov-mcp": {
      "command": "bun",
      "args": ["run", "/path/to/ov-mcp/packages/mcp-server/dist/index.js"],
      "env": {
        "DEBUG": "false"
      }
    }
  }
}
```

### Using with Other MCP Clients

The server implements the standard MCP protocol and can be used with any MCP-compatible client:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "bun",
  args: ["run", "/path/to/ov-mcp/packages/mcp-server/dist/index.js"],
});

const client = new Client(
  {
    name: "my-client",
    version: "1.0.0",
  },
  {
    capabilities: {},
  }
);

await client.connect(transport);
```

## Available Tools

### 1. `find_stops`

Search for public transport stops in the Netherlands.

**Parameters:**
- `query` (required): Search term for stop name (e.g., "Amsterdam Centraal")
- `limit` (optional): Maximum results to return (default: 10, max: 50)

**Example:**
```
Find stops matching "Amsterdam"
```

**Response:**
```
Found 10 stop(s) matching "Amsterdam":

🚉 Amsterdam Centraal
   ID: 8400058
   Code: ASD
   Location: 52.3791, 4.9003
   
🚉 Amsterdam Zuid
   ID: 8400061
   Location: 52.3389, 4.8730
   
...
```

### 2. `plan_journey`

Plan a journey between two stops with route and timing information.

**Parameters:**
- `from` (required): Origin stop name or ID
- `to` (required): Destination stop name or ID  
- `date` (optional): Departure date (YYYY-MM-DD format)
- `time` (optional): Departure time (HH:MM format)

**Example:**
```
Plan journey from "Amsterdam Centraal" to "Utrecht Centraal"
```

**Response:**
```
Journey from Amsterdam Centraal to Utrecht Centraal:

1. Intercity to Utrecht Centraal
   Departure: 10:15 from Amsterdam Centraal
   Arrival: 10:42 at Utrecht Centraal
   Duration: 27m

2. Sprinter to Utrecht Centraal
   Departure: 10:23 from Amsterdam Centraal
   Arrival: 11:05 at Utrecht Centraal
   Duration: 42m
   
...
```

### 3. `get_realtime_info`

Get real-time departure information for a specific stop.

**Parameters:**
- `stop_id` (required): Stop ID or name
- `limit` (optional): Number of departures to show (default: 5, max: 20)

**Example:**
```
Get realtime info for "Amsterdam Centraal"
```

**Response:**
```
📍 Amsterdam Centraal
Upcoming departures:

🚊 IC 500 → Rotterdam Centraal
   Departure: 10:15
   Platform: 5b
   
🚊 IC 800 → Maastricht
   Departure: 10:18
   Platform: 7a
   ⚠️ Delay: 5 minutes
   
...
```

## Data Source

This server uses GTFS (General Transit Feed Specification) data from **gtfs.ovapi.nl**, which provides comprehensive public transport information for the Netherlands including:

- NS (Nederlandse Spoorwegen) - Dutch Railways
- Regional trains
- Buses
- Trams
- Metro systems

The data is automatically downloaded and cached locally. The cache expires after 24 hours to ensure data freshness.

## Architecture

### Components

1. **index.ts**: Main MCP server implementation
   - Handles MCP protocol
   - Registers tools and request handlers
   - Manages GTFS data loading

2. **gtfs-loader.ts**: GTFS data management
   - Downloads GTFS zip from gtfs.ovapi.nl
   - Caches data locally (24h expiry)
   - Parses data using @ov-mcp/gtfs-parser

3. **tools.ts**: Tool implementations
   - `findStops`: Stop search functionality
   - `planJourney`: Journey planning with connections
   - `getRealtimeInfo`: Real-time departure information

4. **types.ts**: TypeScript type definitions
   - GTFS entity types (Stop, Route, Trip, etc.)
   - Journey planning types
   - Realtime info types

5. **logger.ts**: Logging utility
   - Logs to stderr (doesn't interfere with stdio transport)
   - Supports different log levels
   - Optional debug mode

### Data Flow

```
┌─────────────┐
│   LLM Agent │
└──────┬──────┘
       │ MCP Request
       ▼
┌─────────────────┐
│   MCP Server    │
│   (index.ts)    │
└────────┬────────┘
         │
         ├─► Tool Handler (tools.ts)
         │   └─► GTFS Data Query
         │
         └─► GTFS Loader (gtfs-loader.ts)
             ├─► Check Cache
             ├─► Download if needed
             └─► Parse with gtfs-parser
```

## Error Handling

The server includes comprehensive error handling:

- **Invalid stop names**: Provides helpful suggestions to use `find_stops` first
- **No connections found**: Clearly indicates when no direct routes exist
- **Network errors**: Gracefully handles download failures
- **Cache errors**: Falls back to downloading fresh data
- **Parse errors**: Logs detailed error information

All errors are returned to the LLM with clear, actionable messages.

## Caching

GTFS data is cached to improve performance and reduce bandwidth:

- **Location**: `.cache/gtfs-data.json` in the project root
- **Max Age**: 24 hours
- **Size**: ~50-100 MB (compressed GTFS data)
- **Clear Cache**: Delete `.cache/` directory or implement cache management

The cache automatically refreshes when:
- Cache file doesn't exist
- Cache is older than 24 hours
- Cache file is corrupted

## Development

### Project Structure

```
packages/mcp-server/
├── src/
│   ├── index.ts          # Main server
│   ├── gtfs-loader.ts    # Data loading & caching
│   ├── tools.ts          # Tool implementations
│   ├── types.ts          # Type definitions
│   └── logger.ts         # Logging utility
├── dist/                 # Compiled output
├── package.json
├── tsconfig.json
└── README.md
```

### Scripts

```bash
# Development with auto-reload
bun run dev

# Build for production
bun run build

# Type checking
bun run typecheck

# Start production server
bun run start
```

### Environment Variables

- `DEBUG`: Set to "true" to enable debug logging

### Adding New Tools

To add a new tool:

1. Define the tool in `setupHandlers()` in `index.ts`
2. Implement the handler function in `tools.ts`
3. Add necessary types to `types.ts`
4. Update this README

Example:

```typescript
// In index.ts
{
  name: "my_new_tool",
  description: "Description for LLM",
  inputSchema: {
    type: "object",
    properties: {
      param: { type: "string", description: "Parameter description" }
    },
    required: ["param"]
  }
}

// In tools.ts
export async function myNewTool(
  args: any,
  gtfsData: GTFSData
): Promise<{ content: Array<{ type: string; text: string }> }> {
  // Implementation
}
```

## Testing

Test the server with sample queries:

```bash
# In one terminal, run the server
bun run dev

# The server will log when it's ready:
# [INFO] GTFS data loaded successfully
# [INFO] OV-MCP Server running on stdio
```

## Troubleshooting

### Server won't start

- Check that all dependencies are installed: `bun install`
- Verify Bun is installed: `bun --version`
- Check the logs for specific error messages

### GTFS data not loading

- Check internet connectivity
- Verify gtfs.ovapi.nl is accessible
- Clear cache and try again: `rm -rf .cache`
- Check disk space (GTFS data is ~100 MB)

### Tools returning no results

- Use `find_stops` to verify stop names exist in the dataset
- Check that stop names are spelled correctly
- Try partial names (e.g., "Amsterdam" instead of "Amsterdam Centraal")

### Claude can't connect to server

- Verify the path in `claude_desktop_config.json` is correct
- Ensure the server is built: `bun run build`
- Check Claude's MCP logs for connection errors
- Restart Claude Desktop after config changes

## Performance

- **Initial Load**: 5-10 seconds (downloads GTFS data)
- **Cached Load**: <1 second
- **Query Response**: <100ms (cached data)
- **Memory Usage**: ~200-300 MB (with cached GTFS data)

## Limitations

- **Schedule Data Only**: No real real-time tracking (uses GTFS schedule data)
- **Dutch Transit Only**: Only covers Netherlands public transport
- **Direct Routes**: Journey planner shows direct connections only (no multi-leg transfers yet)
- **Today's Schedule**: Real-time info shows current day's schedule

## Future Enhancements

- [ ] Add actual real-time tracking via APIs
- [ ] Implement multi-leg journey planning with transfers
- [ ] Add support for different transport modes filtering
- [ ] Include fare calculation
- [ ] Add accessibility information
- [ ] Support for nearby stops (geolocation)
- [ ] Historical delay analysis
- [ ] Service alerts and disruptions

## Contributing

Contributions are welcome! This is part of the ov-mcp monorepo.

## License

See the main repository LICENSE file.

## Links

- [GTFS Reference](https://gtfs.org/reference/static)
- [OV API](https://ovapi.nl/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk)

## Support

For issues and questions:
- Open an issue in the main ov-mcp repository
- Check existing issues for similar problems
- Include error messages and logs when reporting issues
