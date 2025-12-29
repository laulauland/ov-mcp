# OV-MCP Cloudflare Worker

Cloudflare Worker implementation of the OV-MCP server with full GTFS support.

## Features

- ✅ **Browser-compatible**: No Node.js or Bun dependencies
- ✅ **GTFS Static**: Full parsing and querying of GTFS feeds
- ✅ **GTFS Realtime**: Protobuf parsing for real-time updates
- ✅ **Journey Planning**: A* algorithm with real-time delay integration
- ✅ **Cloudflare Agents**: AI-powered query understanding
- ✅ **KV Caching**: Fast access to GTFS data

## Architecture

```
src/
├── index.ts              # Main worker entry point with MCP server
├── gtfs-static.ts        # GTFS Static feed parsing and querying
├── gtfs-realtime.ts      # GTFS Realtime protobuf parsing
└── journey-planner.ts    # A* journey planning algorithm
```

## Building

```bash
npm install
npm run build
```

This uses `esbuild` (not Bun) to create a browser-compatible bundle.

## Development

```bash
npm run dev
```

This starts the Wrangler development server with hot reloading.

## Deployment

### Prerequisites

1. **Create KV Namespace**:
   ```bash
   wrangler kv:namespace create GTFS_CACHE
   wrangler kv:namespace create GTFS_CACHE --preview
   ```

2. **Set Environment Variables**:
   Update `wrangler.toml` with your KV namespace IDs:
   ```toml
   GTFS_CACHE_KV_ID = "your-kv-id"
   GTFS_CACHE_PREVIEW_KV_ID = "your-preview-kv-id"
   ```

3. **Set Secrets** (production only):
   ```bash
   wrangler secret put GTFS_UPDATE_SECRET --env production
   ```

### Deploy

```bash
# Staging
npm run deploy:staging

# Production
npm run deploy:production
```

Or use the provided deploy script:

```bash
../../deploy.sh staging
../../deploy.sh production
```

## Usage

### 1. Upload GTFS Data

After deployment, you need to populate the KV cache with GTFS data:

```bash
curl -X POST https://your-worker.workers.dev/admin/download-gtfs \
  -H "Authorization: Bearer YOUR_SECRET"
```

This downloads and processes the GTFS feed from `http://gtfs.ovapi.nl/gtfs-nl.zip`.

### 2. Use MCP Tools

Connect your MCP client to the worker endpoint:

```json
{
  "mcpServers": {
    "ov-mcp": {
      "url": "https://your-worker.workers.dev/mcp"
    }
  }
}
```

Available tools:
- `get_stops` - Search for stops by name
- `get_stop_by_id` - Get stop details
- `find_stops_nearby` - Find stops near coordinates
- `get_routes` - Search for routes
- `plan_journey` - Plan a journey between two stops
- `get_departures` - Get upcoming departures from a stop
- `get_realtime_updates` - Get real-time vehicle positions and delays

### 3. Monitor

```bash
# View logs
wrangler tail --env production

# Check health
curl https://your-worker.workers.dev/health
```

## GTFS Data Structure

### Static Data

Stored in KV under key `gtfs:data:v1`:

```typescript
{
  stops: GTFSStop[];
  routes: GTFSRoute[];
  trips: GTFSTrip[];
  stop_times: GTFSStopTime[];
  calendar: GTFSCalendar[];
  calendar_dates: GTFSCalendarDate[];
  agencies: GTFSAgency[];
}
```

### Realtime Data

Fetched on-demand from GTFS Realtime feeds:
- Vehicle positions
- Trip updates (delays)
- Service alerts

## Journey Planning

The journey planner uses the A* algorithm with the following features:

- **Multi-modal**: Combines walking and transit
- **Real-time aware**: Integrates delays from GTFS Realtime
- **Transfer handling**: Configurable transfer times and limits
- **Walking distance limits**: Prevents unrealistic walking connections

### Options

```typescript
const options = {
  maxTransfers: 3,           // Maximum number of transfers
  maxWalkingDistance: 2,     // Maximum walking distance in km
  walkingSpeed: 5,           // Walking speed in km/h
  transferTime: 5,           // Minimum transfer time in minutes
  departureTime: new Date()  // Desired departure time
};
```

## Performance

- **Cold start**: ~100-200ms
- **Warm start**: ~5-20ms
- **GTFS data size**: ~50-100MB (compressed in KV)
- **Journey planning**: ~50-500ms depending on complexity

## Limitations

- **KV storage**: Limited to 25MB per key (use R2 for larger feeds)
- **CPU time**: 50ms on free tier, 30s on paid
- **Memory**: 128MB (can handle most GTFS feeds)

## Browser Compatibility

All code uses only browser-standard APIs:
- ✅ `fetch` for HTTP requests
- ✅ `TextEncoder`/`TextDecoder` for string encoding
- ✅ `ArrayBuffer`/`Uint8Array` for binary data
- ✅ `fflate` for ZIP decompression (WASM-free)
- ❌ No Node.js `fs`, `path`, `buffer`, etc.

## Development Notes

### Adding New GTFS Files

To parse additional GTFS files, update `gtfs-static.ts`:

```typescript
const shapes = parseCSV<GTFSShape>(decodeFile(unzipped['shapes.txt']));
```

### Custom Journey Planning

To customize the journey planner heuristic or neighbor generation, modify `journey-planner.ts`:

```typescript
private heuristic(from: GTFSStop, to: GTFSStop): number {
  // Custom heuristic here
}
```

### Protobuf Extensions

GTFS Realtime uses a subset of protobuf. To add support for additional fields, update the field parsing in `gtfs-realtime.ts`.

## Troubleshooting

### Build Issues

```bash
# Clear cache and rebuild
rm -rf dist node_modules
npm install
npm run build
```

### KV Issues

```bash
# List KV namespaces
wrangler kv:namespace list

# View KV data
wrangler kv:key get gtfs:data:v1 --binding GTFS_CACHE
```

### Runtime Issues

```bash
# Check logs
wrangler tail --env production

# Test locally
wrangler dev
```

## License

MIT
