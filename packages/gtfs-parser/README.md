# @ov-mcp/gtfs-parser

GTFS (General Transit Feed Specification) parser for Dutch public transport data.

## Overview

This package provides utilities for parsing and querying GTFS data files used by Dutch public transport operators.

## Features

- Parse GTFS CSV files (stops, routes, trips, stop_times, agencies, calendar)
- Type-safe interfaces for all GTFS entities
- Query utilities for common operations:
  - Search stops by name
  - Find stops near a coordinate
  - Get entities by ID
  - Calculate distances between coordinates

## Development

```bash
# Install dependencies
bun install

# Run in development mode
bun run dev

# Build
bun run build

# Run tests
bun run test

# Type checking
bun run typecheck
```

## Usage

```typescript
import { GTFSParser, GTFSQuery } from '@ov-mcp/gtfs-parser';

// Parse GTFS data
const stopsCSV = await Bun.file('stops.txt').text();
const stops = GTFSParser.parseStops(stopsCSV);

// Query stops
const results = GTFSQuery.searchStopsByName(stops, 'Amsterdam', 10);

// Find nearby stops
const nearby = GTFSQuery.findStopsNear(stops, 52.3676, 4.9041, 1, 10);
```

## GTFS Specification

This parser implements the [GTFS Static specification](https://gtfs.org/reference/static).
