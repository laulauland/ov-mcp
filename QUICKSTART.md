# Quick Start Guide - OV-MCP

Get the OV-MCP server running with Claude Desktop in 5 minutes!

## Prerequisites

- ✅ [Bun](https://bun.sh) installed (`curl -fsSL https://bun.sh/install | bash`)
- ✅ Claude Desktop installed
- ✅ 5 minutes of your time

## Step 1: Clone & Build (2 minutes)

```bash
# Clone the repository
git clone https://github.com/laulauland/ov-mcp.git
cd ov-mcp

# Install dependencies and build
bun install
bun run build
```

## Step 2: Configure Claude Desktop (1 minute)

### macOS

```bash
# Open the config file
open ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

### Windows

```powershell
# Open the config file
notepad %APPDATA%\Claude\claude_desktop_config.json
```

### Linux

```bash
# Open the config file
nano ~/.config/Claude/claude_desktop_config.json
```

### Add This Configuration

Replace `/absolute/path/to/ov-mcp` with your actual path:

```json
{
  "mcpServers": {
    "ov-mcp": {
      "command": "bun",
      "args": [
        "run",
        "/absolute/path/to/ov-mcp/packages/mcp-server/dist/index.js"
      ]
    }
  }
}
```

**Example (macOS):**
```json
{
  "mcpServers": {
    "ov-mcp": {
      "command": "bun",
      "args": [
        "run",
        "/Users/laurynas/projects/ov-mcp/packages/mcp-server/dist/index.js"
      ]
    }
  }
}
```

## Step 3: Restart Claude (30 seconds)

1. Quit Claude Desktop completely
2. Reopen Claude Desktop
3. Wait for it to connect to the server (you'll see a small indicator)

## Step 4: Test It! (1 minute)

Try these queries in Claude:

### 1. Find Stops
```
Find train stations in Amsterdam
```

Expected response:
```
Found X stop(s) matching "Amsterdam":

🚉 Amsterdam Centraal
   ID: 8400058
   Code: ASD
   Location: 52.3791, 4.9003
...
```

### 2. Plan a Journey
```
How do I get from Amsterdam Centraal to Utrecht Centraal?
```

Expected response:
```
Journey from Amsterdam Centraal to Utrecht Centraal:

1. Intercity to Utrecht Centraal
   Departure: 10:15
   Arrival: 10:42
   Duration: 27m
...
```

### 3. Real-time Info
```
When does the next train leave from Amsterdam Centraal?
```

Expected response:
```
📍 Amsterdam Centraal
Upcoming departures:

🚊 IC 500 → Rotterdam Centraal
   Departure: 10:15
   Platform: 5b
...
```

## That's It! 🎉

You now have a fully functional Dutch public transit assistant in Claude!

## What Happens on First Use?

The first time you use a tool, the server will:
1. Download GTFS data from gtfs.ovapi.nl (~100 MB)
2. Parse and cache it locally
3. This takes about 5-10 seconds

Subsequent queries will be instant (< 100ms) using cached data.

## Common First-Time Issues

### Issue: "Command not found: bun"

**Solution:** Install Bun:
```bash
curl -fsSL https://bun.sh/install | bash
```

### Issue: Claude can't connect to server

**Solution:** Check these:
1. Is the path in config absolute? (starts with `/` on Mac/Linux or `C:\` on Windows)
2. Did you run `bun run build`?
3. Did you restart Claude completely?

### Issue: "Server timed out"

**Solution:** First query downloads data. Just wait 10 seconds and try again.

### Issue: No results found

**Solution:** Try these proven queries:
- "Find stops in Amsterdam"
- "How do I get from Amsterdam to Utrecht?"
- "Show departures from Amsterdam Centraal"

## Next Steps

### Learn More

- 📖 [Full Documentation](./packages/mcp-server/README.md)
- 📚 [Usage Guide](./packages/mcp-server/USAGE.md) - Detailed examples
- 🏗️ [Architecture](./README.md#architecture) - How it works

### Try These Queries

Natural language works great:

- "Find all stations with 'Zuid' in the name"
- "What's the fastest way from Schiphol to Rotterdam?"
- "Show me the next 10 trains from Utrecht"
- "Plan a journey from Den Haag to Maastricht"
- "Are there any delays at Amsterdam Centraal?"

### Customize

Want to tweak the server? Check out:

- `packages/mcp-server/src/tools.ts` - Modify tool behavior
- `packages/mcp-server/src/gtfs-loader.ts` - Change caching settings
- `packages/mcp-server/src/index.ts` - Add new tools

### Get Help

- 💬 [Open an issue](https://github.com/laulauland/ov-mcp/issues)
- 📖 Read the [troubleshooting guide](./packages/mcp-server/USAGE.md#common-issues)
- 🐛 Include error messages when reporting problems

## Pro Tips 💡

1. **Use Find First**: Before planning a journey, use find_stops to get exact names
2. **Partial Names Work**: "Amsterdam" finds all Amsterdam stations
3. **Check Real-time**: Use get_realtime_info to see current delays
4. **Cache is Smart**: Data refreshes automatically every 24 hours
5. **Be Specific**: "Amsterdam Centraal" works better than "Amsterdam station"

## What's Covered

The server includes data for:
- ✅ All NS (Dutch Railways) stations
- ✅ Regional trains
- ✅ Major bus routes
- ✅ Trams in Amsterdam, Rotterdam, Den Haag, Utrecht
- ✅ Metro in Amsterdam and Rotterdam

## System Requirements

- **Disk Space**: ~200 MB (including cache)
- **Memory**: ~300 MB when running
- **Network**: Internet connection for initial download
- **OS**: macOS, Linux, or Windows

## Performance

| Action | Time |
|--------|------|
| First query | 5-10 seconds |
| Cached queries | < 1 second |
| Tool response | < 100ms |
| Cache refresh | Automatic (24h) |

## Data Freshness

- **Source**: gtfs.ovapi.nl
- **Update Frequency**: Daily
- **Cache Expiry**: 24 hours
- **Manual Refresh**: Delete `.cache/` folder

---

## Having Fun? 🚀

This project is open source! Consider:
- ⭐ Starring the repository
- 🐛 Reporting issues
- 💡 Suggesting features  
- 🔧 Contributing code

Happy travels! 🚆
