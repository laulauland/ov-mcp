# ============================================================================
# Multi-stage Dockerfile for Bun-based GTFS Container Server
# Optimized for Cloudflare Containers with complete GTFS processing support
# ============================================================================

# ============================================================================
# Stage 1: Dependencies - Install all workspace dependencies
# ============================================================================
FROM oven/bun:1.1-alpine AS deps

WORKDIR /app

# Copy workspace configuration and all package.json files
COPY package.json bun.lock ./
COPY packages/gtfs-container/package.json ./packages/gtfs-container/
COPY packages/gtfs-parser/package.json ./packages/gtfs-parser/
COPY tsconfig.json ./

# Install all dependencies (including workspace dependencies)
# This ensures gtfs-parser and its dependencies are available
RUN bun install --frozen-lockfile

# ============================================================================
# Stage 2: Builder - Build and prepare the application
# ============================================================================
FROM oven/bun:1.1-alpine AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/gtfs-container/node_modules ./packages/gtfs-container/node_modules
COPY --from=deps /app/packages/gtfs-parser/node_modules ./packages/gtfs-parser/node_modules

# Copy workspace configuration
COPY package.json bun.lock tsconfig.json ./

# Copy all source code for workspace packages
COPY packages/gtfs-parser ./packages/gtfs-parser
COPY packages/gtfs-container ./packages/gtfs-container

# Build gtfs-parser if needed (though Bun runs TypeScript directly)
# This step ensures any build artifacts are created
RUN cd packages/gtfs-parser && bun run build || true

# Clean up dev dependencies for production
WORKDIR /app
RUN bun install --production --frozen-lockfile

# ============================================================================
# Stage 3: Production - Minimal runtime image for Cloudflare Containers
# ============================================================================
FROM oven/bun:1.1-alpine AS production

# Install runtime dependencies
# - curl: for health checks
# - ca-certificates: for HTTPS requests (GTFS downloads)
# - tzdata: for timezone support in GTFS data
RUN apk add --no-cache \
    curl \
    ca-certificates \
    tzdata \
    && rm -rf /var/cache/apk/*

# Create non-root user for security best practices
RUN addgroup -g 1001 -S bunuser && \
    adduser -S -D -h /app -u 1001 -G bunuser bunuser

WORKDIR /app

# Copy workspace configuration
COPY --from=builder --chown=bunuser:bunuser /app/package.json ./
COPY --from=builder --chown=bunuser:bunuser /app/tsconfig.json ./

# Copy production node_modules (root workspace)
COPY --from=builder --chown=bunuser:bunuser /app/node_modules ./node_modules

# Copy gtfs-parser package (required for GTFS processing)
COPY --from=builder --chown=bunuser:bunuser /app/packages/gtfs-parser ./packages/gtfs-parser

# Copy gtfs-container application
COPY --from=builder --chown=bunuser:bunuser /app/packages/gtfs-container ./packages/gtfs-container

# Create directories for GTFS data and cache with proper permissions
RUN mkdir -p /data /tmp/.bun-cache && \
    chown -R bunuser:bunuser /data /tmp/.bun-cache

# Switch to non-root user
USER bunuser

# Set environment variables for production
ENV NODE_ENV=production \
    GTFS_DATA_DIR=/data \
    BUN_INSTALL_CACHE_DIR=/tmp/.bun-cache \
    PORT=3000 \
    HOST=0.0.0.0

# Expose application port
EXPOSE 3000

# Add volume for GTFS data persistence
VOLUME ["/data"]

# Health check configuration optimized for container orchestration
HEALTHCHECK --interval=30s \
    --timeout=10s \
    --start-period=15s \
    --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# Container metadata labels
LABEL maintainer="Laurynas Keturakis" \
      org.opencontainers.image.title="GTFS Container Server" \
      org.opencontainers.image.description="Production-ready Bun-based GTFS container server for Cloudflare Containers" \
      org.opencontainers.image.vendor="laulauland" \
      org.opencontainers.image.source="https://github.com/laulauland/ov-mcp" \
      org.opencontainers.image.version="0.2.0"

# Start the container server
# Using absolute path from workspace root to ensure proper module resolution
CMD ["bun", "run", "packages/gtfs-container/src/container-server.ts"]
