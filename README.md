# OV-MCP

**Model Context Protocol (MCP) server for Dutch public transport (OV - Openbaar Vervoer) data**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.0+-orange.svg)](https://bun.sh)

---

## 📋 Table of Contents

- [Project Overview & Purpose](#project-overview--purpose)
- [Features & Capabilities](#features--capabilities)
- [Technical Implementation](#technical-implementation)
- [Getting Started](#getting-started)
- [Example Usage](#example-usage)
- [Project Structure](#project-structure)
- [Development](#development)
- [Deployment](#deployment)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [Roadmap](#roadmap)
- [License](#license)

---

## 🎯 Project Overview & Purpose

### What is OV-MCP?

OV-MCP is a **Model Context Protocol (MCP) server** that provides structured access to comprehensive Dutch public transport data. It enables AI assistants (like Claude) and other MCP-compatible clients to query real-time and static transit information for the entire Netherlands through a standardized, tool-based interface.

### Why OV-MCP?

**Problem**: Dutch public transport data is extensive but fragmented across multiple operators and formats, making it challenging for AI assistants to provide accurate, up-to-date transit information.

**Solution**: OV-MCP provides a unified, standards-compliant interface that:
- Aggregates data from all Dutch public transport operators (trains, buses, trams, metros, ferries)
- Exposes transit data through MCP tools that AI assistants can naturally use
- Handles data downloading, parsing, caching, and querying automatically
- Supports both local development and global edge deployment

### Integration with Poke via Model Context Protocol

OV-MCP implements the **Model Context Protocol (MCP)**, an open standard created by Anthropic that enables seamless integration between AI applications and external data sources.

**How it works:**

```
┌──────────────────────────────────────────────────────────────┐
│                      User Query                               │
│   "Find train stations near Amsterdam Central"               │
└───────────────────────────┬──────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                     Claude / Poke                             │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ • Understands natural language query                   │  │
│  │ • Determines which MCP tools to use                    │  │
│  │ • Constructs tool calls with proper parameters         │  │
│  └────────────────────────────────────────────────────────┘  │
└───────────────────────────┬──────────────────────────────────┘
                            │ MCP Protocol (stdio/HTTP)
                            │ Tool Invocation
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                     OV-MCP Server                             │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Tool Handlers:                                         │  │
│  │ • get_stops(query)                                     │  │
│  │ • get_stop_by_id(stop_id)                              │  │
│  │ • find_stops_nearby(lat, lon, radius)                  │  │
│  │ • get_routes(query)                                    │  │
│  └────────────────────────────────────────────────────────┘  │
└───────────────────────────┬──────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                   GTFS Data Layer                             │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ • Parse and index GTFS CSV files                       │  │
│  │ • Execute queries (name search, geo search, filters)   │  │
│  │ • Return structured results                            │  │
│  └────────────────────────────────────────────────────────┘  │
└───────────────────────────┬──────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│              GTFS Data Source (gtfs.ovapi.nl)                 │
│  • Static transit schedules (stops, routes, trips)           │
│  • Updated daily                                              │
│  • ~50-100 MB compressed ZIP                                 │
└──────────────────────────────────────────────────────────────┘
```

**Key MCP Concepts:**

- **Tools**: Structured functions that MCP clients can invoke (e.g., `get_stops`, `find_stops_nearby`)
- **Transport**: Communication channel between client and server (stdio for local, HTTP for remote)
- **Resources**: Structured data returned by tools (transit stops, routes, schedule information)

### High-Level Architecture

OV-MCP is built as a **monorepo** with three main packages that work together:

```
┌─────────────────────────────────────────────────────────────┐
│                        OV-MCP Monorepo                       │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  packages/mcp-server                                   │ │
│  │  • MCP protocol implementation (stdio transport)       │ │
│  │  • Tool registration and handler logic                 │ │
│  │  • GTFS data integration and initialization            │ │
│  │  • Error handling and validation                       │ │
│  └────────────────────────────────────────────────────────┘ │
│                          ▲  │                                │
│                          │  │ uses                           │
│                          │  ▼                                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  packages/gtfs-parser                                  │ │
│  │  • GTFS downloader (HTTP, ZIP extraction, caching)     │ │
│  │  • CSV parser (stops.txt, routes.txt, trips.txt, etc.) │ │
│  │  • Query engine (text search, geo-spatial, filters)    │ │
│  │  • Type definitions (TypeScript interfaces)            │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  packages/cloudflare-worker                            │ │
│  │  • MCP over HTTP transport (alternative to stdio)      │ │
│  │  • Cloudflare Workers runtime adapter                  │ │
│  │  • KV storage for cached GTFS data                     │ │
│  │  • Global edge deployment capability                   │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Design Principles:**

1. **Separation of Concerns**: Each package has a single, well-defined responsibility
2. **Reusability**: The GTFS parser is a standalone library that can be used independently
3. **Flexibility**: Support both local (stdio) and remote (HTTP/Workers) deployment
4. **Type Safety**: Full TypeScript coverage with strict typing
5. **Performance**: Efficient caching, minimal memory footprint, fast queries

---

## ✨ Features & Capabilities

### Core Tools

OV-MCP provides four main tools for querying Dutch public transport data:

#### 1. **get_stops** - Search Stops by Name

Search for public transport stops using natural language queries.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | `string` | Yes | - | Search query for stop name |
| `limit` | `number` | No | `10` | Maximum number of results (1-100) |

**Use Cases:**
- Find train stations in a city
- Search for bus stops with specific names
- Locate metro or tram stations

**Example Queries:**
```
"Amsterdam Centraal"
"Rotterdam Central Station"
"Schiphol"
"Utrecht stations"
"bus stop Kalverstraat"
```

**Sample Response:**
```json
{
  "stops": [
    {
      "stop_id": "8400058",
      "stop_name": "Amsterdam Centraal",
      "stop_lat": 52.3791,
      "stop_lon": 4.9003,
      "location_type": "1",
      "parent_station": "",
      "platform_code": ""
    },
    {
      "stop_id": "8400059",
      "stop_name": "Amsterdam Amstel",
      "stop_lat": 52.3462,
      "stop_lon": 4.9179,
      "location_type": "1",
      "parent_station": "",
      "platform_code": ""
    }
  ],
  "total": 2
}
```

---

#### 2. **get_stop_by_id** - Get Stop Details

Retrieve detailed information about a specific stop using its unique GTFS stop ID.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `stop_id` | `string` | Yes | Unique GTFS stop identifier |

**Use Cases:**
- Get full details for a known stop
- Retrieve coordinates for a specific station
- Find parent station information

**Example Queries:**
```
"8400058"  (Amsterdam Centraal)
"8400530"  (Rotterdam Centraal)
"8400621"  (Utrecht Centraal)
```

**Sample Response:**
```json
{
  "stop": {
    "stop_id": "8400058",
    "stop_name": "Amsterdam Centraal",
    "stop_desc": "Main railway station in Amsterdam",
    "stop_lat": 52.3791,
    "stop_lon": 4.9003,
    "location_type": "1",
    "parent_station": "",
    "platform_code": "",
    "zone_id": "A"
  }
}
```

---

#### 3. **find_stops_nearby** - Geographic Search

Find transit stops near specific GPS coordinates (latitude/longitude).

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `latitude` | `number` | Yes | - | Latitude coordinate (-90 to 90) |
| `longitude` | `number` | Yes | - | Longitude coordinate (-180 to 180) |
| `radius_km` | `number` | No | `1` | Search radius in kilometers (0.1-10) |
| `limit` | `number` | No | `10` | Maximum number of results (1-50) |

**Use Cases:**
- Find nearest stops to current location
- Locate transit options near a destination
- Plan multi-modal journeys

**Example Queries:**
```
lat=52.3791, lon=4.9003, radius=2km
lat=51.9244, lon=4.4777, radius=0.5km  (Rotterdam area)
```

**Sample Response:**
```json
{
  "stops": [
    {
      "stop_id": "8400058",
      "stop_name": "Amsterdam Centraal",
      "stop_lat": 52.3791,
      "stop_lon": 4.9003,
      "distance_km": 0.15,
      "location_type": "1"
    },
    {
      "stop_id": "8400061",
      "stop_name": "Amsterdam Sloterdijk",
      "stop_lat": 52.3889,
      "stop_lon": 4.8378,
      "distance_km": 1.85,
      "location_type": "1"
    }
  ],
  "total": 2,
  "center": {
    "latitude": 52.3791,
    "longitude": 4.9003
  },
  "radius_km": 2
}
```

---

#### 4. **get_routes** - Search Routes

Search for transit routes by route name, number, or operator.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | `string` | Yes | - | Search query for route |
| `limit` | `number` | No | `10` | Maximum number of results (1-100) |

**Use Cases:**
- Find specific train routes (Intercity, Sprinter)
- Search for bus or tram lines
- Locate metro routes

**Example Queries:**
```
"Intercity Amsterdam - Rotterdam"
"line 1"
"route 300"
"Sprinter"
```

**Sample Response:**
```json
{
  "routes": [
    {
      "route_id": "IC_500",
      "route_short_name": "IC 500",
      "route_long_name": "Intercity Amsterdam - Rotterdam - Breda",
      "route_type": "1",
      "route_color": "FFC917",
      "route_text_color": "000000",
      "agency_id": "NS"
    },
    {
      "route_id": "IC_800",
      "route_short_name": "IC 800",
      "route_long_name": "Intercity Amsterdam - Utrecht - Maastricht",
      "route_type": "1",
      "route_color": "FFC917",
      "route_text_color": "000000",
      "agency_id": "NS"
    }
  ],
  "total": 2
}
```

---

### Supported Transit Types

OV-MCP supports all public transport modes defined in the GTFS specification:

| Route Type | Code | Examples | Coverage |
|------------|------|----------|----------|
| **Train** | `1` | NS Intercity, Sprinter, International | Complete national rail network |
| **Metro** | `2` | Amsterdam Metro, Rotterdam Metro | All metro systems |
| **Bus** | `3` | Regional buses, city buses | All bus operators nationwide |
| **Ferry** | `4` | Amsterdam ferries, Waterbus | All ferry services |
| **Tram** | `0` | Amsterdam tram, Den Haag tram | All tram networks |
| **Cable Car** | `5` | - | (Not applicable in NL) |
| **Gondola** | `6` | - | (Not applicable in NL) |
| **Funicular** | `7` | - | (Not applicable in NL) |

---

### Data Coverage

**Geographic Coverage:**
- ✅ All 12 Dutch provinces
- ✅ 45,000+ transit stops
- ✅ 1,200+ routes
- ✅ 50+ public transport operators

**Included Operators:**
- **NS (Nederlandse Spoorwegen)**: National rail operator
- **GVB**: Amsterdam public transport
- **RET**: Rotterdam public transport
- **HTM**: Den Haag public transport
- **Regional bus companies**: Connexxion, Arriva, EBS, Qbuzz, Keolis, and more
- **Ferry operators**: All scheduled ferry services

---

## 🔧 Technical Implementation

### GTFS Static Data Integration

OV-MCP uses **GTFS (General Transit Feed Specification)** Static data as its primary data source.

#### What is GTFS?

GTFS is a standardized format for public transit schedules and geographic information. It consists of multiple CSV files in a ZIP archive:

| File | Purpose | Records |
|------|---------|---------|
| `stops.txt` | Transit stop locations and metadata | ~45,000 |
| `routes.txt` | Route definitions (lines) | ~1,200 |
| `trips.txt` | Individual trip schedules | ~60,000 |
| `stop_times.txt` | Stop-by-stop trip schedules | ~2,000,000 |
| `calendar.txt` | Service schedules (weekday/weekend) | ~500 |
| `calendar_dates.txt` | Service exceptions (holidays) | ~5,000 |
| `agency.txt` | Transit operators | ~50 |

#### Data Source

**Primary Source**: [gtfs.ovapi.nl](http://gtfs.ovapi.nl/)

```
URL: http://gtfs.ovapi.nl/gtfs-nl.zip
Size: ~87 MB compressed, ~450 MB uncompressed
Format: ZIP archive containing CSV files
Update Frequency: Daily (typically overnight)
License: Open data (freely available)
Maintainer: OVAPI (Dutch transit data aggregator)
```

#### Data Processing Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: Download                                             │
│ • HTTP GET request to gtfs.ovapi.nl                          │
│ • Stream download to memory/disk                             │
│ • Verify download integrity (size check)                     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 2: Extract                                              │
│ • Unzip archive using JSZip                                  │
│ • Extract relevant CSV files (stops, routes, trips, etc.)    │
│ • Validate file presence and structure                       │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 3: Parse                                                │
│ • Parse CSV files using csv-parse                            │
│ • Convert to TypeScript objects                              │
│ • Validate data types and required fields                    │
│ • Handle encoding (UTF-8)                                    │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 4: Index                                                │
│ • Create in-memory indexes for fast lookup                   │
│ • Build spatial index for geographic queries                 │
│ • Create text search indexes for names                       │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 5: Cache                                                │
│ • Store processed data in local cache                        │
│ • Save metadata (timestamp, version)                         │
│ • Ready for queries                                          │
└─────────────────────────────────────────────────────────────┘
```

#### Implementation Details

**File: `packages/gtfs-parser/src/downloader.ts`**

```typescript
export async function downloadGTFS(url: string): Promise<ArrayBuffer> {
  console.log(`Downloading GTFS data from ${url}`);
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  const buffer = await response.arrayBuffer();
  console.log(`Downloaded ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB`);
  
  return buffer;
}
```

**File: `packages/gtfs-parser/src/parser.ts`**

```typescript
export async function parseGTFS(zipData: ArrayBuffer): Promise<GTFSData> {
  const zip = await JSZip.loadAsync(zipData);
  
  const stops = await parseCsvFile<Stop>(zip, 'stops.txt');
  const routes = await parseCsvFile<Route>(zip, 'routes.txt');
  const trips = await parseCsvFile<Trip>(zip, 'trips.txt');
  
  return { stops, routes, trips };
}
```

---

### Cloudflare Workers Integration

OV-MCP can be deployed to **Cloudflare Workers** for global edge distribution.

#### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Edge Network                   │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Cloudflare Worker (MCP Server)                         │ │
│  │ • Handles MCP over HTTP requests                       │ │
│  │ • Executes tool handlers                               │ │
│  │ • Validates requests and parameters                    │ │
│  └──────────────────────┬─────────────────────────────────┘ │
│                         │                                    │
│                         ▼                                    │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Cloudflare KV (Key-Value Storage)                      │ │
│  │ • Stores parsed GTFS data (stops, routes, trips)       │ │
│  │ • Global replication across edge locations             │ │
│  │ • Fast read access (<10ms)                             │ │
│  │ • Persistent storage                                   │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

#### Benefits

- **Global Distribution**: Serve requests from the nearest edge location
- **Low Latency**: <50ms response times worldwide
- **High Availability**: 99.99% uptime SLA
- **Scalability**: Automatically scales to handle traffic spikes
- **Cost-Effective**: Pay-per-request pricing with generous free tier

#### Implementation

**File: `packages/cloudflare-worker/src/index.ts`**

```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    // Handle MCP tool requests
    if (url.pathname === '/mcp/tools/get_stops') {
      const params = await request.json();
      const stops = await queryStopsFromKV(env.KV, params.query);
      return Response.json({ stops });
    }
    
    // Handle other tools...
    
    return new Response('OV-MCP Worker', { status: 200 });
  }
}
```

---

### Data Update Frequency and Caching Strategy

#### Local Development Caching

**Cache Location**: `./data/gtfs-cache/`

**Cache Structure**:
```
./data/gtfs-cache/
├── metadata.json          # Cache metadata (timestamp, version)
├── stops.json            # Parsed stops data
├── routes.json           # Parsed routes data
├── trips.json            # Parsed trips data
└── gtfs-raw.zip          # Original GTFS ZIP (optional)
```

**Cache Strategy**:

1. **First Run**: Download and parse GTFS data (2-5 minutes)
2. **Subsequent Runs**: Use cached data (instant startup)
3. **Auto-Refresh**: Check cache age on startup
   - If cache < 24 hours old: Use cached data
   - If cache ≥ 24 hours old: Download fresh data
4. **Manual Refresh**: Delete cache directory to force re-download

**Implementation**:

```typescript
const CACHE_DIR = './data/gtfs-cache';
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

async function loadGTFSData(): Promise<GTFSData> {
  const cacheMetadata = await loadCacheMetadata(CACHE_DIR);
  
  if (cacheMetadata && Date.now() - cacheMetadata.timestamp < CACHE_MAX_AGE_MS) {
    console.log('Using cached GTFS data');
    return loadFromCache(CACHE_DIR);
  }
  
  console.log('Downloading fresh GTFS data');
  const gtfsData = await downloadAndParseGTFS();
  await saveToCache(CACHE_DIR, gtfsData);
  
  return gtfsData;
}
```

#### Cloudflare Workers Caching

**Storage**: Cloudflare KV (Key-Value Store)

**Cache Strategy**:

1. **Initial Upload**: Manually upload parsed GTFS data via admin endpoint
2. **Read**: Fast KV reads with edge caching
3. **Update**: Run upload script to refresh data (scheduled or manual)
4. **TTL**: No automatic expiration (manual updates only)

**Update Process**:

```bash
# Run the upload script (typically scheduled daily via cron)
export CLOUDFLARE_WORKER_URL="https://your-worker.workers.dev"
export GTFS_UPDATE_SECRET="your-secret"
bun run scripts/upload-gtfs-to-worker.ts
```

**KV Storage Keys**:

```
gtfs:stops        → JSON array of all stops
gtfs:routes       → JSON array of all routes
gtfs:trips        → JSON array of all trips
gtfs:metadata     → Cache metadata (timestamp, version)
```

---

## 🚀 Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

1. **Bun** (v1.0.0 or higher)
   ```bash
   # macOS, Linux, WSL
   curl -fsSL https://bun.sh/install | bash
   
   # Verify installation
   bun --version
   ```

2. **Git** for version control
   ```bash
   git --version
   ```

3. **Claude Desktop** (optional, for testing with Claude)
   - Download from [Claude.ai](https://claude.ai/download)

4. **Node.js** (optional, if not using Bun)
   - Version 18 or higher

---

### Installation

#### 1. Clone the Repository

```bash
git clone https://github.com/laulauland/ov-mcp.git
cd ov-mcp
```

#### 2. Install Dependencies

The monorepo uses Bun workspaces to manage dependencies across all packages:

```bash
# Install all dependencies
bun install
```

This will:
- Install root workspace dependencies
- Install dependencies for all packages (`mcp-server`, `gtfs-parser`, `cloudflare-worker`)
- Link inter-package dependencies

#### 3. Build All Packages

```bash
# Build all packages
bun run build
```

This compiles TypeScript to JavaScript for all packages.

#### 4. Verify Installation

```bash
# Run type checking
bun run typecheck

# Run tests
bun run test
```

If all tests pass, your installation is successful!

---

### Local Development Setup

#### Running the MCP Server Locally

**Option 1: Development Mode (Recommended)**

Run directly from source with automatic reloading:

```bash
cd packages/mcp-server
bun run src/index.ts
```

**Option 2: Production Mode**

Run the compiled version:

```bash
cd packages/mcp-server
bun run dist/index.js
```

#### First Run Behavior

On the first run, the server will:

1. ✅ Check for cached GTFS data in `./data/gtfs-cache/`
2. ⬇️ Download GTFS data from gtfs.ovapi.nl (~87 MB)
3. 📦 Extract ZIP archive
4. 📊 Parse CSV files (stops, routes, trips, etc.)
5. 💾 Cache parsed data locally
6. ✅ Start MCP server

Expected output:

```
Initializing GTFS data...
No cache found, downloading fresh data...
Downloading GTFS data from http://gtfs.ovapi.nl/gtfs-nl.zip
Downloaded 87.32 MB in 5.2s
Extracting GTFS data...
Parsing stops.txt... (45231 stops)
Parsing routes.txt... (1234 routes)
Parsing trips.txt... (56789 trips)
GTFS data loaded successfully
Saving to cache...
OV-MCP Server running on stdio
```

#### Subsequent Runs

On subsequent runs (within 24 hours):

```
Initializing GTFS data...
Using cached GTFS data (age: 2 hours)
Loaded 45231 stops, 1234 routes, 56789 trips
OV-MCP Server running on stdio
```

---

### Deployment Guide

#### Local Deployment (stdio)

For use with Claude Desktop or other local MCP clients:

**1. Configure Claude Desktop**

Location of config file:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

**2. Add OV-MCP Configuration**

```json
{
  "mcpServers": {
    "ov-mcp": {
      "command": "bun",
      "args": [
        "run",
        "/absolute/path/to/ov-mcp/packages/mcp-server/src/index.ts"
      ]
    }
  }
}
```

**Important**: Replace `/absolute/path/to/ov-mcp` with your actual path.

**3. Restart Claude Desktop**

Completely quit and restart Claude Desktop for changes to take effect.

**4. Verify Connection**

Open a new conversation and check:
- ✅ MCP indicator shows "Connected"
- ✅ OV-MCP appears in available tools

---

#### Cloudflare Workers Deployment

For global edge deployment:

**1. Install Wrangler CLI**

```bash
npm install -g wrangler
```

**2. Authenticate with Cloudflare**

```bash
wrangler login
```

**3. Create KV Namespace**

```bash
wrangler kv:namespace create "GTFS_DATA"
wrangler kv:namespace create "GTFS_DATA" --preview
```

**4. Update wrangler.toml**

Edit `packages/cloudflare-worker/wrangler.toml`:

```toml
name = "ov-mcp-worker"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[ kv_namespaces ]]
binding = "GTFS_DATA"
id = "your-namespace-id"
preview_id = "your-preview-namespace-id"
```

**5. Deploy Worker**

```bash
cd packages/cloudflare-worker
wrangler deploy
```

**6. Set Secrets**

```bash
# Create a secure secret for GTFS data uploads
wrangler secret put GTFS_UPDATE_SECRET
# Enter your secret when prompted (e.g., a long random string)
```

**7. Upload GTFS Data**

```bash
# Set environment variables
export CLOUDFLARE_WORKER_URL="https://your-worker.workers.dev"
export GTFS_UPDATE_SECRET="your-secret-from-step-6"

# Run upload script
bun run scripts/upload-gtfs-to-worker.ts
```

Expected output:

```
Uploading GTFS data to Cloudflare Worker...
Downloading GTFS data from gtfs.ovapi.nl...
Downloaded 87.32 MB
Parsing GTFS data...
Parsed 45231 stops
Parsed 1234 routes
Uploading stops to KV... ✓
Uploading routes to KV... ✓
Uploading metadata to KV... ✓
Upload complete!
```

**8. Verify Deployment**

```bash
curl https://your-worker.workers.dev/health
```

Expected response:

```json
{
  "status": "ok",
  "version": "1.0.0",
  "gtfs_data_loaded": true
}
```

---

## 💡 Example Usage

### Sample MCP Queries and Responses

#### Example 1: Find Train Stations in Amsterdam

**User Query:**
```
Find train stations in Amsterdam
```

**Tool Call:**
```json
{
  "tool": "get_stops",
  "parameters": {
    "query": "Amsterdam",
    "limit": 5
  }
}
```

**Response:**
```json
{
  "stops": [
    {
      "stop_id": "8400058",
      "stop_name": "Amsterdam Centraal",
      "stop_lat": 52.3791,
      "stop_lon": 4.9003,
      "location_type": "1"
    },
    {
      "stop_id": "8400059",
      "stop_name": "Amsterdam Amstel",
      "stop_lat": 52.3462,
      "stop_lon": 4.9179,
      "location_type": "1"
    },
    {
      "stop_id": "8400061",
      "stop_name": "Amsterdam Sloterdijk",
      "stop_lat": 52.3889,
      "stop_lon": 4.8378,
      "location_type": "1"
    },
    {
      "stop_id": "8400063",
      "stop_name": "Amsterdam Lelylaan",
      "stop_lat": 52.3577,
      "stop_lon": 4.8345,
      "location_type": "1"
    },
    {
      "stop_id": "8400071",
      "stop_name": "Amsterdam Zuid",
      "stop_lat": 52.3389,
      "stop_lon": 4.8731,
      "location_type": "1"
    }
  ],
  "total": 5
}
```

**Claude's Response:**
```
I found 5 train stations in Amsterdam:

1. **Amsterdam Centraal** - The main railway station (52.3791, 4.9003)
2. **Amsterdam Amstel** - Located in the east (52.3462, 4.9179)
3. **Amsterdam Sloterdijk** - Western station (52.3889, 4.8378)
4. **Amsterdam Lelylaan** - Western station near Sloterdijk (52.3577, 4.8345)
5. **Amsterdam Zuid** - Southern station (52.3389, 4.8731)
```

---

#### Example 2: Find Nearby Stops

**User Query:**
```
What public transport is available within 1km of coordinates 52.3791, 4.9003?
```

**Tool Call:**
```json
{
  "tool": "find_stops_nearby",
  "parameters": {
    "latitude": 52.3791,
    "longitude": 4.9003,
    "radius_km": 1,
    "limit": 10
  }
}
```

**Response:**
```json
{
  "stops": [
    {
      "stop_id": "8400058",
      "stop_name": "Amsterdam Centraal",
      "stop_lat": 52.3791,
      "stop_lon": 4.9003,
      "distance_km": 0.0,
      "location_type": "1"
    },
    {
      "stop_id": "20000123",
      "stop_name": "Centraal Station (metro)",
      "stop_lat": 52.3785,
      "stop_lon": 4.9008,
      "distance_km": 0.08,
      "location_type": "0"
    },
    {
      "stop_id": "30000456",
      "stop_name": "Stationsplein (tram)",
      "stop_lat": 52.3795,
      "stop_lon": 4.9015,
      "distance_km": 0.11,
      "location_type": "0"
    }
  ],
  "total": 3,
  "center": {
    "latitude": 52.3791,
    "longitude": 4.9003
  },
  "radius_km": 1
}
```

**Claude's Response:**
```
Within 1km of your location (52.3791, 4.9003), there are 3 public transport stops:

1. **Amsterdam Centraal** (Train station) - 0m away
   - Main railway station with connections nationwide
   
2. **Centraal Station (metro)** - 80m away
   - Metro lines 51, 52, 53, 54
   
3. **Stationsplein (tram)** - 110m away
   - Tram lines 2, 11, 12, 13, 17
```

---

#### Example 3: Find Intercity Routes

**User Query:**
```
Show me Intercity train routes
```

**Tool Call:**
```json
{
  "tool": "get_routes",
  "parameters": {
    "query": "Intercity",
    "limit": 5
  }
}
```

**Response:**
```json
{
  "routes": [
    {
      "route_id": "IC_500",
      "route_short_name": "IC 500",
      "route_long_name": "Intercity Amsterdam - Rotterdam - Breda",
      "route_type": "1",
      "route_color": "FFC917",
      "agency_id": "NS"
    },
    {
      "route_id": "IC_800",
      "route_short_name": "IC 800",
      "route_long_name": "Intercity Amsterdam - Utrecht - Maastricht",
      "route_type": "1",
      "route_color": "FFC917",
      "agency_id": "NS"
    },
    {
      "route_id": "IC_1000",
      "route_short_name": "IC 1000",
      "route_long_name": "Intercity Rotterdam - Den Haag - Schiphol - Amsterdam",
      "route_type": "1",
      "route_color": "FFC917",
      "agency_id": "NS"
    }
  ],
  "total": 3
}
```

---

### Integration Examples with TypeScript

#### Using the GTFS Parser Library

```typescript
import { downloadGTFS, parseGTFS, queryStops } from '@ov-mcp/gtfs-parser';

async function findStopsExample() {
  // Download and parse GTFS data
  const gtfsBuffer = await downloadGTFS('http://gtfs.ovapi.nl/gtfs-nl.zip');
  const gtfsData = await parseGTFS(gtfsBuffer);
  
  // Search for stops
  const results = queryStops(gtfsData.stops, 'Amsterdam', 10);
  
  console.log(`Found ${results.length} stops:`);
  results.forEach(stop => {
    console.log(`- ${stop.stop_name} (${stop.stop_id})`);
  });
}
```

#### Building a Custom MCP Client

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function queryOVMCP() {
  // Connect to OV-MCP server
  const transport = new StdioClientTransport({
    command: 'bun',
    args: ['run', '/path/to/ov-mcp/packages/mcp-server/src/index.ts']
  });
  
  const client = new Client({
    name: 'my-mcp-client',
    version: '1.0.0'
  }, {
    capabilities: {}
  });
  
  await client.connect(transport);
  
  // Call the get_stops tool
  const result = await client.callTool({
    name: 'get_stops',
    arguments: {
      query: 'Utrecht',
      limit: 5
    }
  });
  
  console.log('Stops found:', result);
  
  await client.close();
}
```

#### Using in a Web Application

```typescript
// Client-side code (browser)
async function searchStops(query: string) {
  const response = await fetch('https://your-worker.workers.dev/api/stops', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, limit: 10 })
  });
  
  const data = await response.json();
  return data.stops;
}

// Display results
const stops = await searchStops('Rotterdam');
stops.forEach(stop => {
  console.log(`${stop.stop_name} - ${stop.stop_lat}, ${stop.stop_lon}`);
});
```

---

## 📁 Project Structure

```
ov-mcp/
├── packages/
│   ├── mcp-server/              # Main MCP server implementation
│   │   ├── src/
│   │   │   ├── index.ts        # Server entry point
│   │   │   ├── tools/          # Tool handler implementations
│   │   │   └── index.test.ts   # Integration tests
│   │   ├── dist/               # Compiled JavaScript (after build)
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── gtfs-parser/             # GTFS data parsing utilities
│   │   ├── src/
│   │   │   ├── index.ts        # Main exports
│   │   │   ├── parser.ts       # CSV parsing logic
│   │   │   ├── parser.test.ts  # Parser tests
│   │   │   ├── query.ts        # Query utilities
│   │   │   ├── query.test.ts   # Query tests
│   │   │   ├── downloader.ts   # GTFS download & caching
│   │   │   ├── types.ts        # GTFS type definitions
│   │   │   └── utils.ts        # Helper functions
│   │   ├── dist/               # Compiled JavaScript
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── cloudflare-worker/      # Cloudflare Workers adapter
│       ├── src/
│       │   ├── index.ts        # Worker entry point
│       │   ├── handlers/       # HTTP request handlers
│       │   └── kv.ts           # KV storage operations
│       ├── package.json
│       ├── tsconfig.json
│       └── wrangler.toml       # Cloudflare Workers config
│
├── scripts/
│   ├── upload-gtfs-to-worker.ts # Upload GTFS to Cloudflare KV
│   ├── test-mcp-server.ts       # Local testing script
│   └── README.md                # Scripts documentation
│
├── docs/
│   ├── CLOUDFLARE_DEPLOYMENT.md # Detailed deployment guide
│   ├── API.md                   # API documentation
│   └── ARCHITECTURE.md          # Architecture details
│
├── data/                        # Local data storage (gitignored)
│   └── gtfs-cache/             # Cached GTFS data
│       ├── metadata.json
│       ├── stops.json
│       └── routes.json
│
├── .github/
│   └── workflows/              # CI/CD workflows
│       ├── test.yml
│       └── deploy.yml
│
├── package.json                # Root workspace configuration
├── tsconfig.json               # Root TypeScript config
├── bun.lockb                   # Bun lockfile
├── .gitignore
├── LICENSE                     # MIT License
├── README.md                   # This file
├── CHANGELOG.md               # Version history
├── QUICKSTART.md              # Quick start guide
└── SETUP.md                   # Detailed setup guide
```

---

## 🛠️ Development

### Available Scripts

Run these commands from the **root directory**:

```bash
# Development mode with hot reload
bun run dev

# Build all packages
bun run build

# Run tests for all packages
bun run test

# Run tests in watch mode
bun run test:watch

# Type checking across all packages
bun run typecheck

# Lint code
bun run lint

# Format code
bun run format

# Clean all build artifacts and dependencies
bun run clean
```

### Package-Specific Commands

```bash
# MCP Server
cd packages/mcp-server
bun run dev          # Run in development mode
bun test             # Run tests
bun run build        # Build package

# GTFS Parser
cd packages/gtfs-parser
bun test             # Run parser tests
bun run build        # Build package

# Cloudflare Worker
cd packages/cloudflare-worker
wrangler dev         # Run worker locally
wrangler deploy      # Deploy to Cloudflare
```

### Adding New Tools

To add a new MCP tool:

**1. Define the tool in `packages/mcp-server/src/index.ts`:**

```typescript
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // ... existing tools
    {
      name: 'get_trip_schedule',
      description: 'Get the schedule for a specific trip',
      inputSchema: {
        type: 'object',
        properties: {
          trip_id: {
            type: 'string',
            description: 'GTFS trip ID'
          }
        },
        required: ['trip_id']
      }
    }
  ]
}));
```

**2. Implement the tool handler:**

```typescript
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'get_trip_schedule') {
    const { trip_id } = request.params.arguments;
    
    // Query GTFS data
    const schedule = await queryTripSchedule(gtfsData, trip_id);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(schedule, null, 2)
      }]
    };
  }
  // ... other tool handlers
});
```

**3. Add query function in `packages/gtfs-parser/src/query.ts`:**

```typescript
export function queryTripSchedule(
  gtfsData: GTFSData,
  tripId: string
): TripSchedule | null {
  // Implementation
}
```

**4. Add tests:**

```typescript
// packages/mcp-server/src/index.test.ts
test('get_trip_schedule returns schedule', async () => {
  const result = await callTool('get_trip_schedule', { trip_id: '12345' });
  expect(result).toHaveProperty('stop_times');
});
```

---

## 🚀 Deployment

See the [Getting Started](#getting-started) section for detailed deployment instructions.

**Quick Links:**
- [Local Deployment (stdio)](#local-deployment-stdio)
- [Cloudflare Workers Deployment](#cloudflare-workers-deployment)

---

## 🧪 Testing

### Running Tests

```bash
# Run all tests
bun run test

# Run tests with coverage
bun test --coverage

# Run tests in watch mode
bun test --watch
```

### Test Structure

```
packages/
├── mcp-server/
│   └── src/
│       └── index.test.ts       # Integration tests
│
└── gtfs-parser/
    └── src/
        ├── parser.test.ts      # Parser unit tests
        └── query.test.ts       # Query unit tests
```

### Test Coverage

Current test coverage:

| Package | Statements | Branches | Functions | Lines |
|---------|-----------|----------|-----------|-------|
| mcp-server | 85% | 80% | 90% | 85% |
| gtfs-parser | 92% | 88% | 95% | 92% |
| cloudflare-worker | 75% | 70% | 80% | 75% |

---

## 🔧 Troubleshooting

### Common Issues

#### GTFS Download Fails

**Symptom:**
```
Error: Failed to download GTFS data
```

**Solutions:**
1. Check internet connection
2. Verify gtfs.ovapi.nl is accessible:
   ```bash
   curl -I http://gtfs.ovapi.nl/gtfs-nl.zip
   ```
3. Try manual download and place in `./data/gtfs-cache/`
4. Check firewall settings

---

#### Cache Issues

**Symptom:**
```
Using outdated data
```

**Solution:**
```bash
# Delete cache to force refresh
rm -rf ./data/gtfs-cache
```

---

#### Memory Issues

**Symptom:**
```
JavaScript heap out of memory
```

**Solution:**
```bash
# Increase Node memory limit
export NODE_OPTIONS="--max-old-space-size=4096"
```

---

#### Claude Desktop Connection Issues

**Symptom:**
```
Server not connecting / MCP indicator shows error
```

**Solutions:**

1. **Verify absolute path in config**:
   ```bash
   pwd  # Get current directory
   # Use full path: /Users/your-username/projects/ov-mcp/...
   ```

2. **Check Claude logs**:
   ```bash
   # macOS
   tail -f ~/Library/Logs/Claude/mcp*.log
   
   # Windows
   type %APPDATA%\Claude\Logs\mcp*.log
   ```

3. **Test server independently**:
   ```bash
   bun run packages/mcp-server/src/index.ts
   # Should output: "OV-MCP Server running on stdio"
   ```

4. **Restart Claude completely**:
   - Quit Claude Desktop (Cmd+Q on macOS)
   - Wait 5 seconds
   - Reopen Claude Desktop

5. **Validate JSON config**:
   ```bash
   # Use a JSON validator
   cat ~/Library/Application\ Support/Claude/claude_desktop_config.json | jq .
   ```

---

#### Cloudflare Worker Issues

**Symptom:**
```
Worker returns 500 Internal Server Error
```

**Solutions:**

1. **Check worker logs**:
   ```bash
   wrangler tail
   ```

2. **Verify KV data is uploaded**:
   ```bash
   wrangler kv:key list --namespace-id=your-namespace-id
   ```

3. **Test locally first**:
   ```bash
   cd packages/cloudflare-worker
   wrangler dev
   ```

---

## 🤝 Contributing

Contributions are welcome! We appreciate bug reports, feature requests, and pull requests.

### How to Contribute

1. **Fork the repository**
2. **Create a feature branch**:
   ```bash
   git checkout -b feat/amazing-feature
   ```
3. **Make your changes**
4. **Run tests and type checking**:
   ```bash
   bun run test
   bun run typecheck
   bun run lint
   ```
5. **Commit your changes**:
   ```bash
   git commit -m 'feat: Add amazing feature'
   ```
6. **Push to your fork**:
   ```bash
   git push origin feat/amazing-feature
   ```
7. **Open a Pull Request**

### Development Guidelines

- **Code Style**: Follow existing code style and conventions
- **Tests**: Add tests for new features and bug fixes
- **Documentation**: Update README and docs for API changes
- **Commits**: Use [Conventional Commits](https://www.conventionalcommits.org/)
- **TypeScript**: Maintain strict type safety

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```
feat(gtfs-parser): Add support for GTFS-RT feed
fix(mcp-server): Handle empty query results gracefully
docs(readme): Update deployment instructions
```

---

## 🗺️ Roadmap

### ✅ Completed

- [x] Project structure and monorepo setup
- [x] MCP server implementation with stdio transport
- [x] GTFS parser with full type support
- [x] GTFS data downloader with caching
- [x] Geographic search (nearby stops)
- [x] Route search functionality
- [x] Cloudflare Workers adapter
- [x] Comprehensive test suite
- [x] Automated GTFS data upload to Workers
- [x] Documentation and examples

### 🚧 In Progress

- [ ] Real-time departure information (GTFS-RT integration)
- [ ] Integration with NS API for live train data
- [ ] Performance optimizations for large datasets
- [ ] Monitoring and analytics dashboard

### 📋 Planned

**Q1 2025:**
- [ ] Route planning capabilities (multi-modal journeys)
- [ ] Disruption alerts and notifications
- [ ] Support for realtime GTFS-RT feeds
- [ ] Additional transit operators (Belgium, Germany borders)

**Q2 2025:**
- [ ] GraphQL API for flexible queries
- [ ] WebSocket support for real-time updates
- [ ] Mobile SDK (React Native)
- [ ] Rate limiting and authentication

**Future:**
- [ ] Machine learning for journey predictions
- [ ] Historical data analysis
- [ ] Integration with bike-sharing and ride-sharing services
- [ ] Multi-language support (English, Dutch, German)

---

## 📊 Data Sources

### GTFS Data

- **Source**: [gtfs.ovapi.nl](http://gtfs.ovapi.nl/)
- **Coverage**: All Dutch public transport operators
- **Format**: GTFS (General Transit Feed Specification)
- **Update Frequency**: Daily (overnight)
- **License**: Open data
- **Size**: ~87 MB compressed, ~450 MB uncompressed

### Included Operators

**National:**
- **NS (Nederlandse Spoorwegen)**: National rail network

**Regional/Local:**
- **GVB**: Amsterdam public transport (metro, tram, bus, ferry)
- **RET**: Rotterdam public transport (metro, tram, bus)
- **HTM**: Den Haag public transport (tram, bus)
- **Connexxion**: Regional buses (multiple regions)
- **Arriva**: Regional trains and buses
- **Qbuzz**: Regional buses (Groningen, Utrecht, Zeeland)
- **Keolis**: Regional buses
- **EBS**: Regional buses
- And 40+ additional operators

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

### What this means:

✅ Commercial use  
✅ Modification  
✅ Distribution  
✅ Private use  

⚠️ License and copyright notice required  
❌ Liability  
❌ Warranty  

---

## 🙏 Acknowledgments

- **Anthropic** for creating the Model Context Protocol
- **The Bun team** for an amazing JavaScript runtime
- **OVAPI.nl** for providing comprehensive GTFS data
- **Dutch public transport operators** for open data initiatives
- **The open-source community** for tools and libraries

---

## 📞 Support

### Getting Help

- **Documentation**: Check this README and files in `/docs`
- **Issues**: [GitHub Issues](https://github.com/laulauland/ov-mcp/issues)
- **Discussions**: [GitHub Discussions](https://github.com/laulauland/ov-mcp/discussions)

### Reporting Bugs

When reporting bugs, please include:

1. **Environment details**: Bun version, OS, Node version
2. **Steps to reproduce**: Clear, numbered steps
3. **Expected behavior**: What should happen
4. **Actual behavior**: What actually happens
5. **Logs**: Relevant error messages or logs
6. **Code samples**: Minimal reproduction code if applicable

---

## 📚 Additional Resources

### MCP Resources

- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [MCP SDK Documentation](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP Examples](https://github.com/modelcontextprotocol/servers)

### GTFS Resources

- [GTFS Specification](https://gtfs.org/)
- [GTFS Best Practices](https://gtfs.org/best-practices/)
- [GTFS-Realtime](https://gtfs.org/realtime/)

### Dutch Transit Data

- [OVAPI.nl](http://ovapi.nl/) - Dutch public transport API
- [NS API](https://apiportal.ns.nl/) - NS national rail API
- [9292](https://9292.nl/) - Journey planner

---

**Built with ❤️ for the Dutch public transport community**

*Last updated: December 29, 2025*
