# OV-MCP: Dutch Public Transport MCP Server

A Model Context Protocol (MCP) server providing AI assistants with comprehensive access to Dutch public transport data through real-time GTFS feeds and live vehicle tracking.

## Project Overview & Purpose

OV-MCP bridges the gap between AI assistants and Dutch public transportation, enabling intelligent travel planning and real-time journey management. By integrating with Poke via the Model Context Protocol, it transforms static transit data into actionable insights for commuters.

**What OV-MCP Does:**
- Provides real-time access to all Dutch public transport operators (NS, GVB, RET, HTM, etc.)
- Enables intelligent journey planning with live delay information
- Tracks vehicles in real-time for precise arrival predictions
- Monitors service disruptions and suggests alternative routes
- Integrates seamlessly with AI assistants for natural language transit queries

**Architecture:**
The system combines GTFS Static data (schedules, stops, routes) with GTFS Realtime feeds (vehicle positions, delays, alerts) through a Cloudflare Workers deployment using the Cloudflare Agents SDK, providing sub-second response times for transit queries.

## Features & Capabilities

### planJourney: Intelligent Route Planning
**Purpose:** Helps commuters find optimal routes with live delay information and alternative options.

**Real-World Applications:**
- **Morning Commute Optimization:** "What's the fastest way to get from Amsterdam Centraal to Schiphol right now?" - Returns the quickest route considering current delays, with backup options if primary connections are disrupted.
- **Multi-Modal Planning:** "I need to get from Utrecht to Rotterdam avoiding the NS strike" - Plans alternative routes using regional buses, metro connections, and trams.
- **Accessibility-Aware Routing:** Plans step-free routes for wheelchair users or travelers with heavy luggage.
- **Time-Critical Journeys:** For airport connections or important meetings, provides routes with built-in buffer time and delay notifications.

### getVehiclePositions: Real-Time Vehicle Tracking
**Purpose:** Tracks specific buses, trains, and trams in real-time for precise arrival predictions.

**Real-World Applications:**
- **Precise Pickup Timing:** "Where is bus 15 heading to Centraal Station?" - Shows exact vehicle location and estimated arrival time at your stop.
- **Connection Monitoring:** While on a train, track if your connecting bus is delayed: "Is the 21 bus from Den Haag HS running on time?"
- **Service Reliability:** Track vehicle bunching or gaps in service: "Why haven't any trams passed Leidseplein in 15 minutes?"
- **Travel Updates:** Get live position updates during your journey: "How far is my train from Amsterdam?"

### getServiceAlerts: Proactive Disruption Management
**Purpose:** Monitors service disruptions and provides timely notifications for affected routes.

**Real-World Applications:**
- **Route Disruption Alerts:** "Are there any issues with the metro between Amsterdam Zuid and Centraal?" - Instant alerts about planned maintenance, strikes, or unexpected disruptions.
- **Alternative Route Suggestions:** When disruptions affect your usual route, automatically suggests alternatives: "Metro line 51 is suspended - take bus 15 instead."
- **Event-Based Planning:** Checks for disruptions during major events: "Will the trams be affected by the concert at Ziggo Dome tonight?"
- **Proactive Notifications:** Set up alerts for your daily commute routes to receive early warnings about delays or cancellations.

### getTripUpdates: Live Journey Monitoring
**Purpose:** Provides real-time updates for specific scheduled trips with delay information.

**Real-World Applications:**
- **Departure Monitoring:** "Is the 14:23 train from Utrecht to Amsterdam delayed?" - Get exact delay minutes and updated arrival times.
- **Connection Protection:** Monitor if delays will affect your planned connections: "Will I still make the 15:45 bus if my train is 8 minutes late?"
- **Schedule Validation:** Confirm if published schedules match reality: "Is the 09:15 bus actually running today?"
- **Journey Adjustments:** Real-time updates allow dynamic re-routing: "My train is 20 minutes delayed - what's the next fastest option?"

## Technical Implementation

**Data Sources:**
- **GTFS Static:** Complete schedule data from gtfs.ovapi.nl (daily updates)
- **GTFS Realtime:** Live vehicle positions, trip updates, and service alerts from multiple operators
- **Integration Coverage:** All major Dutch transport operators (NS, GVB, RET, HTM, Connexxion, Arriva, etc.)

**Cloudflare Workers Architecture:**
- **Edge Computing:** Deployed across Cloudflare's global network for sub-100ms response times
- **Cloudflare Agents SDK:** Native MCP protocol implementation optimized for AI assistant integration
- **Caching Strategy:** Smart caching with 30-second vehicle position updates and 5-minute static data refresh
- **Auto-scaling:** Handles peak traffic during rush hours and service disruptions automatically

**Data Processing:**
- **Real-time Fusion:** Combines scheduled data with live updates for accurate predictions
- **Geospatial Queries:** Efficient nearby stop searches using R-tree indexing
- **Multi-modal Routing:** Considers walking transfers, platform changes, and accessibility requirements

## Real-World Use Cases

### 1. Smart Commute Planning with Delay Notifications

**Scenario:** Daily commute from Haarlem to Amsterdam with NS train + GVB metro connection

```typescript
// Morning routine check
const journey = await mcp.planJourney({
  from: "Haarlem Station",
  to: "Amsterdam Bijlmer ArenA",
  departure: "08:15",
  preferences: ["fastest", "minimal_transfers"]
});

// Result shows: Train to Amsterdam Centraal (8 min delay) + Metro 54 (on time)
// Automatic notification: "Your usual train is delayed - leave 5 minutes later"
```

**User Experience:**
- AI assistant proactively suggests leaving later due to train delays
- Provides walking directions to alternative metro platforms
- Sends push notification if delays worsen during journey

### 2. Real-Time Vehicle Tracking During Travel

**Scenario:** Tracking connecting bus while on a delayed train

```typescript
// User is on delayed train, checking connection
const busPosition = await mcp.getVehiclePositions({
  route: "Bus 15",
  direction: "Amsterdam Centraal",
  nearStop: "Amsterdam Zuid"
});

// Shows bus is 3 stops away, arriving in 7 minutes
// Train delay is 5 minutes - connection is still possible
```

**User Experience:**
- Real-time map showing both train and bus positions
- Dynamic connection feasibility assessment
- Alternative route suggestions if connection becomes impossible

### 3. Disruption Response and Route Adaptation

**Scenario:** Metro line suspension during evening rush hour

```typescript
// Check for disruptions affecting planned route
const alerts = await mcp.getServiceAlerts({
  routes: ["Metro 52", "Metro 51"],
  area: "Amsterdam"
});

// Alert: "Metro 52 suspended between Noord and Centraal due to signal failure"
// Automatically triggers alternative route search
const alternatives = await mcp.planJourney({
  from: currentLocation,
  to: destination,
  avoidRoutes: ["Metro 52"],
  options: ["bus_priority"]
});
```

**User Experience:**
- Instant notification about service disruption
- AI suggests taking bus 15 + tram 12 as fastest alternative
- Provides real-time updates as situation develops

### 4. Multi-Modal Journey Optimization

**Scenario:** Airport journey with luggage requiring accessible routes

```typescript
// Plan accessible route to Schiphol with heavy bags
const journey = await mcp.planJourney({
  from: "Amsterdam Vondelpark",
  to: "Schiphol Airport",
  departure: "14:30",
  accessibility: ["step_free", "elevator_access"],
  preferences: ["comfort", "reliable"]
});

// Result: Walk to tram stop (flat) → Tram 12 to Central → Direct train to Schiphol
// Includes: elevator locations, platform numbers, buffer time for delays
```

**User Experience:**
- Route avoids stairs and long walking transfers
- Provides platform maps showing elevator locations
- Includes 15-minute buffer time for potential delays
- Sends notifications if journey requires adjustment

### 5. Nearby Transport Discovery and Live Departures

**Scenario:** Finding immediate transport options from current location

```typescript
// User is at unknown location, needs to get somewhere quickly
const nearbyStops = await mcp.findStopsNearby({
  latitude: 52.3676,
  longitude: 4.9041,
  radius: 300,
  includeUpcomingDepartures: true
});

// Returns: 3 bus stops, 1 tram stop, 1 metro station within 300m
// Each with next 3 departures and real-time delays
```

**User Experience:**
- Interactive map showing all nearby transit options
- Live departure board for each stop
- Walking directions to closest relevant stop
- Smart filtering based on destination direction

## Example Usage

### Natural Language Integration with AI Assistants

```typescript
// AI processes: "I need to get to work by 9 AM, what's the best option?"
const workCommute = await mcp.planJourney({
  from: userLocation,
  to: "Amsterdam Zuid WTC",
  arriveBy: "09:00",
  preferences: ["reliable", "minimal_walking"]
});

// AI provides: "Take the 08:23 train from your nearest station. 
// It's currently on time and will get you there by 08:47."
```

### Integration with Smart Home Systems

```typescript
// Morning routine automation
const morningCheck = async () => {
  const disruptions = await mcp.getServiceAlerts({
    routes: userConfig.dailyRoutes
  });
  
  if (disruptions.length > 0) {
    // Adjust smart alarm and send alternative route to phone
    const alternatives = await mcp.planJourney({
      from: home,
      to: office,
      departure: "08:00",
      avoidDisruptedRoutes: true
    });
    
    return `Disruption detected. Leave 10 minutes earlier and take ${alternatives[0].summary}`;
  }
  
  return "Normal commute route is clear";
};
```

### Travel Companion Features

```typescript
// Continuous journey monitoring
const trackJourney = async (plannedTrips) => {
  for (const trip of plannedTrips) {
    const updates = await mcp.getTripUpdates({
      tripId: trip.id,
      includeVehiclePosition: true
    });
    
    if (updates.delay > 5) {
      // Check if delays affect connections
      const connectionStatus = await checkConnections(trip.connections, updates.delay);
      
      if (connectionStatus.atRisk) {
        // Suggest alternatives or later departure
        return await findAlternatives(trip.destination, updates.estimatedArrival);
      }
    }
  }
};
```

This comprehensive integration enables AI assistants to provide intelligent, context-aware transit assistance that adapts to real-world conditions and user preferences, transforming Dutch public transport into a seamless, predictable travel experience.
