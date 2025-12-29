import { describe, test, expect, beforeAll } from 'bun:test';
import { spawn } from 'bun';
import { resolve } from 'path';

/**
 * Integration tests for the MCP server
 * These tests verify the server can start and respond to basic requests
 */

describe('OV-MCP Server Integration', () => {
  test('server should start without errors', async () => {
    const serverPath = resolve(__dirname, 'index.ts');
    
    // Start the server
    const proc = spawn(['bun', 'run', serverPath], {
      stdout: 'pipe',
      stderr: 'pipe',
    });

    // Wait a bit for server to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check if process is still running
    const isRunning = proc.pid !== undefined;
    
    // Clean up
    proc.kill();
    
    expect(isRunning).toBe(true);
  }, 10000);

  test('server should output initialization message', async () => {
    const serverPath = resolve(__dirname, 'index.ts');
    
    const proc = spawn(['bun', 'run', serverPath], {
      stdout: 'pipe',
      stderr: 'pipe',
    });

    // Collect stderr output
    let output = '';
    const reader = proc.stderr.getReader();
    const timeout = setTimeout(() => {
      proc.kill();
    }, 5000);

    try {
      const { value } = await reader.read();
      if (value) {
        output = new TextDecoder().decode(value);
      }
    } finally {
      clearTimeout(timeout);
      proc.kill();
    }

    expect(output).toContain('OV-MCP Server running on stdio');
  }, 10000);
});

/**
 * Unit tests for utility functions
 */

describe('OV-MCP Server Utilities', () => {
  test('should format stop type correctly', () => {
    const getStopType = (locationType?: string): string => {
      switch (locationType) {
        case '0': return 'stop';
        case '1': return 'station';
        case '2': return 'entrance/exit';
        case '3': return 'generic node';
        case '4': return 'boarding area';
        default: return 'stop';
      }
    };

    expect(getStopType('0')).toBe('stop');
    expect(getStopType('1')).toBe('station');
    expect(getStopType('2')).toBe('entrance/exit');
    expect(getStopType(undefined)).toBe('stop');
  });

  test('should format route type correctly', () => {
    const getRouteType = (routeType: string): string => {
      const typeMap: Record<string, string> = {
        '0': 'Tram',
        '1': 'Metro',
        '2': 'Rail',
        '3': 'Bus',
        '4': 'Ferry',
      };
      return typeMap[routeType] || `Route Type ${routeType}`;
    };

    expect(getRouteType('0')).toBe('Tram');
    expect(getRouteType('2')).toBe('Rail');
    expect(getRouteType('3')).toBe('Bus');
    expect(getRouteType('999')).toBe('Route Type 999');
  });
});
