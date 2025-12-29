import type { GTFSStop, GTFSRoute, GTFSFeed } from './types';

/**
 * Query utilities for GTFS data
 */
export class GTFSQuery {
  /**
   * Search stops by name (case-insensitive)
   */
  static searchStopsByName(stops: GTFSStop[], query: string, limit = 10): GTFSStop[] {
    const lowerQuery = query.toLowerCase();
    return stops
      .filter(stop => stop.stop_name.toLowerCase().includes(lowerQuery))
      .slice(0, limit);
  }

  /**
   * Find stops near a coordinate (simple distance calculation)
   */
  static findStopsNear(
    stops: GTFSStop[],
    lat: number,
    lon: number,
    radiusKm = 1,
    limit = 10
  ): GTFSStop[] {
    const stopsWithDistance = stops.map(stop => ({
      stop,
      distance: this.calculateDistance(lat, lon, stop.stop_lat, stop.stop_lon),
    }));

    return stopsWithDistance
      .filter(({ distance }) => distance <= radiusKm)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit)
      .map(({ stop }) => stop);
  }

  /**
   * Get stop by ID
   */
  static getStopById(stops: GTFSStop[], stopId: string): GTFSStop | undefined {
    return stops.find(stop => stop.stop_id === stopId);
  }

  /**
   * Get route by ID
   */
  static getRouteById(routes: GTFSRoute[], routeId: string): GTFSRoute | undefined {
    return routes.find(route => route.route_id === routeId);
  }

  /**
   * Calculate distance between two coordinates using Haversine formula
   * Returns distance in kilometers
   */
  private static calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private static toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}
