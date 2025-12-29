#!/usr/bin/env python3
"""
Journey Planning for Netherlands Public Transport

This module provides journey planning capabilities using GTFS data. It can find
direct connections and multi-leg journeys with transfers between stations.

Usage:
    from gtfs_parser import GTFSParser
    from journey_planner import JourneyPlanner, find_stops_by_name
    
    # Load GTFS data
    parser = GTFSParser()
    gtfs_data = parser.load_gtfs_data()
    
    # Find stations
    origin = find_stops_by_name(gtfs_data['stops'], "Amsterdam Noorderpark")
    destination = find_stops_by_name(gtfs_data['stops'], "Amsterdam Zuid")
    
    # Plan journey
    planner = JourneyPlanner(gtfs_data)
    journeys = planner.find_journeys(
        origin[0]['stop_id'],
        destination[0]['stop_id'],
        max_transfers=2
    )

Author: Laurynas Keturakis
Date: December 2025
"""

import logging
from collections import defaultdict
from typing import Dict, List, Optional, Tuple

import networkx as nx
import pandas as pd
from fuzzywuzzy import fuzz, process

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class JourneyPlanner:
    """
    Journey planner for public transport networks.
    
    Uses GTFS data to build a network graph and find optimal journeys
    between stops, including multi-leg journeys with transfers.
    
    Attributes:
        gtfs_data (Dict): Parsed GTFS data
        graph (nx.MultiDiGraph): Network graph of connections
        route_info (Dict): Mapping of route IDs to route details
        trip_routes (Dict): Mapping of trip IDs to route IDs
    """
    
    # GTFS route type definitions
    ROUTE_TYPES = {
        0: "Tram",
        1: "Metro",
        2: "Rail",
        3: "Bus",
        4: "Ferry",
        5: "Cable Car",
        6: "Gondola",
        7: "Funicular",
    }
    
    def __init__(self, gtfs_data: Dict[str, pd.DataFrame]):
        """
        Initialize the journey planner with GTFS data.
        
        Args:
            gtfs_data: Dictionary of parsed GTFS DataFrames
        """
        self.gtfs_data = gtfs_data
        self.graph = None
        self.route_info = {}
        self.trip_routes = {}
        self.stop_info = {}
        
        logger.info("Initializing JourneyPlanner...")
        self._build_network()
        logger.info("✓ JourneyPlanner ready")
    
    def _build_network(self):
        """
        Build a network graph from GTFS data.
        
        Creates a directed multigraph where:
        - Nodes are stops
        - Edges are direct connections between consecutive stops on a trip
        - Edge attributes include route info, trip ID, and sequence
        """
        logger.info("Building network graph from GTFS data...")
        
        stops = self.gtfs_data['stops']
        routes = self.gtfs_data['routes']
        trips = self.gtfs_data['trips']
        stop_times = self.gtfs_data['stop_times']
        
        # Build lookup dictionaries
        logger.info("Building lookup dictionaries...")
        
        # Stop information
        for _, stop in stops.iterrows():
            self.stop_info[stop['stop_id']] = {
                'stop_name': stop['stop_name'],
                'stop_lat': stop.get('stop_lat'),
                'stop_lon': stop.get('stop_lon'),
            }
        
        # Route information
        for _, route in routes.iterrows():
            self.route_info[route['route_id']] = {
                'route_short_name': route.get('route_short_name', 'N/A'),
                'route_long_name': route.get('route_long_name', 'N/A'),
                'route_type': int(route['route_type']),
                'route_type_name': self.ROUTE_TYPES.get(int(route['route_type']), 'Unknown'),
            }
        
        # Trip to route mapping
        for _, trip in trips.iterrows():
            self.trip_routes[trip['trip_id']] = trip['route_id']
        
        # Build graph
        logger.info("Building graph edges...")
        self.graph = nx.MultiDiGraph()
        
        # Add all stops as nodes
        for stop_id in self.stop_info.keys():
            self.graph.add_node(stop_id)
        
        # Group stop_times by trip
        stop_times_sorted = stop_times.sort_values(['trip_id', 'stop_sequence'])
        
        edges_added = 0
        for trip_id, trip_stops in stop_times_sorted.groupby('trip_id'):
            # Get route for this trip
            route_id = self.trip_routes.get(trip_id)
            if route_id is None:
                continue
            
            route = self.route_info.get(route_id, {})
            
            # Create edges between consecutive stops
            stops_list = trip_stops.sort_values('stop_sequence')
            for i in range(len(stops_list) - 1):
                from_stop = stops_list.iloc[i]['stop_id']
                to_stop = stops_list.iloc[i + 1]['stop_id']
                
                # Add edge with route information
                self.graph.add_edge(
                    from_stop,
                    to_stop,
                    trip_id=trip_id,
                    route_id=route_id,
                    route_type=route.get('route_type'),
                    route_short_name=route.get('route_short_name'),
                    route_long_name=route.get('route_long_name'),
                )
                edges_added += 1
        
        logger.info(f"✓ Graph built: {self.graph.number_of_nodes():,} nodes, {edges_added:,} edges")
    
    def find_direct_connection(self, origin: str, destination: str) -> List[Dict]:
        """
        Find direct connections (no transfers) between two stops.
        
        Args:
            origin: Origin stop ID
            destination: Destination stop ID
            
        Returns:
            List of direct connection details
        """
        if origin not in self.graph or destination not in self.graph:
            logger.warning(f"Stops not found in graph: {origin} or {destination}")
            return []
        
        connections = []
        
        # Check if there's a direct edge
        if self.graph.has_edge(origin, destination):
            for edge_data in self.graph[origin][destination].values():
                connections.append({
                    'type': 'direct',
                    'from_stop': self.stop_info[origin]['stop_name'],
                    'to_stop': self.stop_info[destination]['stop_name'],
                    'route_id': edge_data['route_id'],
                    'route_short_name': edge_data.get('route_short_name'),
                    'route_type': edge_data.get('route_type'),
                    'route_type_name': self.ROUTE_TYPES.get(edge_data.get('route_type'), 'Unknown'),
                })
        
        return connections
    
    def find_journeys(self, origin: str, destination: str, max_transfers: int = 2) -> List[Dict]:
        """
        Find journey options between two stops, including transfers.
        
        Args:
            origin: Origin stop ID
            destination: Destination stop ID
            max_transfers: Maximum number of transfers allowed
            
        Returns:
            List of journey options, each containing:
            - legs: List of journey legs
            - num_transfers: Number of transfers
            - route_types: Set of route types used
        """
        if origin not in self.graph or destination not in self.graph:
            logger.error(f"Stops not found: {origin} or {destination}")
            return []
        
        logger.info(f"Finding journeys from {origin} to {destination} (max {max_transfers} transfers)...")
        
        journeys = []
        
        try:
            # Use simple_paths to find all paths up to max_transfers + 1 legs
            max_path_length = max_transfers + 2  # +1 for destination, +1 because path length includes origin
            
            paths = nx.all_simple_paths(
                self.graph,
                origin,
                destination,
                cutoff=max_path_length
            )
            
            for path in paths:
                if len(path) < 2:
                    continue
                
                # Build journey legs
                legs = []
                for i in range(len(path) - 1):
                    from_stop = path[i]
                    to_stop = path[i + 1]
                    
                    # Get edge data (take first edge if multiple)
                    edge_data = list(self.graph[from_stop][to_stop].values())[0]
                    
                    legs.append({
                        'from_stop': self.stop_info[from_stop]['stop_name'],
                        'from_stop_id': from_stop,
                        'to_stop': self.stop_info[to_stop]['stop_name'],
                        'to_stop_id': to_stop,
                        'route_id': edge_data['route_id'],
                        'route_short_name': edge_data.get('route_short_name'),
                        'route_type': edge_data.get('route_type'),
                        'route_type_name': self.ROUTE_TYPES.get(edge_data.get('route_type'), 'Unknown'),
                    })
                
                # Calculate transfers (number of legs - 1)
                num_transfers = len(legs) - 1
                
                if num_transfers <= max_transfers:
                    route_types = set(leg['route_type'] for leg in legs)
                    
                    journeys.append({
                        'legs': legs,
                        'num_transfers': num_transfers,
                        'route_types': route_types,
                    })
        
        except nx.NetworkXNoPath:
            logger.warning(f"No path found between {origin} and {destination}")
        except Exception as e:
            logger.error(f"Error finding journeys: {e}")
        
        logger.info(f"✓ Found {len(journeys)} journey options")
        return journeys
    
    def filter_metro_journeys(self, journeys: List[Dict]) -> List[Dict]:
        """
        Filter journeys to only include those using metro (route_type == 1).
        
        Args:
            journeys: List of journey options
            
        Returns:
            List of metro-only journeys
        """
        metro_journeys = [
            journey for journey in journeys
            if all(leg['route_type'] == 1 for leg in journey['legs'])
        ]
        
        logger.info(f"Filtered to {len(metro_journeys)} metro-only journeys")
        return metro_journeys


def find_stops_by_name(stops: pd.DataFrame, query: str, threshold: int = 80, limit: int = 5) -> List[Dict]:
    """
    Find stops matching a query string using fuzzy matching.
    
    Args:
        stops: DataFrame of stops from GTFS data
        query: Search query (e.g., "Amsterdam Noorderpark")
        threshold: Minimum fuzzy match score (0-100)
        limit: Maximum number of results
        
    Returns:
        List of matching stops with their details
    """
    logger.info(f"Searching for stops matching '{query}'...")
    
    # Create a list of stop names with their indices
    stop_names = stops['stop_name'].tolist()
    
    # Use fuzzy matching to find best matches
    matches = process.extract(query, stop_names, scorer=fuzz.token_sort_ratio, limit=limit)
    
    results = []
    for match_name, score in matches:
        if score >= threshold:
            # Find the stop(s) with this name
            matching_stops = stops[stops['stop_name'] == match_name]
            
            for _, stop in matching_stops.iterrows():
                results.append({
                    'stop_id': stop['stop_id'],
                    'stop_name': stop['stop_name'],
                    'stop_lat': stop.get('stop_lat'),
                    'stop_lon': stop.get('stop_lon'),
                    'match_score': score,
                })
    
    logger.info(f"✓ Found {len(results)} matching stops")
    return results


def format_journey(journey: Dict, index: int = 1) -> str:
    """
    Format a journey into a readable string.
    
    Args:
        journey: Journey dictionary with legs and transfer info
        index: Journey number for display
        
    Returns:
        Formatted string representation
    """
    lines = []
    lines.append(f"\nJourney Option {index}:")
    lines.append(f"  Transfers: {journey['num_transfers']}")
    
    for i, leg in enumerate(journey['legs'], 1):
        lines.append(f"\n  Leg {i}:")
        lines.append(f"    Route: {leg['route_short_name']} ({leg['route_type_name']})")
        lines.append(f"    From: {leg['from_stop']}")
        lines.append(f"    To:   {leg['to_stop']}")
    
    return "\n".join(lines)


def main():
    """
    Example usage of the journey planner.
    """
    from gtfs_parser import GTFSParser
    
    # Load GTFS data
    parser = GTFSParser()
    gtfs_data = parser.load_gtfs_data()
    
    # Example: Find journey from Amsterdam Centraal to Amsterdam Zuid
    stops = gtfs_data['stops']
    
    print("\nSearching for origin stop...")
    origin_stops = find_stops_by_name(stops, "Amsterdam Centraal")
    if not origin_stops:
        print("Origin stop not found!")
        return
    
    print("\nSearching for destination stop...")
    dest_stops = find_stops_by_name(stops, "Amsterdam Zuid")
    if not dest_stops:
        print("Destination stop not found!")
        return
    
    origin = origin_stops[0]
    destination = dest_stops[0]
    
    print(f"\nOrigin: {origin['stop_name']} (ID: {origin['stop_id']})")
    print(f"Destination: {destination['stop_name']} (ID: {destination['stop_id']})")
    
    # Plan journey
    planner = JourneyPlanner(gtfs_data)
    journeys = planner.find_journeys(
        origin['stop_id'],
        destination['stop_id'],
        max_transfers=2
    )
    
    if not journeys:
        print("\nNo journeys found!")
        return
    
    print(f"\n{'='*60}")
    print(f"Found {len(journeys)} journey options")
    print(f"{'='*60}")
    
    # Display first few journeys
    for i, journey in enumerate(journeys[:5], 1):
        print(format_journey(journey, i))
    
    # Filter for metro
    metro_journeys = planner.filter_metro_journeys(journeys)
    if metro_journeys:
        print(f"\n{'='*60}")
        print(f"Metro-only journeys: {len(metro_journeys)}")
        print(f"{'='*60}")
        for i, journey in enumerate(metro_journeys[:3], 1):
            print(format_journey(journey, i))


if __name__ == "__main__":
    main()
