# Quick Start Guide

Get the OV-MCP server running in 5 minutes!

## Prerequisites

- **Bun** installed ([bun.sh](https://bun.sh))
- **Claude Desktop** (for testing)

## Installation

```bash
# Clone the repository
git clone https://github.com/laulauland/ov-mcp.git
cd ov-mcp

# Install dependencies
bun install

# Build packages
bun run build
```

## First Run

The server will automatically download GTFS data on first run (~50-100 MB):

```bash
cd packages/mcp-server
bun run src/index.ts
```

Expected output:
```
Initializing GTFS data...
Downloading GTFS data from http://gtfs.ovapi.nl/gtfs-nl.zip
Downloaded 87.32 MB
Extracting GTFS data...
Parsed 45231 stops, 1234 routes, 56789 trips
GTFS data loaded successfully
OV-MCP Server running on stdio
```

The data is cached in `./data/gtfs-cache/` and will be used on subsequent runs.

## Configure Claude Desktop

1. **Find your config file**:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\\Claude\\claude_desktop_config.json`
   - Linux: `~/.config/Claude/claude_desktop_config.json`

2. **Add the server configuration**:

   ```json
   {
     \"mcpServers\": {
       \"ov-mcp\": {
         \"command\": \"bun\",
         \"args\": [
           \"run\",
           \"/ABSOLUTE/PATH/TO/ov-mcp/packages/mcp-server/src/index.ts\"
         ]
       }
     }
   }
   ```

   Replace `/ABSOLUTE/PATH/TO/ov-mcp` with your actual path. Get it with:
   ```bash
   cd /path/to/ov-mcp && pwd
   ```

3. **Restart Claude Desktop**

## Test It!

Open Claude Desktop and try these queries:

### Find Train Stations
```
Can you find train stations in Amsterdam?
```

### Get Stop Details
```
What can you tell me about stop 8400561?
```

### Find Nearby Stops
```
Find public transport stops within 2km of coordinates 52.3791, 4.9003
```

### Search Routes
```
Show me information about Intercity routes
```

## Example Response

```json
{
  "id": "8400561",
  "name": "Amsterdam Centraal",
  "code": "Asd",
  "location": {
    "latitude": 52.3791,
    "longitude": 4.9003
  },
  "type": "station",
  "wheelchair_accessible": true
}
```

## Troubleshooting

### Server Won't Connect

1. **Verify the path is absolute**:
   ```bash
   cd /path/to/ov-mcp && pwd
   ```

2. **Check Claude logs**:
   - macOS: `~/Library/Logs/Claude/`
   - Windows: `%APPDATA%\\Claude\\Logs\\`

3. **Test server independently**:
   ```bash
   cd packages/mcp-server
   bun run src/index.ts
   ```

### Download Fails

If GTFS download fails:

1. **Check internet connection**
2. **Verify source is accessible**:
   ```bash
   curl -I http://gtfs.ovapi.nl/gtfs-nl.zip
   ```
3. **Try again** - the download will retry automatically

### Memory Issues

If you see "heap out of memory":

```bash
export NODE_OPTIONS="--max-old-space-size=4096"
```

## Next Steps

- **Read the full [README](README.md)** for detailed documentation
- **Deploy to Cloudflare Workers** - see [Deployment Guide](docs/CLOUDFLARE_DEPLOYMENT.md)
- **Run tests**: `bun test`
- **Contribute** - see [Contributing](#contributing) in README

## Common Commands

```bash
# Run development mode (auto-reload)
bun run dev

# Build all packages
bun run build

# Run tests
bun run test

# Type checking
bun run typecheck

# Clean build artifacts
bun run clean

# Force refresh GTFS data
rm -rf data/gtfs-cache
```

## Data Updates

The GTFS data is automatically cached and refreshed:

- **First run**: Downloads from gtfs.ovapi.nl
- **Subsequent runs**: Uses cached data
- **Auto-refresh**: Every 24 hours
- **Manual refresh**: Delete `./data/gtfs-cache/`

## Support

- **GitHub Issues**: [github.com/laulauland/ov-mcp/issues](https://github.com/laulauland/ov-mcp/issues)
- **Documentation**: See [README.md](README.md)
- **MCP Docs**: [modelcontextprotocol.io](https://modelcontextprotocol.io)

---

**Ready to go!** Your OV-MCP server is now running with real Dutch public transport data.

Enjoy exploring Dutch public transport through Claude! 🚂🇳🇱
