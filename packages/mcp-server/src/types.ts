/**
 * Type definitions for GTFS data and MCP server
 */

// GTFS Stop
export interface Stop {
  stop_id: string;
  stop_code?: string;
  stop_name?: string;
  stop_desc?: string;
  stop_lat: number;
  stop_lon: number;
  zone_id?: string;
  stop_url?: string;
  location_type?: number;
  parent_station?: string;
  stop_timezone?: string;
  wheelchair_boarding?: number;
  platform_code?: string;
}

// GTFS Route
export interface Route {
  route_id: string;
  agency_id?: string;
  route_short_name?: string;
  route_long_name?: string;
  route_desc?: string;
  route_type: number;
  route_url?: string;
  route_color?: string;
  route_text_color?: string;
}

// GTFS Trip
export interface Trip {
  route_id: string;
  service_id: string;
  trip_id: string;
  trip_headsign?: string;
  trip_short_name?: string;
  direction_id?: number;
  block_id?: string;
  shape_id?: string;
  wheelchair_accessible?: number;
  bikes_allowed?: number;
}

// GTFS Stop Time
export interface StopTime {
  trip_id: string;
  arrival_time?: string;
  departure_time?: string;
  stop_id: string;
  stop_sequence?: number;
  stop_headsign?: string;
  pickup_type?: number;
  drop_off_type?: number;
  shape_dist_traveled?: number;
}

// GTFS Agency
export interface Agency {
  agency_id?: string;
  agency_name: string;
  agency_url: string;
  agency_timezone: string;
  agency_lang?: string;
  agency_phone?: string;
  agency_fare_url?: string;
  agency_email?: string;
}

// Complete GTFS Data
export interface GTFSData {
  stops: Stop[];
  routes: Route[];
  trips: Trip[];
  stopTimes: StopTime[];
  agencies: Agency[];
}

// Journey planning types
export interface Journey {
  from: Stop;
  to: Stop;
  legs: JourneyLeg[];
  totalDuration: number;
  departure: Date;
  arrival: Date;
}

export interface JourneyLeg {
  from: Stop;
  to: Stop;
  route: Route;
  departure: Date;
  arrival: Date;
  duration: number;
}

// Realtime info types
export interface RealtimeInfo {
  stop: Stop;
  departures: RealtimeDeparture[];
}

export interface RealtimeDeparture {
  route: Route;
  trip: Trip;
  scheduledDeparture: Date;
  estimatedDeparture?: Date;
  delay?: number;
  platform?: string;
  destination: string;
}
