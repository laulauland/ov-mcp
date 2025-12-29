# OV-MCP

Model Context Protocol (MCP) server for Dutch public transport (OV - Openbaar Vervoer) data, built with TypeScript and Bun.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

OV-MCP provides a standardized interface for accessing Dutch public transport information through the Model Context Protocol. It enables AI assistants like Claude and other MCP clients to query real-time and static transit data for the Netherlands.

### Key Features

- 🚄 **Complete Transit Data**: Access to Dutch public transport stops, routes, and schedules
- 🔧 **TypeScript Implementation**: Fully typed, modern TypeScript codebase
- ⚡ **Bun Runtime**: Lightning-fast execution with Bun
- 📦 **Monorepo Structure**: Well-organized workspace with shared packages
- 🌐 **Multiple Deployment Options**: Run locally or deploy to Cloudflare Workers
- 🔌 **MCP Protocol**: Standards-compliant Model Context Protocol implementation
- 📊 **GTFS Support**: Parse and query GTFS (General Transit Feed Specification) data

## Table of Contents

- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Development](#development)
- [Usage with Claude Desktop](#usage-with-claude-desktop)
- [Available Tools](#available-tools)
- [Technical Architecture](#technical-architecture)
- [Deployment](#deployment)
  - [Local Deployment](#local-deployment)
  - [Cloudflare Workers Deployment](#cloudflare-workers-deployment)
- [Troubleshooting](#troubleshooting)
- [Data Sources](#data-sources)
- [Contributing](#contributing)
- [Roadmap](#roadmap)

## Project Structure

This is a Bun monorepo with a clean separation of concerns:

```
ov-mcp/
├── packages/
│   ├── mcp-server/              # Main MCP server implementation
│   │   ├── src/
│   │   │   └── index.ts        # Server entry point
│   │   ├── package.json        # Server dependencies
│   │   └── tsconfig.json       # TypeScript config
│   │
│   ├── gtfs-parser/             # GTFS data parsing utilities
│   │   ├── src/
│   │   │   ├── index.ts        # Main exports
│   │   │   ├── parser.ts       # CSV parsing logic
│   │   │   ├── query.ts        # Query utilities
│   │   │   └── types.ts        # GTFS type definitions
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── cloudflare-worker/      # Cloudflare Workers adapter (in development)
│       ├── src/
│       │   └── index.ts        # Worker entry point
│       └── package.json
│
├── explorations/               # Experimental code and prototypes
├── docs/                       # Documentation
│   └── CLOUDFLARE_DEPLOYMENT.md
├── package.json               # Root workspace configuration
├── tsconfig.json             # Shared TypeScript configuration
├── wrangler.toml            # Cloudflare Workers config
└── README.md                # This file
```

### Package Details

#### **@ov-mcp/server**
The main MCP server package that implements the Model Context Protocol. It:
- Exposes transit data tools to MCP clients
- Uses stdio transport for communication
- Integrates with the GTFS parser for data access
- Built with `@modelcontextprotocol/sdk`

#### **@ov-mcp/gtfs-parser**
A utility library for parsing and querying GTFS data. Features:
- Type-safe GTFS entity interfaces
- CSV parsing with `csv-parse`
- Search stops by name
- Find nearby stops by coordinates
- Haversine distance calculations
- Efficient querying utilities

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

3. **Verify installation**
   ```bash
   bun run typecheck
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

### Working on Individual Packages

```bash
# Work on the MCP server
cd packages/mcp-server
bun run dev

# Work on the GTFS parser
cd packages/gtfs-parser
bun run dev
bun run test
```

### Project Workflows

The monorepo uses Bun workspaces for efficient package management:

- **Shared dependencies**: Common dependencies are hoisted to the root
- **Workspace references**: Packages can reference each other using `workspace:*`
- **Parallel execution**: Scripts run across all packages with `--filter '*'`
- **TypeScript project references**: Enables incremental builds

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
3. **Check for the MCP indicator** – you should see an indicator that the MCP server is connected
4. **Test the tools**: Ask Claude to search for a train station:
   ```
   Can you search for train stations in Amsterdam?
   ```

## Available Tools

### `get_stops`

Search for public transport stops in the Netherlands.

**Parameters:**
- `query` (string, required): Search query for stop name or location
- `limit` (number, optional): Maximum number of results to return (default: 10)

**Example usage in Claude:**
```
Show me train stations in Rotterdam
Find bus stops near Utrecht Centraal
Search for stops containing "Schiphol"
```

**Example response:**
```json
{
  "stops": [
    {
      "stop_id": "8400530",
      "stop_name": "Rotterdam Centraal",
      "stop_lat": 51.9249,
      "stop_lon": 4.4690,
      "location_type": 1
    }
  ]
}
```

## Technical Architecture

### MCP Server Implementation

The server follows the Model Context Protocol specification:

```typescript
// Core server structure
class OVMCPServer {
  private server: Server;
  
  constructor() {
    this.server = new Server({
      name: "ov-mcp",
      version: "0.1.0"
    }, {
      capabilities: { tools: {} }
    });
    
    this.setupHandlers();
  }
  
  private setupHandlers(): void {
    // List tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools: [...] };
    });
    
    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      // Route to appropriate handler
    });
  }
}
```

### GTFS Parser Architecture

The GTFS parser is designed for efficiency and type safety:

```typescript
// Type-safe GTFS entities
interface GTFSStop {
  stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
  location_type: number;
  parent_station?: string;
}

// Parser utilities
class GTFSParser {
  static parseStops(csv: string): GTFSStop[] { /* ... */ }
  static parseRoutes(csv: string): GTFSRoute[] { /* ... */ }
  // ... more parsers
}

// Query utilities
class GTFSQuery {
  static searchStopsByName(stops: GTFSStop[], query: string, limit: number) { /* ... */ }
  static findStopsNear(stops: GTFSStop[], lat: number, lon: number, radiusKm: number, limit: number) { /* ... */ }
}
```

### Communication Flow

```
┌─────────────────┐
│  Claude Desktop │
│  (MCP Client)   │
└────────┬────────┘
         │ MCP Protocol (stdio)
         │
┌────────▼────────┐
│  OV-MCP Server  │
│   TypeScript    │
└────────┬────────┘
         │ Import/Function Call
         │
┌────────▼────────┐
│  GTFS Parser    │
│  Library        │
└────────┬────────┘
         │
┌────────▼────────┐
│  GTFS Data      │
│  (CSV Files)    │
└─────────────────┘
```

### TypeScript Configuration

The project uses modern TypeScript with strict type checking:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "composite": true,
    "declaration": true,
    "types": ["bun-types"]
  }
}
```

## Deployment

### Local Deployment

The MCP server runs locally and communicates via stdio (standard input/output).

**Quick Start:**
```bash
# From the repository root
bun run packages/mcp-server/src/index.ts
```

**Production Build:**
```bash
# Build the server
bun run build

# Run the built version
bun run packages/mcp-server/dist/index.js
```

### Cloudflare Workers Deployment

Deploy the MCP server to Cloudflare Workers for scalable, edge-based hosting.

> **Note**: Cloudflare Workers deployment is currently in development. Check the `feat/cloudflare-workers-deployment` branch for the latest progress.

#### Prerequisites

1. **Cloudflare Account**: Sign up at [cloudflare.com](https://cloudflare.com)
2. **Wrangler CLI**: Install Cloudflare's deployment tool
   ```bash
   bun install -g wrangler
   ```
3. **Authentication**: Log in to Cloudflare
   ```bash
   wrangler login
   ```

#### Setup

1. **Create KV Namespace** (for caching GTFS data):
   ```bash
   wrangler kv:namespace create "GTFS_CACHE"
   wrangler kv:namespace create "GTFS_CACHE" --preview
   ```

2. **Configure Environment Variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your Cloudflare credentials and KV namespace IDs
   ```

3. **Update `wrangler.toml`**:
   ```toml
   name = "ov-mcp-server"
   main = "packages/cloudflare-worker/src/index.ts"
   compatibility_date = "2024-12-01"
   
   [[kv_namespaces]]
   binding = "GTFS_CACHE"
   id = "your-kv-namespace-id"
   ```

#### Deploy

```bash
# Deploy to production
wrangler deploy

# Deploy to staging
wrangler deploy --env staging

# View logs
wrangler tail
```

#### Cloudflare-Specific Features

- **KV Storage**: Cache GTFS data at the edge for fast access
- **Global CDN**: Serve requests from 300+ locations worldwide
- **Auto-scaling**: Handle any number of concurrent requests
- **Zero cold starts**: Always-warm instances

For detailed deployment instructions, see [docs/CLOUDFLARE_DEPLOYMENT.md](docs/CLOUDFLARE_DEPLOYMENT.md).

## Troubleshooting

### Common Issues

#### MCP Server Not Connecting

**Symptoms**: Claude Desktop doesn't show the MCP server indicator

**Solutions**:
1. **Verify the configuration path** is absolute:
   ```bash
   # Get absolute path (macOS/Linux)
   cd /path/to/ov-mcp && pwd
   ```

2. **Check Claude Desktop logs**:
   - macOS: `~/Library/Logs/Claude/`
   - Windows: `%APPDATA%\Claude\Logs\`
   - Linux: `~/.config/Claude/logs/`

3. **Test the server independently**:
   ```bash
   bun run packages/mcp-server/src/index.ts
   # Should output: "OV-MCP Server running on stdio"
   ```

4. **Restart Claude Desktop** completely (quit and reopen)

#### Bun Not Found

**Symptoms**: `command not found: bun`

**Solution**:
```bash
# Install or update Bun
curl -fsSL https://bun.sh/install | bash

# Verify installation
bun --version

# Reload shell configuration
source ~/.bashrc  # or ~/.zshrc
```

#### TypeScript Errors

**Symptoms**: Type checking fails

**Solutions**:
```bash
# Reinstall dependencies
bun run clean
bun install

# Check individual packages
cd packages/mcp-server
bun run typecheck
```

#### GTFS Data Not Loading

**Symptoms**: "No results found" for all queries

**Solution**: The GTFS parser integration is in development. Check the roadmap below for status.

### Debug Mode

Enable verbose logging:

```typescript
// In packages/mcp-server/src/index.ts
console.error("Debug: Tool called", { name, args });
```

### Getting Help

- **GitHub Issues**: [github.com/laulauland/ov-mcp/issues](https://github.com/laulauland/ov-mcp/issues)
- **MCP Documentation**: [modelcontextprotocol.io](https://modelcontextprotocol.io)
- **Bun Documentation**: [bun.sh/docs](https://bun.sh/docs)

## Data Sources

The project uses GTFS (General Transit Feed Specification) data from Dutch public transport operators:

### Current Sources
- **NS (Nederlandse Spoorwegen)**: National Rail network
- **Regional operators**: Bus, tram, and metro services

### GTFS Data Format

GTFS data consists of several related CSV files:

- `stops.txt`: Stop/station locations and names
- `routes.txt`: Transit routes (lines)
- `trips.txt`: Individual trips on routes
- `stop_times.txt`: Arrival/departure times for trips
- `calendar.txt`: Service schedules
- `agency.txt`: Transit agency information

### Obtaining GTFS Data

1. **NS GTFS**: Available at [ns.nl](https://www.ns.nl/reisinformatie/ns-api)
2. **Regional Operators**: Check individual operator websites
3. **OpenOV**: Community-maintained Dutch GTFS feeds

## Contributing

Contributions are welcome! Here's how to get started:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feat/amazing-feature`
3. **Make your changes**
4. **Run tests and type checking**:
   ```bash
   bun run test
   bun run typecheck
   ```
5. **Commit your changes**: `git commit -m 'feat: Add amazing feature'`
6. **Push to the branch**: `git push origin feat/amazing-feature`
7. **Open a Pull Request**

### Development Guidelines

- Follow the existing code style
- Add tests for new features
- Update documentation for API changes
- Use conventional commit messages
- Ensure all CI checks pass

## License

MIT License - see [LICENSE](LICENSE) file for details

## Roadmap

### ✅ Completed
- [x] Project structure and monorepo setup
- [x] MCP server basic implementation
- [x] GTFS parser foundation
- [x] TypeScript configuration
- [x] Bun workspace configuration

### 🚧 In Progress
- [ ] GTFS data integration
- [ ] Complete stop search implementation
- [ ] Cloudflare Workers adapter

### 📋 Planned
- [ ] Real-time departure information
- [ ] Route planning capabilities
- [ ] Disruption alerts and notifications
- [ ] Multi-modal journey planning
- [ ] Support for all Dutch transport operators
- [ ] Caching and performance optimization
- [ ] Rate limiting and error handling
- [ ] Comprehensive test coverage
- [ ] API documentation
- [ ] Example integrations

## Related Projects

- **[Model Context Protocol](https://modelcontextprotocol.io)**: Official MCP specification and documentation
- **[MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)**: Official SDK used in this project
- **[GTFS Specification](https://gtfs.org)**: General Transit Feed Specification
- **[Bun](https://bun.sh)**: Fast all-in-one JavaScript runtime

## Acknowledgments

- Anthropic for creating the Model Context Protocol
- The Bun team for an amazing JavaScript runtime
- Dutch public transport operators for providing GTFS data
- The open-source community

---

**Built with ❤️ for the Dutch public transport community**
