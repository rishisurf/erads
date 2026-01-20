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
import { requireAdmin, verifyAdminCredentials } from './middleware/auth';
import { checkRoute, keysRoute, statsRoute, bansRoute, settingsRoute } from './routes';
import { initIPIntel, ipIntelRoutes, shutdownIPIntel } from './ip-intel';

// Initialize the application
const app = new Hono();

// ============================================================================
// Database Initialization (runs once at startup)
// ============================================================================
// Initialize database before handling any requests
await getDatabase();
logger.info('Database initialized');

// Initialize IP Intelligence module
await initIPIntel();
logger.info('IP Intelligence module initialized');

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
    authRequired: !!config.admin.secret,
    endpoints: {
      check: 'POST /v1/check - Check if a request should be allowed (PUBLIC)',
      auth: 'POST /v1/auth/verify - Verify admin credentials',
      keys: 'POST /v1/keys - Create/manage API keys (ADMIN)',
      stats: 'GET /v1/stats - Get aggregated statistics (ADMIN)',
      bans: '/v1/bans - Manage bans (ADMIN)',
      settings: '/v1/settings - Manage settings (ADMIN)',
      health: 'GET /v1/stats/health - Health check (PUBLIC)',
      ipIntel: {
        check: 'POST /v1/ip/check - Check IP reputation (PUBLIC)',
        block: 'POST /v1/ip/block - Manually block IP/ASN (ADMIN)',
        stats: 'GET /v1/ip/stats - IP intel statistics (ADMIN)',
      },
    },
  });
});

// ============================================================================
// Authentication
// ============================================================================

// Auth verification endpoint (public)
app.post('/v1/auth/verify', verifyAdminCredentials);

// ============================================================================
// API Routes (v1)
// ============================================================================

// PUBLIC: Rate limiting check endpoint (what your apps call)
app.route('/v1/check', checkRoute);

// PROTECTED: Admin routes require authentication
// Apply auth middleware to all admin route paths
app.use('/v1/keys', requireAdmin());
app.use('/v1/keys/*', requireAdmin());
app.use('/v1/bans', requireAdmin());
app.use('/v1/bans/*', requireAdmin());
app.use('/v1/settings', requireAdmin());
app.use('/v1/settings/*', requireAdmin());
app.use('/v1/stats', requireAdmin());
app.use('/v1/stats/*', requireAdmin());

// Mount admin routes
app.route('/v1/keys', keysRoute);
app.route('/v1/stats', statsRoute);
app.route('/v1/bans', bansRoute);
app.route('/v1/settings', settingsRoute);

// IP Intelligence routes (check is public, management is admin)
app.use('/v1/ip/block', requireAdmin());
app.use('/v1/ip/blocks', requireAdmin());
app.use('/v1/ip/stats', requireAdmin());
app.use('/v1/ip/maintenance/*', requireAdmin());
app.route('/v1/ip', ipIntelRoutes);

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

// Graceful shutdown handler
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  shutdownIPIntel();
  process.exit(0);
});
