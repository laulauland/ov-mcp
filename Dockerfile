# ============================================================================
# Multi-stage Dockerfile for Bun-based GTFS Parser Container
# Optimized for production deployment with minimal image size
# ============================================================================

# ============================================================================
# Stage 1: Dependencies - Install all dependencies including devDependencies
# ============================================================================
FROM oven/bun:1.1-alpine AS deps

WORKDIR /app

# Copy package manager files
COPY package.json bun.lock ./
COPY packages/gtfs-parser/package.json ./packages/gtfs-parser/

# Install all dependencies (including dev dependencies for build)
RUN bun install --frozen-lockfile

# ============================================================================
# Stage 2: Builder - Build the application
# ============================================================================
FROM oven/bun:1.1-alpine AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/gtfs-parser/node_modules ./packages/gtfs-parser/node_modules

# Copy source code and configuration files
COPY . .

# Build the GTFS parser package
RUN bun run build:gtfs

# Remove development dependencies to reduce size
RUN bun install --production --frozen-lockfile

# ============================================================================
# Stage 3: Production - Minimal runtime image
# ============================================================================
FROM oven/bun:1.1-alpine AS production

# Install runtime dependencies only (curl for health checks, ca-certificates for HTTPS)
RUN apk add --no-cache \
    curl \
    ca-certificates \
    tzdata \
    && rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g 1001 -S bunuser && \
    adduser -S -D -h /app -u 1001 -G bunuser bunuser

WORKDIR /app

# Copy production node_modules from builder
COPY --from=builder --chown=bunuser:bunuser /app/node_modules ./node_modules

# Copy built application
COPY --from=builder --chown=bunuser:bunuser /app/packages/gtfs-parser/dist ./packages/gtfs-parser/dist
COPY --from=builder --chown=bunuser:bunuser /app/packages/gtfs-parser/package.json ./packages/gtfs-parser/
COPY --from=builder --chown=bunuser:bunuser /app/package.json ./

# Create directory for GTFS data with proper permissions
RUN mkdir -p /data && chown -R bunuser:bunuser /data

# Switch to non-root user
USER bunuser

# Set environment variables for production
ENV NODE_ENV=production \
    GTFS_DATA_DIR=/data \
    BUN_INSTALL_CACHE_DIR=/tmp/.bun-cache \
    PORT=3000

# Expose application port
EXPOSE 3000

# Add volume for GTFS data persistence
VOLUME ["/data"]

# Health check with better configuration
HEALTHCHECK --interval=30s \
    --timeout=5s \
    --start-period=10s \
    --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# Labels for better container metadata
LABEL maintainer="Laurynas Keturakis" \
      org.opencontainers.image.title="GTFS Parser Container" \
      org.opencontainers.image.description="Production-ready Bun-based GTFS data parser" \
      org.opencontainers.image.vendor="laulauland" \
      org.opencontainers.image.source="https://github.com/laulauland/ov-mcp"

# Default command to run the application
CMD ["bun", "run", "packages/gtfs-parser/dist/index.js"]
