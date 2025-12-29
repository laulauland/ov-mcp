# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

#### GTFS Parser Package
- **GTFS Downloader** (`downloader.ts`): Complete implementation for downloading and caching GTFS data
  - Downloads from gtfs.ovapi.nl
  - Automatic ZIP extraction and CSV parsing
  - File system caching with 24-hour TTL
  - Cache validation and automatic refresh
- **Comprehensive Tests**: 
  - `parser.test.ts`: Tests for all GTFS CSV parsing functions
  - `query.test.ts`: Tests for search and geographic query operations
- **Enhanced Exports**: Updated `index.ts` to export downloader functionality

#### MCP Server Package
- **Real GTFS Integration**: Complete replacement of mock data with actual GTFS feeds
  - Automatic data initialization on startup
  - Smart caching with lazy loading
  - Graceful error handling for missing data
- **New MCP Tools**:
  - `get_stops`: Search for stops by name with real data
  - `get_stop_by_id`: Get detailed stop information
  - `find_stops_nearby`: Geographic search using Haversine distance calculation
  - `get_routes`: Search for transit routes by name or number
- **Helper Functions**:
  - `getStopType()`: Human-readable stop type descriptions
  - `getRouteType()`: Transit route type mapping
  - `ensureGTFSData()`: Async data loading with retry logic
- **Integration Tests**: Server startup and basic operation tests

#### Cloudflare Worker Package
- **Full HTTP Transport**: Complete MCP-over-HTTP implementation
- **KV Storage Integration**: Cloudflare KV for globally replicated GTFS data
- **Admin Endpoints**:
  - `POST /admin/update-gtfs`: Upload GTFS data (authenticated)
  - `POST /admin/download-gtfs`: Trigger GTFS download from source
- **Monitoring**:
  - `GET /health`: Health check with GTFS metadata
  - `GET /`: API information and endpoints
- **Security**:
  - Bearer token authentication for admin operations
  - Proper CORS headers
  - Input validation and error handling

#### Scripts
- **GTFS Upload Script** (`scripts/upload-gtfs-to-worker.ts`):
  - Downloads GTFS data from source
  - Parses and validates data structure
  - Uploads to Cloudflare Worker KV
  - Verification of successful upload
- **Script Documentation** (`scripts/README.md`):
  - Usage instructions
  - Environment variable documentation
  - Scheduling options (GitHub Actions, Cron, Cloudflare Cron Triggers)
  - Troubleshooting guide

#### Documentation
- **Complete README Rewrite**:
  - Real implementation details replacing placeholder content
  - GTFS data management section
  - Architecture diagrams with actual data flow
  - Comprehensive troubleshooting guide
  - Testing instructions
  - Usage examples with real data responses
- **Cloudflare Deployment Guide** (`docs/CLOUDFLARE_DEPLOYMENT.md`):
  - Step-by-step deployment instructions
  - KV namespace setup
  - Data upload procedures
  - Monitoring and logging
  - Production best practices
  - Cost optimization tips
  - Security considerations

### Changed

#### MCP Server Package
- **Refactored** `index.ts` to use real GTFS data instead of mock responses
- **Enhanced** error messages with helpful troubleshooting information
- **Improved** tool descriptions for better AI assistant understanding
- **Added** input validation and limit enforcement (max 100 stops, 50 nearby results, etc.)

#### Cloudflare Worker Package
- **Replaced** mock data implementation with real KV storage integration
- **Enhanced** error handling for all endpoints
- **Added** metadata tracking for cached data
- **Improved** health check endpoint with detailed status information

#### Configuration
- **Updated** `.gitignore` to exclude GTFS cache directory and data files
- No changes to `package.json` or dependencies (uses existing packages)

### Fixed
- **MCP Server**: Placeholder implementation now fully functional with real data
- **GTFS Parser**: Complete integration instead of stub exports
- **Cloudflare Worker**: Full implementation replacing skeleton code
- **Documentation**: Accurate information replacing preliminary/placeholder content

## [0.1.0] - 2024-12-29

### Initial Release

- Basic project structure with Bun monorepo
- GTFS parser foundation with type definitions
- MCP server skeleton with stdio transport
- Cloudflare Worker skeleton
- Basic documentation and README
- TypeScript configuration
- Development scripts and workflows

---

## Migration Guide

### From 0.1.0 to Unreleased

#### Breaking Changes
None - all changes are additive.

#### New Features to Adopt

1. **GTFS Data Auto-Download**:
   - No action required - data downloads automatically on first run
   - Cache stored in `./data/gtfs-cache/`
   - Refreshes every 24 hours automatically

2. **New MCP Tools Available**:
   - Start using `get_stop_by_id` for detailed stop information
   - Use `find_stops_nearby` for geographic searches
   - Use `get_routes` to search for transit routes

3. **Cloudflare Workers Deployment**:
   - Follow new deployment guide in `docs/CLOUDFLARE_DEPLOYMENT.md`
   - Use upload script for data management
   - Set up KV namespaces as documented

#### Deprecated Features
None - this release adds functionality without removing anything.

---

## Development

### Testing Changes
```bash
# Run all tests
bun test

# Run specific package tests
cd packages/gtfs-parser && bun test
cd packages/mcp-server && bun test
```

### Building
```bash
# Build all packages
bun run build

# Build specific package
cd packages/mcp-server && bun run build
```

### Type Checking
```bash
# Check all packages
bun run typecheck
```

---

## Contributors

- Laurynas Keturakis - Initial implementation and GTFS integration

---

## Links

- [Repository](https://github.com/laulauland/ov-mcp)
- [Issues](https://github.com/laulauland/ov-mcp/issues)
- [Pull Requests](https://github.com/laulauland/ov-mcp/pulls)
- [Model Context Protocol](https://modelcontextprotocol.io)
