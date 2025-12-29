/**
 * GTFS Realtime parser for Cloudflare Workers
 * Handles protobuf parsing for realtime transit feeds
 * Browser-compatible implementation without Node.js dependencies
 */

export interface GtfsRealtimeVehiclePosition {
  trip?: {
    trip_id?: string;
    route_id?: string;
    direction_id?: number;
    start_time?: string;
    start_date?: string;
  };
  vehicle?: {
    id?: string;
    label?: string;
    license_plate?: string;
  };
  position?: {
    latitude: number;
    longitude: number;
    bearing?: number;
    speed?: number;
  };
  current_stop_sequence?: number;
  stop_id?: string;
  current_status?: number;
  timestamp?: number;
  congestion_level?: number;
  occupancy_status?: number;
}

export interface GtfsRealtimeTripUpdate {
  trip: {
    trip_id?: string;
    route_id?: string;
    direction_id?: number;
    start_time?: string;
    start_date?: string;
  };
  vehicle?: {
    id?: string;
    label?: string;
  };
  stop_time_update?: Array<{
    stop_sequence?: number;
    stop_id?: string;
    arrival?: {
      delay?: number;
      time?: number;
    };
    departure?: {
      delay?: number;
      time?: number;
    };
    schedule_relationship?: number;
  }>;
  timestamp?: number;
  delay?: number;
}

export interface GtfsRealtimeAlert {
  active_period?: Array<{
    start?: number;
    end?: number;
  }>;
  informed_entity?: Array<{
    agency_id?: string;
    route_id?: string;
    route_type?: number;
    trip?: {
      trip_id?: string;
      route_id?: string;
    };
    stop_id?: string;
  }>;
  cause?: number;
  effect?: number;
  url?: {
    translation: Array<{
      text: string;
      language?: string;
    }>;
  };
  header_text?: {
    translation: Array<{
      text: string;
      language?: string;
    }>;
  };
  description_text?: {
    translation: Array<{
      text: string;
      language?: string;
    }>;
  };
}

export interface GtfsRealtimeFeed {
  header: {
    gtfs_realtime_version: string;
    incrementality?: number;
    timestamp?: number;
  };
  entity: Array<{
    id: string;
    is_deleted?: boolean;
    trip_update?: GtfsRealtimeTripUpdate;
    vehicle?: GtfsRealtimeVehiclePosition;
    alert?: GtfsRealtimeAlert;
  }>;
}

/**
 * Minimal protobuf decoder for GTFS Realtime
 * Supports only the subset needed for transit data
 */
class ProtobufDecoder {
  private buffer: Uint8Array;
  private pos: number = 0;

  constructor(buffer: Uint8Array) {
    this.buffer = buffer;
  }

  private readVarint(): number {
    let result = 0;
    let shift = 0;
    
    while (this.pos < this.buffer.length) {
      const byte = this.buffer[this.pos++];
      result |= (byte & 0x7f) << shift;
      
      if ((byte & 0x80) === 0) {
        return result >>> 0; // Convert to unsigned
      }
      
      shift += 7;
    }
    
    throw new Error('Malformed varint');
  }

  private readBytes(length: number): Uint8Array {
    const bytes = this.buffer.slice(this.pos, this.pos + length);
    this.pos += length;
    return bytes;
  }

  private readString(length: number): string {
    const bytes = this.readBytes(length);
    return new TextDecoder().decode(bytes);
  }

  private readField(): { tag: number; wireType: number; value: any } | null {
    if (this.pos >= this.buffer.length) {
      return null;
    }

    const key = this.readVarint();
    const tag = key >>> 3;
    const wireType = key & 0x07;

    let value: any;

    switch (wireType) {
      case 0: // Varint
        value = this.readVarint();
        break;
      case 1: // 64-bit
        value = this.readBytes(8);
        break;
      case 2: // Length-delimited
        const length = this.readVarint();
        value = this.readBytes(length);
        break;
      case 5: // 32-bit
        value = this.readBytes(4);
        break;
      default:
        throw new Error(`Unknown wire type: ${wireType}`);
    }

    return { tag, wireType, value };
  }

  decodeMessage(): Record<number, any[]> {
    const message: Record<number, any[]> = {};

    while (this.pos < this.buffer.length) {
      const field = this.readField();
      if (!field) break;

      if (!message[field.tag]) {
        message[field.tag] = [];
      }
      message[field.tag].push(field.value);
    }

    return message;
  }

  static decode(buffer: Uint8Array): Record<number, any[]> {
    const decoder = new ProtobufDecoder(buffer);
    return decoder.decodeMessage();
  }
}

/**
 * Parse GTFS Realtime FeedMessage from protobuf binary data
 */
export function parseGtfsRealtimeFeed(buffer: ArrayBuffer): GtfsRealtimeFeed {
  const uint8Array = new Uint8Array(buffer);
  const message = ProtobufDecoder.decode(uint8Array);

  // FeedMessage structure:
  // 1: FeedHeader (message)
  // 2: FeedEntity (repeated message)

  const header = message[1]?.[0] ? parseHeader(message[1][0]) : { gtfs_realtime_version: '2.0' };
  const entities = (message[2] || []).map(parseEntity);

  return {
    header,
    entity: entities,
  };
}

function parseHeader(buffer: Uint8Array): GtfsRealtimeFeed['header'] {
  const message = ProtobufDecoder.decode(buffer);
  
  return {
    gtfs_realtime_version: message[1]?.[0] ? new TextDecoder().decode(message[1][0]) : '2.0',
    incrementality: message[2]?.[0],
    timestamp: message[3]?.[0],
  };
}

function parseEntity(buffer: Uint8Array): GtfsRealtimeFeed['entity'][0] {
  const message = ProtobufDecoder.decode(buffer);
  
  return {
    id: message[1]?.[0] ? new TextDecoder().decode(message[1][0]) : '',
    is_deleted: message[2]?.[0] === 1,
    trip_update: message[3]?.[0] ? parseTripUpdate(message[3][0]) : undefined,
    vehicle: message[4]?.[0] ? parseVehiclePosition(message[4][0]) : undefined,
    alert: message[5]?.[0] ? parseAlert(message[5][0]) : undefined,
  };
}

function parseTripUpdate(buffer: Uint8Array): GtfsRealtimeTripUpdate {
  const message = ProtobufDecoder.decode(buffer);
  
  return {
    trip: message[1]?.[0] ? parseTripDescriptor(message[1][0]) : { trip_id: '' },
    vehicle: message[3]?.[0] ? parseVehicleDescriptor(message[3][0]) : undefined,
    stop_time_update: (message[2] || []).map(parseStopTimeUpdate),
    timestamp: message[4]?.[0],
    delay: message[5]?.[0],
  };
}

function parseVehiclePosition(buffer: Uint8Array): GtfsRealtimeVehiclePosition {
  const message = ProtobufDecoder.decode(buffer);
  
  return {
    trip: message[1]?.[0] ? parseTripDescriptor(message[1][0]) : undefined,
    vehicle: message[8]?.[0] ? parseVehicleDescriptor(message[8][0]) : undefined,
    position: message[2]?.[0] ? parsePosition(message[2][0]) : undefined,
    current_stop_sequence: message[3]?.[0],
    stop_id: message[7]?.[0] ? new TextDecoder().decode(message[7][0]) : undefined,
    current_status: message[4]?.[0],
    timestamp: message[5]?.[0],
    congestion_level: message[6]?.[0],
    occupancy_status: message[9]?.[0],
  };
}

function parseAlert(buffer: Uint8Array): GtfsRealtimeAlert {
  const message = ProtobufDecoder.decode(buffer);
  
  return {
    active_period: (message[1] || []).map(parseTimeRange),
    informed_entity: (message[5] || []).map(parseEntitySelector),
    cause: message[6]?.[0],
    effect: message[7]?.[0],
    url: message[8]?.[0] ? parseTranslatedString(message[8][0]) : undefined,
    header_text: message[10]?.[0] ? parseTranslatedString(message[10][0]) : undefined,
    description_text: message[11]?.[0] ? parseTranslatedString(message[11][0]) : undefined,
  };
}

function parseTripDescriptor(buffer: Uint8Array) {
  const message = ProtobufDecoder.decode(buffer);
  
  return {
    trip_id: message[1]?.[0] ? new TextDecoder().decode(message[1][0]) : undefined,
    route_id: message[5]?.[0] ? new TextDecoder().decode(message[5][0]) : undefined,
    direction_id: message[6]?.[0],
    start_time: message[2]?.[0] ? new TextDecoder().decode(message[2][0]) : undefined,
    start_date: message[3]?.[0] ? new TextDecoder().decode(message[3][0]) : undefined,
  };
}

function parseVehicleDescriptor(buffer: Uint8Array) {
  const message = ProtobufDecoder.decode(buffer);
  
  return {
    id: message[1]?.[0] ? new TextDecoder().decode(message[1][0]) : undefined,
    label: message[2]?.[0] ? new TextDecoder().decode(message[2][0]) : undefined,
    license_plate: message[3]?.[0] ? new TextDecoder().decode(message[3][0]) : undefined,
  };
}

function parsePosition(buffer: Uint8Array) {
  const message = ProtobufDecoder.decode(buffer);
  
  // Parse float from bytes
  const lat = message[1]?.[0] ? parseFloat32(message[1][0]) : 0;
  const lon = message[2]?.[0] ? parseFloat32(message[2][0]) : 0;
  
  return {
    latitude: lat,
    longitude: lon,
    bearing: message[3]?.[0] ? parseFloat32(message[3][0]) : undefined,
    speed: message[4]?.[0] ? parseFloat32(message[4][0]) : undefined,
  };
}

function parseStopTimeUpdate(buffer: Uint8Array) {
  const message = ProtobufDecoder.decode(buffer);
  
  return {
    stop_sequence: message[1]?.[0],
    stop_id: message[4]?.[0] ? new TextDecoder().decode(message[4][0]) : undefined,
    arrival: message[2]?.[0] ? parseStopTimeEvent(message[2][0]) : undefined,
    departure: message[3]?.[0] ? parseStopTimeEvent(message[3][0]) : undefined,
    schedule_relationship: message[5]?.[0],
  };
}

function parseStopTimeEvent(buffer: Uint8Array) {
  const message = ProtobufDecoder.decode(buffer);
  
  return {
    delay: message[1]?.[0],
    time: message[2]?.[0],
  };
}

function parseTimeRange(buffer: Uint8Array) {
  const message = ProtobufDecoder.decode(buffer);
  
  return {
    start: message[1]?.[0],
    end: message[2]?.[0],
  };
}

function parseEntitySelector(buffer: Uint8Array) {
  const message = ProtobufDecoder.decode(buffer);
  
  return {
    agency_id: message[1]?.[0] ? new TextDecoder().decode(message[1][0]) : undefined,
    route_id: message[2]?.[0] ? new TextDecoder().decode(message[2][0]) : undefined,
    route_type: message[3]?.[0],
    trip: message[4]?.[0] ? parseTripDescriptor(message[4][0]) : undefined,
    stop_id: message[5]?.[0] ? new TextDecoder().decode(message[5][0]) : undefined,
  };
}

function parseTranslatedString(buffer: Uint8Array) {
  const message = ProtobufDecoder.decode(buffer);
  
  return {
    translation: (message[1] || []).map((trans: Uint8Array) => {
      const transMsg = ProtobufDecoder.decode(trans);
      return {
        text: transMsg[1]?.[0] ? new TextDecoder().decode(transMsg[1][0]) : '',
        language: transMsg[2]?.[0] ? new TextDecoder().decode(transMsg[2][0]) : undefined,
      };
    }),
  };
}

function parseFloat32(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, 4);
  return view.getFloat32(0, true); // Little endian
}

/**
 * Fetch and parse GTFS Realtime feed from URL
 */
export async function fetchGtfsRealtimeFeed(url: string): Promise<GtfsRealtimeFeed> {
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch GTFS Realtime feed: ${response.status} ${response.statusText}`);
  }
  
  const buffer = await response.arrayBuffer();
  return parseGtfsRealtimeFeed(buffer);
}

/**
 * Filter vehicle positions by route
 */
export function filterVehiclesByRoute(
  feed: GtfsRealtimeFeed,
  routeId: string
): GtfsRealtimeVehiclePosition[] {
  return feed.entity
    .filter(entity => entity.vehicle?.trip?.route_id === routeId)
    .map(entity => entity.vehicle!)
    .filter(Boolean);
}

/**
 * Filter trip updates by route
 */
export function filterTripUpdatesByRoute(
  feed: GtfsRealtimeFeed,
  routeId: string
): GtfsRealtimeTripUpdate[] {
  return feed.entity
    .filter(entity => entity.trip_update?.trip?.route_id === routeId)
    .map(entity => entity.trip_update!)
    .filter(Boolean);
}

/**
 * Get delays for a specific stop
 */
export function getStopDelays(
  feed: GtfsRealtimeFeed,
  stopId: string
): Array<{ tripId: string; routeId: string; arrivalDelay?: number; departureDelay?: number }> {
  const delays: Array<{ tripId: string; routeId: string; arrivalDelay?: number; departureDelay?: number }> = [];

  for (const entity of feed.entity) {
    if (!entity.trip_update) continue;

    const trip = entity.trip_update.trip;
    const stopUpdates = entity.trip_update.stop_time_update || [];

    for (const update of stopUpdates) {
      if (update.stop_id === stopId) {
        delays.push({
          tripId: trip.trip_id || '',
          routeId: trip.route_id || '',
          arrivalDelay: update.arrival?.delay,
          departureDelay: update.departure?.delay,
        });
      }
    }
  }

  return delays;
}

/**
 * Get active alerts for a route
 */
export function getRouteAlerts(
  feed: GtfsRealtimeFeed,
  routeId: string
): GtfsRealtimeAlert[] {
  return feed.entity
    .filter(entity => {
      if (!entity.alert) return false;
      
      const informedEntities = entity.alert.informed_entity || [];
      return informedEntities.some(e => e.route_id === routeId);
    })
    .map(entity => entity.alert!)
    .filter(Boolean);
}
