/**
 * GTFS Parser for Dutch public transport data
 * 
 * This package provides comprehensive utilities for parsing and querying GTFS
 * (General Transit Feed Specification) data with support for:
 * - Streaming CSV parsing for memory efficiency
 * - Graph-based journey planning with Dijkstra's algorithm
 * - Fuzzy search for Amsterdam stations
 * - GTFS-Realtime Protocol Buffer support
 * - Geo-spatial utilities for distance calculations
 */

export * from './types';
export * from './parser';
export * from './query';
export * from './journey-planner';
export * from './fuzzy-search';
export * from './realtime';
export * from './utils';
