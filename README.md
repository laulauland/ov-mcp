# OV-MCP

Model Context Protocol (MCP) server for Dutch public transport (OV - Openbaar Vervoer) data, built with TypeScript and Bun.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

OV-MCP provides a standardized interface for accessing Dutch public transport information through the Model Context Protocol. It enables AI assistants like Claude and other MCP clients to query real-time and static transit data for the Netherlands.

### Key Features

- 🚄 **Complete Transit Data**: Access to Dutch public transport stops, routes, and schedules via GTFS
- 🔧 **TypeScript Implementation**: Fully typed, modern TypeScript codebase
- ⚡ **Bun Runtime**: Lightning-fast execution with Bun
- 📦 **Monorepo Structure**: Well-organized workspace with shared packages
- 🌐 **Multiple Deployment Options**: Run locally or deploy to Cloudflare Workers
- 🔌 **MCP Protocol**: Standards-compliant Model Context Protocol implementation
- 📊 **GTFS Support**: Parse and query GTFS (General Transit Feed Specification) data
- 🗺️ **Geographic Queries**: Find stops by name or location coordinates
- 🔄 **Auto-caching**: Automatic GTFS data caching with configurable refresh

## Table of Contents

- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Development](#development)
- [Usage with Claude Desktop](#usage-with-claude-desktop)
- [Available Tools](#available-tools)
- [GTFS Data Management](#gtfs-data-management)
- [Technical Architecture](#technical-architecture)
- [Deployment](#deployment)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [Roadmap](#roadmap)

## Project Structure

This is a Bun monorepo with a clean separation of concerns:

```
ov-mcp/
├── packages/
│   ├── mcp-server/              # Main MCP server implementation
│   │   ├── src/
│   │   │   ├── index.ts        # Server entry point with GTFS integration
│   │   │   └── index.test.ts   # Integration tests
│   │   └── package.json
│   │
│   ├── gtfs-parser/             # GTFS data parsing utilities
│   │   ├── src/
│   │   │   ├── index.ts        # Main exports
│   │   │   ├── parser.ts       # CSV parsing logic
│   │   │   ├── parser.test.ts  # Parser tests
│   │   │   ├── query.ts        # Query utilities
│   │   │   ├── query.test.ts   # Query tests
│   │   │   ├── downloader.ts   # GTFS download & caching
│   │   │   └── types.ts        # GTFS type definitions
│   │   └── package.json
│   │
│   └── cloudflare-worker/      # Cloudflare Workers adapter
│       ├── src/
│       │   └── index.ts        # Worker with KV storage integration
│       └── package.json
│
├── scripts/
│   ├── upload-gtfs-to-worker.ts # Upload GTFS to Cloudflare KV
│   └── README.md
├── docs/                       # Documentation
├── package.json               # Root workspace configuration
└── README.md                  # This file
```

## Prerequisites

- **[Bun](https://bun.sh)** v1.0.0 or higher
  ```bash
  # Install Bun (macOS, Linux, WSL)
  curl -fsSL https://bun.sh/install | bash
  ```

- **Git** for version control
- **Claude Desktop** (optional, for testing with Claude)

## Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/laulauland/ov-mcp.git
   cd ov-mcp
   ```

2. **Install dependencies**
   ```bash
   bun install
   ```

   This will install all dependencies for the root workspace and all packages.

3. **Build all packages**
   ```bash
   bun run build
   ```

4. **Verify installation**
   ```bash
   bun run typecheck
   bun run test
   ```

## Development

### Available Scripts

Run these from the root directory:

```bash
# Development mode with hot reload
bun run dev

# Build all packages
bun run build

# Run tests
bun run test

# Type checking across all packages
bun run typecheck

# Clean all build artifacts and dependencies
bun run clean
```

### First Run

On first run, the MCP server will automatically:
1. Download GTFS data from gtfs.ovapi.nl (~50-100 MB)
2. Parse and cache the data locally in `./data/gtfs-cache/`
3. Use cached data on subsequent runs (refreshes every 24 hours)

```bash
# Run the MCP server
cd packages/mcp-server
bun run src/index.ts
```

You should see:
```
Initializing GTFS data...
Downloading GTFS data from http://gtfs.ovapi.nl/gtfs-nl.zip
Downloaded 87.32 MB
Extracting GTFS data...
Parsed 45231 stops, 1234 routes, 56789 trips
GTFS data loaded successfully
OV-MCP Server running on stdio
```

## Usage with Claude Desktop

Configure the MCP server in your Claude Desktop configuration file.

### Configuration Location

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

**Linux**: `~/.config/Claude/claude_desktop_config.json`

### Configuration Examples

#### Development Mode (Recommended)

Run directly from source with hot reload:

```json
{
  "mcpServers": {
    "ov-mcp": {
      "command": "bun",
      "args": [
        "run",
        "/absolute/path/to/ov-mcp/packages/mcp-server/src/index.ts"
      ]
    }
  }
}
```

#### Production Mode

Run the built version:

```json
{
  "mcpServers": {
    "ov-mcp": {
      "command": "bun",
      "args": [
        "run",
        "/absolute/path/to/ov-mcp/packages/mcp-server/dist/index.js"
      ]
    }
  }
}
```

### Verifying the Connection

1. **Restart Claude Desktop** after updating the configuration
2. **Open a new conversation** in Claude
3. **Check for the MCP indicator** – you should see that the MCP server is connected
4. **Test the tools**: Ask Claude to search for a train station:
   ```
   Can you search for train stations in Amsterdam?
   Find me stops near coordinates 52.3791, 4.9003
   ```

## Available Tools

### `get_stops`

Search for public transport stops by name.

**Parameters:**
- `query` (string, required): Search query for stop name
- `limit` (number, optional): Maximum results (default: 10, max: 100)

**Example:**
```
Find train stations in Rotterdam
Show me stops with "Schiphol" in the name
```

### `get_stop_by_id`

Get detailed information about a specific stop.

**Parameters:**
- `stop_id` (string, required): The unique GTFS stop ID

**Example:**
```
Get details for stop 8400530
```

### `find_stops_nearby`

Find stops near specific coordinates.

**Parameters:**
- `latitude` (number, required): Latitude coordinate
- `longitude` (number, required): Longitude coordinate
- `radius_km` (number, optional): Search radius in km (default: 1, max: 10)
- `limit` (number, optional): Maximum results (default: 10, max: 50)

**Example:**
```
Find stops within 2km of coordinates 52.3791, 4.9003
```

### `get_routes`

Search for transit routes by name or number.

**Parameters:**
- `query` (string, required): Search query for route
- `limit` (number, optional): Maximum results (default: 10, max: 100)

**Example:**
```
Find all Intercity routes
Show me route information for line 1
```

## GTFS Data Management

### Local Development

The MCP server automatically manages GTFS data:

- **First run**: Downloads from gtfs.ovapi.nl
- **Subsequent runs**: Uses cached data from `./data/gtfs-cache/`
- **Auto-refresh**: Downloads fresh data if cache is older than 24 hours
- **Manual refresh**: Delete `./data/gtfs-cache/` to force re-download

### Cloudflare Workers

For Cloudflare Workers deployment, use the upload script:

```bash
export CLOUDFLARE_WORKER_URL="https://your-worker.workers.dev"
export GTFS_UPDATE_SECRET="your-secret"
bun run scripts/upload-gtfs-to-worker.ts
```

See [scripts/README.md](scripts/README.md) for detailed instructions.

## Technical Architecture

### Data Flow

```
┌─────────────────┐
│  Claude Desktop │
└────────┬────────┘
         │ MCP Protocol (stdio/HTTP)
         │
┌────────▼────────┐
│  OV-MCP Server  │  ← Implements MCP tools
└────────┬────────┘
         │ Uses
         │
┌────────▼────────┐
│  GTFS Parser    │  ← Parse & query GTFS data
└────────┬────────┘
         │ Reads
         │
┌────────▼────────┐
│ GTFS Downloader │  ← Download & cache from ovapi.nl
└────────┬────────┘
         │
┌────────▼────────┐
│  GTFS Data      │  ← gtfs.ovapi.nl
│  (ZIP/CSV)      │
└─────────────────┘
```

### Key Components

#### GTFS Parser
- **Parser**: CSV to typed objects using `csv-parse`
- **Query**: Search and filter operations
- **Downloader**: Fetch, extract, and cache GTFS data

#### MCP Server
- **Tool Handlers**: Implement each MCP tool
- **GTFS Integration**: Load and query data on demand
- **Error Handling**: Graceful fallbacks and error messages

#### Cloudflare Worker
- **HTTP Transport**: MCP over HTTP instead of stdio
- **KV Storage**: Global edge caching of GTFS data
- **Admin Endpoints**: Secure data upload and management

## Deployment

### Local Deployment

The MCP server runs locally via stdio:

```bash
# From the repository root
bun run packages/mcp-server/src/index.ts

# Or after building
bun run packages/mcp-server/dist/index.js
```

### Cloudflare Workers Deployment

1. **Deploy the Worker**
   ```bash
   cd packages/cloudflare-worker
   wrangler deploy
   ```

2. **Set up authentication**
   ```bash
   wrangler secret put GTFS_UPDATE_SECRET
   ```

3. **Upload GTFS data**
   ```bash
   export CLOUDFLARE_WORKER_URL="https://your-worker.workers.dev"
   export GTFS_UPDATE_SECRET="your-secret"
   bun run scripts/upload-gtfs-to-worker.ts
   ```

4. **Verify deployment**
   ```bash
   curl https://your-worker.workers.dev/health
   ```

See [docs/CLOUDFLARE_DEPLOYMENT.md](docs/CLOUDFLARE_DEPLOYMENT.md) for detailed instructions.

## Testing

### Run All Tests

```bash
bun run test
```

### Run Specific Package Tests

```bash
# GTFS Parser tests
cd packages/gtfs-parser
bun test

# MCP Server integration tests
cd packages/mcp-server
bun test
```

### Test Coverage

- **Parser Tests**: CSV parsing for all GTFS files
- **Query Tests**: Search, filtering, and distance calculations
- **Integration Tests**: Server startup and basic operations

## Troubleshooting

### GTFS Download Issues

**Problem**: "Failed to download GTFS data"

**Solutions**:
- Check internet connection
- Verify gtfs.ovapi.nl is accessible: `curl -I http://gtfs.ovapi.nl/gtfs-nl.zip`
- Try manual download and place in `./data/gtfs-cache/`

### Cache Issues

**Problem**: "Using outdated data"

**Solution**: Delete cache to force refresh
```bash
rm -rf ./data/gtfs-cache
```

### Memory Issues

**Problem**: "JavaScript heap out of memory"

**Solution**: Increase Node memory limit
```bash
export NODE_OPTIONS="--max-old-space-size=4096"
```

### Claude Desktop Connection

**Problem**: "Server not connecting"

**Solutions**:
1. Verify absolute path in config
2. Check Claude logs: `~/Library/Logs/Claude/`
3. Test server independently: `bun run packages/mcp-server/src/index.ts`
4. Restart Claude Desktop completely

## Contributing

Contributions are welcome! Here's how to get started:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feat/amazing-feature`
3. **Make your changes**
4. **Run tests**: `bun run test && bun run typecheck`
5. **Commit**: `git commit -m 'feat: Add amazing feature'`
6. **Push**: `git push origin feat/amazing-feature`
7. **Open a Pull Request**

### Development Guidelines

- Follow the existing code style
- Add tests for new features
- Update documentation for API changes
- Use conventional commit messages
- Ensure all CI checks pass

## Roadmap

### ✅ Completed
- [x] Project structure and monorepo setup
- [x] MCP server implementation
- [x] GTFS parser with full type support
- [x] GTFS data downloader with caching
- [x] Geographic search (nearby stops)
- [x] Route search functionality
- [x] Cloudflare Workers adapter
- [x] Test suite for parser and queries
- [x] Automated GTFS data upload

### 🚧 In Progress
- [ ] Real-time departure information
- [ ] Integration with NS API
- [ ] Comprehensive documentation

### 📋 Planned
- [ ] Route planning capabilities
- [ ] Disruption alerts and notifications
- [ ] Multi-modal journey planning
- [ ] Support for realtime GTFS-RT
- [ ] Performance optimizations
- [ ] Rate limiting
- [ ] Monitoring and analytics
- [ ] Additional transit operators

## Data Sources

### GTFS Data
- **Source**: [gtfs.ovapi.nl](http://gtfs.ovapi.nl/)
- **Coverage**: All Dutch public transport operators
- **Format**: GTFS (General Transit Feed Specification)
- **Update Frequency**: Daily
- **License**: Open data

### Included Operators
- NS (Nederlandse Spoorwegen) - National Rail
- Regional bus operators
- Metro systems (Amsterdam, Rotterdam)
- Tram networks
- Ferry services

## License

MIT License - see [LICENSE](LICENSE) file for details

## Acknowledgments

- Anthropic for creating the Model Context Protocol
- The Bun team for an amazing JavaScript runtime
- OVAPI.nl for providing comprehensive GTFS data
- Dutch public transport operators for open data
- The open-source community

---

**Built with ❤️ for the Dutch public transport community**
