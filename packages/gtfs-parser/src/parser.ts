import { parse } from 'csv-parse';
import { Readable } from 'stream';
import type {
  GTFSStop,
  GTFSRoute,
  GTFSTrip,
  GTFSStopTime,
  GTFSAgency,
  GTFSCalendar,
  GTFSCalendarDate,
  GTFSShape,
  GTFSFrequency,
  GTFSTransfer,
  GTFSFeedInfo,
} from './types';

/**
 * Parse GTFS CSV data with streaming support for memory efficiency
 */
export class GTFSParser {
  /**
   * Parse stops.txt file with streaming support
   */
  static async parseStopsStream(
    stream: Readable,
    onRecord: (stop: GTFSStop) => void | Promise<void>
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const parser = parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
        cast: true,
      });

      stream.pipe(parser);

      parser.on('readable', async function () {
        let record;
        while ((record = parser.read()) !== null) {
          const stop: GTFSStop = {
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
            level_id: record.level_id,
          };
          await onRecord(stop);
        }
      });

      parser.on('error', reject);
      parser.on('end', resolve);
    });
  }

  /**
   * Parse routes.txt file with streaming support
   */
  static async parseRoutesStream(
    stream: Readable,
    onRecord: (route: GTFSRoute) => void | Promise<void>
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const parser = parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
        cast: true,
      });

      stream.pipe(parser);

      parser.on('readable', async function () {
        let record;
        while ((record = parser.read()) !== null) {
          const route: GTFSRoute = {
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
            continuous_pickup: record.continuous_pickup,
            continuous_drop_off: record.continuous_drop_off,
          };
          await onRecord(route);
        }
      });

      parser.on('error', reject);
      parser.on('end', resolve);
    });
  }

  /**
   * Parse trips.txt file with streaming support
   */
  static async parseTripsStream(
    stream: Readable,
    onRecord: (trip: GTFSTrip) => void | Promise<void>
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const parser = parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
        cast: true,
      });

      stream.pipe(parser);

      parser.on('readable', async function () {
        let record;
        while ((record = parser.read()) !== null) {
          const trip: GTFSTrip = {
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
          };
          await onRecord(trip);
        }
      });

      parser.on('error', reject);
      parser.on('end', resolve);
    });
  }

  /**
   * Parse stop_times.txt file with streaming support
   * This is typically the largest file in GTFS feeds
   */
  static async parseStopTimesStream(
    stream: Readable,
    onRecord: (stopTime: GTFSStopTime) => void | Promise<void>
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const parser = parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
        cast: true,
      });

      stream.pipe(parser);

      parser.on('readable', async function () {
        let record;
        while ((record = parser.read()) !== null) {
          const stopTime: GTFSStopTime = {
            trip_id: record.trip_id,
            arrival_time: record.arrival_time,
            departure_time: record.departure_time,
            stop_id: record.stop_id,
            stop_sequence: parseInt(record.stop_sequence),
            stop_headsign: record.stop_headsign,
            pickup_type: record.pickup_type,
            drop_off_type: record.drop_off_type,
            shape_dist_traveled: record.shape_dist_traveled
              ? parseFloat(record.shape_dist_traveled)
              : undefined,
            timepoint: record.timepoint,
            continuous_pickup: record.continuous_pickup,
            continuous_drop_off: record.continuous_drop_off,
          };
          await onRecord(stopTime);
        }
      });

      parser.on('error', reject);
      parser.on('end', resolve);
    });
  }

  /**
   * Parse calendar.txt file with streaming support
   */
  static async parseCalendarStream(
    stream: Readable,
    onRecord: (calendar: GTFSCalendar) => void | Promise<void>
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const parser = parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
        cast: true,
      });

      stream.pipe(parser);

      parser.on('readable', async function () {
        let record;
        while ((record = parser.read()) !== null) {
          const calendar: GTFSCalendar = {
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
          };
          await onRecord(calendar);
        }
      });

      parser.on('error', reject);
      parser.on('end', resolve);
    });
  }

  /**
   * Parse calendar_dates.txt file with streaming support
   */
  static async parseCalendarDatesStream(
    stream: Readable,
    onRecord: (calendarDate: GTFSCalendarDate) => void | Promise<void>
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const parser = parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
        cast: true,
      });

      stream.pipe(parser);

      parser.on('readable', async function () {
        let record;
        while ((record = parser.read()) !== null) {
          const calendarDate: GTFSCalendarDate = {
            service_id: record.service_id,
            date: record.date,
            exception_type: record.exception_type,
          };
          await onRecord(calendarDate);
        }
      });

      parser.on('error', reject);
      parser.on('end', resolve);
    });
  }

  /**
   * Parse shapes.txt file with streaming support
   */
  static async parseShapesStream(
    stream: Readable,
    onRecord: (shape: GTFSShape) => void | Promise<void>
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const parser = parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
        cast: true,
      });

      stream.pipe(parser);

      parser.on('readable', async function () {
        let record;
        while ((record = parser.read()) !== null) {
          const shape: GTFSShape = {
            shape_id: record.shape_id,
            shape_pt_lat: parseFloat(record.shape_pt_lat),
            shape_pt_lon: parseFloat(record.shape_pt_lon),
            shape_pt_sequence: parseInt(record.shape_pt_sequence),
            shape_dist_traveled: record.shape_dist_traveled
              ? parseFloat(record.shape_dist_traveled)
              : undefined,
          };
          await onRecord(shape);
        }
      });

      parser.on('error', reject);
      parser.on('end', resolve);
    });
  }

  /**
   * Parse transfers.txt file with streaming support
   */
  static async parseTransfersStream(
    stream: Readable,
    onRecord: (transfer: GTFSTransfer) => void | Promise<void>
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const parser = parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
        cast: true,
      });

      stream.pipe(parser);

      parser.on('readable', async function () {
        let record;
        while ((record = parser.read()) !== null) {
          const transfer: GTFSTransfer = {
            from_stop_id: record.from_stop_id,
            to_stop_id: record.to_stop_id,
            transfer_type: record.transfer_type,
            min_transfer_time: record.min_transfer_time
              ? parseInt(record.min_transfer_time)
              : undefined,
          };
          await onRecord(transfer);
        }
      });

      parser.on('error', reject);
      parser.on('end', resolve);
    });
  }

  /**
   * Parse agencies.txt file with streaming support
   */
  static async parseAgenciesStream(
    stream: Readable,
    onRecord: (agency: GTFSAgency) => void | Promise<void>
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const parser = parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
        cast: true,
      });

      stream.pipe(parser);

      parser.on('readable', async function () {
        let record;
        while ((record = parser.read()) !== null) {
          const agency: GTFSAgency = {
            agency_id: record.agency_id,
            agency_name: record.agency_name,
            agency_url: record.agency_url,
            agency_timezone: record.agency_timezone,
            agency_lang: record.agency_lang,
            agency_phone: record.agency_phone,
            agency_fare_url: record.agency_fare_url,
            agency_email: record.agency_email,
          };
          await onRecord(agency);
        }
      });

      parser.on('error', reject);
      parser.on('end', resolve);
    });
  }
}
