import type { GTFSStop, GTFSRoute, GTFSFeed, GTFSCalendar } from './types';

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in kilometers
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
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
  if (feed.calendar_dates) {
    const exception = feed.calendar_dates.find(
      cd => cd.service_id === serviceId && cd.date === dateStr
    );

    if (exception) {
      return exception.exception_type === '1'; // 1 = added, 2 = removed
    }
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
