# OV-MCP 🚆

Model Context Protocol (MCP) server for Dutch public transport (OV - Openbaar Vervoer) data.

[![MCP](https://img.shields.io/badge/MCP-Compatible-blue)](https://modelcontextprotocol.io)
[![Bun](https://img.shields.io/badge/runtime-Bun-orange)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/language-TypeScript-blue)](https://www.typescriptlang.org/)

## Overview

OV-MCP provides a standardized interface for accessing Dutch public transport information through the Model Context Protocol. It enables AI assistants like Claude to query real-time and static transit data, plan journeys, and find stops across the Netherlands.

### Key Features

- 🔍 **Find Stops**: Search for public transport stops by name or location
- 🗺️ **Plan Journeys**: Get route information between any two stops in the Netherlands
- ⏱️ **Real-time Info**: View upcoming departures with platform and delay information
- 💾 **Smart Caching**: Automatic GTFS data caching with 24-hour refresh
- 🤖 **LLM-Optimized**: Tool descriptions designed for AI agent comprehension
- 🛡️ **Error Handling**: Comprehensive error handling with helpful messages

## Project Structure

This is a Bun monorepo with the following packages:

```
ov-mcp/
├── packages/
│   ├── mcp-server/          # MCP server implementation
│   │   ├── src/
│   │   │   ├── index.ts           # Main server
│   │   │   ├── gtfs-loader.ts     # Data loading & caching
│   │   │   ├── tools.ts           # Tool implementations
│   │   │   ├── types.ts           # TypeScript types
│   │   │   └── logger.ts          # Logging utility
│   │   ├── README.md              # Technical documentation
│   │   └── USAGE.md               # Usage guide
│   │
│   └── gtfs-parser/         # GTFS data parsing utilities
│       └── src/
│           ├── index.ts
│           ├── parser.ts
│           ├── query.ts
│           └── types.ts
├── package.json             # Root workspace configuration
└── tsconfig.json           # Shared TypeScript configuration
```

### Packages

- **@ov-mcp/server**: MCP server that exposes public transport tools
  - Three main tools: `find_stops`, `plan_journey`, `get_realtime_info`
  - GTFS data management with automatic caching
  - Integration with @ov-mcp/gtfs-parser
  
- **@ov-mcp/gtfs-parser**: GTFS parser and query utilities for transit data
  - Parse GTFS ZIP files
  - Query stops, routes, trips, and schedules
  - Type-safe data structures

## Prerequisites

- [Bun](https://bun.sh) v1.0.0 or higher
- Node.js 20+ (for compatibility)
- ~100MB free disk space (for GTFS data cache)

## Quick Start

### 1. Installation

```bash
# Clone the repository
git clone https://github.com/laulauland/ov-mcp.git
cd ov-mcp

# Install dependencies
bun install

# Build all packages
bun run build
```

### 2. Configure Claude Desktop

**macOS**: Edit `~/Library/Application Support/Claude/claude_desktop_config.json`

**Windows**: Edit `%APPDATA%\\Claude\\claude_desktop_config.json`

**Linux**: Edit `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "ov-mcp": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/ov-mcp/packages/mcp-server/dist/index.js"],
      "env": {
        "DEBUG": "false"
      }
    }
  }
}
```

### 3. Restart Claude Desktop

After updating the config, restart Claude Desktop. The server will automatically load on first use.

### 4. Try It Out!

In Claude, try queries like:

- "Find train stations in Amsterdam"
- "How do I get from Amsterdam Centraal to Utrecht?"
- "When does the next train leave from Amsterdam Centraal?"

## Available Tools

### 🔍 `find_stops`

Search for public transport stops across the Netherlands.

**Parameters:**
- `query` (string, required): Stop name to search for
- `limit` (number, optional): Max results (default: 10, max: 50)

**Example:**
```
User: "Find stops in Amsterdam"

Result:
🚉 Amsterdam Centraal
   ID: 8400058
   Code: ASD
   Location: 52.3791, 4.9003
   
🚉 Amsterdam Zuid
   ID: 8400061
   Location: 52.3389, 4.8730
...
```

### 🗺️ `plan_journey`

Plan a journey between two stops with route and timing information.

**Parameters:**
- `from` (string, required): Origin stop name or ID
- `to` (string, required): Destination stop name or ID
- `date` (string, optional): Departure date (YYYY-MM-DD)
- `time` (string, optional): Departure time (HH:MM)

**Example:**
```
User: "Plan journey from Amsterdam Centraal to Utrecht"

Result:
Journey from Amsterdam Centraal to Utrecht Centraal:

1. Intercity to Utrecht Centraal
   Departure: 10:15 from Amsterdam Centraal
   Arrival: 10:42 at Utrecht Centraal
   Duration: 27m
...
```

### ⏱️ `get_realtime_info`

Get upcoming departures and arrivals for a specific stop.

**Parameters:**
- `stop_id` (string, required): Stop ID or name
- `limit` (number, optional): Number of departures (default: 5, max: 20)

**Example:**
```
User: "When's the next train from Amsterdam Centraal?"

Result:
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

## Data Sources

The project uses GTFS data from **gtfs.ovapi.nl**, which provides comprehensive public transport information for the Netherlands:

- ✅ NS (Nederlandse Spoorwegen) - National Rail
- ✅ Regional trains
- ✅ Major bus operators
- ✅ Trams (Amsterdam, Rotterdam, Den Haag, Utrecht)
- ✅ Metro (Amsterdam, Rotterdam)

Data is automatically downloaded and cached locally, with smart refresh every 24 hours.

## Development

### Commands

```bash
# Run all packages in development mode (auto-reload)
bun run dev

# Build all packages
bun run build

# Run type checking
bun run typecheck

# Clean build artifacts and cache
bun run clean
```

### Package-Specific Commands

```bash
# Work on MCP server only
cd packages/mcp-server
bun run dev          # Development with auto-reload
bun run build        # Build for production
bun run start        # Run built version
bun run typecheck    # Type checking

# Work on GTFS parser
cd packages/gtfs-parser
bun run dev
bun run build
bun test
```

### Project Scripts

- `dev`: Run all packages in watch mode
- `build`: Build all packages
- `test`: Run tests across all packages
- `typecheck`: Type-check all packages
- `clean`: Remove all build artifacts and node_modules

## Architecture

```
┌─────────────────┐
│   Claude / LLM  │
└────────┬────────┘
         │ MCP Protocol (stdio)
         ▼
┌─────────────────┐
│   MCP Server    │
│  (index.ts)     │
└────────┬────────┘
         │
         ├─► Tools (tools.ts)
         │   ├─► find_stops
         │   ├─► plan_journey
         │   └─► get_realtime_info
         │
         └─► GTFS Loader (gtfs-loader.ts)
             ├─► Cache Check
             ├─► Download (gtfs.ovapi.nl)
             └─► Parse (@ov-mcp/gtfs-parser)
```

## Documentation

- [MCP Server README](./packages/mcp-server/README.md) - Technical documentation
- [Usage Guide](./packages/mcp-server/USAGE.md) - User guide with examples
- [GTFS Parser README](./packages/gtfs-parser/README.md) - Parser documentation

## Performance

- **First Request**: 5-10 seconds (downloads GTFS data)
- **Cached Requests**: <1 second to load
- **Query Response**: <100ms per tool call
- **Memory Usage**: ~200-300 MB with cached data
- **Cache Size**: ~100 MB (GTFS data)

## Troubleshooting

### Server Won't Start

```bash
# Verify Bun is installed
bun --version

# Reinstall dependencies
bun install

# Rebuild
bun run clean
bun run build
```

### GTFS Data Issues

```bash
# Clear cache and re-download
rm -rf packages/mcp-server/.cache
```

### Claude Can't Connect

1. Check absolute path in config is correct
2. Verify server is built: `bun run build`
3. Restart Claude Desktop
4. Check Claude's logs for errors

See [USAGE.md](./packages/mcp-server/USAGE.md) for more troubleshooting.

## Contributing

Contributions are welcome! Here's how you can help:

1. **Report Bugs**: Open an issue with details
2. **Suggest Features**: Propose new tools or improvements
3. **Submit PRs**: Fork, create a branch, and submit a PR
4. **Improve Docs**: Help make documentation clearer

### Development Guidelines

- Use TypeScript for type safety
- Follow existing code style
- Add tests for new features
- Update documentation
- Use conventional commits

## Roadmap

### Completed ✅
- [x] GTFS data integration
- [x] Stop search functionality
- [x] Journey planning (direct routes)
- [x] Real-time departure information
- [x] Smart caching system
- [x] Error handling and logging
- [x] Comprehensive documentation

### Planned 🚧
- [ ] Multi-leg journey planning with transfers
- [ ] Actual real-time tracking via APIs
- [ ] Disruption alerts and service messages
- [ ] Fare calculation
- [ ] Accessibility information
- [ ] Geolocation-based nearby stops
- [ ] Historical delay analysis
- [ ] Support for bike-sharing and other modes

## License

MIT License - see LICENSE file for details

## Related Projects

- [Model Context Protocol](https://modelcontextprotocol.io) - MCP specification
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) - Official SDK
- [GTFS Specification](https://gtfs.org) - Transit data format
- [OV API](https://ovapi.nl) - Dutch transit API

## Acknowledgments

- GTFS data provided by [gtfs.ovapi.nl](https://gtfs.ovapi.nl)
- Built with [Bun](https://bun.sh) runtime
- Uses [Model Context Protocol](https://modelcontextprotocol.io)
- Inspired by the Dutch public transport ecosystem

## Support

- 📖 Read the [documentation](./packages/mcp-server/README.md)
- 💬 Open an [issue](https://github.com/laulauland/ov-mcp/issues)
- 🐛 Report bugs with detailed information
- 💡 Suggest features and improvements

---

Made with ❤️ for the Dutch transit community
