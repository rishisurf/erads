/**
 * Stats Route - GET /v1/stats
 * 
 * Endpoint for aggregated metrics and analytics.
 */

import { Hono } from 'hono';
import { StatsService } from '../services/stats';
import type { StatsQuery } from '../types';

const statsRoute = new Hono();

// Lazy initialization to avoid database initialization order issues
let statsService: StatsService | null = null;
function getStatsService(): StatsService {
    if (!statsService) {
        statsService = new StatsService();
    }
    return statsService;
}

/**
 * GET /v1/stats
 * Get aggregated statistics
 * 
 * Query params:
 * - startDate: ISO date string (default: 24 hours ago)
 * - endDate: ISO date string (default: now)
 * - limit: number for top lists (default: 10, max: 50)
 * 
 * Response:
 * {
 *   "period": { "start": string, "end": string },
 *   "requests": {
 *     "total": number,
 *     "allowed": number,
 *     "blocked": number,
 *     "byReason": { [reason]: count }
 *   },
 *   "topIdentifiers": [{ identifier, type, count }],
 *   "topPaths": [{ path, count }],
 *   "activeBans": number,
 *   "activeApiKeys": number
 * }
 */
statsRoute.get('/', (c) => {
    const query: StatsQuery = {
        startDate: c.req.query('startDate'),
        endDate: c.req.query('endDate'),
        limit: c.req.query('limit')
            ? Math.min(parseInt(c.req.query('limit')!), 50)
            : undefined,
    };

    const stats = getStatsService().getStats(query);
    return c.json(stats);
});

/**
 * GET /v1/stats/health
 * Health check endpoint
 */
statsRoute.get('/health', (c) => {
    const health = getStatsService().getHealth();
    return c.json(health);
});

export { statsRoute };
