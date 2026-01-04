/**
 * GTFS Container Server
 * Bun-based server for processing GTFS data
 */

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

interface GTFSProcessRequest {
  url?: string;
  data?: string;
  operation: 'parse' | 'validate' | 'transform';
}

const server = Bun.serve({
  port: PORT,
  hostname: HOST,
  
  async fetch(req: Request) {
    const url = new URL(req.url);
    
    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // GTFS processing endpoint
    if (url.pathname === '/process' && req.method === 'POST') {
      try {
        const body = await req.json() as GTFSProcessRequest;
        
        // TODO: Implement GTFS processing logic
        const result = {
          success: true,
          operation: body.operation,
          message: 'GTFS processing not yet implemented',
          timestamp: new Date().toISOString()
        };
        
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    // Root endpoint
    if (url.pathname === '/') {
      return new Response(JSON.stringify({
        service: 'GTFS Container',
        version: '0.1.0',
        endpoints: {
          health: '/health',
          process: '/process (POST)'
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response('Not Found', { status: 404 });
  },
  
  error(error: Error) {
    return new Response(JSON.stringify({
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

console.log(`🚀 GTFS Container Server running on http://${HOST}:${PORT}`);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  server.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down...');
  server.stop();
  process.exit(0);
});
