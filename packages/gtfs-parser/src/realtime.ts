import type {
  GTFSRealtimeFeedMessage,
  GTFSRealtimeTripUpdate,
  GTFSRealtimeVehiclePosition,
  GTFSRealtimeAlert,
} from './types';

/**
 * GTFS-Realtime Protocol Buffer parser
 * 
 * This module provides utilities for parsing GTFS-Realtime feeds.
 * Note: For full Protocol Buffer support, you'll need to install protobufjs:
 * npm install protobufjs
 * 
 * And download the GTFS-Realtime .proto file from:
 * https://github.com/google/transit/blob/master/gtfs-realtime/proto/gtfs-realtime.proto
 */

/**
 * Parse GTFS-Realtime Protocol Buffer data
 * 
 * @param buffer - Binary Protocol Buffer data
 * @returns Parsed GTFS-Realtime feed message
 */
export async function parseRealtimeFeed(buffer: ArrayBuffer): Promise<GTFSRealtimeFeedMessage> {
  // This is a placeholder implementation
  // In production, you would use protobufjs to parse the Protocol Buffer
  
  // Example with protobufjs (commented out):
  /*
  import protobuf from 'protobufjs';
  
  const root = await protobuf.load('gtfs-realtime.proto');
  const FeedMessage = root.lookupType('transit_realtime.FeedMessage');
  const message = FeedMessage.decode(new Uint8Array(buffer));
  return message as unknown as GTFSRealtimeFeedMessage;
  */

  throw new Error(
    'Protocol Buffer parsing not implemented. Install protobufjs and load gtfs-realtime.proto'
  );
}

/**
 * Filter trip updates from realtime feed
 */
export function filterTripUpdates(
  feed: GTFSRealtimeFeedMessage
): GTFSRealtimeTripUpdate[] {
  return feed.entity
    .filter((entity) => entity.trip_update && !entity.is_deleted)
    .map((entity) => entity.trip_update!);
}

/**
 * Filter vehicle positions from realtime feed
 */
export function filterVehiclePositions(
  feed: GTFSRealtimeFeedMessage
): GTFSRealtimeVehiclePosition[] {
  return feed.entity
    .filter((entity) => entity.vehicle && !entity.is_deleted)
    .map((entity) => entity.vehicle!);
}

/**
 * Filter service alerts from realtime feed
 */
export function filterAlerts(feed: GTFSRealtimeFeedMessage): GTFSRealtimeAlert[] {
  return feed.entity
    .filter((entity) => entity.alert && !entity.is_deleted)
    .map((entity) => entity.alert!);
}

/**
 * Get trip updates for a specific route
 */
export function getTripUpdatesForRoute(
  feed: GTFSRealtimeFeedMessage,
  routeId: string
): GTFSRealtimeTripUpdate[] {
  return filterTripUpdates(feed).filter(
    (update) => update.trip.route_id === routeId
  );
}

/**
 * Get vehicle positions for a specific route
 */
export function getVehiclePositionsForRoute(
  feed: GTFSRealtimeFeedMessage,
  routeId: string
): GTFSRealtimeVehiclePosition[] {
  return filterVehiclePositions(feed).filter(
    (vehicle) => vehicle.trip?.route_id === routeId
  );
}

/**
 * Get alerts affecting a specific stop
 */
export function getAlertsForStop(
  feed: GTFSRealtimeFeedMessage,
  stopId: string
): GTFSRealtimeAlert[] {
  return filterAlerts(feed).filter((alert) =>
    alert.informed_entity?.some((entity) => entity.stop_id === stopId)
  );
}

/**
 * Calculate delay for a stop time update
 */
export function calculateDelay(
  stopTimeUpdate: { arrival?: { delay?: number }; departure?: { delay?: number } }
): number {
  return stopTimeUpdate.departure?.delay || stopTimeUpdate.arrival?.delay || 0;
}

/**
 * Check if a trip is cancelled
 */
export function isTripCancelled(tripUpdate: GTFSRealtimeTripUpdate): boolean {
  return tripUpdate.trip.schedule_relationship === 'CANCELED';
}

/**
 * Fetch GTFS-Realtime feed from URL
 */
export async function fetchRealtimeFeed(url: string): Promise<GTFSRealtimeFeedMessage> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch realtime feed: ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  return parseRealtimeFeed(buffer);
}

/**
 * Merge realtime updates with static GTFS data
 * This updates arrival/departure times with realtime delays
 */
export function applyRealtimeUpdates<T extends { trip_id: string; arrival_time: string; departure_time: string }>(
  stopTimes: T[],
  tripUpdates: GTFSRealtimeTripUpdate[]
): T[] {
  const updatesMap = new Map<string, GTFSRealtimeTripUpdate>();
  for (const update of tripUpdates) {
    if (update.trip.trip_id) {
      updatesMap.set(update.trip.trip_id, update);
    }
  }

  return stopTimes.map((stopTime) => {
    const update = updatesMap.get(stopTime.trip_id);
    if (!update) return stopTime;

    // Find matching stop time update
    const stopUpdate = update.stop_time_update.find(
      (stu) => stu.stop_id === (stopTime as any).stop_id
    );

    if (!stopUpdate) return stopTime;

    // Apply delays (convert seconds to HH:MM:SS format)
    const arrivalDelay = stopUpdate.arrival?.delay || 0;
    const departureDelay = stopUpdate.departure?.delay || 0;

    return {
      ...stopTime,
      arrival_time: addSecondsToTime(stopTime.arrival_time, arrivalDelay),
      departure_time: addSecondsToTime(stopTime.departure_time, departureDelay),
    };
  });
}

/**
 * Add seconds to a time string (HH:MM:SS)
 */
function addSecondsToTime(timeStr: string, seconds: number): string {
  const [hours, minutes, secs] = timeStr.split(':').map(Number);
  const totalSeconds = hours * 3600 + minutes * 60 + secs + seconds;

  const newHours = Math.floor(totalSeconds / 3600);
  const newMinutes = Math.floor((totalSeconds % 3600) / 60);
  const newSeconds = totalSeconds % 60;

  return `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}:${String(newSeconds).padStart(2, '0')}`;
}
