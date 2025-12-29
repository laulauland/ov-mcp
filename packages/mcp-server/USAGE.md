# Usage Guide for OV-MCP Server

This guide provides practical examples for using the OV-MCP server with LLM agents.

## Quick Start

### 1. Installation

```bash
cd packages/mcp-server
bun install
bun run build
```

### 2. Configuration

#### For Claude Desktop (macOS)

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ov-mcp": {
      "command": "bun",
      "args": ["run", "/Users/yourname/ov-mcp/packages/mcp-server/dist/index.js"]
    }
  }
}
```

#### For Claude Desktop (Windows)

Edit `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ov-mcp": {
      "command": "bun",
      "args": ["run", "C:\\path\\to\\ov-mcp\\packages\\mcp-server\\dist\\index.js"]
    }
  }
}
```

### 3. Restart Claude

After updating the config, restart Claude Desktop for changes to take effect.

## Example Conversations

### Finding Stops

**You:** "Find train stations in Amsterdam"

**Claude will use:** `find_stops` tool with query "Amsterdam"

**Result:**
```
Found 15 stop(s) matching "Amsterdam":

🚉 Amsterdam Centraal
   ID: 8400058
   Code: ASD
   Location: 52.3791, 4.9003

🚉 Amsterdam Zuid
   ID: 8400061
   Location: 52.3389, 4.8730

🚉 Amsterdam Amstel
   ID: 8400061
   Location: 52.3467, 4.9177

...
```

### Planning a Journey

**You:** "How do I get from Amsterdam Centraal to Utrecht Centraal?"

**Claude will use:** 
1. `find_stops` to verify station names
2. `plan_journey` with from="Amsterdam Centraal" and to="Utrecht Centraal"

**Result:**
```
Journey from Amsterdam Centraal to Utrecht Centraal:

1. Intercity to Utrecht Centraal
   Departure: 10:15 from Amsterdam Centraal
   Arrival: 10:42 at Utrecht Centraal
   Duration: 27m

2. Sprinter to Utrecht Centraal
   Departure: 10:23 from Amsterdam Centraal
   Arrival: 11:05 at Utrecht Centraal
   Duration: 42m

3. Intercity to Utrecht Centraal
   Departure: 10:45 from Amsterdam Centraal
   Arrival: 11:12 at Utrecht Centraal
   Duration: 27m
```

### Getting Real-time Information

**You:** "When does the next train leave from Amsterdam Centraal?"

**Claude will use:** `get_realtime_info` with stop_id="Amsterdam Centraal"

**Result:**
```
📍 Amsterdam Centraal
Upcoming departures:

🚊 IC 500 → Rotterdam Centraal
   Departure: 10:15
   Platform: 5b

🚊 IC 800 → Maastricht
   Departure: 10:18
   Platform: 7a
   ⚠️ Delay: 5 minutes

🚊 SPR 4000 → Utrecht Centraal
   Departure: 10:23
   Platform: 10a

🚊 IC 1500 → Groningen
   Departure: 10:25
   Platform: 8b

🚊 IC 3000 → Venlo
   Departure: 10:30
   Platform: 12
```

## Natural Language Examples

The MCP server is designed to work with natural language queries. Here are some examples:

### Stop Search Examples

- "Find stops near Schiphol Airport"
- "Search for stations in Rotterdam"
- "Show me all stops with 'Zuid' in the name"
- "What stations are in Den Haag?"

### Journey Planning Examples

- "Plan a trip from Amsterdam to Rotterdam"
- "How do I get to Utrecht from Den Haag?"
- "Show me routes between Eindhoven and Maastricht"
- "What's the fastest way from Amsterdam Zuid to Schiphol?"

### Real-time Info Examples

- "When's the next train from Amsterdam Centraal?"
- "Show departures from Rotterdam Centraal"
- "What trains are leaving from Utrecht soon?"
- "Are there any delays at Den Haag Centraal?"

## Advanced Usage

### Chaining Queries

You can ask complex questions that require multiple tool calls:

**You:** "I need to go from Amsterdam to Maastricht. First find the stations, then show me the routes."

**Claude will:**
1. Use `find_stops` for "Amsterdam"
2. Use `find_stops` for "Maastricht"
3. Use `plan_journey` with the found station IDs

### Filtering Results

**You:** "Find stops in Amsterdam, but only show me the top 5"

**Claude will:** Use `find_stops` with query="Amsterdam" and limit=5

### Specific Times

**You:** "Plan a journey from Amsterdam to Utrecht leaving tomorrow at 9:00 AM"

**Claude will:** Use `plan_journey` with date and time parameters

## Common Issues

### "No stops found"

**Problem:** The search query doesn't match any stops.

**Solution:** 
- Check spelling
- Try a partial name (e.g., "Amsterdam" instead of "Amsterdam Centraal Station")
- Use the official Dutch station names

### "Could not find origin/destination stop"

**Problem:** The stop name in `plan_journey` doesn't exist.

**Solution:** Use `find_stops` first to get the exact stop name or ID.

### "No direct connections found"

**Problem:** There are no direct routes between the stops.

**Solution:** 
- This is expected for some routes
- Future versions will support multi-leg journeys with transfers
- Try planning to an intermediate station

### Server not responding

**Problem:** Claude can't connect to the MCP server.

**Solution:**
1. Check that the path in config is correct (use absolute path)
2. Verify the server is built: `bun run build`
3. Check Bun is installed: `bun --version`
4. Restart Claude Desktop
5. Check Claude's logs for error messages

## Tips for Best Results

1. **Be Specific**: Use official station names when possible
2. **Use Find First**: For journey planning, use `find_stops` first to get exact names
3. **Check Real-time**: Use `get_realtime_info` to check for delays before traveling
4. **Partial Names Work**: You can search with partial names ("Amsterdam" finds all Amsterdam stations)
5. **Amsterdam Focus**: The server works best for Amsterdam-area transit

## API Response Format

All tools return results in MCP text content format:

```typescript
{
  content: [
    {
      type: "text",
      text: "Formatted result text..."
    }
  ]
}
```

Errors are returned with `isError: true`:

```typescript
{
  content: [
    {
      type: "text",
      text: "Error: Description of the error"
    }
  ],
  isError: true
}
```

## Performance Notes

- **First Query**: Takes 5-10 seconds (downloads GTFS data)
- **Subsequent Queries**: <100ms (uses cached data)
- **Cache Duration**: 24 hours
- **Data Size**: ~100 MB (GTFS data)

## Data Coverage

The server uses GTFS data from gtfs.ovapi.nl, which includes:

- ✅ NS (Dutch Railways) - All stations
- ✅ Regional trains
- ✅ Major bus operators
- ✅ Trams (Amsterdam, Rotterdam, Den Haag, Utrecht)
- ✅ Metro (Amsterdam, Rotterdam)

## Limitations

- **Schedule Data Only**: Shows scheduled times, not live tracking
- **No Real Delays**: Cannot show actual real-time delays (GTFS limitation)
- **Direct Routes Only**: Multi-leg journeys with transfers not yet supported
- **Netherlands Only**: Only covers Dutch public transport

## Next Steps

After getting familiar with basic usage:

1. Explore the [README.md](./README.md) for technical details
2. Check the source code for implementation details
3. Contribute improvements or report issues
4. Try integrating with other MCP tools

## Support

For issues:
- Check this guide first
- Review the [README.md](./README.md)
- Open an issue on GitHub with:
  - Your query
  - Expected result
  - Actual result
  - Error messages
