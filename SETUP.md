# OV-MCP Setup Guide

Complete setup guide for the browser-compatible OV-MCP rewrite.

## Prerequisites

- **Node.js 18+** (no Bun required!)
- **npm 9+**
- **Cloudflare account** (free tier works)
- **Wrangler CLI** (`npm install -g wrangler`)

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/laulauland/ov-mcp.git
cd ov-mcp
npm install
```

### 2. Login to Cloudflare

```bash
wrangler login
```

### 3. Create KV Namespaces

```bash
# Production namespace
wrangler kv:namespace create GTFS_CACHE

# Staging/preview namespace
wrangler kv:namespace create GTFS_CACHE --preview
```

This will output IDs like:
```
🌀 Creating namespace with title "ov-mcp-server-GTFS_CACHE"
✨ Success!
Add the following to your configuration file in your kv_namespaces array:
{ binding = "GTFS_CACHE", id = "abc123..." }
```

### 4. Update Configuration

Edit `wrangler.toml` and replace the placeholder IDs:

```toml
[[kv_namespaces]]
binding = "GTFS_CACHE"
id = "YOUR_PRODUCTION_KV_ID"  # From step 3
preview_id = "YOUR_PREVIEW_KV_ID"  # From step 3
```

### 5. Set Secrets (Production Only)

```bash
wrangler secret put GTFS_UPDATE_SECRET --env production
```

Enter a secure random string when prompted. This protects your admin endpoints.

### 6. Build and Deploy

```bash
# Deploy to staging first
./deploy.sh staging

# Or manually:
cd packages/cloudflare-worker
npm run deploy:staging
```

### 7. Upload GTFS Data

After deployment, populate the cache with GTFS data:

```bash
# Get your worker URL from Wrangler output
WORKER_URL="https://ov-mcp-server-staging.YOUR_SUBDOMAIN.workers.dev"

# Download and process GTFS data
curl -X POST "$WORKER_URL/admin/download-gtfs" \
  -H "Authorization: Bearer YOUR_SECRET"
```

This downloads the Dutch public transport GTFS feed (~100MB) and processes it into the KV cache.

### 8. Test

```bash
# Check health
curl $WORKER_URL/health

# Test MCP endpoint
curl -X POST $WORKER_URL/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {
        "name": "test-client",
        "version": "1.0.0"
      }
    }
  }'
```

### 9. Deploy to Production

Once staging is working:

```bash
./deploy.sh production
```

## Architecture Overview

### File Structure

```
ov-mcp/
├── packages/
│   └── cloudflare-worker/
│       ├── src/
│       │   ├── index.ts              # Main MCP server (your existing file)
│       │   ├── gtfs-static.ts        # GTFS feed parser (browser-compatible)
│       │   ├── gtfs-realtime.ts      # GTFS Realtime protobuf parser
│       │   └── journey-planner.ts    # A* journey planning algorithm
│       ├── package.json              # Dependencies (no Bun!)
│       └── build.js                  # esbuild-based build script
├── wrangler.toml                     # Cloudflare Worker config
├── deploy.sh                         # Deployment script
└── package.json                      # Root package.json (workspace)
```

### Key Technologies

- **fflate**: Browser-compatible ZIP decompression (no Node.js!)
- **esbuild**: Fast bundler for browser targets
- **@cloudflare/agents**: AI-powered query understanding
- **Custom protobuf parser**: Minimal implementation for GTFS Realtime

### Data Flow

```
User Query
    ↓
MCP Client → Worker (index.ts)
    ↓
AI Agent (@cloudflare/agents)
    ↓
Journey Planner (journey-planner.ts)
    ↓
GTFS Static (gtfs-static.ts) + Realtime (gtfs-realtime.ts)
    ↓
KV Cache ← External GTFS Feeds
```

## Available MCP Tools

### 1. `get_stops`
Search for stops by name.

```json
{
  "name": "get_stops",
  "arguments": {
    "query": "Amsterdam Centraal",
    "limit": 5
  }
}
```

### 2. `get_stop_by_id`
Get detailed information about a specific stop.

```json
{
  "name": "get_stop_by_id",
  "arguments": {
    "stop_id": "8400058"
  }
}
```

### 3. `find_stops_nearby`
Find stops near coordinates.

```json
{
  "name": "find_stops_nearby",
  "arguments": {
    "latitude": 52.3791,
    "longitude": 4.9003,
    "radius_km": 0.5,
    "limit": 10
  }
}
```

### 4. `get_routes`
Search for routes.

```json
{
  "name": "get_routes",
  "arguments": {
    "query": "IC 3000",
    "limit": 5
  }
}
```

### 5. `plan_journey`
Plan a journey between stops (requires journey-planner integration in index.ts).

```json
{
  "name": "plan_journey",
  "arguments": {
    "origin_stop_id": "8400058",
    "destination_stop_id": "8400530",
    "departure_time": "2025-12-29T10:00:00Z",
    "max_transfers": 2
  }
}
```

### 6. `get_realtime_updates`
Get real-time vehicle positions and delays.

```json
{
  "name": "get_realtime_updates",
  "arguments": {
    "route_id": "IC_3000",
    "stop_id": "8400058"
  }
}
```

## Integrating New Tools

To add journey planning and realtime tools to your existing `index.ts`:

### 1. Import the modules

```typescript
import { JourneyPlanner, formatJourney } from './journey-planner';
import { fetchGtfsRealtimeFeed, getStopDelays } from './gtfs-realtime';
import { downloadGTFSFeed } from './gtfs-static';
```

### 2. Add tool definitions

In `handleToolsList()`, add:

```typescript
{
  name: 'plan_journey',
  description: 'Plan a journey between two stops with real-time updates',
  inputSchema: {
    type: 'object',
    properties: {
      origin_stop_id: { type: 'string', description: 'Origin stop ID' },
      destination_stop_id: { type: 'string', description: 'Destination stop ID' },
      departure_time: { type: 'string', description: 'ISO 8601 departure time' },
      max_transfers: { type: 'number', default: 3 }
    },
    required: ['origin_stop_id', 'destination_stop_id']
  }
}
```

### 3. Add tool handlers

In `handleToolCall()`, add:

```typescript
case 'plan_journey':
  return await this.planJourney(args);
case 'get_realtime_updates':
  return await this.getRealtimeUpdates(args);
```

### 4. Implement handlers

```typescript
private async planJourney(args: {
  origin_stop_id: string;
  destination_stop_id: string;
  departure_time?: string;
  max_transfers?: number;
}) {
  const feed = await this.getCachedGTFSData();
  if (!feed) {
    return { content: [{ type: 'text', text: 'GTFS data not available' }] };
  }

  // Fetch realtime data
  const realtimeFeed = await fetchGtfsRealtimeFeed(
    'http://gtfs.ovapi.nl/gtfsrt'
  ).catch(() => undefined);

  const planner = new JourneyPlanner(feed, realtimeFeed, {
    maxTransfers: args.max_transfers,
    departureTime: args.departure_time ? new Date(args.departure_time) : new Date(),
  });

  const journeys = await planner.planJourney(
    args.origin_stop_id,
    args.destination_stop_id
  );

  if (journeys.length === 0) {
    return {
      content: [{ type: 'text', text: 'No journeys found' }]
    };
  }

  const formatted = journeys.map(formatJourney).join('\n\n---\n\n');
  return {
    content: [{ type: 'text', text: formatted }]
  };
}
```

## Configuration Options

### Journey Planner

```typescript
const options = {
  maxTransfers: 3,           // Maximum transfers allowed
  maxWalkingDistance: 2,     // Maximum walking in km
  walkingSpeed: 5,           // Walking speed km/h
  transferTime: 5,           // Minimum transfer time minutes
  departureTime: new Date()  // Departure time
};
```

### GTFS Caching

```typescript
const CACHE_TTL = 60 * 60 * 24; // 24 hours
```

Update GTFS data daily using a scheduled worker or cron job.

## Troubleshooting

### Build Errors

```bash
# Clear everything
npm run clean
npm install
npm run build
```

### KV Not Found

```bash
# List your KV namespaces
wrangler kv:namespace list

# Check KV contents
wrangler kv:key list --binding GTFS_CACHE --env staging
```

### Deployment Issues

```bash
# Check Wrangler auth
wrangler whoami

# View deployment logs
wrangler tail --env staging
```

### GTFS Data Issues

If GTFS data fails to load:

1. Check the feed URL is accessible: `curl http://gtfs.ovapi.nl/gtfs-nl.zip`
2. Verify KV namespace IDs in `wrangler.toml`
3. Check worker logs: `wrangler tail`
4. Try uploading manually via the admin endpoint

### Memory Issues

If the worker runs out of memory processing large GTFS feeds:

1. Consider using R2 instead of KV for large datasets
2. Process the GTFS feed externally and upload JSON
3. Split the data into smaller chunks

## Performance Tips

### 1. Preprocess GTFS Data

Instead of downloading and parsing in the worker, preprocess offline:

```bash
# Download
curl -O http://gtfs.ovapi.nl/gtfs-nl.zip

# Process with a script (outside the worker)
node scripts/process-gtfs.js gtfs-nl.zip > gtfs-data.json

# Upload
curl -X POST $WORKER_URL/admin/update-gtfs \
  -H "Authorization: Bearer YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d @gtfs-data.json
```

### 2. Use R2 for Large Datasets

For feeds >25MB, use R2 instead of KV:

```toml
[[r2_buckets]]
binding = "GTFS_STORAGE"
bucket_name = "ov-mcp-gtfs"
```

### 3. Cache Realtime Data

Cache realtime feeds for 30-60 seconds to reduce API calls:

```typescript
const cachedRealtime = await env.GTFS_CACHE.get('realtime:cache', 'json');
if (cachedRealtime && Date.now() - cachedRealtime.timestamp < 60000) {
  return cachedRealtime.data;
}
```

## Monitoring

### Cloudflare Dashboard

- **Analytics**: View request counts, latency, errors
- **Logs**: Real-time worker logs
- **KV Metrics**: Storage usage, read/write operations

### Wrangler CLI

```bash
# Live logs
wrangler tail --env production

# Deployment info
wrangler deployments list

# KV usage
wrangler kv:key list --binding GTFS_CACHE
```

### Custom Metrics

Add custom logging in your worker:

```typescript
console.log('Journey planned', {
  origin: originStopId,
  destination: destinationStopId,
  journeys: journeys.length,
  duration_ms: Date.now() - startTime
});
```

## Scheduled Updates

To update GTFS data automatically, create a scheduled worker:

### 1. Add to wrangler.toml

```toml
[triggers]
crons = ["0 3 * * *"]  # Daily at 3 AM
```

### 2. Add scheduled handler

```typescript
export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    console.log('Running scheduled GTFS update');
    
    try {
      const feed = await downloadGTFSFeed('http://gtfs.ovapi.nl/gtfs-nl.zip');
      
      await env.GTFS_CACHE.put('gtfs:data:v1', JSON.stringify(feed), {
        expirationTtl: 60 * 60 * 24,
      });
      
      console.log('GTFS data updated successfully');
    } catch (error) {
      console.error('Failed to update GTFS data:', error);
    }
  }
};
```

## MCP Client Configuration

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ov-mcp": {
      "url": "https://ov-mcp-server.YOUR_SUBDOMAIN.workers.dev/mcp"
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "servers": {
    "ov-mcp": {
      "type": "http",
      "url": "https://ov-mcp-server.YOUR_SUBDOMAIN.workers.dev/mcp"
    }
  }
}
```

## Security

### 1. Protect Admin Endpoints

Always set `GTFS_UPDATE_SECRET` for production:

```bash
wrangler secret put GTFS_UPDATE_SECRET --env production
```

### 2. Rate Limiting

Add rate limiting to prevent abuse:

```typescript
const rateLimiter = new Map<string, number>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const lastRequest = rateLimiter.get(ip) || 0;
  
  if (now - lastRequest < 1000) { // 1 request per second
    return false;
  }
  
  rateLimiter.set(ip, now);
  return true;
}
```

### 3. CORS Configuration

Restrict CORS to specific origins in production:

```typescript
const allowedOrigins = ['https://your-app.com'];
const origin = request.headers.get('Origin');

if (allowedOrigins.includes(origin)) {
  headers['Access-Control-Allow-Origin'] = origin;
}
```

## Next Steps

1. ✅ **Complete Setup**: Follow steps 1-8 above
2. 🔧 **Integrate Tools**: Add journey planning and realtime to index.ts
3. 🧪 **Test Thoroughly**: Try all tools with various inputs
4. 📊 **Monitor**: Set up alerts for errors and performance
5. 🚀 **Deploy to Production**: Use `./deploy.sh production`
6. 📅 **Schedule Updates**: Add cron job for daily GTFS updates
7. 📱 **Connect MCP Clients**: Configure Claude, Cursor, or custom clients

## Support

- **Issues**: https://github.com/laulauland/ov-mcp/issues
- **Discussions**: https://github.com/laulauland/ov-mcp/discussions
- **Documentation**: https://github.com/laulauland/ov-mcp/blob/main/README.md

## License

MIT
