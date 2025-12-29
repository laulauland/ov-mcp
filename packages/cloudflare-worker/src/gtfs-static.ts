/**
 * GTFS Static data handler for Cloudflare Workers
 * Browser-compatible implementation without Node.js dependencies
 * Uses fflate for zip decompression
 */

import { unzipSync } from 'fflate';

export interface GTFSStop {
  stop_id: string;
  stop_code?: string;
  stop_name: string;
  stop_desc?: string;
  stop_lat: number;
  stop_lon: number;
  zone_id?: string;
  stop_url?: string;
  location_type?: string;
  parent_station?: string;
  stop_timezone?: string;
  wheelchair_boarding?: string;
  platform_code?: string;
}

export interface GTFSRoute {
  route_id: string;
  agency_id?: string;
  route_short_name: string;
  route_long_name: string;
  route_desc?: string;
  route_type: string;
  route_url?: string;
  route_color?: string;
  route_text_color?: string;
  route_sort_order?: number;
}

export interface GTFSTrip {
  route_id: string;
  service_id: string;
  trip_id: string;
  trip_headsign?: string;
  trip_short_name?: string;
  direction_id?: string;
  block_id?: string;
  shape_id?: string;
  wheelchair_accessible?: string;
  bikes_allowed?: string;
}

export interface GTFSStopTime {
  trip_id: string;
  arrival_time: string;
  departure_time: string;
  stop_id: string;
  stop_sequence: number;
  stop_headsign?: string;
  pickup_type?: string;
  drop_off_type?: string;
  shape_dist_traveled?: string;
  timepoint?: string;
}

export interface GTFSCalendar {
  service_id: string;
  monday: string;
  tuesday: string;
  wednesday: string;
  thursday: string;
  friday: string;
  saturday: string;
  sunday: string;
  start_date: string;
  end_date: string;
}

export interface GTFSCalendarDate {
  service_id: string;
  date: string;
  exception_type: string;
}

export interface GTFSAgency {
  agency_id?: string;
  agency_name: string;
  agency_url: string;
  agency_timezone: string;
  agency_lang?: string;
  agency_phone?: string;
  agency_fare_url?: string;
  agency_email?: string;
}

export interface GTFSFeed {
  stops: GTFSStop[];
  routes: GTFSRoute[];
  trips: GTFSTrip[];
  stop_times: GTFSStopTime[];
  calendar: GTFSCalendar[];
  calendar_dates: GTFSCalendarDate[];
  agencies: GTFSAgency[];
}

/**
 * Parse CSV text into array of objects
 */
function parseCSV<T extends Record<string, any>>(csv: string): T[] {
  const lines = csv.split('\n').filter(line => line.trim());
  if (lines.length === 0) return [];

  const headers = lines[0].split(',').map(h => h.trim().replace(/"|"/g, ''));
  const results: T[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const values = parseCSVLine(line);
    const obj: any = {};

    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = values[j] || '';
    }

    results.push(obj);
  }

  return results;
}

/**
 * Parse a single CSV line handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

/**
 * Download and parse GTFS feed from a ZIP URL
 */
export async function downloadGTFSFeed(url: string): Promise<GTFSFeed> {
  console.log(`Downloading GTFS feed from ${url}`);
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download GTFS: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return parseGTFSZip(arrayBuffer);
}

/**
 * Parse GTFS feed from ZIP ArrayBuffer
 */
export function parseGTFSZip(zipData: ArrayBuffer): GTFSFeed {
  console.log('Parsing GTFS ZIP...');
  
  const uint8Array = new Uint8Array(zipData);
  const unzipped = unzipSync(uint8Array);

  // Parse required files
  const stops = parseCSV<GTFSStop>(decodeFile(unzipped['stops.txt']));
  const routes = parseCSV<GTFSRoute>(decodeFile(unzipped['routes.txt']));
  const trips = parseCSV<GTFSTrip>(decodeFile(unzipped['trips.txt']));
  const stop_times = parseCSV<GTFSStopTime>(decodeFile(unzipped['stop_times.txt']));
  const calendar = parseCSV<GTFSCalendar>(decodeFile(unzipped['calendar.txt']));
  const calendar_dates = parseCSV<GTFSCalendarDate>(decodeFile(unzipped['calendar_dates.txt']));
  const agencies = parseCSV<GTFSAgency>(decodeFile(unzipped['agency.txt']));

  // Convert string coordinates to numbers
  stops.forEach(stop => {
    stop.stop_lat = parseFloat(stop.stop_lat as any);
    stop.stop_lon = parseFloat(stop.stop_lon as any);
  });

  // Convert stop_sequence to numbers
  stop_times.forEach(st => {
    st.stop_sequence = parseInt(st.stop_sequence as any, 10);
  });

  console.log(`Parsed GTFS: ${stops.length} stops, ${routes.length} routes, ${trips.length} trips`);

  return {
    stops,
    routes,
    trips,
    stop_times,
    calendar,
    calendar_dates,
    agencies,
  };
}

function decodeFile(data: Uint8Array | undefined): string {
  if (!data) return '';
  return new TextDecoder('utf-8').decode(data);
}

/**
 * Build spatial index for stops (simple grid-based index)
 */
export class StopIndex {
  private gridSize = 0.01; // ~1km grid cells
  private grid: Map<string, GTFSStop[]> = new Map();

  constructor(stops: GTFSStop[]) {
    for (const stop of stops) {
      const key = this.getGridKey(stop.stop_lat, stop.stop_lon);
      const cell = this.grid.get(key) || [];
      cell.push(stop);
      this.grid.set(key, cell);
    }
  }

  private getGridKey(lat: number, lon: number): string {
    const gridLat = Math.floor(lat / this.gridSize);
    const gridLon = Math.floor(lon / this.gridSize);
    return `${gridLat},${gridLon}`;
  }

  findNearby(lat: number, lon: number, radiusKm: number): GTFSStop[] {
    const results: GTFSStop[] = [];
    const radiusDeg = radiusKm / 111; // Approximate km to degrees
    
    // Check surrounding grid cells
    const centerLat = Math.floor(lat / this.gridSize);
    const centerLon = Math.floor(lon / this.gridSize);
    const cellRadius = Math.ceil(radiusDeg / this.gridSize);

    for (let dLat = -cellRadius; dLat <= cellRadius; dLat++) {
      for (let dLon = -cellRadius; dLon <= cellRadius; dLon++) {
        const key = `${centerLat + dLat},${centerLon + dLon}`;
        const cell = this.grid.get(key);
        
        if (cell) {
          for (const stop of cell) {
            const distance = haversineDistance(lat, lon, stop.stop_lat, stop.stop_lon);
            if (distance <= radiusKm) {
              results.push(stop);
            }
          }
        }
      }
    }

    return results.sort((a, b) => {
      const distA = haversineDistance(lat, lon, a.stop_lat, a.stop_lon);
      const distB = haversineDistance(lat, lon, b.stop_lat, b.stop_lon);
      return distA - distB;
    });
  }
}

/**
 * Calculate distance between two coordinates using Haversine formula
 */
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Search stops by name (case-insensitive partial match)
 */
export function searchStopsByName(stops: GTFSStop[], query: string, limit: number = 10): GTFSStop[] {
  const lowerQuery = query.toLowerCase();
  
  return stops
    .filter(stop => stop.stop_name.toLowerCase().includes(lowerQuery))
    .slice(0, limit);
}

/**
 * Get stop by ID
 */
export function getStopById(stops: GTFSStop[], stopId: string): GTFSStop | undefined {
  return stops.find(stop => stop.stop_id === stopId);
}

/**
 * Find stops near a coordinate
 */
export function findStopsNear(
  stops: GTFSStop[],
  lat: number,
  lon: number,
  radiusKm: number = 1,
  limit: number = 10
): GTFSStop[] {
  const stopsWithDistance = stops.map(stop => ({
    stop,
    distance: haversineDistance(lat, lon, stop.stop_lat, stop.stop_lon),
  }));

  return stopsWithDistance
    .filter(({ distance }) => distance <= radiusKm)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
    .map(({ stop }) => stop);
}

/**
 * Get routes serving a stop
 */
export function getRoutesForStop(
  feed: GTFSFeed,
  stopId: string
): GTFSRoute[] {
  // Find all trips that stop at this stop
  const tripIds = new Set(
    feed.stop_times
      .filter(st => st.stop_id === stopId)
      .map(st => st.trip_id)
  );

  // Find routes for those trips
  const routeIds = new Set(
    feed.trips
      .filter(trip => tripIds.has(trip.trip_id))
      .map(trip => trip.route_id)
  );

  return feed.routes.filter(route => routeIds.has(route.route_id));
}

/**
 * Get stops for a route
 */
export function getStopsForRoute(
  feed: GTFSFeed,
  routeId: string
): GTFSStop[] {
  // Find all trips for this route
  const tripIds = feed.trips
    .filter(trip => trip.route_id === routeId)
    .map(trip => trip.trip_id);

  // Find all stops for those trips
  const stopIds = new Set(
    feed.stop_times
      .filter(st => tripIds.includes(st.trip_id))
      .map(st => st.stop_id)
  );

  return feed.stops.filter(stop => stopIds.has(stop.stop_id));
}

/**
 * Check if a service is active on a given date
 */
export function isServiceActive(
  feed: GTFSFeed,
  serviceId: string,
  date: Date
): boolean {
  const dateStr = formatDate(date);
  const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday

  // Check calendar exceptions first
  const exception = feed.calendar_dates.find(
    cd => cd.service_id === serviceId && cd.date === dateStr
  );

  if (exception) {
    return exception.exception_type === '1'; // 1 = added, 2 = removed
  }

  // Check regular calendar
  const calendar = feed.calendar.find(c => c.service_id === serviceId);
  if (!calendar) return false;

  // Check if date is within service period
  if (dateStr < calendar.start_date || dateStr > calendar.end_date) {
    return false;
  }

  // Check day of week
  const dayMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayField = dayMap[dayOfWeek] as keyof GTFSCalendar;
  return calendar[dayField] === '1';
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Get departures from a stop
 */
export function getDeparturesFromStop(
  feed: GTFSFeed,
  stopId: string,
  date: Date,
  limit: number = 10
): Array<{
  route: GTFSRoute;
  trip: GTFSTrip;
  departureTime: string;
  headsign?: string;
}> {
  const departures: Array<{
    route: GTFSRoute;
    trip: GTFSTrip;
    departureTime: string;
    headsign?: string;
  }> = [];

  // Find all stop times for this stop
  const stopTimes = feed.stop_times.filter(st => st.stop_id === stopId);

  for (const st of stopTimes) {
    const trip = feed.trips.find(t => t.trip_id === st.trip_id);
    if (!trip) continue;

    // Check if service is active
    if (!isServiceActive(feed, trip.service_id, date)) continue;

    const route = feed.routes.find(r => r.route_id === trip.route_id);
    if (!route) continue;

    departures.push({
      route,
      trip,
      departureTime: st.departure_time,
      headsign: trip.trip_headsign,
    });
  }

  // Sort by departure time
  departures.sort((a, b) => a.departureTime.localeCompare(b.departureTime));

  return departures.slice(0, limit);
}
