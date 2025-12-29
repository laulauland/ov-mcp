import { describe, test, expect } from 'bun:test';
import { GTFSParser } from './parser';

describe('GTFSParser', () => {
  describe('parseStops', () => {
    test('should parse valid stops CSV', () => {
      const csv = `stop_id,stop_code,stop_name,stop_lat,stop_lon,location_type
8400530,530,Rotterdam Centraal,51.9249,4.4690,1
8400561,561,Amsterdam Centraal,52.3791,4.9003,1`;

      const stops = GTFSParser.parseStops(csv);

      expect(stops).toHaveLength(2);
      expect(stops[0].stop_id).toBe('8400530');
      expect(stops[0].stop_name).toBe('Rotterdam Centraal');
      expect(stops[0].stop_lat).toBe(51.9249);
      expect(stops[0].stop_lon).toBe(4.4690);
      expect(stops[0].location_type).toBe('1');
    });

    test('should handle optional fields', () => {
      const csv = `stop_id,stop_name,stop_lat,stop_lon,wheelchair_boarding,platform_code
8400530,Rotterdam Centraal,51.9249,4.4690,1,5a`;

      const stops = GTFSParser.parseStops(csv);

      expect(stops).toHaveLength(1);
      expect(stops[0].wheelchair_boarding).toBe('1');
      expect(stops[0].platform_code).toBe('5a');
    });

    test('should handle empty CSV', () => {
      const csv = `stop_id,stop_name,stop_lat,stop_lon`;
      const stops = GTFSParser.parseStops(csv);
      expect(stops).toHaveLength(0);
    });
  });

  describe('parseRoutes', () => {
    test('should parse valid routes CSV', () => {
      const csv = `route_id,route_short_name,route_long_name,route_type,route_color
IC,IC,Intercity,2,FFCC00
SPR,SPR,Sprinter,2,003082`;

      const routes = GTFSParser.parseRoutes(csv);

      expect(routes).toHaveLength(2);
      expect(routes[0].route_id).toBe('IC');
      expect(routes[0].route_short_name).toBe('IC');
      expect(routes[0].route_long_name).toBe('Intercity');
      expect(routes[0].route_type).toBe('2');
      expect(routes[0].route_color).toBe('FFCC00');
    });

    test('should handle optional route_sort_order', () => {
      const csv = `route_id,route_short_name,route_long_name,route_type,route_sort_order
IC,IC,Intercity,2,100`;

      const routes = GTFSParser.parseRoutes(csv);

      expect(routes).toHaveLength(1);
      expect(routes[0].route_sort_order).toBe(100);
    });
  });

  describe('parseTrips', () => {
    test('should parse valid trips CSV', () => {
      const csv = `route_id,service_id,trip_id,trip_headsign,direction_id
IC,WE,12345,Den Haag Centraal,0
IC,WD,12346,Rotterdam Centraal,1`;

      const trips = GTFSParser.parseTrips(csv);

      expect(trips).toHaveLength(2);
      expect(trips[0].trip_id).toBe('12345');
      expect(trips[0].route_id).toBe('IC');
      expect(trips[0].trip_headsign).toBe('Den Haag Centraal');
      expect(trips[0].direction_id).toBe('0');
    });
  });

  describe('parseStopTimes', () => {
    test('should parse valid stop_times CSV', () => {
      const csv = `trip_id,arrival_time,departure_time,stop_id,stop_sequence
12345,08:00:00,08:00:00,8400530,1
12345,08:30:00,08:30:00,8400561,2`;

      const stopTimes = GTFSParser.parseStopTimes(csv);

      expect(stopTimes).toHaveLength(2);
      expect(stopTimes[0].trip_id).toBe('12345');
      expect(stopTimes[0].arrival_time).toBe('08:00:00');
      expect(stopTimes[0].stop_id).toBe('8400530');
      expect(stopTimes[0].stop_sequence).toBe(1);
      expect(stopTimes[1].stop_sequence).toBe(2);
    });

    test('should handle optional fields', () => {
      const csv = `trip_id,arrival_time,departure_time,stop_id,stop_sequence,shape_dist_traveled
12345,08:00:00,08:00:00,8400530,1,5.5`;

      const stopTimes = GTFSParser.parseStopTimes(csv);

      expect(stopTimes).toHaveLength(1);
      expect(stopTimes[0].shape_dist_traveled).toBe(5.5);
    });
  });

  describe('parseAgencies', () => {
    test('should parse valid agencies CSV', () => {
      const csv = `agency_id,agency_name,agency_url,agency_timezone,agency_lang
NS,Nederlandse Spoorwegen,https://www.ns.nl,Europe/Amsterdam,nl`;

      const agencies = GTFSParser.parseAgencies(csv);

      expect(agencies).toHaveLength(1);
      expect(agencies[0].agency_id).toBe('NS');
      expect(agencies[0].agency_name).toBe('Nederlandse Spoorwegen');
      expect(agencies[0].agency_url).toBe('https://www.ns.nl');
      expect(agencies[0].agency_timezone).toBe('Europe/Amsterdam');
      expect(agencies[0].agency_lang).toBe('nl');
    });
  });

  describe('parseCalendar', () => {
    test('should parse valid calendar CSV', () => {
      const csv = `service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
WD,1,1,1,1,1,0,0,20240101,20241231
WE,0,0,0,0,0,1,1,20240101,20241231`;

      const calendar = GTFSParser.parseCalendar(csv);

      expect(calendar).toHaveLength(2);
      expect(calendar[0].service_id).toBe('WD');
      expect(calendar[0].monday).toBe('1');
      expect(calendar[0].saturday).toBe('0');
      expect(calendar[0].start_date).toBe('20240101');
      expect(calendar[1].service_id).toBe('WE');
      expect(calendar[1].saturday).toBe('1');
    });
  });
});
