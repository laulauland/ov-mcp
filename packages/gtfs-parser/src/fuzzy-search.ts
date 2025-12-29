import type { GTFSStop, FuzzySearchResult } from './types';
import { calculateDistance } from './utils';

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * Calculate fuzzy match score (0-1, higher is better)
 */
function calculateFuzzyScore(query: string, target: string): number {
  const queryLower = query.toLowerCase().trim();
  const targetLower = target.toLowerCase().trim();

  // Exact match
  if (queryLower === targetLower) return 1.0;

  // Starts with query
  if (targetLower.startsWith(queryLower)) return 0.9;

  // Contains query
  if (targetLower.includes(queryLower)) return 0.8;

  // Calculate Levenshtein distance
  const distance = levenshteinDistance(queryLower, targetLower);
  const maxLength = Math.max(queryLower.length, targetLower.length);
  const similarity = 1 - distance / maxLength;

  // Only return scores above threshold
  return similarity > 0.6 ? similarity * 0.7 : 0;
}

/**
 * Fuzzy search for Amsterdam stations and stops
 */
export class FuzzySearch {
  private stops: GTFSStop[];
  private amsterdamCenter = { lat: 52.3702, lon: 4.8952 };
  private amsterdamRadius = 20000; // 20km radius

  constructor(stops: GTFSStop[]) {
    this.stops = stops;
  }

  /**
   * Search for stops by name with fuzzy matching
   */
  public searchStops(
    query: string,
    options: {
      maxResults?: number;
      minScore?: number;
      amsterdamOnly?: boolean;
      includeParentStations?: boolean;
    } = {}
  ): FuzzySearchResult[] {
    const {
      maxResults = 10,
      minScore = 0.5,
      amsterdamOnly = false,
      includeParentStations = true,
    } = options;

    const results: FuzzySearchResult[] = [];

    for (const stop of this.stops) {
      // Filter by location if Amsterdam only
      if (amsterdamOnly) {
        const distance = calculateDistance(
          this.amsterdamCenter.lat,
          this.amsterdamCenter.lon,
          stop.stop_lat,
          stop.stop_lon
        );
        if (distance > this.amsterdamRadius) continue;
      }

      // Filter by location type
      if (!includeParentStations && stop.location_type === '1') {
        continue;
      }

      const matchedFields: string[] = [];
      let maxScore = 0;

      // Check stop name
      const nameScore = calculateFuzzyScore(query, stop.stop_name);
      if (nameScore > maxScore) {
        maxScore = nameScore;
        matchedFields.push('stop_name');
      }

      // Check stop code
      if (stop.stop_code) {
        const codeScore = calculateFuzzyScore(query, stop.stop_code);
        if (codeScore > maxScore) {
          maxScore = codeScore;
          matchedFields.push('stop_code');
        }
      }

      // Check stop description
      if (stop.stop_desc) {
        const descScore = calculateFuzzyScore(query, stop.stop_desc);
        if (descScore > maxScore) {
          maxScore = descScore;
          matchedFields.push('stop_desc');
        }
      }

      // Check platform code
      if (stop.platform_code) {
        const platformScore = calculateFuzzyScore(query, stop.platform_code);
        if (platformScore > maxScore) {
          maxScore = platformScore;
          matchedFields.push('platform_code');
        }
      }

      if (maxScore >= minScore) {
        results.push({
          stop,
          score: maxScore,
          matchedFields,
        });
      }
    }

    // Sort by score (descending) and limit results
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, maxResults);
  }

  /**
   * Search specifically for Amsterdam Central Station variations
   */
  public searchAmsterdamCentralStation(): FuzzySearchResult[] {
    const variations = [
      'Amsterdam Centraal',
      'Amsterdam Central',
      'Amsterdam CS',
      'A'dam Centraal',
      'Centraal Station',
    ];

    const allResults: FuzzySearchResult[] = [];

    for (const variation of variations) {
      const results = this.searchStops(variation, {
        amsterdamOnly: true,
        maxResults: 5,
      });
      allResults.push(...results);
    }

    // Deduplicate by stop_id
    const unique = new Map<string, FuzzySearchResult>();
    for (const result of allResults) {
      const existing = unique.get(result.stop.stop_id);
      if (!existing || result.score > existing.score) {
        unique.set(result.stop.stop_id, result);
      }
    }

    return Array.from(unique.values()).sort((a, b) => b.score - a.score);
  }

  /**
   * Search for stops near a location
   */
  public searchNearby(
    lat: number,
    lon: number,
    radiusMeters: number = 500,
    query?: string
  ): FuzzySearchResult[] {
    const results: FuzzySearchResult[] = [];

    for (const stop of this.stops) {
      const distance = calculateDistance(lat, lon, stop.stop_lat, stop.stop_lon);

      if (distance <= radiusMeters) {
        let score = 1 - distance / radiusMeters; // Distance-based score

        // If query provided, combine with fuzzy match
        if (query) {
          const fuzzyScore = calculateFuzzyScore(query, stop.stop_name);
          score = (score + fuzzyScore) / 2;
        }

        results.push({
          stop,
          score,
          matchedFields: query ? ['stop_name', 'location'] : ['location'],
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results;
  }

  /**
   * Get major Amsterdam transit hubs
   */
  public getAmsterdamHubs(): GTFSStop[] {
    const hubKeywords = [
      'Centraal',
      'Zuid',
      'Amstel',
      'Sloterdijk',
      'Bijlmer',
      'Schiphol',
      'Lelylaan',
      'RAI',
      'Science Park',
      'Muiderpoort',
    ];

    const hubs: GTFSStop[] = [];

    for (const keyword of hubKeywords) {
      const results = this.searchStops(`Amsterdam ${keyword}`, {
        amsterdamOnly: true,
        maxResults: 3,
        includeParentStations: true,
      });

      if (results.length > 0) {
        hubs.push(results[0].stop);
      }
    }

    return hubs;
  }
}
