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
│   ├── gtfs-parser/         # GTFS data parsing utilities
│   └── cloudflare-worker/   # Cloudflare Workers deployment
├── docs/
│   └── CLOUDFLARE_DEPLOYMENT.md  # Cloudflare deployment guide
├── .github/workflows/
│   └── deploy-cloudflare.yml     # Automated deployment workflow
├── wrangler.toml            # Cloudflare Workers configuration
├── package.json             # Root workspace configuration
└── tsconfig.json           # Shared TypeScript configuration
```

### Packages

- **@ov-mcp/server**: MCP server that exposes public transport tools
- **@ov-mcp/gtfs-parser**: GTFS parser and query utilities for transit data
- **@ov-mcp/cloudflare-worker**: Cloudflare Workers runtime for edge deployment

## Prerequisites

- [Bun](https://bun.sh) v1.0.0 or higher
- (Optional) [Cloudflare account](https://cloudflare.com) for production deployment

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

# Build Cloudflare Worker specifically
bun run build:worker

# Run tests
bun run test

# Type checking
bun run typecheck

# Clean all build artifacts
bun run clean
```

## Deployment Options

### Local Development (MCP Server)

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

### Cloudflare Workers (Production)

Deploy to Cloudflare Workers for global edge deployment with automatic scaling:

```bash
# Deploy to staging
cd packages/cloudflare-worker
bun run deploy:staging

# Deploy to production
bun run deploy:production
```

**Complete deployment guide**: See [docs/CLOUDFLARE_DEPLOYMENT.md](docs/CLOUDFLARE_DEPLOYMENT.md)

**Features:**
- ✅ Global edge deployment
- ✅ Automatic scaling
- ✅ KV storage for GTFS data caching
- ✅ GitHub Actions CI/CD
- ✅ Multi-environment support (staging/production)

## Available Tools

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

- [x] Cloudflare Workers deployment support
- [ ] GTFS data integration
- [ ] Real-time departure information
- [ ] Route planning
- [ ] Disruption alerts
- [ ] Multi-modal journey planning
- [ ] Support for all Dutch transport operators

## Related Projects

- [Model Context Protocol](https://modelcontextprotocol.io)
- [GTFS Specification](https://gtfs.org)
- [Cloudflare Workers](https://workers.cloudflare.com)
