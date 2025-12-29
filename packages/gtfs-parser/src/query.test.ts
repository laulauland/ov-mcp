import { describe, test, expect } from 'bun:test';
import { GTFSQuery } from './query';
import type { GTFSStop, GTFSRoute } from './types';

const mockStops: GTFSStop[] = [
  {
    stop_id: '8400530',
    stop_name: 'Rotterdam Centraal',
    stop_lat: 51.9249,
    stop_lon: 4.4690,
    location_type: '1',
  },
  {
    stop_id: '8400561',
    stop_name: 'Amsterdam Centraal',
    stop_lat: 52.3791,
    stop_lon: 4.9003,
    location_type: '1',
  },
  {
    stop_id: '8400258',
    stop_name: 'Utrecht Centraal',
    stop_lat: 52.0889,
    stop_lon: 5.1103,
    location_type: '1',
  },
  {
    stop_id: '8400506',
    stop_name: 'Schiphol Airport',
    stop_lat: 52.3105,
    stop_lon: 4.7683,
    location_type: '1',
  },
];

const mockRoutes: GTFSRoute[] = [
  {
    route_id: 'IC',
    route_short_name: 'IC',
    route_long_name: 'Intercity',
    route_type: '2',
  },
  {
    route_id: 'SPR',
    route_short_name: 'SPR',
    route_long_name: 'Sprinter',
    route_type: '2',
  },
];

describe('GTFSQuery', () => {
  describe('searchStopsByName', () => {
    test('should find stops by exact name', () => {
      const results = GTFSQuery.searchStopsByName(mockStops, 'Rotterdam Centraal');
      
      expect(results).toHaveLength(1);
      expect(results[0].stop_name).toBe('Rotterdam Centraal');
    });

    test('should find stops by partial name (case-insensitive)', () => {
      const results = GTFSQuery.searchStopsByName(mockStops, 'centraal');
      
      expect(results).toHaveLength(3);
      expect(results.map(s => s.stop_name)).toContain('Rotterdam Centraal');
      expect(results.map(s => s.stop_name)).toContain('Amsterdam Centraal');
      expect(results.map(s => s.stop_name)).toContain('Utrecht Centraal');
    });

    test('should respect limit parameter', () => {
      const results = GTFSQuery.searchStopsByName(mockStops, 'centraal', 2);
      
      expect(results).toHaveLength(2);
    });

    test('should return empty array for no matches', () => {
      const results = GTFSQuery.searchStopsByName(mockStops, 'nonexistent');
      
      expect(results).toHaveLength(0);
    });

    test('should handle case variations', () => {
      const results = GTFSQuery.searchStopsByName(mockStops, 'SCHIPHOL');
      
      expect(results).toHaveLength(1);
      expect(results[0].stop_name).toBe('Schiphol Airport');
    });
  });

  describe('findStopsNear', () => {
    test('should find stops within radius', () => {
      // Amsterdam coordinates
      const lat = 52.3791;
      const lon = 4.9003;
      
      const results = GTFSQuery.findStopsNear(mockStops, lat, lon, 50);
      
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].stop_name).toBe('Amsterdam Centraal');
    });

    test('should sort by distance (closest first)', () => {
      // Coordinates between Amsterdam and Utrecht
      const lat = 52.2;
      const lon = 5.0;
      
      const results = GTFSQuery.findStopsNear(mockStops, lat, lon, 100);
      
      expect(results.length).toBeGreaterThan(1);
      // Utrecht should be closer than Amsterdam from this point
      expect(results[0].stop_name).toBe('Utrecht Centraal');
    });

    test('should respect radius limit', () => {
      const lat = 52.3791;
      const lon = 4.9003;
      
      // Very small radius should only find Amsterdam Centraal
      const results = GTFSQuery.findStopsNear(mockStops, lat, lon, 0.1);
      
      expect(results).toHaveLength(1);
      expect(results[0].stop_name).toBe('Amsterdam Centraal');
    });

    test('should respect result limit', () => {
      const lat = 52.3;
      const lon = 5.0;
      
      const results = GTFSQuery.findStopsNear(mockStops, lat, lon, 100, 2);
      
      expect(results.length).toBeLessThanOrEqual(2);
    });

    test('should return empty array when no stops in radius', () => {
      // Middle of the North Sea
      const lat = 53.0;
      const lon = 3.0;
      
      const results = GTFSQuery.findStopsNear(mockStops, lat, lon, 1);
      
      expect(results).toHaveLength(0);
    });
  });

  describe('getStopById', () => {
    test('should find stop by ID', () => {
      const stop = GTFSQuery.getStopById(mockStops, '8400530');
      
      expect(stop).toBeDefined();
      expect(stop?.stop_name).toBe('Rotterdam Centraal');
    });

    test('should return undefined for non-existent ID', () => {
      const stop = GTFSQuery.getStopById(mockStops, 'nonexistent');
      
      expect(stop).toBeUndefined();
    });
  });

  describe('getRouteById', () => {
    test('should find route by ID', () => {
      const route = GTFSQuery.getRouteById(mockRoutes, 'IC');
      
      expect(route).toBeDefined();
      expect(route?.route_long_name).toBe('Intercity');
    });

    test('should return undefined for non-existent ID', () => {
      const route = GTFSQuery.getRouteById(mockRoutes, 'nonexistent');
      
      expect(route).toBeUndefined();
    });
  });
});
