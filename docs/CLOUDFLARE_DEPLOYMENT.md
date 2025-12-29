# Cloudflare Workers Deployment Guide

This guide walks you through deploying the OV-MCP server to Cloudflare Workers for global, scalable edge deployment.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Initial Setup](#initial-setup)
- [Deployment](#deployment)
- [Data Management](#data-management)
- [Testing](#testing)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)
- [Production Considerations](#production-considerations)

## Overview

### Why Cloudflare Workers?

- **Global Edge Network**: Serve from 300+ locations worldwide
- **Zero Cold Starts**: Always-warm instances
- **Auto-scaling**: Handle any load without configuration
- **KV Storage**: Globally replicated key-value storage for GTFS data
- **Cost-Effective**: Generous free tier (100k requests/day)

### Architecture

```
           ┌───────────────────┐
           │   MCP Client      │
           │ (Claude Desktop) │
           └─────────┬─────────┘
                    │ HTTPS
                    │
           ┌────────▼─────────┐
           │ Cloudflare Edge  │ ← 300+ global locations
           └─────────┬─────────┘
                    │
           ┌────────▼─────────┐
           │  OV-MCP Worker  │ ← Your Worker script
           └─────────┬─────────┘
                    │ Read
                    │
           ┌────────▼─────────┐
           │ KV Storage      │ ← GTFS data cache
           │ (Replicated)    │     (globally replicated)
           └───────────────────┘
```

## Prerequisites

### 1. Cloudflare Account

Sign up at [cloudflare.com](https://dash.cloudflare.com/sign-up) - the free tier is sufficient.

### 2. Wrangler CLI

Install Cloudflare's deployment tool:

```bash
bun install -g wrangler
# or
npm install -g wrangler
```

Verify installation:
```bash
wrangler --version
```

### 3. Authentication

Log in to your Cloudflare account:

```bash
wrangler login
```

This will open a browser window for authentication.

## Initial Setup

### 1. Create KV Namespace

KV (Workers KV) is Cloudflare's key-value storage for caching GTFS data.

```bash
# Create production namespace
wrangler kv:namespace create "GTFS_CACHE"

# Create preview namespace (for testing)
wrangler kv:namespace create "GTFS_CACHE" --preview
```

You'll get output like:
```
🎉 Success! Created KV namespace with id "abc123..."
```

**Save these IDs** - you'll need them for configuration.

### 2. Update wrangler.toml

Edit `wrangler.toml` in the root directory:

```toml
name = "ov-mcp-server"
main = "packages/cloudflare-worker/src/index.ts"
compatibility_date = "2024-12-01"

# Production KV namespace
[[kv_namespaces]]
binding = "GTFS_CACHE"
id = "YOUR_PRODUCTION_ID_HERE"  # Replace with your ID from step 1

# Preview KV namespace (for wrangler dev)
[[kv_namespaces]]
binding = "GTFS_CACHE"
preview_id = "YOUR_PREVIEW_ID_HERE"  # Replace with your preview ID

# Environment variables
[vars]
ENVIRONMENT = "production"

# Optional: Custom domain
# routes = [
#   { pattern = "ov-mcp.yourdomain.com", custom_domain = true }
# ]
```

### 3. Set Secrets

Secrets are encrypted environment variables for sensitive data:

```bash
# Navigate to worker directory
cd packages/cloudflare-worker

# Set update secret (used for data uploads)
wrangler secret put GTFS_UPDATE_SECRET
# Enter a secure random string when prompted
# You can generate one with: openssl rand -base64 32
```

## Deployment

### Deploy to Production

```bash
cd packages/cloudflare-worker
wrangler deploy
```

You'll get output like:
```
Total Upload: 250 KiB / gzip: 75 KiB
Uploaded ov-mcp-server (1.23 sec)
Published ov-mcp-server (0.45 sec)
  https://ov-mcp-server.your-subdomain.workers.dev
```

**Save this URL** - this is your Worker's endpoint.

### Deploy to Staging

For testing before production:

```bash
wrangler deploy --env staging
```

Update `wrangler.toml` to add staging environment:

```toml
[env.staging]
name = "ov-mcp-server-staging"

[[env.staging.kv_namespaces]]
binding = "GTFS_CACHE"
id = "YOUR_STAGING_KV_ID"

[env.staging.vars]
ENVIRONMENT = "staging"
```

## Data Management

### Upload GTFS Data

After deploying, you need to upload GTFS data to KV storage:

#### Method 1: Using the Upload Script (Recommended)

```bash
# Set environment variables
export CLOUDFLARE_WORKER_URL="https://ov-mcp-server.your-subdomain.workers.dev"
export GTFS_UPDATE_SECRET="your-secret-from-step-3"

# Run upload script from repository root
bun run scripts/upload-gtfs-to-worker.ts
```

This will:
1. Download GTFS data from gtfs.ovapi.nl
2. Parse and validate the data
3. Upload to your Worker's KV storage
4. Verify the upload

#### Method 2: Manual Upload via API

If you have pre-processed GTFS data:

```bash
curl -X POST https://your-worker.workers.dev/admin/update-gtfs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SECRET" \
  -d @gtfs-data.json
```

### Automatic Updates

#### Option A: GitHub Actions

Create `.github/workflows/update-gtfs.yml`:

```yaml
name: Update GTFS Data

on:
  schedule:
    - cron: '0 3 * * *'  # Daily at 3 AM UTC
  workflow_dispatch:

jobs:
  update-gtfs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: oven-sh/setup-bun@v1
      
      - run: bun install
      
      - name: Upload GTFS Data
        env:
          CLOUDFLARE_WORKER_URL: ${{ secrets.CLOUDFLARE_WORKER_URL }}
          GTFS_UPDATE_SECRET: ${{ secrets.GTFS_UPDATE_SECRET }}
        run: bun run scripts/upload-gtfs-to-worker.ts
```

Add secrets in GitHub repository settings:
- `CLOUDFLARE_WORKER_URL`
- `GTFS_UPDATE_SECRET`

#### Option B: Cloudflare Cron Triggers

Add to `wrangler.toml`:

```toml
[triggers]
crons = ["0 3 * * *"]  # Daily at 3 AM UTC
```

Update your Worker to handle scheduled events:

```typescript
export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // Download and cache fresh GTFS data
    await downloadAndCacheGTFS(env);
  },
  
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    // ... existing fetch handler
  },
};
```

## Testing

### Health Check

Verify your Worker is running:

```bash
curl https://your-worker.workers.dev/health | jq
```

Expected response:
```json
{
  "status": "ok",
  "environment": "production",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "gtfs_data_available": true,
  "gtfs_metadata": {
    "lastUpdated": "2024-01-15T03:00:00.000Z",
    "stopCount": 45231,
    "routeCount": 1234,
    "tripCount": 56789
  }
}
```

### Test MCP Endpoints

#### List Available Tools

```bash
curl -X POST https://your-worker.workers.dev/mcp \
  -H "Content-Type: application/json" \
  -d '{"method":"tools/list"}' | jq
```

#### Search for Stops

```bash
curl -X POST https://your-worker.workers.dev/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "get_stops",
      "arguments": {
        "query": "Amsterdam Centraal",
        "limit": 5
      }
    }
  }' | jq
```

#### Find Nearby Stops

```bash
curl -X POST https://your-worker.workers.dev/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "find_stops_nearby",
      "arguments": {
        "latitude": 52.3791,
        "longitude": 4.9003,
        "radius_km": 1,
        "limit": 10
      }
    }
  }' | jq
```

### Local Testing

Test locally before deploying:

```bash
cd packages/cloudflare-worker
wrangler dev
```

This starts a local development server at `http://localhost:8787`.

## Monitoring

### View Logs

Stream real-time logs:

```bash
wrangler tail
```

Filter by status:
```bash
wrangler tail --status error
```

### Analytics Dashboard

View analytics in the Cloudflare dashboard:
1. Go to [dash.cloudflare.com](https://dash.cloudflare.com)
2. Select "Workers & Pages"
3. Click on "ov-mcp-server"
4. View metrics: requests, errors, CPU time, etc.

### Custom Metrics

Add custom metrics to your Worker:

```typescript
// Track tool usage
const { ANALYTICS_ENGINE } = env;
await ANALYTICS_ENGINE.writeDataPoint({
  blobs: [toolName],
  doubles: [responseTime],
  indexes: [userId],
});
```

## Troubleshooting

### "Error: No KV namespace with binding GTFS_CACHE"

**Solution**: Update `wrangler.toml` with correct KV namespace IDs.

### "Error: 401 Unauthorized" on Data Upload

**Solutions**:
1. Verify `GTFS_UPDATE_SECRET` is set: `wrangler secret list`
2. Ensure you're using the same secret locally
3. Re-set the secret: `wrangler secret put GTFS_UPDATE_SECRET`

### "Error: Script too large"

**Solution**: The bundled script exceeds 1 MB. Optimize by:
```bash
# Enable minification
wrangler deploy --minify

# Or update wrangler.toml
[build]
command = "bun build src/index.ts --outdir dist --target browser --minify"
```

### "GTFS data not available"

**Solution**: Upload data using the upload script (see Data Management section).

### High CPU Time

If you see warnings about CPU time:

1. **Optimize queries**: Add indexes for frequent searches
2. **Reduce data size**: Store only essential fields
3. **Use pagination**: Limit result set sizes
4. **Cache responses**: Add response caching for common queries

### KV Storage Limits

**Free Tier Limits**:
- 100,000 reads/day
- 1,000 writes/day
- 1 GB storage

**If you exceed limits**:
- Upgrade to paid plan ($5/month)
- Reduce update frequency
- Optimize data structure

## Production Considerations

### Custom Domain

Use your own domain instead of `*.workers.dev`:

1. Add domain to Cloudflare
2. Update `wrangler.toml`:
   ```toml
   routes = [
     { pattern = "api.yourdomain.com/ov-mcp", custom_domain = true }
   ]
   ```
3. Deploy: `wrangler deploy`

### Rate Limiting

Protect your Worker from abuse:

```typescript
const RATE_LIMIT = 100; // requests per minute

const rateLimiter = new RateLimiter(env.RATE_LIMITER, RATE_LIMIT);
const allowed = await rateLimiter.checkLimit(clientId);

if (!allowed) {
  return new Response('Rate limit exceeded', { status: 429 });
}
```

### Security

1. **Use secrets** for all sensitive data
2. **Validate input** to prevent injection attacks
3. **Implement CORS** properly for your use case
4. **Monitor logs** for suspicious activity
5. **Rotate secrets** regularly

### Caching Strategy

```typescript
// Add cache headers for static responses
return new Response(JSON.stringify(data), {
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
  },
});
```

### Backup Strategy

1. **Export KV data regularly**:
   ```bash
   wrangler kv:key list --namespace-id=YOUR_ID > keys.json
   ```

2. **Store in version control**:
   - Keep processed GTFS data in Git LFS
   - Or store in cloud storage (S3, R2)

3. **Automate backups**:
   - Add to GitHub Actions workflow
   - Or use Cloudflare Workers Cron

### Cost Optimization

**Free Tier (sufficient for most use cases)**:
- 100,000 requests/day
- 10 ms CPU time per request
- 1 GB KV storage

**Paid Plan ($5/month)**:
- 10 million requests/month
- 50 ms CPU time per request
- Additional KV operations

**Tips to stay within free tier**:
- Cache aggressively
- Minimize KV reads
- Optimize bundle size
- Use efficient data structures

## Next Steps

1. **Set up monitoring**: Configure alerts for errors
2. **Add more tools**: Implement additional MCP tools
3. **Optimize performance**: Profile and optimize hot paths
4. **Add analytics**: Track usage patterns
5. **Documentation**: Document your API endpoints

## Support

- **Cloudflare Docs**: [developers.cloudflare.com/workers](https://developers.cloudflare.com/workers/)
- **Community**: [Discord](https://discord.cloudflare.com)
- **Issues**: [GitHub Issues](https://github.com/laulauland/ov-mcp/issues)

---

**Ready to deploy?** Follow the steps above and your OV-MCP server will be running globally in minutes!
