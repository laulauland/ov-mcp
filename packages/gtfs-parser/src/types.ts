/**
 * GTFS data type definitions
 * Based on the GTFS specification: https://gtfs.org/reference/static
 */

// Core GTFS Static Types
export interface GTFSStop {
  stop_id: string;
  stop_code?: string;
  stop_name: string;
  stop_desc?: string;
  stop_lat: number;
  stop_lon: number;
  zone_id?: string;
  stop_url?: string;
  location_type?: '0' | '1' | '2' | '3' | '4';
  parent_station?: string;
  stop_timezone?: string;
  wheelchair_boarding?: '0' | '1' | '2';
  platform_code?: string;
  level_id?: string;
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
  continuous_pickup?: '0' | '1' | '2' | '3';
  continuous_drop_off?: '0' | '1' | '2' | '3';
}

export interface GTFSTrip {
  route_id: string;
  service_id: string;
  trip_id: string;
  trip_headsign?: string;
  trip_short_name?: string;
  direction_id?: '0' | '1';
  block_id?: string;
  shape_id?: string;
  wheelchair_accessible?: '0' | '1' | '2';
  bikes_allowed?: '0' | '1' | '2';
}

export interface GTFSStopTime {
  trip_id: string;
  arrival_time: string;
  departure_time: string;
  stop_id: string;
  stop_sequence: number;
  stop_headsign?: string;
  pickup_type?: '0' | '1' | '2' | '3';
  drop_off_type?: '0' | '1' | '2' | '3';
  shape_dist_traveled?: number;
  timepoint?: '0' | '1';
  continuous_pickup?: '0' | '1' | '2' | '3';
  continuous_drop_off?: '0' | '1' | '2' | '3';
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

export interface GTFSCalendar {
  service_id: string;
  monday: '0' | '1';
  tuesday: '0' | '1';
  wednesday: '0' | '1';
  thursday: '0' | '1';
  friday: '0' | '1';
  saturday: '0' | '1';
  sunday: '0' | '1';
  start_date: string;
  end_date: string;
}

export interface GTFSCalendarDate {
  service_id: string;
  date: string;
  exception_type: '1' | '2';
}

export interface GTFSShape {
  shape_id: string;
  shape_pt_lat: number;
  shape_pt_lon: number;
  shape_pt_sequence: number;
  shape_dist_traveled?: number;
}

export interface GTFSFrequency {
  trip_id: string;
  start_time: string;
  end_time: string;
  headway_secs: number;
  exact_times?: '0' | '1';
}

export interface GTFSTransfer {
  from_stop_id: string;
  to_stop_id: string;
  transfer_type: '0' | '1' | '2' | '3';
  min_transfer_time?: number;
}

export interface GTFSFeedInfo {
  feed_publisher_name: string;
  feed_publisher_url: string;
  feed_lang: string;
  default_lang?: string;
  feed_start_date?: string;
  feed_end_date?: string;
  feed_version?: string;
  feed_contact_email?: string;
  feed_contact_url?: string;
}

// Complete GTFS Feed
export interface GTFSFeed {
  agencies: GTFSAgency[];
  stops: GTFSStop[];
  routes: GTFSRoute[];
  trips: GTFSTrip[];
  stop_times: GTFSStopTime[];
  calendar: GTFSCalendar[];
  calendar_dates?: GTFSCalendarDate[];
  shapes?: GTFSShape[];
  frequencies?: GTFSFrequency[];
  transfers?: GTFSTransfer[];
  feed_info?: GTFSFeedInfo;
}

// GTFS Realtime Types
export interface GTFSRealtimePosition {
  latitude: number;
  longitude: number;
  bearing?: number;
  odometer?: number;
  speed?: number;
}

export interface GTFSRealtimeVehicleDescriptor {
  id?: string;
  label?: string;
  license_plate?: string;
}

export interface GTFSRealtimeTripDescriptor {
  trip_id?: string;
  route_id?: string;
  direction_id?: number;
  start_time?: string;
  start_date?: string;
  schedule_relationship?: 'SCHEDULED' | 'ADDED' | 'UNSCHEDULED' | 'CANCELED';
}

export interface GTFSRealtimeStopTimeUpdate {
  stop_sequence?: number;
  stop_id?: string;
  arrival?: {
    delay?: number;
    time?: number;
    uncertainty?: number;
  };
  departure?: {
    delay?: number;
    time?: number;
    uncertainty?: number;
  };
  schedule_relationship?: 'SCHEDULED' | 'SKIPPED' | 'NO_DATA';
}

export interface GTFSRealtimeTripUpdate {
  trip: GTFSRealtimeTripDescriptor;
  vehicle?: GTFSRealtimeVehicleDescriptor;
  stop_time_update: GTFSRealtimeStopTimeUpdate[];
  timestamp?: number;
  delay?: number;
}

export interface GTFSRealtimeVehiclePosition {
  trip?: GTFSRealtimeTripDescriptor;
  vehicle?: GTFSRealtimeVehicleDescriptor;
  position?: GTFSRealtimePosition;
  current_stop_sequence?: number;
  stop_id?: string;
  current_status?: 'INCOMING_AT' | 'STOPPED_AT' | 'IN_TRANSIT_TO';
  timestamp?: number;
  congestion_level?: 'UNKNOWN_CONGESTION_LEVEL' | 'RUNNING_SMOOTHLY' | 'STOP_AND_GO' | 'CONGESTION' | 'SEVERE_CONGESTION';
  occupancy_status?: 'EMPTY' | 'MANY_SEATS_AVAILABLE' | 'FEW_SEATS_AVAILABLE' | 'STANDING_ROOM_ONLY' | 'CRUSHED_STANDING_ROOM_ONLY' | 'FULL' | 'NOT_ACCEPTING_PASSENGERS';
}

export interface GTFSRealtimeAlert {
  active_period?: Array<{
    start?: number;
    end?: number;
  }>;
  informed_entity?: Array<{
    agency_id?: string;
    route_id?: string;
    route_type?: number;
    trip?: GTFSRealtimeTripDescriptor;
    stop_id?: string;
  }>;
  cause?: 'UNKNOWN_CAUSE' | 'OTHER_CAUSE' | 'TECHNICAL_PROBLEM' | 'STRIKE' | 'DEMONSTRATION' | 'ACCIDENT' | 'HOLIDAY' | 'WEATHER' | 'MAINTENANCE' | 'CONSTRUCTION' | 'POLICE_ACTIVITY' | 'MEDICAL_EMERGENCY';
  effect?: 'NO_SERVICE' | 'REDUCED_SERVICE' | 'SIGNIFICANT_DELAYS' | 'DETOUR' | 'ADDITIONAL_SERVICE' | 'MODIFIED_SERVICE' | 'OTHER_EFFECT' | 'UNKNOWN_EFFECT' | 'STOP_MOVED';
  url?: { translation: Array<{ text: string; language?: string }> };
  header_text?: { translation: Array<{ text: string; language?: string }> };
  description_text?: { translation: Array<{ text: string; language?: string }> };
}

export interface GTFSRealtimeFeedMessage {
  header: {
    gtfs_realtime_version: string;
    incrementality?: 'FULL_DATASET' | 'DIFFERENTIAL';
    timestamp?: number;
  };
  entity: Array<{
    id: string;
    is_deleted?: boolean;
    trip_update?: GTFSRealtimeTripUpdate;
    vehicle?: GTFSRealtimeVehiclePosition;
    alert?: GTFSRealtimeAlert;
  }>;
}

// Journey Planning Types
export interface Connection {
  from_stop: GTFSStop;
  to_stop: GTFSStop;
  departure_time: string;
  arrival_time: string;
  trip: GTFSTrip;
  route: GTFSRoute;
}

export interface Journey {
  connections: Connection[];
  total_duration_minutes: number;
  transfers: number;
  departure_time: string;
  arrival_time: string;
}

export interface RouteSegment {
  from_stop_id: string;
  to_stop_id: string;
  distance_meters: number;
  travel_time_seconds: number;
  trip_id?: string;
}

// Fuzzy Search Types
export interface FuzzySearchResult {
  stop: GTFSStop;
  score: number;
  matchedFields: string[];
}

// Utility Types
export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface BoundingBox {
  min_lat: number;
  max_lat: number;
  min_lon: number;
  max_lon: number;
}
