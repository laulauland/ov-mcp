# OV-MCP Quick Reference

## Setup (First Time)

```bash
# 1. Install dependencies
npm install

# 2. Login to Cloudflare
wrangler login

# 3. Create KV namespaces
wrangler kv:namespace create GTFS_CACHE
wrangler kv:namespace create GTFS_CACHE --preview

# 4. Update wrangler.toml with KV IDs (from step 3)

# 5. Set production secret
wrangler secret put GTFS_UPDATE_SECRET --env production
```

## Build & Deploy

```bash
# Build
cd packages/cloudflare-worker
npm run build

# Deploy to staging
./deploy.sh staging

# Deploy to production
./deploy.sh production

# Or manually
npm run deploy:staging
npm run deploy:production
```

## Development

```bash
# Start local dev server
cd packages/cloudflare-worker
npm run dev

# Type check
npm run typecheck

# Clean build artifacts
npm run clean
```

## Upload GTFS Data

```bash
# Set your worker URL
export WORKER_URL="https://ov-mcp-server-staging.YOUR_SUBDOMAIN.workers.dev"

# Download and process GTFS data
curl -X POST "$WORKER_URL/admin/download-gtfs" \\
  -H "Authorization: Bearer YOUR_SECRET"

# Or upload pre-processed JSON
curl -X POST "$WORKER_URL/admin/update-gtfs" \\
  -H "Authorization: Bearer YOUR_SECRET" \\
  -H "Content-Type: application/json" \\
  -d @gtfs-data.json
```

## Testing

```bash
# Health check
curl $WORKER_URL/health

# Test MCP endpoint
curl -X POST $WORKER_URL/mcp \\
  -H "Content-Type: application/json" \\
  -d '{
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {"name": "test", "version": "1.0.0"}
    }
  }'

# Get stops
curl -X POST $WORKER_URL/mcp \\
  -H "Content-Type: application/json" \\
  -d '{
    "method": "tools/call",
    "params": {
      "name": "get_stops",
      "arguments": {"query": "Amsterdam", "limit": 5}
    }
  }'
```

## Monitoring

```bash
# View live logs
wrangler tail --env production

# List deployments
wrangler deployments list

# Check KV contents
wrangler kv:key list --binding GTFS_CACHE --env production
wrangler kv:key get gtfs:data:v1 --binding GTFS_CACHE --env production
```

## File Structure

```
ov-mcp/
├── packages/cloudflare-worker/
│   ├── src/
│   │   ├── index.ts              # Main MCP server
│   │   ├── gtfs-static.ts        # GTFS parser
│   │   ├── gtfs-realtime.ts      # Realtime parser
│   │   └── journey-planner.ts    # Journey planning
│   ├── package.json
│   └── build.js
├── wrangler.toml                 # Worker config
├── deploy.sh                     # Deployment script
└── package.json                  # Root config
```

## Available MCP Tools

| Tool | Description |
|------|-------------|
| `get_stops` | Search stops by name |
| `get_stop_by_id` | Get stop details |
| `find_stops_nearby` | Find stops near coordinates |
| `get_routes` | Search routes |
| `plan_journey` | Plan journey between stops |
| `get_departures` | Get upcoming departures |
| `get_realtime_updates` | Get real-time vehicle data |

## Common Issues

### Build fails
```bash
npm run clean
npm install
npm run build
```

### KV not found
```bash
# List namespaces
wrangler kv:namespace list

# Update wrangler.toml with correct IDs
```

### Authentication error
```bash
wrangler whoami
wrangler login
```

### GTFS data missing
```bash
# Re-upload data
curl -X POST $WORKER_URL/admin/download-gtfs \\
  -H "Authorization: Bearer YOUR_SECRET"
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GTFS_CACHE_KV_ID` | Production KV namespace ID | Yes |
| `GTFS_CACHE_PREVIEW_KV_ID` | Preview KV namespace ID | Yes |
| `GTFS_UPDATE_SECRET` | Admin endpoint protection | Production only |

## Links

- **Setup Guide**: [SETUP.md](./SETUP.md)
- **Implementation Details**: [IMPLEMENTATION.md](./IMPLEMENTATION.md)
- **Worker README**: [packages/cloudflare-worker/README.md](./packages/cloudflare-worker/README.md)
- **GitHub**: https://github.com/laulauland/ov-mcp
- **Issues**: https://github.com/laulauland/ov-mcp/issues

## Key Dependencies

```json
{
  "fflate": "^0.8.2",               // ZIP decompression
  "@cloudflare/agents": "^1.0.0",   // AI agents
  "@modelcontextprotocol/sdk": "^0.5.0",  // MCP SDK
  "esbuild": "^0.20.0",             // Build tool
  "wrangler": "^3.94.0"             // Cloudflare CLI
}
```

## Architecture

```
User Query → Worker → AI Agent → Journey Planner
                                      ↓
                          GTFS Static + Realtime
                                      ↓
                                  KV Cache
```

## Performance

- **Cold start**: 100-200ms
- **Warm start**: 5-20ms
- **Journey planning**: 50-500ms
- **GTFS parsing**: 2-5 seconds
- **KV storage**: ~50MB

## Browser APIs Used

✅ fetch, TextEncoder/Decoder, ArrayBuffer, Uint8Array, DataView, Map, Set, Promise

❌ No Node.js APIs (fs, path, buffer, process)

## Next Steps After Setup

1. Test locally with `wrangler dev`
2. Deploy to staging
3. Upload GTFS data
4. Test all MCP tools
5. Deploy to production
6. Set up monitoring
7. Schedule GTFS updates

## Support

Need help? Check:
1. [SETUP.md](./SETUP.md) - Detailed setup instructions
2. [IMPLEMENTATION.md](./IMPLEMENTATION.md) - Technical details
3. [GitHub Issues](https://github.com/laulauland/ov-mcp/issues) - Report bugs
4. [Discussions](https://github.com/laulauland/ov-mcp/discussions) - Ask questions
