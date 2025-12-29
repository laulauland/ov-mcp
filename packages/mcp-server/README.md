# @ov-mcp/server

Model Context Protocol (MCP) server for Dutch public transport (OV) data.

## Overview

This package implements an MCP server that provides tools for accessing Dutch public transport information through the Model Context Protocol.

## Development

```bash
# Install dependencies
bun install

# Run in development mode with hot reload
bun run dev

# Build
bun run build

# Start production server
bun run start

# Type checking
bun run typecheck
```

## Usage

The server runs as an MCP server using stdio transport. Configure it in your MCP client (e.g., Claude Desktop):

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

## Available Tools

- `get_stops`: Search for public transport stops in the Netherlands

## Architecture

The server uses:
- `@modelcontextprotocol/sdk` for MCP protocol implementation
- `@ov-mcp/gtfs-parser` for GTFS data parsing and access
- Bun runtime for fast execution
