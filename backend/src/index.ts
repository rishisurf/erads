/**
 * Edge-Inspired Rate Limiting & Abuse Detection Service
 * 
 * Main application entry point.
 * 
 * Architecture Overview:
 * - Hono framework for lightweight, edge-ready HTTP handling
 * - SQLite database for persistent storage (WAL mode for performance)
 * - Layered architecture: routes → services → repositories → database
 * - Middleware-first design for reusability
 * 
 * Key Features:
 * - IP-based and API key-based rate limiting
 * - Fixed and sliding window algorithms
 * - Burst detection with automatic temporary bans
 * - Geo-blocking support
 * - Comprehensive statistics and logging
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { prettyJSON } from 'hono/pretty-json';
import { getDatabase } from './db';
import { config } from './config/env';
import { logger } from './utils/logger';
import { errorHandler, requestLogger } from './middleware';
import { checkRoute, keysRoute, statsRoute, bansRoute, settingsRoute } from './routes';

// Initialize the application
const app = new Hono();

// ============================================================================
// Database Initialization (runs once at startup)
// ============================================================================
// Initialize database before handling any requests
await getDatabase();
logger.info('Database initialized');

// ============================================================================
// Global Middleware
// ============================================================================

// CORS - adjust origins for production
app.use('*', cors({
  origin: config.server.isProduction
    ? ['https://your-frontend-domain.com'] // Replace with actual frontend domain
    : '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  exposeHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'X-Request-ID'],
  maxAge: 86400,
}));

// Pretty JSON for development
if (!config.server.isProduction) {
  app.use('*', prettyJSON());
}

// Error handling and request logging
app.use('*', errorHandler());
app.use('*', requestLogger());

// ============================================================================
// Health & Info Endpoints
// ============================================================================

// Root endpoint - service info
app.get('/', (c) => {
  return c.json({
    name: 'Edge Rate Limiter',
    version: '1.0.0',
    description: 'Rate limiting and abuse detection service',
    endpoints: {
      check: 'POST /v1/check - Check if a request should be allowed',
      keys: 'POST /v1/keys - Create/manage API keys',
      stats: 'GET /v1/stats - Get aggregated statistics',
      bans: '/v1/bans - Manage bans',
      settings: '/v1/settings - Manage settings (geo-blocking)',
      health: 'GET /v1/stats/health - Health check',
    },
  });
});

// ============================================================================
// API Routes (v1)
// ============================================================================

// Mount all routes under /v1
app.route('/v1/check', checkRoute);
app.route('/v1/keys', keysRoute);
app.route('/v1/stats', statsRoute);
app.route('/v1/bans', bansRoute);
app.route('/v1/settings', settingsRoute);

// ============================================================================
// 404 Handler
// ============================================================================

app.notFound((c) => {
  return c.json({
    error: 'Not found',
    code: 'not_found',
    path: new URL(c.req.url).pathname,
  }, 404);
});

// ============================================================================
// Server Configuration for Bun
// ============================================================================

// Log startup info
logger.info(`🚀 Rate Limiter service starting`, {
  port: config.server.port,
  environment: config.server.env,
});

logger.info('Configuration', {
  rateLimit: {
    default: config.rateLimit.defaultLimit,
    windowSeconds: config.rateLimit.defaultWindowSeconds,
    algorithm: config.rateLimit.useSlidingWindow ? 'sliding' : 'fixed',
  },
  abuse: {
    burstThreshold: config.abuse.burstThreshold,
    burstWindowSeconds: config.abuse.burstWindowSeconds,
    geoBlocking: config.abuse.geoBlockingEnabled,
  },
});

// Export for Bun to serve
// Bun automatically picks up this export and serves it
export default {
  port: config.server.port,
  fetch: app.fetch,
};
