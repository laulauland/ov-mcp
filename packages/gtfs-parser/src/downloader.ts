import { unzipSync } from 'fflate';
import { GTFSParser } from './parser';
import { GTFSFeed } from './types';

/**
 * GTFS Data Downloader
 * Downloads and caches GTFS data from gtfs.ovapi.nl
 */
export class GTFSDownloader {
  private static readonly GTFS_URL = 'http://gtfs.ovapi.nl/gtfs-nl.zip';
  private static readonly CACHE_DIR = './data/gtfs-cache';
  private static readonly CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Download GTFS data from gtfs.ovapi.nl
   */
  static async downloadGTFS(): Promise<ArrayBuffer> {
    console.error('Downloading GTFS data from', this.GTFS_URL);
    
    try {
      const response = await fetch(this.GTFS_URL);
      
      if (!response.ok) {
        throw new Error(`Failed to download GTFS data: ${response.status} ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      console.error(`Downloaded ${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`);
      
      return arrayBuffer;
    } catch (error) {
      console.error('Error downloading GTFS data:', error);
      throw error;
    }
  }

  /**
   * Extract and parse GTFS zip file
   */
  static async extractGTFS(zipBuffer: ArrayBuffer): Promise<GTFSFeed> {
    console.error('Extracting GTFS data...');
    
    try {
      const uint8Array = new Uint8Array(zipBuffer);
      const unzipped = unzipSync(uint8Array);
      
      // Parse each required file
      const agencies = unzipped['agency.txt'] 
        ? GTFSParser.parseAgencies(new TextDecoder().decode(unzipped['agency.txt']))
        : [];
      
      const stops = unzipped['stops.txt']
        ? GTFSParser.parseStops(new TextDecoder().decode(unzipped['stops.txt']))
        : [];
      
      const routes = unzipped['routes.txt']
        ? GTFSParser.parseRoutes(new TextDecoder().decode(unzipped['routes.txt']))
        : [];
      
      const trips = unzipped['trips.txt']
        ? GTFSParser.parseTrips(new TextDecoder().decode(unzipped['trips.txt']))
        : [];
      
      const stop_times = unzipped['stop_times.txt']
        ? GTFSParser.parseStopTimes(new TextDecoder().decode(unzipped['stop_times.txt']))
        : [];
      
      const calendar = unzipped['calendar.txt']
        ? GTFSParser.parseCalendar(new TextDecoder().decode(unzipped['calendar.txt']))
        : [];

      console.error(`Parsed ${stops.length} stops, ${routes.length} routes, ${trips.length} trips`);

      return {
        agencies,
        stops,
        routes,
        trips,
        stop_times,
        calendar,
      };
    } catch (error) {
      console.error('Error extracting GTFS data:', error);
      throw error;
    }
  }

  /**
   * Download and parse GTFS data in one step
   */
  static async fetchAndParse(): Promise<GTFSFeed> {
    const zipBuffer = await this.downloadGTFS();
    return await this.extractGTFS(zipBuffer);
  }

  /**
   * Save GTFS feed to file system cache
   */
  static async saveToCacheFS(feed: GTFSFeed): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      await fs.mkdir(this.CACHE_DIR, { recursive: true });
      
      const cacheFile = path.join(this.CACHE_DIR, 'gtfs-feed.json');
      const metaFile = path.join(this.CACHE_DIR, 'metadata.json');
      
      await fs.writeFile(cacheFile, JSON.stringify(feed));
      await fs.writeFile(metaFile, JSON.stringify({
        lastUpdated: new Date().toISOString(),
        stopCount: feed.stops.length,
        routeCount: feed.routes.length,
        tripCount: feed.trips.length,
      }));
      
      console.error(`Cached GTFS data to ${cacheFile}`);
    } catch (error) {
      console.error('Error saving to cache:', error);
      throw error;
    }
  }

  /**
   * Load GTFS feed from file system cache
   */
  static async loadFromCacheFS(): Promise<GTFSFeed | null> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      const cacheFile = path.join(this.CACHE_DIR, 'gtfs-feed.json');
      const metaFile = path.join(this.CACHE_DIR, 'metadata.json');
      
      // Check if cache exists
      try {
        await fs.access(cacheFile);
      } catch {
        return null;
      }

      // Check cache age
      const metadata = JSON.parse(await fs.readFile(metaFile, 'utf-8'));
      const lastUpdated = new Date(metadata.lastUpdated);
      const now = new Date();
      
      if (now.getTime() - lastUpdated.getTime() > this.CACHE_DURATION_MS) {
        console.error('Cache expired');
        return null;
      }

      // Load and return cached data
      const data = await fs.readFile(cacheFile, 'utf-8');
      console.error('Loaded GTFS data from cache');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading from cache:', error);
      return null;
    }
  }

  /**
   * Get GTFS feed with caching
   */
  static async getFeed(): Promise<GTFSFeed> {
    // Try to load from cache first
    const cached = await this.loadFromCacheFS();
    if (cached) {
      return cached;
    }

    // Download and parse new data
    console.error('Cache miss - downloading fresh GTFS data...');
    const feed = await this.fetchAndParse();
    
    // Save to cache for next time
    await this.saveToCacheFS(feed);
    
    return feed;
  }
}
