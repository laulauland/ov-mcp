import type {
  GTFSStop,
  GTFSRoute,
  GTFSTrip,
  GTFSStopTime,
  GTFSTransfer,
  Journey,
  Connection,
  RouteSegment,
} from './types';
import { calculateDistance, parseGTFSTime } from './utils';

/**
 * Graph node for journey planning
 */
interface GraphNode {
  stop_id: string;
  time: number; // minutes since midnight
  trip_id?: string;
  cost: number; // total cost to reach this node
  previous?: GraphNode;
  connection?: Connection;
}

/**
 * Journey planner using graph-based routing with Dijkstra's algorithm
 */
export class JourneyPlanner {
  private stops: Map<string, GTFSStop>;
  private routes: Map<string, GTFSRoute>;
  private trips: Map<string, GTFSTrip>;
  private stopTimes: GTFSStopTime[];
  private transfers: Map<string, GTFSTransfer[]>;
  private stopsGraph: Map<string, RouteSegment[]>;

  constructor(
    stops: GTFSStop[],
    routes: GTFSRoute[],
    trips: GTFSTrip[],
    stopTimes: GTFSStopTime[],
    transfers: GTFSTransfer[] = []
  ) {
    this.stops = new Map(stops.map((s) => [s.stop_id, s]));
    this.routes = new Map(routes.map((r) => [r.route_id, r]));
    this.trips = new Map(trips.map((t) => [t.trip_id, t]));
    this.stopTimes = stopTimes;
    this.transfers = this.buildTransfersMap(transfers);
    this.stopsGraph = this.buildStopsGraph();
  }

  /**
   * Build a map of transfers from each stop
   */
  private buildTransfersMap(transfers: GTFSTransfer[]): Map<string, GTFSTransfer[]> {
    const map = new Map<string, GTFSTransfer[]>();
    for (const transfer of transfers) {
      if (!map.has(transfer.from_stop_id)) {
        map.set(transfer.from_stop_id, []);
      }
      map.get(transfer.from_stop_id)!.push(transfer);
    }
    return map;
  }

  /**
   * Build a graph of stop connections from stop times
   */
  private buildStopsGraph(): Map<string, RouteSegment[]> {
    const graph = new Map<string, RouteSegment[]>();

    // Group stop times by trip
    const tripStopTimes = new Map<string, GTFSStopTime[]>();
    for (const stopTime of this.stopTimes) {
      if (!tripStopTimes.has(stopTime.trip_id)) {
        tripStopTimes.set(stopTime.trip_id, []);
      }
      tripStopTimes.get(stopTime.trip_id)!.push(stopTime);
    }

    // Create edges between consecutive stops in each trip
    for (const [tripId, stopTimes] of tripStopTimes) {
      // Sort by stop sequence
      stopTimes.sort((a, b) => a.stop_sequence - b.stop_sequence);

      for (let i = 0; i < stopTimes.length - 1; i++) {
        const from = stopTimes[i];
        const to = stopTimes[i + 1];

        const fromStop = this.stops.get(from.stop_id);
        const toStop = this.stops.get(to.stop_id);

        if (!fromStop || !toStop) continue;

        const distance = calculateDistance(
          fromStop.stop_lat,
          fromStop.stop_lon,
          toStop.stop_lat,
          toStop.stop_lon
        );

        const departureMinutes = parseGTFSTime(from.departure_time);
        const arrivalMinutes = parseGTFSTime(to.arrival_time);
        const travelTime = arrivalMinutes - departureMinutes;

        const segment: RouteSegment = {
          from_stop_id: from.stop_id,
          to_stop_id: to.stop_id,
          distance_meters: distance,
          travel_time_seconds: travelTime * 60,
          trip_id: tripId,
        };

        if (!graph.has(from.stop_id)) {
          graph.set(from.stop_id, []);
        }
        graph.get(from.stop_id)!.push(segment);
      }
    }

    // Add transfer edges
    for (const [fromStopId, transfers] of this.transfers) {
      for (const transfer of transfers) {
        const fromStop = this.stops.get(fromStopId);
        const toStop = this.stops.get(transfer.to_stop_id);

        if (!fromStop || !toStop) continue;

        const distance = calculateDistance(
          fromStop.stop_lat,
          fromStop.stop_lon,
          toStop.stop_lat,
          toStop.stop_lon
        );

        const segment: RouteSegment = {
          from_stop_id: fromStopId,
          to_stop_id: transfer.to_stop_id,
          distance_meters: distance,
          travel_time_seconds: transfer.min_transfer_time || 180, // Default 3 minutes
        };

        if (!graph.has(fromStopId)) {
          graph.set(fromStopId, []);
        }
        graph.get(fromStopId)!.push(segment);
      }
    }

    return graph;
  }

  /**
   * Find optimal journey between two stops using Dijkstra's algorithm
   */
  public findJourney(
    fromStopId: string,
    toStopId: string,
    departureTime: string, // HH:MM:SS format
    maxTransfers: number = 3
  ): Journey | null {
    const startTime = parseGTFSTime(departureTime);
    const startNode: GraphNode = {
      stop_id: fromStopId,
      time: startTime,
      cost: 0,
    };

    const visited = new Set<string>();
    const queue: GraphNode[] = [startNode];
    let bestNode: GraphNode | null = null;

    while (queue.length > 0) {
      // Get node with lowest cost (priority queue simulation)
      queue.sort((a, b) => a.cost - b.cost);
      const current = queue.shift()!;

      const key = `${current.stop_id}_${current.time}_${current.trip_id || 'walk'}`;
      if (visited.has(key)) continue;
      visited.add(key);

      // Check if we reached destination
      if (current.stop_id === toStopId) {
        if (!bestNode || current.cost < bestNode.cost) {
          bestNode = current;
        }
        continue;
      }

      // Explore neighbors
      const segments = this.stopsGraph.get(current.stop_id) || [];
      for (const segment of segments) {
        // Find next departure for this segment
        const nextDepartures = this.findNextDepartures(
          segment.from_stop_id,
          segment.to_stop_id,
          current.time,
          segment.trip_id
        );

        for (const departure of nextDepartures) {
          const waitTime = departure.departureTime - current.time;
          const arrivalTime = departure.arrivalTime;
          const travelTime = arrivalTime - departure.departureTime;

          // Check transfer limit
          const transfers = this.countTransfers(current);
          if (departure.trip_id !== current.trip_id && transfers >= maxTransfers) {
            continue;
          }

          // Calculate cost (prioritize less waiting and fewer transfers)
          const transferPenalty = departure.trip_id !== current.trip_id ? 5 : 0;
          const cost = current.cost + waitTime + travelTime + transferPenalty;

          const fromStop = this.stops.get(segment.from_stop_id)!;
          const toStop = this.stops.get(segment.to_stop_id)!;
          const trip = departure.trip_id ? this.trips.get(departure.trip_id)! : undefined;
          const route = trip ? this.routes.get(trip.route_id)! : undefined;

          const connection: Connection = {
            from_stop: fromStop,
            to_stop: toStop,
            departure_time: this.formatTime(departure.departureTime),
            arrival_time: this.formatTime(arrivalTime),
            trip: trip!,
            route: route!,
          };

          const nextNode: GraphNode = {
            stop_id: segment.to_stop_id,
            time: arrivalTime,
            trip_id: departure.trip_id,
            cost,
            previous: current,
            connection,
          };

          queue.push(nextNode);
        }
      }
    }

    if (!bestNode) return null;

    // Reconstruct journey
    return this.reconstructJourney(bestNode);
  }

  /**
   * Find next departures from a stop after a given time
   */
  private findNextDepartures(
    fromStopId: string,
    toStopId: string,
    afterTime: number,
    tripId?: string
  ): Array<{ departureTime: number; arrivalTime: number; trip_id?: string }> {
    const departures: Array<{ departureTime: number; arrivalTime: number; trip_id?: string }> = [];

    // Group stop times by trip
    const tripStopTimes = new Map<string, GTFSStopTime[]>();
    for (const stopTime of this.stopTimes) {
      if (tripId && stopTime.trip_id !== tripId) continue;

      if (!tripStopTimes.has(stopTime.trip_id)) {
        tripStopTimes.set(stopTime.trip_id, []);
      }
      tripStopTimes.get(stopTime.trip_id)!.push(stopTime);
    }

    // Find consecutive stop pairs
    for (const [currentTripId, stopTimes] of tripStopTimes) {
      stopTimes.sort((a, b) => a.stop_sequence - b.stop_sequence);

      for (let i = 0; i < stopTimes.length - 1; i++) {
        const from = stopTimes[i];
        const to = stopTimes[i + 1];

        if (from.stop_id === fromStopId && to.stop_id === toStopId) {
          const depTime = parseGTFSTime(from.departure_time);
          const arrTime = parseGTFSTime(to.arrival_time);

          if (depTime >= afterTime) {
            departures.push({
              departureTime: depTime,
              arrivalTime: arrTime,
              trip_id: currentTripId,
            });
          }
        }
      }
    }

    return departures.slice(0, 5); // Return first 5 departures
  }

  /**
   * Count number of transfers in a journey path
   */
  private countTransfers(node: GraphNode): number {
    let count = 0;
    let current = node;
    let lastTripId = current.trip_id;

    while (current.previous) {
      if (current.trip_id !== lastTripId && lastTripId) {
        count++;
      }
      lastTripId = current.trip_id;
      current = current.previous;
    }

    return count;
  }

  /**
   * Reconstruct journey from final node
   */
  private reconstructJourney(finalNode: GraphNode): Journey {
    const connections: Connection[] = [];
    let current: GraphNode | undefined = finalNode;

    while (current?.previous) {
      if (current.connection) {
        connections.unshift(current.connection);
      }
      current = current.previous;
    }

    const firstConnection = connections[0];
    const lastConnection = connections[connections.length - 1];

    const departureMinutes = parseGTFSTime(firstConnection.departure_time);
    const arrivalMinutes = parseGTFSTime(lastConnection.arrival_time);
    const totalDuration = arrivalMinutes - departureMinutes;

    // Count unique trips (transfers)
    const uniqueTrips = new Set(connections.map((c) => c.trip.trip_id));
    const transfers = uniqueTrips.size - 1;

    return {
      connections,
      total_duration_minutes: totalDuration,
      transfers,
      departure_time: firstConnection.departure_time,
      arrival_time: lastConnection.arrival_time,
    };
  }

  /**
   * Format minutes since midnight to HH:MM:SS
   */
  private formatTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    const secs = Math.floor(((minutes % 1) * 60));

    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  /**
   * Get all direct routes between two stops
   */
  public getDirectRoutes(fromStopId: string, toStopId: string): GTFSRoute[] {
    const routes = new Set<string>();

    // Group stop times by trip
    const tripStopTimes = new Map<string, GTFSStopTime[]>();
    for (const stopTime of this.stopTimes) {
      if (!tripStopTimes.has(stopTime.trip_id)) {
        tripStopTimes.set(stopTime.trip_id, []);
      }
      tripStopTimes.get(stopTime.trip_id)!.push(stopTime);
    }

    // Find trips that connect these stops
    for (const [tripId, stopTimes] of tripStopTimes) {
      stopTimes.sort((a, b) => a.stop_sequence - b.stop_sequence);

      let foundFrom = false;
      for (const stopTime of stopTimes) {
        if (stopTime.stop_id === fromStopId) {
          foundFrom = true;
        }
        if (foundFrom && stopTime.stop_id === toStopId) {
          const trip = this.trips.get(tripId);
          if (trip) {
            routes.add(trip.route_id);
          }
          break;
        }
      }
    }

    return Array.from(routes)
      .map((routeId) => this.routes.get(routeId)!)
      .filter(Boolean);
  }
}
