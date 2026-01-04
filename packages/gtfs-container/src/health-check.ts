/**
 * Health Check Utility
 * Checks the health status of the GTFS container server
 */

const HEALTH_URL = process.env.HEALTH_URL || 'http://localhost:3000/health';
const TIMEOUT_MS = parseInt(process.env.HEALTH_TIMEOUT || '5000', 10);

interface HealthResponse {
  status: string;
  timestamp: string;
  uptime: number;
}

async function checkHealth(): Promise<void> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    
    const response = await fetch(HEALTH_URL, {
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.error(`❌ Health check failed: HTTP ${response.status}`);
      process.exit(1);
    }
    
    const data = await response.json() as HealthResponse;
    
    if (data.status === 'healthy') {
      console.log('✅ Health check passed');
      console.log(`   Status: ${data.status}`);
      console.log(`   Uptime: ${Math.floor(data.uptime)}s`);
      console.log(`   Timestamp: ${data.timestamp}`);
      process.exit(0);
    } else {
      console.error(`❌ Health check failed: status is ${data.status}`);
      process.exit(1);
    }
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        console.error(`❌ Health check timeout after ${TIMEOUT_MS}ms`);
      } else {
        console.error(`❌ Health check error: ${error.message}`);
      }
    } else {
      console.error('❌ Health check failed with unknown error');
    }
    process.exit(1);
  }
}

// Run health check
checkHealth();
