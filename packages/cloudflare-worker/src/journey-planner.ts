/**
 * Journey planner with A* algorithm for route planning
 * Handles real-time updates and multi-modal transport
 */

import type { GTFSFeed, GTFSStop, GTFSStopTime, GTFSTrip, GTFSRoute } from './gtfs-static';
import { haversineDistance, isServiceActive } from './gtfs-static';
import type { GtfsRealtimeFeed } from './gtfs-realtime';
import { getStopDelays } from './gtfs-realtime';

export interface JourneyLeg {
  type: 'transit' | 'transfer';
  from: {
    stop: GTFSStop;
    time: Date;
  };
  to: {
    stop: GTFSStop;
    time: Date;
  };
  route?: GTFSRoute;
  trip?: GTFSTrip;
  headsign?: string;
  distance?: number;
  duration: number;
}

export interface Journey {
  legs: JourneyLeg[];
  departure: Date;
  arrival: Date;
  duration: number;
  transfers: number;
  walking_distance: number;
}

export interface JourneyPlannerOptions {
  maxTransfers?: number;
  maxWalkingDistance?: number; // in km
  walkingSpeed?: number; // km/h
  transferTime?: number; // minutes
  departureTime?: Date;
}

interface Node {
  stop: GTFSStop;
  time: Date;
  previousNode?: Node;
  previousLeg?: JourneyLeg;
  transfers: number;
  walkingDistance: number;
}

/**
 * Journey Planner class using A* algorithm
 */
export class JourneyPlanner {
  private feed: GTFSFeed;
  private realtimeFeed?: GtfsRealtimeFeed;
  private options: Required<JourneyPlannerOptions>;

  constructor(
    feed: GTFSFeed,
    realtimeFeed?: GtfsRealtimeFeed,
    options: JourneyPlannerOptions = {}
  ) {
    this.feed = feed;
    this.realtimeFeed = realtimeFeed;
    this.options = {
      maxTransfers: options.maxTransfers ?? 3,
      maxWalkingDistance: options.maxWalkingDistance ?? 2, // 2km
      walkingSpeed: options.walkingSpeed ?? 5, // 5 km/h
      transferTime: options.transferTime ?? 5, // 5 minutes
      departureTime: options.departureTime ?? new Date(),
    };
  }

  /**
   * Plan a journey from origin to destination
   */
  async planJourney(
    originStopId: string,
    destinationStopId: string
  ): Promise<Journey[]> {
    const originStop = this.feed.stops.find(s => s.stop_id === originStopId);
    const destinationStop = this.feed.stops.find(s => s.stop_id === destinationStopId);

    if (!originStop || !destinationStop) {
      throw new Error('Origin or destination stop not found');
    }

    // Use A* algorithm to find optimal paths
    const journeys = this.findJourneys(originStop, destinationStop);
    
    // Sort by total duration
    return journeys.sort((a, b) => a.duration - b.duration).slice(0, 3);
  }

  /**
   * Find journeys using A* algorithm
   */
  private findJourneys(origin: GTFSStop, destination: GTFSStop): Journey[] {
    const journeys: Journey[] = [];
    const openSet: Node[] = [];
    const closedSet = new Set<string>();

    // Initialize with origin
    const startNode: Node = {
      stop: origin,
      time: this.options.departureTime,
      transfers: 0,
      walkingDistance: 0,
    };

    openSet.push(startNode);

    while (openSet.length > 0 && journeys.length < 3) {
      // Sort by f-score (time + heuristic)
      openSet.sort((a, b) => {
        const fA = a.time.getTime() + this.heuristic(a.stop, destination);
        const fB = b.time.getTime() + this.heuristic(b.stop, destination);
        return fA - fB;
      });

      const current = openSet.shift()!;
      const nodeKey = `${current.stop.stop_id}-${current.time.getTime()}`;

      if (closedSet.has(nodeKey)) continue;
      closedSet.add(nodeKey);

      // Check if we reached destination
      if (current.stop.stop_id === destination.stop_id) {
        const journey = this.reconstructJourney(current);
        if (journey) {
          journeys.push(journey);
        }
        continue;
      }

      // Prune if too many transfers
      if (current.transfers >= this.options.maxTransfers) {
        continue;
      }

      // Explore neighbors
      const neighbors = this.getNeighbors(current);
      
      for (const neighbor of neighbors) {
        const neighborKey = `${neighbor.stop.stop_id}-${neighbor.time.getTime()}`;
        if (!closedSet.has(neighborKey)) {
          openSet.push(neighbor);
        }
      }
    }

    return journeys;
  }

  /**
   * Heuristic function for A* (estimated time to destination)
   */
  private heuristic(from: GTFSStop, to: GTFSStop): number {
    const distance = haversineDistance(
      from.stop_lat,
      from.stop_lon,
      to.stop_lat,
      to.stop_lon
    );
    
    // Assume average transit speed of 30 km/h
    const estimatedHours = distance / 30;
    return estimatedHours * 60 * 60 * 1000; // Convert to milliseconds
  }

  /**
   * Get neighboring nodes (reachable stops from current node)
   */
  private getNeighbors(node: Node): Node[] {
    const neighbors: Node[] = [];

    // 1. Find departures from current stop
    const departures = this.getDepartures(node.stop, node.time);
    
    for (const departure of departures) {
      // Get all stops on this trip after current stop
      const subsequentStops = this.getSubsequentStops(
        departure.trip,
        node.stop.stop_id,
        node.time
      );

      for (const { stop, arrivalTime } of subsequentStops) {
        neighbors.push({
          stop,
          time: arrivalTime,
          previousNode: node,
          previousLeg: {
            type: 'transit',
            from: {
              stop: node.stop,
              time: node.time,
            },
            to: {
              stop,
              time: arrivalTime,
            },
            route: departure.route,
            trip: departure.trip,
            headsign: departure.trip.trip_headsign,
            duration: (arrivalTime.getTime() - node.time.getTime()) / 1000,
          },
          transfers: node.transfers + 1,
          walkingDistance: node.walkingDistance,
        });
      }
    }

    // 2. Find nearby stops within walking distance
    const nearbyStops = this.getNearbyStops(node.stop, this.options.maxWalkingDistance);
    
    for (const nearbyStop of nearbyStops) {
      const distance = haversineDistance(
        node.stop.stop_lat,
        node.stop.stop_lon,
        nearbyStop.stop_lat,
        nearbyStop.stop_lon
      );

      if (node.walkingDistance + distance <= this.options.maxWalkingDistance) {
        const walkingTime = (distance / this.options.walkingSpeed) * 60 * 60 * 1000; // ms
        const arrivalTime = new Date(node.time.getTime() + walkingTime);

        neighbors.push({
          stop: nearbyStop,
          time: arrivalTime,
          previousNode: node,
          previousLeg: {
            type: 'transfer',
            from: {
              stop: node.stop,
              time: node.time,
            },
            to: {
              stop: nearbyStop,
              time: arrivalTime,
            },
            distance,
            duration: walkingTime / 1000,
          },
          transfers: node.transfers,
          walkingDistance: node.walkingDistance + distance,
        });
      }
    }

    return neighbors;
  }

  /**
   * Get departures from a stop after a given time
   */
  private getDepartures(
    stop: GTFSStop,
    afterTime: Date
  ): Array<{ route: GTFSRoute; trip: GTFSTrip; departureTime: Date }> {
    const departures: Array<{ route: GTFSRoute; trip: GTFSTrip; departureTime: Date }> = [];
    const currentDate = new Date(afterTime);
    currentDate.setHours(0, 0, 0, 0);

    // Get stop times for this stop
    const stopTimes = this.feed.stop_times.filter(st => st.stop_id === stop.stop_id);

    for (const st of stopTimes) {
      const trip = this.feed.trips.find(t => t.trip_id === st.trip_id);
      if (!trip) continue;

      // Check if service is active
      if (!isServiceActive(this.feed, trip.service_id, currentDate)) continue;

      const route = this.feed.routes.find(r => r.route_id === trip.route_id);
      if (!route) continue;

      // Parse departure time
      let departureTime = this.parseGTFSTime(st.departure_time, currentDate);

      // Apply realtime delays if available
      if (this.realtimeFeed) {
        const delays = getStopDelays(this.realtimeFeed, stop.stop_id);
        const delay = delays.find(d => d.tripId === trip.trip_id);
        if (delay?.departureDelay) {
          departureTime = new Date(departureTime.getTime() + delay.departureDelay * 1000);
        }
      }

      // Only include future departures
      if (departureTime >= afterTime) {
        departures.push({ route, trip, departureTime });
      }
    }

    // Sort by departure time and limit
    return departures
      .sort((a, b) => a.departureTime.getTime() - b.departureTime.getTime())
      .slice(0, 10);
  }

  /**
   * Get subsequent stops on a trip
   */
  private getSubsequentStops(
    trip: GTFSTrip,
    currentStopId: string,
    currentTime: Date
  ): Array<{ stop: GTFSStop; arrivalTime: Date }> {
    const result: Array<{ stop: GTFSStop; arrivalTime: Date }> = [];
    const currentDate = new Date(currentTime);
    currentDate.setHours(0, 0, 0, 0);

    // Get all stop times for this trip
    const stopTimes = this.feed.stop_times
      .filter(st => st.trip_id === trip.trip_id)
      .sort((a, b) => a.stop_sequence - b.stop_sequence);

    // Find current stop
    const currentIndex = stopTimes.findIndex(st => st.stop_id === currentStopId);
    if (currentIndex === -1) return result;

    // Get subsequent stops
    for (let i = currentIndex + 1; i < stopTimes.length; i++) {
      const st = stopTimes[i];
      const stop = this.feed.stops.find(s => s.stop_id === st.stop_id);
      if (!stop) continue;

      let arrivalTime = this.parseGTFSTime(st.arrival_time, currentDate);

      // Apply realtime delays if available
      if (this.realtimeFeed) {
        const delays = getStopDelays(this.realtimeFeed, stop.stop_id);
        const delay = delays.find(d => d.tripId === trip.trip_id);
        if (delay?.arrivalDelay) {
          arrivalTime = new Date(arrivalTime.getTime() + delay.arrivalDelay * 1000);
        }
      }

      result.push({ stop, arrivalTime });
    }

    return result;
  }

  /**
   * Get nearby stops within walking distance
   */
  private getNearbyStops(stop: GTFSStop, maxDistance: number): GTFSStop[] {
    return this.feed.stops.filter(s => {
      if (s.stop_id === stop.stop_id) return false;
      
      const distance = haversineDistance(
        stop.stop_lat,
        stop.stop_lon,
        s.stop_lat,
        s.stop_lon
      );
      
      return distance <= maxDistance;
    });
  }

  /**
   * Parse GTFS time string (HH:MM:SS) to Date
   */
  private parseGTFSTime(timeStr: string, baseDate: Date): Date {
    const [hours, minutes, seconds] = timeStr.split(':').map(Number);
    const date = new Date(baseDate);
    
    // Handle times past midnight (e.g., 25:30:00)
    if (hours >= 24) {
      date.setDate(date.getDate() + Math.floor(hours / 24));
      date.setHours(hours % 24, minutes, seconds, 0);
    } else {
      date.setHours(hours, minutes, seconds, 0);
    }
    
    return date;
  }

  /**
   * Reconstruct journey from final node
   */
  private reconstructJourney(finalNode: Node): Journey | null {
    const legs: JourneyLeg[] = [];
    let current: Node | undefined = finalNode;
    let departureTime: Date | null = null;

    // Backtrack through nodes
    while (current?.previousNode) {
      if (current.previousLeg) {
        legs.unshift(current.previousLeg);
        departureTime = current.previousLeg.from.time;
      }
      current = current.previousNode;
    }

    if (legs.length === 0 || !departureTime) return null;

    const arrivalTime = finalNode.time;
    const duration = (arrivalTime.getTime() - departureTime.getTime()) / 1000;
    const transfers = legs.filter(leg => leg.type === 'transit').length - 1;
    const walking_distance = legs
      .filter(leg => leg.type === 'transfer')
      .reduce((sum, leg) => sum + (leg.distance || 0), 0);

    return {
      legs,
      departure: departureTime,
      arrival: arrivalTime,
      duration,
      transfers: Math.max(0, transfers),
      walking_distance,
    };
  }
}

/**
 * Format journey for display
 */
export function formatJourney(journey: Journey): string {
  const lines: string[] = [];
  
  lines.push(`Journey: ${journey.departure.toLocaleTimeString()} → ${journey.arrival.toLocaleTimeString()}`);
  lines.push(`Duration: ${Math.round(journey.duration / 60)} minutes`);
  lines.push(`Transfers: ${journey.transfers}`);
  
  if (journey.walking_distance > 0) {
    lines.push(`Walking distance: ${journey.walking_distance.toFixed(2)} km`);
  }
  
  lines.push('');
  lines.push('Legs:');
  
  for (let i = 0; i < journey.legs.length; i++) {
    const leg = journey.legs[i];
    const duration = Math.round(leg.duration / 60);
    
    if (leg.type === 'transit') {
      lines.push(
        `${i + 1}. ${leg.route?.route_short_name || ''} ${leg.headsign || ''} ` +
        `(${duration} min) ${leg.from.stop.stop_name} → ${leg.to.stop.stop_name}`
      );
    } else {
      lines.push(
        `${i + 1}. Walk (${duration} min, ${leg.distance?.toFixed(2)}km) ` +
        `${leg.from.stop.stop_name} → ${leg.to.stop.stop_name}`
      );
    }
  }
  
  return lines.join('\n');
}
