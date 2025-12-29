import { GTFSParser } from "@ov-mcp/gtfs-parser";
import { logger } from "./logger.js";
import type { GTFSData } from "./types.js";
import * as fs from "fs";
import * as path from "path";

const GTFS_URL = "https://gtfs.ovapi.nl/nl/gtfs-nl.zip";
const CACHE_DIR = path.join(process.cwd(), ".cache");
const CACHE_FILE = path.join(CACHE_DIR, "gtfs-data.json");
const CACHE_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

/**
 * GTFSLoader handles downloading, caching, and loading GTFS data
 * from gtfs.ovapi.nl for Dutch public transport.
 */
export class GTFSLoader {
  private data: GTFSData | null = null;
  private parser: GTFSParser;
  private loading: Promise<void> | null = null;

  constructor() {
    this.parser = new GTFSParser();
  }

  /**
   * Check if GTFS data is loaded
   */
  isLoaded(): boolean {
    return this.data !== null;
  }

  /**
   * Get loaded GTFS data
   */
  getData(): GTFSData {
    if (!this.data) {
      throw new Error("GTFS data not loaded. Call load() first.");
    }
    return this.data;
  }

  /**
   * Load GTFS data (from cache or download)
   */
  async load(): Promise<void> {
    // If already loading, wait for it
    if (this.loading) {
      return this.loading;
    }

    // If already loaded, return
    if (this.data) {
      return;
    }

    this.loading = this.loadInternal();
    await this.loading;
    this.loading = null;
  }

  private async loadInternal(): Promise<void> {
    try {
      // Try loading from cache first
      const cached = await this.loadFromCache();
      if (cached) {
        this.data = cached;
        logger.info("Loaded GTFS data from cache");
        return;
      }

      // Download and parse fresh data
      logger.info("Downloading GTFS data from", GTFS_URL);
      await this.downloadAndParse();
      
      // Save to cache
      await this.saveToCache();
      logger.info("GTFS data downloaded and cached");
    } catch (error) {
      logger.error("Failed to load GTFS data:", error);
      throw error;
    }
  }

  private async loadFromCache(): Promise<GTFSData | null> {
    try {
      // Check if cache file exists
      if (!fs.existsSync(CACHE_FILE)) {
        return null;
      }

      // Check cache age
      const stats = fs.statSync(CACHE_FILE);
      const age = Date.now() - stats.mtimeMs;
      if (age > CACHE_MAX_AGE) {
        logger.info("Cache expired, will download fresh data");
        return null;
      }

      // Load from cache
      const content = fs.readFileSync(CACHE_FILE, "utf-8");
      return JSON.parse(content) as GTFSData;
    } catch (error) {
      logger.warn("Failed to load from cache:", error);
      return null;
    }
  }

  private async saveToCache(): Promise<void> {
    if (!this.data) return;

    try {
      // Ensure cache directory exists
      if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
      }

      // Save to cache
      fs.writeFileSync(CACHE_FILE, JSON.stringify(this.data), "utf-8");
    } catch (error) {
      logger.warn("Failed to save to cache:", error);
    }
  }

  private async downloadAndParse(): Promise<void> {
    try {
      // Download GTFS zip file
      const response = await fetch(GTFS_URL);
      if (!response.ok) {
        throw new Error(`Failed to download GTFS data: ${response.statusText}`);
      }

      const buffer = await response.arrayBuffer();
      
      // Parse GTFS data
      const parsedData = await this.parser.parseZip(Buffer.from(buffer));
      
      // Convert to our format
      this.data = {
        stops: parsedData.stops || [],
        routes: parsedData.routes || [],
        trips: parsedData.trips || [],
        stopTimes: parsedData.stop_times || [],
        agencies: parsedData.agency || [],
      };
    } catch (error) {
      logger.error("Failed to download and parse GTFS data:", error);
      throw error;
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    try {
      if (fs.existsSync(CACHE_FILE)) {
        fs.unlinkSync(CACHE_FILE);
        logger.info("Cache cleared");
      }
    } catch (error) {
      logger.error("Failed to clear cache:", error);
    }
  }
}
