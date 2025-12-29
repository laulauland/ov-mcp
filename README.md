# OV-MCP

Model Context Protocol (MCP) server for Dutch public transport (OV - Openbaar Vervoer) data.

## Overview

OV-MCP provides a standardized interface for accessing Dutch public transport information through the Model Context Protocol. It enables AI assistants and other MCP clients to query real-time and static transit data.

## Project Structure

This is a Bun monorepo with the following packages:

```
ov-mcp/
├── packages/
│   ├── mcp-server/          # MCP server implementation
│   └── gtfs-parser/         # GTFS data parsing utilities
├── package.json             # Root workspace configuration
└── tsconfig.json           # Shared TypeScript configuration
```

### Packages

- **@ov-mcp/server**: MCP server that exposes public transport tools
- **@ov-mcp/gtfs-parser**: GTFS parser and query utilities for transit data

## Prerequisites

- [Bun](https://bun.sh) v1.0.0 or higher

## Getting Started

### Installation

```bash
# Clone the repository
git clone https://github.com/laulauland/ov-mcp.git
cd ov-mcp

# Install dependencies
bun install
```

### Development

```bash
# Run all packages in development mode
bun run dev

# Build all packages
bun run build

# Run tests
bun run test

# Type checking
bun run typecheck

# Clean all build artifacts
bun run clean
```

## Usage

### MCP Server

Configure the MCP server in your MCP client (e.g., Claude Desktop):

```json
{
  "mcpServers": {
    "ov-mcp": {
      "command": "bun",
      "args": ["run", "/path/to/ov-mcp/packages/mcp-server/src/index.ts"]
    }
  }
}
```

### Available Tools

- `get_stops`: Search for public transport stops in the Netherlands

## Data Sources

The project uses GTFS (General Transit Feed Specification) data from Dutch public transport operators:

- NS (Nederlandse Spoorwegen) - National Rail
- Regional transport operators
- [More sources to be added]

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Roadmap

- [ ] GTFS data integration
- [ ] Real-time departure information
- [ ] Route planning
- [ ] Disruption alerts
- [ ] Multi-modal journey planning
- [ ] Support for all Dutch transport operators

## Related Projects

- [Model Context Protocol](https://modelcontextprotocol.io)
- [GTFS Specification](https://gtfs.org)
