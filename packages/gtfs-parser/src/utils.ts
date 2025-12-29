import type { GTFSStop, GeoPoint, BoundingBox } from './types';

/**
 * Calculate distance between two geographic points using Haversine formula
 * @returns Distance in meters
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Calculate bearing between two points
 * @returns Bearing in degrees (0-360)
 */
export function calculateBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  const θ = Math.atan2(y, x);
  const bearing = ((θ * 180) / Math.PI + 360) % 360;

  return bearing;
}

/**
 * Get destination point given distance and bearing from start point
 */
export function getDestinationPoint(
  lat: number,
  lon: number,
  distanceMeters: number,
  bearing: number
): GeoPoint {
  const R = 6371000; // Earth's radius in meters
  const δ = distanceMeters / R;
  const θ = (bearing * Math.PI) / 180;

  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lon * Math.PI) / 180;

  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ)
  );

  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)
    );

  return {
    latitude: (φ2 * 180) / Math.PI,
    longitude: (λ2 * 180) / Math.PI,
  };
}

/**
 * Create a bounding box around a point
 */
export function createBoundingBox(
  lat: number,
  lon: number,
  radiusMeters: number
): BoundingBox {
  const north = getDestinationPoint(lat, lon, radiusMeters, 0);
  const south = getDestinationPoint(lat, lon, radiusMeters, 180);
  const east = getDestinationPoint(lat, lon, radiusMeters, 90);
  const west = getDestinationPoint(lat, lon, radiusMeters, 270);

  return {
    min_lat: south.latitude,
    max_lat: north.latitude,
    min_lon: west.longitude,
    max_lon: east.longitude,
  };
}

/**
 * Check if a point is within a bounding box
 */
export function isPointInBoundingBox(
  lat: number,
  lon: number,
  bbox: BoundingBox
): boolean {
  return (
    lat >= bbox.min_lat &&
    lat <= bbox.max_lat &&
    lon >= bbox.min_lon &&
    lon <= bbox.max_lon
  );
}

/**
 * Find stops within a radius of a point
 */
export function findStopsNearby(
  stops: GTFSStop[],
  lat: number,
  lon: number,
  radiusMeters: number
): Array<{ stop: GTFSStop; distance: number }> {
  const results: Array<{ stop: GTFSStop; distance: number }> = [];

  for (const stop of stops) {
    const distance = calculateDistance(lat, lon, stop.stop_lat, stop.stop_lon);
    if (distance <= radiusMeters) {
      results.push({ stop, distance });
    }
  }

  // Sort by distance
  results.sort((a, b) => a.distance - b.distance);
  return results;
}

/**
 * Find the closest stop to a point
 */
export function findClosestStop(
  stops: GTFSStop[],
  lat: number,
  lon: number
): { stop: GTFSStop; distance: number } | null {
  let closest: { stop: GTFSStop; distance: number } | null = null;

  for (const stop of stops) {
    const distance = calculateDistance(lat, lon, stop.stop_lat, stop.stop_lon);
    if (!closest || distance < closest.distance) {
      closest = { stop, distance };
    }
  }

  return closest;
}

/**
 * Parse GTFS time format (HH:MM:SS) to minutes since midnight
 * Handles times >= 24:00:00 for trips that continue past midnight
 */
export function parseGTFSTime(timeStr: string): number {
  const [hours, minutes, seconds] = timeStr.split(':').map(Number);
  return hours * 60 + minutes + (seconds || 0) / 60;
}

/**
 * Format minutes since midnight to GTFS time format (HH:MM:SS)
 */
export function formatGTFSTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.floor(minutes % 60);
  const secs = Math.floor(((minutes % 1) * 60));

  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Parse GTFS date format (YYYYMMDD) to Date object
 */
export function parseGTFSDate(dateStr: string): Date {
  const year = parseInt(dateStr.substring(0, 4));
  const month = parseInt(dateStr.substring(4, 6)) - 1; // Month is 0-indexed
  const day = parseInt(dateStr.substring(6, 8));
  return new Date(year, month, day);
}

/**
 * Format Date object to GTFS date format (YYYYMMDD)
 */
export function formatGTFSDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Check if a service is active on a given date
 */
export function isServiceActive(
  calendar: {
    start_date: string;
    end_date: string;
    monday: '0' | '1';
    tuesday: '0' | '1';
    wednesday: '0' | '1';
    thursday: '0' | '1';
    friday: '0' | '1';
    saturday: '0' | '1';
    sunday: '0' | '1';
  },
  date: Date
): boolean {
  const startDate = parseGTFSDate(calendar.start_date);
  const endDate = parseGTFSDate(calendar.end_date);

  if (date < startDate || date > endDate) {
    return false;
  }

  const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const days = [
    calendar.sunday,
    calendar.monday,
    calendar.tuesday,
    calendar.wednesday,
    calendar.thursday,
    calendar.friday,
    calendar.saturday,
  ];

  return days[dayOfWeek] === '1';
}

/**
 * Calculate walking time between two points
 * Assumes average walking speed of 5 km/h
 */
export function calculateWalkingTime(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const distance = calculateDistance(lat1, lon1, lat2, lon2);
  const walkingSpeedMps = 5000 / 3600; // 5 km/h in meters per second
  return Math.ceil(distance / walkingSpeedMps); // Return seconds
}

/**
 * Convert degrees to radians
 */
export function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Convert radians to degrees
 */
export function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

/**
 * Calculate the center point (centroid) of multiple stops
 */
export function calculateCentroid(stops: GTFSStop[]): GeoPoint | null {
  if (stops.length === 0) return null;

  let totalLat = 0;
  let totalLon = 0;

  for (const stop of stops) {
    totalLat += stop.stop_lat;
    totalLon += stop.stop_lon;
  }

  return {
    latitude: totalLat / stops.length,
    longitude: totalLon / stops.length,
  };
}
