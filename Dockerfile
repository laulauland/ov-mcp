# Use official Bun image as base
FROM oven/bun:1 AS base

# Set working directory
WORKDIR /app

# Install system dependencies for GTFS processing
RUN apt-get update && apt-get install -y \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Copy package files for dependency installation
COPY package.json bun.lock ./
COPY packages/gtfs-parser/package.json ./packages/gtfs-parser/

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build the GTFS parser
RUN bun run build:gtfs

# Production stage
FROM oven/bun:1-slim AS production

WORKDIR /app

# Copy only necessary files from build stage
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages/gtfs-parser/dist ./packages/gtfs-parser/dist
COPY --from=base /app/packages/gtfs-parser/package.json ./packages/gtfs-parser/
COPY --from=base /app/package.json ./

# Create directory for GTFS data
RUN mkdir -p /data

# Set environment variables
ENV NODE_ENV=production
ENV GTFS_DATA_DIR=/data

# Expose port (adjust as needed)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD bun --version || exit 1

# Default command - can be overridden
CMD ["bun", "run", "packages/gtfs-parser/dist/index.js"]
