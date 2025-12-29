# Cloudflare Workers Deployment Guide

This guide explains how to deploy the OV-MCP server to Cloudflare Workers for production use.

## Overview

Cloudflare Workers provides a serverless platform for running the OV-MCP server at the edge, offering:

- **Global distribution**: Deploy close to your users worldwide
- **Scalability**: Automatic scaling based on demand
- **Low latency**: Edge computing for faster response times
- **KV Storage**: Efficient caching of GTFS data
- **Cost-effective**: Pay only for what you use

## Prerequisites

1. **Cloudflare Account**
   - Sign up at [cloudflare.com](https://cloudflare.com)
   - Note your Account ID from the dashboard

2. **Wrangler CLI**
   ```bash
   npm install -g wrangler
   # or
   bun add -g wrangler
   ```

3. **Authentication**
   ```bash
   wrangler login
   ```

## Setup

### 1. Create KV Namespaces

Create KV namespaces for caching GTFS data:

```bash
# Production namespace
wrangler kv:namespace create "GTFS_CACHE" --env production

# Preview/staging namespace
wrangler kv:namespace create "GTFS_CACHE" --env staging
```

Note the namespace IDs returned by these commands.

### 2. Configure wrangler.toml

Update the `wrangler.toml` file with your KV namespace IDs:

```toml
[[kv_namespaces]]
binding = "GTFS_CACHE"
id = "your_production_kv_id"
preview_id = "your_preview_kv_id"
```

### 3. Set Environment Variables

For GitHub Actions deployment, add these secrets to your repository:

- `CLOUDFLARE_API_TOKEN`: API token with Workers edit permissions
- `CLOUDFLARE_ACCOUNT_ID`: Your Cloudflare account ID
- `GTFS_CACHE_KV_ID`: Production KV namespace ID
- `GTFS_CACHE_PREVIEW_KV_ID`: Staging KV namespace ID

#### Creating an API Token

1. Go to [Cloudflare Dashboard → My Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click "Create Token"
3. Use the "Edit Cloudflare Workers" template
4. Configure permissions:
   - Account: Workers Scripts (Edit)
   - Account: Workers KV Storage (Edit)
5. Copy the token and add it to GitHub Secrets

## Local Development

### 1. Install Dependencies

```bash
bun install
```

### 2. Run Development Server

```bash
cd packages/cloudflare-worker
bun run dev
```

This starts a local Cloudflare Workers development server at `http://localhost:8787`.

### 3. Test Endpoints

**Health Check:**
```bash
curl http://localhost:8787/health
```

**MCP Request:**
```bash
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/list",
    "params": {}
  }'
```

## Deployment

### Manual Deployment

**Deploy to Staging:**
```bash
cd packages/cloudflare-worker
bun run deploy:staging
```

**Deploy to Production:**
```bash
bun run deploy:production
```

### Automated Deployment (GitHub Actions)

The repository includes a GitHub Actions workflow that automatically deploys on:

1. **Push to main branch**: Deploys to staging
2. **Manual workflow dispatch**: Deploy to staging or production

To manually trigger a deployment:

1. Go to Actions tab in your GitHub repository
2. Select "Deploy to Cloudflare Workers" workflow
3. Click "Run workflow"
4. Choose environment (staging/production)
5. Click "Run workflow"

## Managing GTFS Data

### Upload GTFS Data to KV

You can populate the KV storage with GTFS data using the admin endpoint:

```bash
curl -X POST https://ov-mcp-server.your-subdomain.workers.dev/admin/update-gtfs \
  -H "Content-Type: application/json" \
  -d @gtfs-data.json
```

**Note**: In production, this endpoint should be protected with authentication.

### Automated GTFS Updates

Consider setting up a scheduled worker or external service to periodically update GTFS data:

```typescript
// Example: Scheduled worker (add to wrangler.toml)
[triggers]
crons = ["0 2 * * *"] // Update daily at 2 AM
```

## Monitoring

### View Logs

```bash
cd packages/cloudflare-worker
bun run tail
```

### Cloudflare Dashboard

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to Workers & Pages
3. Select your worker
4. View metrics, logs, and performance data

## Configuration

### Environment Variables

The worker supports the following environment variables:

| Variable | Description | Required |
|----------|-------------|----------|
| `ENVIRONMENT` | Environment name (production/staging) | No |
| `GTFS_CACHE` | KV namespace binding | Yes |

### Cache Configuration

GTFS data is cached with a 24-hour TTL by default. To modify:

```typescript
// packages/cloudflare-worker/src/index.ts
const CACHE_TTL = 60 * 60 * 24; // Modify this value
```

## API Endpoints

### Root (`/`)
Returns API information and available endpoints.

### Health Check (`/health`)
Returns server status and environment information.

```json
{
  "status": "ok",
  "environment": "production",
  "timestamp": "2025-12-29T05:41:00.000Z"
}
```

### MCP Endpoint (`/mcp`)
Main endpoint for MCP protocol requests.

**Request:**
```json
{
  "method": "tools/call",
  "params": {
    "name": "get_stops",
    "arguments": {
      "query": "Amsterdam Centraal",
      "limit": 5
    }
  }
}
```

### Admin Endpoint (`/admin/update-gtfs`)
Update GTFS data in KV storage (should be protected in production).

## Security Considerations

1. **Authentication**: Add authentication to admin endpoints
2. **Rate Limiting**: Implement rate limiting for public endpoints
3. **CORS**: Configure CORS appropriately for your use case
4. **Secrets**: Never commit API tokens or account IDs to version control
5. **KV Access**: Restrict KV namespace access to necessary workers only

## Troubleshooting

### Common Issues

**Issue**: `Error: Unknown type "KVNamespace"`
- **Solution**: Ensure `@cloudflare/workers-types` is installed

**Issue**: `Error: KV namespace not found`
- **Solution**: Verify KV namespace IDs in `wrangler.toml`

**Issue**: `Error: 10021: Script not found`
- **Solution**: Ensure you've run `bun run build` before deploying

### Debug Mode

Enable verbose logging:

```bash
wrangler dev --local --log-level debug
```

## Performance Optimization

1. **Edge Caching**: Utilize Cloudflare's edge cache for static responses
2. **KV Caching**: Store frequently accessed GTFS data in KV
3. **Bundling**: Minimize bundle size by tree-shaking unused code
4. **Compression**: Enable compression for large responses

## Cost Estimation

Cloudflare Workers Free Plan includes:
- 100,000 requests per day
- 10ms CPU time per request

For higher usage, consider the [Workers Paid plan](https://workers.cloudflare.com/pricing).

## Next Steps

- [ ] Set up custom domain
- [ ] Configure authentication for admin endpoints
- [ ] Implement rate limiting
- [ ] Set up monitoring and alerts
- [ ] Configure automated GTFS data updates
- [ ] Add more comprehensive error handling
- [ ] Implement request logging and analytics

## Resources

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Wrangler CLI Documentation](https://developers.cloudflare.com/workers/wrangler/)
- [Workers KV Documentation](https://developers.cloudflare.com/kv/)
- [Model Context Protocol](https://modelcontextprotocol.io)

## Support

For issues or questions:
- Open an issue on [GitHub](https://github.com/laulauland/ov-mcp/issues)
- Check [Cloudflare Community](https://community.cloudflare.com/)
