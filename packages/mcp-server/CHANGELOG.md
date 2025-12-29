# Changelog

All notable changes to the OV-MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-12-29

### Added - Complete MCP Server Implementation

#### Core Functionality
- ✨ Complete TypeScript MCP server using `@modelcontextprotocol/sdk`
- ✨ Stdio transport for MCP protocol communication
- ✨ Tool registration and request handling system
- ✨ Three main tools for Dutch public transit:
  - `find_stops` - Search for transit stops by name or location
  - `plan_journey` - Plan routes between stations with timing
  - `get_realtime_info` - Get upcoming departures with platform info

#### GTFS Data Management
- ✨ GTFSLoader class for data management
- ✨ Automatic download from gtfs.ovapi.nl
- ✨ Smart caching system with 24-hour expiry
- ✨ Cache directory: `.cache/gtfs-data.json`
- ✨ Integration with `@ov-mcp/gtfs-parser` workspace package
- ✨ Efficient ZIP file parsing and data extraction
- ✨ Graceful fallback when cache is unavailable

#### Error Handling & Logging
- ✨ Comprehensive error handling for all operations
- ✨ LLM-friendly error messages with actionable suggestions
- ✨ Structured logging to stderr (doesn't interfere with stdio)
- ✨ Logger utility with info, warn, error, debug levels
- ✨ Optional DEBUG mode for detailed logging
- ✨ Graceful handling of network failures
- ✨ Cache corruption recovery

#### Tool Implementations

**find_stops Tool**
- Search stops by name, code, or ID
- Configurable result limit (default: 10, max: 50)
- Returns stop details: ID, name, code, coordinates, platform
- Fuzzy matching with partial name support
- Helpful "not found" messages

**plan_journey Tool**
- Journey planning between any two stops
- Optional date and time parameters
- Direct connection detection
- Route information with departure/arrival times
- Travel duration calculation
- Suggests using find_stops for better results
- Shows top 5 connections

**get_realtime_info Tool**
- Upcoming departures for any stop
- Configurable limit (default: 5, max: 20)
- Platform information display
- Route names and destinations
- Time formatting for readability
- Delay information (when available)

#### Type System
- ✨ Complete TypeScript type definitions
- ✨ GTFS entity types: Stop, Route, Trip, StopTime, Agency
- ✨ GTFSData interface for complete dataset
- ✨ Journey planning types
- ✨ Realtime info types
- ✨ Type-safe data structures throughout

#### Documentation
- 📚 Comprehensive README.md (400+ lines)
  - Installation instructions
  - Configuration guide
  - Tool descriptions
  - Architecture documentation
  - Troubleshooting section
  - Performance metrics
  - Future roadmap
  
- 📚 USAGE.md (350+ lines)
  - Quick start guide
  - Example conversations
  - Natural language query examples
  - Advanced usage patterns
  - Common issues and solutions
  - Tips for best results
  
- 📚 QUICKSTART.md (200+ lines)
  - 5-minute setup guide
  - Step-by-step instructions
  - Common first-time issues
  - Pro tips
  - System requirements
  
- 📚 Example configuration files
  - Claude Desktop config example
  - MCP server configuration
  
- 📚 Updated root README
  - Project overview
  - Features showcase
  - Quick start
  - Complete tool documentation

#### Configuration & Build
- ✨ Updated package.json with proper dependencies
- ✨ Build scripts for Bun and TypeScript
- ✨ Development mode with auto-reload
- ✨ Proper .gitignore for build artifacts
- ✨ Binary entry point configuration
- ✨ ESM module support

### Technical Details

#### Architecture
```
MCP Client (Claude)
    ↓ stdio protocol
MCP Server (index.ts)
    ↓
Tools (tools.ts)
    ├─ find_stops
    ├─ plan_journey
    └─ get_realtime_info
    ↓
GTFS Loader (gtfs-loader.ts)
    ├─ Cache management
    ├─ Data download
    └─ GTFS parsing
```

#### Performance
- Initial load: 5-10 seconds (downloads GTFS data)
- Cached load: <1 second
- Query response: <100ms
- Memory usage: ~200-300 MB
- Cache size: ~100 MB

#### Dependencies
- `@modelcontextprotocol/sdk` ^0.5.0
- `@ov-mcp/gtfs-parser` (workspace)
- `@types/node` ^20.10.0
- Bun runtime

#### Data Coverage
- ✅ NS (Dutch Railways) - All stations
- ✅ Regional trains
- ✅ Major bus operators
- ✅ Trams (Amsterdam, Rotterdam, Den Haag, Utrecht)
- ✅ Metro (Amsterdam, Rotterdam)

### Files Added

**Core Implementation**
- `src/index.ts` - Main MCP server (180 lines)
- `src/gtfs-loader.ts` - GTFS data management (150 lines)
- `src/tools.ts` - Tool implementations (350 lines)
- `src/types.ts` - Type definitions (100 lines)
- `src/logger.ts` - Logging utility (20 lines)

**Documentation**
- `README.md` - Technical documentation (400 lines)
- `USAGE.md` - User guide (350 lines)
- `CHANGELOG.md` - This file (200 lines)

**Configuration**
- `package.json` - Updated dependencies and scripts
- `.gitignore` - Ignore patterns for artifacts
- `example-config.json` - Example MCP configuration

### Known Limitations

- Shows schedule data only (not live GPS tracking)
- Direct routes only (multi-leg journeys not yet supported)
- Netherlands public transport only
- Real-time delays not fully integrated (GTFS limitation)

### Future Plans

- [ ] Multi-leg journey planning with transfers
- [ ] Integration with real-time APIs for actual delays
- [ ] Fare calculation
- [ ] Service alerts and disruptions
- [ ] Accessibility information
- [ ] Geolocation-based nearby stops
- [ ] Historical delay analysis
- [ ] Support for bike-sharing integration

---

## [0.0.1] - Initial Placeholder

### Added
- Basic project structure
- Placeholder MCP server
- Minimal tool implementations
- Basic README

---

**Note**: This is the first complete release of the OV-MCP server. All features are new in version 0.1.0.
