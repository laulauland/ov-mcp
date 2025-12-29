#!/usr/bin/env python3
"""
GTFS Parser for Netherlands Public Transport Data

This module provides functionality to download and parse GTFS (General Transit Feed 
Specification) data from gtfs.ovapi.nl. It handles the entire pipeline from downloading
the ZIP file to parsing the relevant CSV files into structured data.

Usage:
    from gtfs_parser import GTFSParser
    
    parser = GTFSParser()
    gtfs_data = parser.load_gtfs_data()
    
    # Access parsed data
    stops = gtfs_data['stops']
    routes = gtfs_data['routes']

Author: Laurynas Keturakis
Date: December 2025
"""

import logging
import os
import zipfile
from pathlib import Path
from typing import Dict, List, Optional
from urllib.parse import urljoin

import pandas as pd
import requests

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class GTFSParser:
    """
    Parser for GTFS data from gtfs.ovapi.nl
    
    This class handles downloading the GTFS feed, extracting relevant files,
    and parsing them into structured Python data structures.
    
    Attributes:
        base_url (str): Base URL for the GTFS feed
        cache_dir (Path): Directory for caching downloaded files
        gtfs_filename (str): Name of the GTFS ZIP file
    """
    
    BASE_URL = "https://gtfs.ovapi.nl/nl/"
    GTFS_FILENAME = "gtfs-nl.zip"
    
    # GTFS files we need to parse
    REQUIRED_FILES = [
        "stops.txt",
        "routes.txt",
        "trips.txt",
        "stop_times.txt",
    ]
    
    # Optional files that provide additional context
    OPTIONAL_FILES = [
        "agency.txt",
        "calendar.txt",
        "calendar_dates.txt",
    ]
    
    def __init__(self, cache_dir: Optional[str] = None):
        """
        Initialize the GTFS parser.
        
        Args:
            cache_dir: Directory to cache downloaded GTFS files. 
                      Defaults to ./gtfs_cache/
        """
        if cache_dir is None:
            cache_dir = Path.cwd() / "gtfs_cache"
        else:
            cache_dir = Path(cache_dir)
        
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        
        self.zip_path = self.cache_dir / self.GTFS_FILENAME
        self.extract_dir = self.cache_dir / "extracted"
        
        logger.info(f"GTFSParser initialized with cache dir: {self.cache_dir}")
    
    def download_gtfs_data(self, force: bool = False) -> Path:
        """
        Download GTFS data from gtfs.ovapi.nl
        
        Args:
            force: If True, download even if cached file exists
            
        Returns:
            Path to the downloaded ZIP file
            
        Raises:
            requests.RequestException: If download fails
        """
        if self.zip_path.exists() and not force:
            logger.info(f"Using cached GTFS data: {self.zip_path}")
            return self.zip_path
        
        url = urljoin(self.BASE_URL, self.GTFS_FILENAME)
        logger.info(f"Downloading GTFS data from {url}...")
        
        try:
            response = requests.get(url, stream=True, timeout=30)
            response.raise_for_status()
            
            total_size = int(response.headers.get('content-length', 0))
            logger.info(f"Downloading {total_size / 1024 / 1024:.2f} MB...")
            
            with open(self.zip_path, 'wb') as f:
                downloaded = 0
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        downloaded += len(chunk)
                        if total_size > 0:
                            progress = (downloaded / total_size) * 100
                            if downloaded % (1024 * 1024) == 0:  # Log every MB
                                logger.info(f"Progress: {progress:.1f}%")
            
            logger.info(f"✓ Downloaded GTFS data to {self.zip_path}")
            return self.zip_path
            
        except requests.RequestException as e:
            logger.error(f"Failed to download GTFS data: {e}")
            raise
    
    def extract_gtfs_files(self) -> Path:
        """
        Extract GTFS files from the ZIP archive.
        
        Returns:
            Path to the extraction directory
            
        Raises:
            zipfile.BadZipFile: If ZIP file is corrupted
        """
        if not self.zip_path.exists():
            raise FileNotFoundError(f"GTFS ZIP file not found: {self.zip_path}")
        
        logger.info(f"Extracting GTFS files to {self.extract_dir}...")
        self.extract_dir.mkdir(parents=True, exist_ok=True)
        
        try:
            with zipfile.ZipFile(self.zip_path, 'r') as zip_ref:
                zip_ref.extractall(self.extract_dir)
            
            logger.info(f"✓ Extracted GTFS files")
            return self.extract_dir
            
        except zipfile.BadZipFile as e:
            logger.error(f"Failed to extract ZIP file: {e}")
            raise
    
    def parse_gtfs_file(self, filename: str) -> pd.DataFrame:
        """
        Parse a single GTFS CSV file into a pandas DataFrame.
        
        Args:
            filename: Name of the GTFS file (e.g., 'stops.txt')
            
        Returns:
            DataFrame containing the parsed data
            
        Raises:
            FileNotFoundError: If the file doesn't exist
            pd.errors.ParserError: If CSV parsing fails
        """
        file_path = self.extract_dir / filename
        
        if not file_path.exists():
            raise FileNotFoundError(f"GTFS file not found: {file_path}")
        
        logger.info(f"Parsing {filename}...")
        
        try:
            # Parse CSV with proper encoding handling
            df = pd.read_csv(file_path, encoding='utf-8-sig', low_memory=False)
            logger.info(f"✓ Parsed {filename}: {len(df)} records")
            return df
            
        except pd.errors.ParserError as e:
            logger.error(f"Failed to parse {filename}: {e}")
            raise
    
    def load_gtfs_data(self, force_download: bool = False) -> Dict[str, pd.DataFrame]:
        """
        Complete pipeline: download, extract, and parse GTFS data.
        
        Args:
            force_download: If True, re-download even if cached
            
        Returns:
            Dictionary mapping file names to DataFrames:
            {
                'stops': DataFrame,
                'routes': DataFrame,
                'trips': DataFrame,
                'stop_times': DataFrame,
                'agency': DataFrame (optional),
                'calendar': DataFrame (optional),
            }
            
        Raises:
            Exception: If any step of the pipeline fails
        """
        logger.info("Starting GTFS data loading pipeline...")
        
        try:
            # Step 1: Download
            self.download_gtfs_data(force=force_download)
            
            # Step 2: Extract
            self.extract_gtfs_files()
            
            # Step 3: Parse required files
            gtfs_data = {}
            
            for filename in self.REQUIRED_FILES:
                try:
                    key = filename.replace('.txt', '')
                    gtfs_data[key] = self.parse_gtfs_file(filename)
                except FileNotFoundError as e:
                    logger.error(f"Required file missing: {filename}")
                    raise
            
            # Step 4: Parse optional files (don't fail if missing)
            for filename in self.OPTIONAL_FILES:
                try:
                    key = filename.replace('.txt', '')
                    gtfs_data[key] = self.parse_gtfs_file(filename)
                except FileNotFoundError:
                    logger.warning(f"Optional file not found: {filename}")
            
            logger.info("✓ GTFS data loading complete")
            logger.info(f"Loaded {len(gtfs_data)} files:")
            for key, df in gtfs_data.items():
                logger.info(f"  - {key}: {len(df)} records")
            
            return gtfs_data
            
        except Exception as e:
            logger.error(f"Failed to load GTFS data: {e}")
            raise
    
    def get_route_types_summary(self, gtfs_data: Dict[str, pd.DataFrame]) -> Dict[int, str]:
        """
        Get a summary of route types present in the data.
        
        Args:
            gtfs_data: Parsed GTFS data dictionary
            
        Returns:
            Dictionary mapping route_type codes to descriptions
        """
        ROUTE_TYPE_NAMES = {
            0: "Tram/Light Rail",
            1: "Metro/Subway",
            2: "Rail",
            3: "Bus",
            4: "Ferry",
            5: "Cable Car",
            6: "Gondola",
            7: "Funicular",
        }
        
        routes = gtfs_data.get('routes')
        if routes is None or 'route_type' not in routes.columns:
            return {}
        
        unique_types = routes['route_type'].unique()
        return {rt: ROUTE_TYPE_NAMES.get(rt, f"Unknown ({rt})") for rt in unique_types}


def main():
    """
    Example usage of the GTFSParser.
    """
    # Initialize parser
    parser = GTFSParser()
    
    # Load GTFS data
    gtfs_data = parser.load_gtfs_data()
    
    # Display some statistics
    print("\n" + "="*60)
    print("GTFS Data Summary")
    print("="*60)
    
    stops = gtfs_data['stops']
    routes = gtfs_data['routes']
    trips = gtfs_data['trips']
    
    print(f"\nTotal Stops: {len(stops):,}")
    print(f"Total Routes: {len(routes):,}")
    print(f"Total Trips: {len(trips):,}")
    
    # Show route types
    route_types = parser.get_route_types_summary(gtfs_data)
    print("\nRoute Types:")
    for route_type, name in sorted(route_types.items()):
        count = len(routes[routes['route_type'] == route_type])
        print(f"  {route_type}: {name} ({count} routes)")
    
    # Show some example stops in Amsterdam
    print("\nExample Amsterdam Stops:")
    amsterdam_stops = stops[stops['stop_name'].str.contains('Amsterdam', case=False, na=False)].head(10)
    for _, stop in amsterdam_stops.iterrows():
        print(f"  - {stop['stop_name']} (ID: {stop['stop_id']})")
    
    print("\n" + "="*60)


if __name__ == "__main__":
    main()
