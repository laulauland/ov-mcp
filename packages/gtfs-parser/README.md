# GTFS Parser

Comprehensive TypeScript library for parsing and analyzing GTFS (General Transit Feed Specification) data with advanced features for Dutch public transport systems.

## Features

### 🚀 Core Capabilities

- **Comprehensive TypeScript Types**: Full type definitions for all GTFS static and realtime entities
- **Streaming CSV Parser**: Memory-efficient parsing of large GTFS feeds using csv-parse
- **Graph-Based Journey Planning**: Dijkstra's algorithm for optimal route finding
- **Fuzzy Search**: Intelligent station search with Amsterdam-specific optimizations
- **GTFS-Realtime Support**: Protocol Buffer parsing for real-time updates
- **Geo-Spatial Utilities**: Distance calculations, bounding boxes, and proximity searches

## Installation

```bash
bun install
```

For GTFS-Realtime Protocol Buffer support, install the optional dependency:

```bash
bun add protobufjs
```

## Usage

### Parsing GTFS Static Data

#### Streaming Parser (Memory Efficient)

```typescript
import { GTFSParser } from '@ov-mcp/gtfs-parser';
import { createReadStream } from 'fs';

const stops: GTFSStop[] = [];

await GTFSParser.parseStopsStream(
  createReadStream('stops.txt'),
  (stop) => {
    stops.push(stop);
    // Process stop immediately
  }
);
```

### Journey Planning

```typescript
import { JourneyPlanner } from '@ov-mcp/gtfs-parser';

const planner = new JourneyPlanner(
  stops,
  routes,
  trips,
  stopTimes,
  transfers
);

// Find journey from Amsterdam Centraal to Amsterdam Zuid
const journey = planner.findJourney(
  'amsterdam-centraal-stop-id',
  'amsterdam-zuid-stop-id',
  '09:00:00', // Departure time
  3 // Max transfers
);

if (journey) {
  console.log(`Duration: ${journey.total_duration_minutes} minutes`);
  console.log(`Transfers: ${journey.transfers}`);
  
  for (const connection of journey.connections) {
    console.log(`${connection.from_stop.stop_name} → ${connection.to_stop.stop_name}`);
    console.log(`  Route: ${connection.route.route_short_name}`);
    console.log(`  ${connection.departure_time} - ${connection.arrival_time}`);
  }
}

// Get all direct routes between two stops
const directRoutes = planner.getDirectRoutes(
  'stop-a-id',
  'stop-b-id'
);
```

### Fuzzy Search for Amsterdam Stations

```typescript
import { FuzzySearch } from '@ov-mcp/gtfs-parser';

const search = new FuzzySearch(stops);

// Search with typos and variations
const results = search.searchStops('amstrdam central', {
  amsterdamOnly: true,
  maxResults: 5,
  minScore: 0.5
});

for (const result of results) {
  console.log(`${result.stop.stop_name} (score: ${result.score})`);
  console.log(`  Matched fields: ${result.matchedFields.join(', ')}`);
}

// Find Amsterdam Central Station with variations
const centralStation = search.searchAmsterdamCentralStation();

// Search near a location
const nearbyStops = search.searchNearby(
  52.3702, // latitude
  4.8952,  // longitude (Amsterdam center)
  500,     // radius in meters
  'tram'   // optional query
);

// Get major Amsterdam transit hubs
const hubs = search.getAmsterdamHubs();
console.log('Major hubs:', hubs.map(h => h.stop_name));
```

### GTFS-Realtime

```typescript
import {
  fetchRealtimeFeed,
  filterTripUpdates,
  getAlertsForStop,
  applyRealtimeUpdates
} from '@ov-mcp/gtfs-parser';

// Fetch realtime feed
const feed = await fetchRealtimeFeed('https://example.com/gtfs-realtime');

// Get trip updates
const tripUpdates = filterTripUpdates(feed);

// Get alerts for a specific stop
const alerts = getAlertsForStop(feed, 'amsterdam-centraal');

// Merge realtime updates with static data
const updatedStopTimes = applyRealtimeUpdates(stopTimes, tripUpdates);
```

### Geo-Spatial Utilities

```typescript
import {
  calculateDistance,
  calculateBearing,
  findStopsNearby,
  findClosestStop,
  createBoundingBox,
  calculateWalkingTime
} from '@ov-mcp/gtfs-parser';

// Calculate distance between two points
const distance = calculateDistance(
  52.3702, 4.8952, // Amsterdam Centraal
  52.3380, 4.8720  // Amsterdam Zuid
);
console.log(`Distance: ${distance} meters`);

// Calculate bearing
const bearing = calculateBearing(52.3702, 4.8952, 52.3380, 4.8720);
console.log(`Bearing: ${bearing}°`);

// Find stops within radius
const nearby = findStopsNearby(
  stops,
  52.3702, 4.8952,
  1000 // 1km radius
);

// Find closest stop
const closest = findClosestStop(stops, 52.3702, 4.8952);
if (closest) {
  console.log(`Closest: ${closest.stop.stop_name} (${closest.distance}m)`);
}

// Create bounding box
const bbox = createBoundingBox(52.3702, 4.8952, 5000); // 5km radius

// Calculate walking time
const walkingSeconds = calculateWalkingTime(
  52.3702, 4.8952,
  52.3380, 4.8720
);
console.log(`Walking time: ${Math.ceil(walkingSeconds / 60)} minutes`);
```

### Time Utilities

```typescript
import {
  parseGTFSTime,
  formatGTFSTime,
  parseGTFSDate,
  formatGTFSDate,
  isServiceActive
} from '@ov-mcp/gtfs-parser';

// Parse GTFS time to minutes since midnight
const minutes = parseGTFSTime('14:30:00');
console.log(minutes); // 870

// Format back to GTFS time
const timeStr = formatGTFSTime(870);
console.log(timeStr); // "14:30:00"

// Parse GTFS date
const date = parseGTFSDate('20231225');
console.log(date); // Date object for Dec 25, 2023

// Check if service is active
const active = isServiceActive(
  calendar,
  new Date('2023-12-25')
);
```

## TypeScript Types

All GTFS entities are fully typed:

```typescript
import type {
  GTFSStop,
  GTFSRoute,
  GTFSTrip,
  GTFSStopTime,
  GTFSAgency,
  GTFSCalendar,
  GTFSFeed,
  GTFSRealtimeTripUpdate,
  GTFSRealtimeVehiclePosition,
  GTFSRealtimeAlert,
  Journey,
  Connection,
  FuzzySearchResult,
  GeoPoint,
  BoundingBox
} from '@ov-mcp/gtfs-parser';
```

## Performance Tips

1. **Use Streaming Parsers**: For large GTFS feeds, always use the streaming parsers to avoid loading entire files into memory:
   ```typescript
   await GTFSParser.parseStopTimesStream(stream, processStopTime);
   ```

2. **Limit Search Results**: When using fuzzy search, set appropriate limits:
   ```typescript
   search.searchStops(query, { maxResults: 10, minScore: 0.6 });
   ```

3. **Cache Results**: Cache frequently accessed data like stops and routes in memory.

4. **Use Bounding Boxes**: Filter stops by bounding box before distance calculations:
   ```typescript
   const bbox = createBoundingBox(lat, lon, radius);
   const filtered = stops.filter(s => 
     isPointInBoundingBox(s.stop_lat, s.stop_lon, bbox)
   );
   ```

## Amsterdam-Specific Features

The library includes optimizations for Amsterdam public transport:

- Amsterdam-only filtering for faster searches
- Recognition of major transit hubs (Centraal, Zuid, Amstel, etc.)
- Station name variations ("Centraal", "Central", "CS")
- Geographic filtering within Amsterdam metro area (20km radius)

## Data Sources

For Dutch GTFS data:
- [NDOV Loket](https://data.ndovloket.nl/): Official Dutch public transport data
- [GVB Amsterdam](https://gvb.nl/): Amsterdam city transport

## License

MIT

## Contributing

Contributions welcome! Please ensure:
- TypeScript types are properly defined
- Code includes documentation comments
- Performance implications are considered
- Tests are included for new features
