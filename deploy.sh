#!/bin/bash

# Deployment script for OV-MCP (works without Bun)
set -e

echo "🚀 OV-MCP Deployment Script"
echo "============================="
echo ""

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI not found. Installing..."
    npm install -g wrangler
fi

# Check if logged in to Cloudflare
if ! wrangler whoami &> /dev/null; then
    echo "❌ Not logged in to Cloudflare. Please run:"
    echo "   wrangler login"
    exit 1
fi

echo "✓ Wrangler CLI ready"
echo ""

# Determine environment
ENV=${1:-staging}

if [ "$ENV" != "staging" ] && [ "$ENV" != "production" ]; then
    echo "❌ Invalid environment: $ENV"
    echo "   Usage: ./deploy.sh [staging|production]"
    exit 1
fi

echo "📦 Environment: $ENV"
echo ""

# Check for required environment variables
if [ -z "$GTFS_CACHE_KV_ID" ]; then
    echo "⚠️  Warning: GTFS_CACHE_KV_ID not set"
    echo "   You need to create a KV namespace first:"
    echo "   wrangler kv:namespace create GTFS_CACHE"
    echo ""
fi

if [ "$ENV" = "production" ] && [ -z "$GTFS_UPDATE_SECRET" ]; then
    echo "⚠️  Warning: GTFS_UPDATE_SECRET not set for production"
    echo "   Set this secret to protect admin endpoints:"
    echo "   wrangler secret put GTFS_UPDATE_SECRET --env production"
    echo ""
fi

# Install dependencies
echo "📦 Installing dependencies..."
cd packages/cloudflare-worker
npm install
cd ../..
echo "✓ Dependencies installed"
echo ""

# Run type checking
echo "🔍 Running type checks..."
cd packages/cloudflare-worker
npm run typecheck
cd ../..
echo "✓ Type checks passed"
echo ""

# Build the worker
echo "🔨 Building worker..."
cd packages/cloudflare-worker
npm run build
cd ../..
echo "✓ Build complete"
echo ""

# Deploy
echo "🚀 Deploying to $ENV..."
cd packages/cloudflare-worker

if [ "$ENV" = "production" ]; then
    wrangler deploy --env production
else
    wrangler deploy --env staging
fi

cd ../..
echo ""
echo "✅ Deployment complete!"
echo ""

# Show deployment info
echo "📋 Next steps:"
echo ""

if [ "$ENV" = "staging" ]; then
    echo "1. Test your deployment:"
    echo "   curl https://ov-mcp-server-staging.YOUR_SUBDOMAIN.workers.dev/health"
    echo ""
    echo "2. Upload GTFS data:"
    echo "   Use the admin endpoints to populate the cache"
    echo ""
    echo "3. When ready, deploy to production:"
    echo "   ./deploy.sh production"
else
    echo "1. Verify production deployment:"
    echo "   curl https://ov-mcp-server.YOUR_SUBDOMAIN.workers.dev/health"
    echo ""
    echo "2. Monitor logs:"
    echo "   wrangler tail --env production"
    echo ""
    echo "3. Update GTFS data regularly using scheduled workers or cron"
fi

echo ""
echo "📚 Documentation: https://github.com/laulauland/ov-mcp"
echo ""
