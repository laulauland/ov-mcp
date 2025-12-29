#!/usr/bin/env python3
"""
Find Metro Route: Amsterdam Noorderpark to Amsterdam Zuid

This script demonstrates the complete workflow for finding journey options
between two specific locations in Amsterdam, with special focus on metro connections.

The script will:
1. Download and parse GTFS data from gtfs.ovapi.nl
2. Find stops matching "Amsterdam Noorderpark" and "Amsterdam Zuid"
3. Search for journey options with up to 2 transfers
4. Display both general and metro-specific routes
5. Provide detailed information about each journey option

Usage:
    python find_metro_route.py

Author: Laurynas Keturakis
Date: December 2025
"""

import logging
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from gtfs_parser import GTFSParser
from journey_planner import JourneyPlanner, find_stops_by_name, format_journey

# Configure logging with color support
try:
    from colorama import init, Fore, Style
    init(autoreset=True)
    HAS_COLOR = True
except ImportError:
    HAS_COLOR = False
    # Fallback if colorama not installed
    class Fore:
        GREEN = RED = YELLOW = CYAN = BLUE = MAGENTA = ""
    class Style:
        BRIGHT = RESET_ALL = ""

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def print_header(text: str):
    """Print a styled header."""
    if HAS_COLOR:
        print(f"\n{Fore.CYAN}{Style.BRIGHT}{'='*70}")
        print(f"{Fore.CYAN}{Style.BRIGHT}{text}")
        print(f"{Fore.CYAN}{Style.BRIGHT}{'='*70}{Style.RESET_ALL}")
    else:
        print(f"\n{'='*70}")
        print(text)
        print(f"{'='*70}")


def print_success(text: str):
    """Print a success message."""
    if HAS_COLOR:
        print(f"{Fore.GREEN}✓ {text}{Style.RESET_ALL}")
    else:
        print(f"✓ {text}")


def print_error(text: str):
    """Print an error message."""
    if HAS_COLOR:
        print(f"{Fore.RED}✗ {text}{Style.RESET_ALL}")
    else:
        print(f"✗ {text}")


def print_info(text: str):
    """Print an info message."""
    if HAS_COLOR:
        print(f"{Fore.BLUE}ℹ {text}{Style.RESET_ALL}")
    else:
        print(f"ℹ {text}")


def display_stop_matches(stops: list, query: str):
    """
    Display matching stops in a formatted table.
    
    Args:
        stops: List of matching stops
        query: Original search query
    """
    if not stops:
        print_error(f"No stops found matching '{query}'")
        return
    
    print(f"\nFound {len(stops)} stop(s) matching '{query}':")
    print(f"\n{'#':<4} {'Stop Name':<40} {'Match Score':<12} {'Stop ID':<15}")
    print("-" * 75)
    
    for i, stop in enumerate(stops, 1):
        print(f"{i:<4} {stop['stop_name']:<40} {stop['match_score']:<12} {stop['stop_id']:<15}")


def display_journey_summary(journeys: list, title: str = "Journey Options"):
    """
    Display a summary of journey options.
    
    Args:
        journeys: List of journey options
        title: Title for the summary section
    """
    print_header(title)
    
    if not journeys:
        print_info("No journeys found matching the criteria.")
        return
    
    print(f"\nFound {len(journeys)} journey option(s):\n")
    
    for i, journey in enumerate(journeys, 1):
        print(f"{'─' * 70}")
        print(f"Option {i}: {journey['num_transfers']} transfer(s)")
        print(f"{'─' * 70}")
        
        for leg_num, leg in enumerate(journey['legs'], 1):
            if HAS_COLOR:
                route_color = Fore.MAGENTA if leg['route_type'] == 1 else Fore.YELLOW
                print(f"\n  Leg {leg_num}: {route_color}{leg['route_short_name']}{Style.RESET_ALL} "
                      f"({leg['route_type_name']})")
            else:
                print(f"\n  Leg {leg_num}: {leg['route_short_name']} ({leg['route_type_name']})")
            
            print(f"    From: {leg['from_stop']}")
            print(f"    To:   {leg['to_stop']}")
        
        print()


def main():
    """
    Main execution function.
    """
    print_header("Amsterdam Metro Route Finder")
    print_info("Finding metro routes from Amsterdam Noorderpark to Amsterdam Zuid")
    print()
    
    try:
        # Step 1: Load GTFS data
        print_header("Step 1: Loading GTFS Data")
        parser = GTFSParser()
        gtfs_data = parser.load_gtfs_data()
        print_success("GTFS data loaded successfully")
        
        stops = gtfs_data['stops']
        
        # Step 2: Find origin stop
        print_header("Step 2: Finding Origin Stop")
        origin_query = "Amsterdam Noorderpark"
        print_info(f"Searching for '{origin_query}'...")
        
        origin_stops = find_stops_by_name(stops, origin_query, threshold=70)
        display_stop_matches(origin_stops, origin_query)
        
        if not origin_stops:
            print_error("Could not find origin stop. Exiting.")
            return 1
        
        origin = origin_stops[0]
        print_success(f"Selected origin: {origin['stop_name']}")
        
        # Step 3: Find destination stop
        print_header("Step 3: Finding Destination Stop")
        dest_query = "Amsterdam Zuid"
        print_info(f"Searching for '{dest_query}'...")
        
        dest_stops = find_stops_by_name(stops, dest_query, threshold=70)
        display_stop_matches(dest_stops, dest_query)
        
        if not dest_stops:
            print_error("Could not find destination stop. Exiting.")
            return 1
        
        destination = dest_stops[0]
        print_success(f"Selected destination: {destination['stop_name']}")
        
        # Step 4: Plan journeys
        print_header("Step 4: Planning Journeys")
        print_info("Building network graph and searching for routes...")
        
        planner = JourneyPlanner(gtfs_data)
        
        # Find all journey options (max 2 transfers)
        journeys = planner.find_journeys(
            origin['stop_id'],
            destination['stop_id'],
            max_transfers=2
        )
        
        if not journeys:
            print_error("No journeys found between the specified stops.")
            print_info("This might mean:")
            print("  - The stops are not connected in the network")
            print("  - More transfers are needed (try increasing max_transfers)")
            print("  - The GTFS data doesn't include this route")
            return 1
        
        print_success(f"Found {len(journeys)} total journey options")
        
        # Step 5: Display all journeys
        display_journey_summary(journeys[:10], "All Journey Options (Top 10)")
        
        # Step 6: Filter and display metro-only journeys
        print_header("Step 5: Metro-Only Routes")
        print_info("Filtering for metro-only journeys (route_type = 1)...")
        
        metro_journeys = planner.filter_metro_journeys(journeys)
        
        if metro_journeys:
            print_success(f"Found {len(metro_journeys)} metro-only journey option(s)")
            display_journey_summary(metro_journeys, "Metro-Only Journey Options")
        else:
            print_info("No direct metro-only routes found.")
            print_info("This suggests you may need to use other transport types (bus, tram, etc.)")
        
        # Step 7: Summary
        print_header("Summary")
        print(f"\nOrigin:      {origin['stop_name']}")
        print(f"Destination: {destination['stop_name']}")
        print(f"\nTotal journey options: {len(journeys)}")
        print(f"Metro-only options:    {len(metro_journeys)}")
        
        if journeys:
            min_transfers = min(j['num_transfers'] for j in journeys)
            print(f"\nMinimum transfers required: {min_transfers}")
        
        print("\n" + "─" * 70)
        print_success("Journey search complete!")
        print("─" * 70 + "\n")
        
        return 0
        
    except KeyboardInterrupt:
        print("\n")
        print_info("Search interrupted by user.")
        return 130
        
    except Exception as e:
        print("\n")
        print_error(f"An error occurred: {e}")
        logger.exception("Detailed error information:")
        return 1


if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)
