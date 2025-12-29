import type { GTFSData, Stop, Journey, RealtimeInfo } from "./types.js";
import { logger } from "./logger.js";

/**
 * Find stops matching a search query
 */
export async function findStops(
  args: any,
  gtfsData: GTFSData
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const query = (args.query as string).toLowerCase().trim();
  const limit = Math.min((args.limit as number) || 10, 50);

  logger.info(`Searching for stops matching: ${query}`);

  // Search stops
  const matchingStops = gtfsData.stops
    .filter((stop) => {
      const name = stop.stop_name?.toLowerCase() || "";
      const code = stop.stop_code?.toLowerCase() || "";
      const id = stop.stop_id?.toLowerCase() || "";
      
      return name.includes(query) || code.includes(query) || id.includes(query);
    })
    .slice(0, limit);

  if (matchingStops.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: `No stops found matching "${query}". Try a different search term or check spelling.`,
        },
      ],
    };
  }

  // Format results
  const results = matchingStops.map((stop) => {
    return [
      `🚉 ${stop.stop_name}`,
      `   ID: ${stop.stop_id}`,
      stop.stop_code ? `   Code: ${stop.stop_code}` : null,
      `   Location: ${stop.stop_lat}, ${stop.stop_lon}`,
      stop.platform_code ? `   Platform: ${stop.platform_code}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  });

  const text = [
    `Found ${matchingStops.length} stop(s) matching "${query}":\n`,
    ...results,
  ].join("\n\n");

  return {
    content: [{ type: "text", text }],
  };
}

/**
 * Plan a journey between two stops
 */
export async function planJourney(
  args: any,
  gtfsData: GTFSData
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const from = (args.from as string).toLowerCase().trim();
  const to = (args.to as string).toLowerCase().trim();
  const date = args.date as string | undefined;
  const time = args.time as string | undefined;

  logger.info(`Planning journey from ${from} to ${to}`);

  // Find origin stop
  const originStop = gtfsData.stops.find(
    (s) =>
      s.stop_id?.toLowerCase() === from ||
      s.stop_name?.toLowerCase().includes(from)
  );

  if (!originStop) {
    return {
      content: [
        {
          type: "text",
          text: `Could not find origin stop "${from}". Use the 'find_stops' tool to search for the correct stop name or ID.`,
        },
      ],
    };
  }

  // Find destination stop
  const destStop = gtfsData.stops.find(
    (s) =>
      s.stop_id?.toLowerCase() === to ||
      s.stop_name?.toLowerCase().includes(to)
  );

  if (!destStop) {
    return {
      content: [
        {
          type: "text",
          text: `Could not find destination stop "${to}". Use the 'find_stops' tool to search for the correct stop name or ID.`,
        },
      ],
    };
  }

  // Find trips connecting these stops
  const connections = findConnections(
    originStop.stop_id,
    destStop.stop_id,
    gtfsData
  );

  if (connections.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: `No direct connections found between ${originStop.stop_name} and ${destStop.stop_name}. You may need to transfer.`,
        },
      ],
    };
  }

  // Format results
  const results = connections.slice(0, 5).map((conn, idx) => {
    const route = gtfsData.routes.find((r) => r.route_id === conn.routeId);
    return [
      `${idx + 1}. ${route?.route_long_name || route?.route_short_name || "Unknown Route"}`,
      `   Departure: ${conn.departureTime} from ${originStop.stop_name}`,
      `   Arrival: ${conn.arrivalTime} at ${destStop.stop_name}`,
      `   Duration: ${conn.duration}`,
    ].join("\n");
  });

  const text = [
    `Journey from ${originStop.stop_name} to ${destStop.stop_name}:\n`,
    ...results,
    `\nNote: Showing ${Math.min(connections.length, 5)} of ${connections.length} available connections.`,
  ].join("\n\n");

  return {
    content: [{ type: "text", text }],
  };
}

/**
 * Get real-time departure information
 */
export async function getRealtimeInfo(
  args: any,
  gtfsData: GTFSData
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const stopId = (args.stop_id as string).toLowerCase().trim();
  const limit = Math.min((args.limit as number) || 5, 20);

  logger.info(`Getting realtime info for stop: ${stopId}`);

  // Find stop
  const stop = gtfsData.stops.find(
    (s) =>
      s.stop_id?.toLowerCase() === stopId ||
      s.stop_name?.toLowerCase().includes(stopId)
  );

  if (!stop) {
    return {
      content: [
        {
          type: "text",
          text: `Could not find stop "${stopId}". Use the 'find_stops' tool to search for the correct stop name or ID.`,
        },
      ],
    };
  }

  // Find upcoming departures
  const departures = getUpcomingDepartures(stop.stop_id, gtfsData, limit);

  if (departures.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: `No upcoming departures found for ${stop.stop_name}. This could mean the stop is not in service or schedule data is unavailable.`,
        },
      ],
    };
  }

  // Format results
  const results = departures.map((dep) => {
    const route = gtfsData.routes.find((r) => r.route_id === dep.routeId);
    return [
      `🚊 ${route?.route_short_name || dep.routeId} → ${dep.headsign}`,
      `   Departure: ${dep.departureTime}`,
      dep.platform ? `   Platform: ${dep.platform}` : null,
      dep.delay ? `   ⚠️  Delay: ${dep.delay} minutes` : null,
    ]
      .filter(Boolean)
      .join("\n");
  });

  const text = [
    `📍 ${stop.stop_name}`,
    `Upcoming departures:\n`,
    ...results,
  ].join("\n\n");

  return {
    content: [{ type: "text", text }],
  };
}

// Helper functions

interface Connection {
  routeId: string;
  departureTime: string;
  arrivalTime: string;
  duration: string;
}

function findConnections(
  fromStopId: string,
  toStopId: string,
  gtfsData: GTFSData
): Connection[] {
  const connections: Connection[] = [];

  // Find all trips that stop at both locations
  const tripsAtOrigin = new Set(
    gtfsData.stopTimes
      .filter((st) => st.stop_id === fromStopId)
      .map((st) => st.trip_id)
  );

  for (const tripId of tripsAtOrigin) {
    const tripStops = gtfsData.stopTimes
      .filter((st) => st.trip_id === tripId)
      .sort((a, b) => (a.stop_sequence || 0) - (b.stop_sequence || 0));

    const originIdx = tripStops.findIndex((st) => st.stop_id === fromStopId);
    const destIdx = tripStops.findIndex((st) => st.stop_id === toStopId);

    // Check if destination comes after origin
    if (originIdx !== -1 && destIdx !== -1 && destIdx > originIdx) {
      const trip = gtfsData.trips.find((t) => t.trip_id === tripId);
      if (trip) {
        const origin = tripStops[originIdx];
        const dest = tripStops[destIdx];
        
        connections.push({
          routeId: trip.route_id,
          departureTime: origin.departure_time || "Unknown",
          arrivalTime: dest.arrival_time || "Unknown",
          duration: calculateDuration(
            origin.departure_time,
            dest.arrival_time
          ),
        });
      }
    }
  }

  return connections;
}

interface Departure {
  routeId: string;
  headsign: string;
  departureTime: string;
  platform?: string;
  delay?: number;
}

function getUpcomingDepartures(
  stopId: string,
  gtfsData: GTFSData,
  limit: number
): Departure[] {
  const now = new Date();
  const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:00`;

  const departures: Departure[] = gtfsData.stopTimes
    .filter((st) => st.stop_id === stopId && st.departure_time >= currentTime)
    .slice(0, limit)
    .map((st) => {
      const trip = gtfsData.trips.find((t) => t.trip_id === st.trip_id);
      return {
        routeId: trip?.route_id || "Unknown",
        headsign: trip?.trip_headsign || "Unknown",
        departureTime: st.departure_time || "Unknown",
        platform: st.stop_headsign || undefined,
      };
    });

  return departures;
}

function calculateDuration(
  departureTime?: string,
  arrivalTime?: string
): string {
  if (!departureTime || !arrivalTime) return "Unknown";

  const [dh, dm] = departureTime.split(":").map(Number);
  const [ah, am] = arrivalTime.split(":").map(Number);

  const departureMinutes = dh * 60 + dm;
  const arrivalMinutes = ah * 60 + am;
  const durationMinutes = arrivalMinutes - departureMinutes;

  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}
