/**
 * Simple logger utility for the MCP server
 * Logs to stderr to avoid interfering with stdio transport
 */

export const logger = {
  info: (message: string, ...args: any[]) => {
    console.error(`[INFO] ${message}`, ...args);
  },
  warn: (message: string, ...args: any[]) => {
    console.error(`[WARN] ${message}`, ...args);
  },
  error: (message: string, ...args: any[]) => {
    console.error(`[ERROR] ${message}`, ...args);
  },
  debug: (message: string, ...args: any[]) => {
    if (process.env.DEBUG) {
      console.error(`[DEBUG] ${message}`, ...args);
    }
  },
};
