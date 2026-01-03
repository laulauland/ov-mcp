import { unzipSync } from 'fflate';
import { GTFSParser } from './parser';
import { GTFSFeed } from './types';

/**
 * GTFS Data Downloader
 * Downloads and parses GTFS data - browser/edge runtime compatible
 */
export class GTFSDownloader {
  private static readonly DEFAULT_GTFS_URL = 'http://gtfs.ovapi.nl/gtfs-nl.zip';

  /**
   * Download GTFS data from a URL
   */
  static async download(url: string = this.DEFAULT_GTFS_URL): Promise<ArrayBuffer> {
    console.log('Downloading GTFS data from', url);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to download GTFS data: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    console.log(`Downloaded ${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`);

    return arrayBuffer;
  }

  /**
   * Extract and parse GTFS zip buffer into a feed
   */
  static extract(zipBuffer: ArrayBuffer): GTFSFeed {
    console.log('Extracting GTFS data...');

    const uint8Array = new Uint8Array(zipBuffer);
    const unzipped = unzipSync(uint8Array);

    const decode = (data: Uint8Array | undefined): string => {
      if (!data) return '';
      return new TextDecoder().decode(data);
    };

    // Parse each required file
    const agencies = unzipped['agency.txt']
      ? GTFSParser.parseAgencies(decode(unzipped['agency.txt']))
      : [];

    const stops = unzipped['stops.txt']
      ? GTFSParser.parseStops(decode(unzipped['stops.txt']))
      : [];

    const routes = unzipped['routes.txt']
      ? GTFSParser.parseRoutes(decode(unzipped['routes.txt']))
      : [];

    const trips = unzipped['trips.txt']
      ? GTFSParser.parseTrips(decode(unzipped['trips.txt']))
      : [];

    const stop_times = unzipped['stop_times.txt']
      ? GTFSParser.parseStopTimes(decode(unzipped['stop_times.txt']))
      : [];

    const calendar = unzipped['calendar.txt']
      ? GTFSParser.parseCalendar(decode(unzipped['calendar.txt']))
      : [];

    console.log(`Parsed ${stops.length} stops, ${routes.length} routes, ${trips.length} trips`);

    return {
      agencies,
      stops,
      routes,
      trips,
      stop_times,
      calendar,
    };
  }

  /**
   * Download and parse GTFS data in one step
   */
  static async fetchAndParse(url?: string): Promise<GTFSFeed> {
    const zipBuffer = await this.download(url);
    return this.extract(zipBuffer);
  }
}
