# OV-MCP Scripts

Utility scripts for managing GTFS data and Cloudflare Workers deployment.

## Upload GTFS Data to Cloudflare Worker

This script downloads GTFS data from gtfs.ovapi.nl and uploads it to your Cloudflare Worker's KV storage.

### Prerequisites

1. Deploy your Cloudflare Worker first:
   ```bash
   cd packages/cloudflare-worker
   bun run deploy
   ```

2. Set up a secret for authentication:
   ```bash
   wrangler secret put GTFS_UPDATE_SECRET
   # Enter a secure random string when prompted
   ```

### Usage

```bash
# Set environment variables
export CLOUDFLARE_WORKER_URL="https://your-worker.workers.dev"
export GTFS_UPDATE_SECRET="your-secret-from-above"

# Run the upload script
bun run scripts/upload-gtfs-to-worker.ts
```

### Environment Variables

- `CLOUDFLARE_WORKER_URL` (required): The URL of your deployed Cloudflare Worker
- `GTFS_UPDATE_SECRET` (required): The secret you configured in your Worker's environment

### What It Does

1. **Downloads** GTFS data from gtfs.ovapi.nl (~50-100 MB compressed)
2. **Parses** the ZIP file and extracts all GTFS CSV files
3. **Uploads** the parsed data to your Worker's KV storage
4. **Verifies** the upload was successful

### Scheduling Automatic Updates

For production use, you should schedule this script to run daily to keep your data fresh:

#### Using GitHub Actions

Create `.github/workflows/update-gtfs.yml`:

```yaml
name: Update GTFS Data

on:
  schedule:
    # Run daily at 3 AM UTC
    - cron: '0 3 * * *'
  workflow_dispatch: # Allow manual triggering

jobs:
  update-gtfs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest
      
      - run: bun install
      
      - name: Upload GTFS Data
        env:
          CLOUDFLARE_WORKER_URL: ${{ secrets.CLOUDFLARE_WORKER_URL }}
          GTFS_UPDATE_SECRET: ${{ secrets.GTFS_UPDATE_SECRET }}
        run: bun run scripts/upload-gtfs-to-worker.ts
```

#### Using Cron (Linux/macOS)

```bash
# Edit crontab
crontab -e

# Add this line to run daily at 3 AM
0 3 * * * cd /path/to/ov-mcp && /path/to/bun run scripts/upload-gtfs-to-worker.ts
```

#### Using Cloudflare Workers Cron Triggers

Alternatively, you can have the Worker download data itself on a schedule. Add to `wrangler.toml`:

```toml
[triggers]
crons = ["0 3 * * *"]  # Daily at 3 AM UTC
```

Then update your Worker code to handle the scheduled event.

### Troubleshooting

#### "Error: CLOUDFLARE_WORKER_URL environment variable is required"

Make sure you've set the environment variable:
```bash
export CLOUDFLARE_WORKER_URL="https://your-worker.workers.dev"
```

#### "Upload failed: 401 Unauthorized"

Your `GTFS_UPDATE_SECRET` doesn't match the Worker's configuration. Verify:
1. The secret was set correctly in Cloudflare: `wrangler secret put GTFS_UPDATE_SECRET`
2. You're using the same value locally: `export GTFS_UPDATE_SECRET="..."`

#### "Download failed"

Check your internet connection and verify gtfs.ovapi.nl is accessible:
```bash
curl -I http://gtfs.ovapi.nl/gtfs-nl.zip
```

#### "Worker is not responding"

Verify your Worker is deployed and accessible:
```bash
curl https://your-worker.workers.dev/health
```

### Data Size and Costs

- **Download size**: ~50-100 MB compressed
- **Parsed size**: ~200-400 MB JSON
- **Cloudflare KV**: 
  - Free tier: 100,000 reads/day, 1,000 writes/day, 1 GB storage
  - This should be sufficient for most use cases
  - KV storage is automatically replicated globally

### Manual Testing

Test the Worker after upload:

```bash
# Health check
curl https://your-worker.workers.dev/health | jq

# Test MCP endpoint
curl -X POST https://your-worker.workers.dev/mcp \
  -H "Content-Type: application/json" \
  -d '{"method":"tools/list"}' | jq

# Search for stops
curl -X POST https://your-worker.workers.dev/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "get_stops",
      "arguments": {"query": "Amsterdam", "limit": 5}
    }
  }' | jq
```
