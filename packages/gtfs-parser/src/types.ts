/**
 * GTFS data type definitions
 * Based on the GTFS specification: https://gtfs.org/reference/static
 */

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
  exception_type: '1' | '2'; // 1 = added, 2 = removed
}

export interface GTFSFeed {
  agencies: GTFSAgency[];
  stops: GTFSStop[];
  routes: GTFSRoute[];
  trips: GTFSTrip[];
  stop_times: GTFSStopTime[];
  calendar: GTFSCalendar[];
  calendar_dates?: GTFSCalendarDate[];
}
