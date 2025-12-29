# @ov-mcp/cloudflare-worker

Cloudflare Workers deployment package for the OV-MCP server.

## Overview

This package provides a Cloudflare Workers runtime for the OV-MCP server, enabling:

- HTTP-based MCP protocol communication
- GTFS data caching via Cloudflare KV
- Global edge deployment
- Automatic scaling

## Quick Start

### Development

```bash
# Install dependencies
bun install

# Start development server
bun run dev
```

### Deployment

```bash
# Deploy to staging
bun run deploy:staging

# Deploy to production
bun run deploy:production
```

## Documentation

For complete deployment instructions, see [Cloudflare Deployment Guide](../../docs/CLOUDFLARE_DEPLOYMENT.md).

## Architecture

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ HTTP/JSON
       ↓
┌─────────────────────┐
│ Cloudflare Worker   │
│  - HTTP Transport   │
│  - MCP Protocol     │
└──────┬──────────────┘
       │
       ├─→ KV Storage (GTFS Cache)
       │
       └─→ GTFS Parser
```

## API Endpoints

- `GET /` - API information
- `GET /health` - Health check
- `POST /mcp` - MCP protocol endpoint
- `POST /admin/update-gtfs` - Update GTFS cache (admin)

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GTFS_CACHE` | KV namespace binding | Yes |
| `ENVIRONMENT` | Environment name | No |

## Scripts

- `dev` - Start local development server with hot reload
- `build` - Build worker for deployment
- `deploy` - Deploy to default environment
- `deploy:staging` - Deploy to staging environment
- `deploy:production` - Deploy to production environment
- `tail` - Stream live logs from deployed worker
- `typecheck` - Run TypeScript type checking

## License

MIT
