import { parse } from 'csv-parse/sync';
import type { GTFSStop, GTFSRoute, GTFSTrip, GTFSStopTime, GTFSAgency, GTFSCalendar } from './types';

/**
 * Parse GTFS CSV data into typed objects
 */
export class GTFSParser {
  /**
   * Parse stops.txt file
   */
  static parseStops(csv: string): GTFSStop[] {
    const records = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    return records.map((record: any) => ({
      stop_id: record.stop_id,
      stop_code: record.stop_code,
      stop_name: record.stop_name,
      stop_desc: record.stop_desc,
      stop_lat: parseFloat(record.stop_lat),
      stop_lon: parseFloat(record.stop_lon),
      zone_id: record.zone_id,
      stop_url: record.stop_url,
      location_type: record.location_type,
      parent_station: record.parent_station,
      stop_timezone: record.stop_timezone,
      wheelchair_boarding: record.wheelchair_boarding,
      platform_code: record.platform_code,
    }));
  }

  /**
   * Parse routes.txt file
   */
  static parseRoutes(csv: string): GTFSRoute[] {
    const records = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    return records.map((record: any) => ({
      route_id: record.route_id,
      agency_id: record.agency_id,
      route_short_name: record.route_short_name,
      route_long_name: record.route_long_name,
      route_desc: record.route_desc,
      route_type: record.route_type,
      route_url: record.route_url,
      route_color: record.route_color,
      route_text_color: record.route_text_color,
      route_sort_order: record.route_sort_order ? parseInt(record.route_sort_order) : undefined,
    }));
  }

  /**
   * Parse trips.txt file
   */
  static parseTrips(csv: string): GTFSTrip[] {
    const records = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    return records.map((record: any) => ({
      route_id: record.route_id,
      service_id: record.service_id,
      trip_id: record.trip_id,
      trip_headsign: record.trip_headsign,
      trip_short_name: record.trip_short_name,
      direction_id: record.direction_id,
      block_id: record.block_id,
      shape_id: record.shape_id,
      wheelchair_accessible: record.wheelchair_accessible,
      bikes_allowed: record.bikes_allowed,
    }));
  }

  /**
   * Parse stop_times.txt file
   */
  static parseStopTimes(csv: string): GTFSStopTime[] {
    const records = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    return records.map((record: any) => ({
      trip_id: record.trip_id,
      arrival_time: record.arrival_time,
      departure_time: record.departure_time,
      stop_id: record.stop_id,
      stop_sequence: parseInt(record.stop_sequence),
      stop_headsign: record.stop_headsign,
      pickup_type: record.pickup_type,
      drop_off_type: record.drop_off_type,
      shape_dist_traveled: record.shape_dist_traveled ? parseFloat(record.shape_dist_traveled) : undefined,
      timepoint: record.timepoint,
    }));
  }

  /**
   * Parse agency.txt file
   */
  static parseAgencies(csv: string): GTFSAgency[] {
    const records = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    return records.map((record: any) => ({
      agency_id: record.agency_id,
      agency_name: record.agency_name,
      agency_url: record.agency_url,
      agency_timezone: record.agency_timezone,
      agency_lang: record.agency_lang,
      agency_phone: record.agency_phone,
      agency_fare_url: record.agency_fare_url,
      agency_email: record.agency_email,
    }));
  }

  /**
   * Parse calendar.txt file
   */
  static parseCalendar(csv: string): GTFSCalendar[] {
    const records = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    return records.map((record: any) => ({
      service_id: record.service_id,
      monday: record.monday,
      tuesday: record.tuesday,
      wednesday: record.wednesday,
      thursday: record.thursday,
      friday: record.friday,
      saturday: record.saturday,
      sunday: record.sunday,
      start_date: record.start_date,
      end_date: record.end_date,
    }));
  }
}
