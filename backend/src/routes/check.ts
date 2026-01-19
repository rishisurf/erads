/**
 * Check Route - POST /v1/check
 * 
 * Main endpoint for rate limit checking.
 * Returns whether a request should be allowed based on IP/API key.
 */

import { Hono } from 'hono';
import { RateLimiterService } from '../services/rateLimiter';
import type { CheckRequest } from '../types';
import { getClientIP } from '../middleware/rateLimit';

const checkRoute = new Hono();

// Lazy initialization to avoid database initialization order issues
let rateLimiter: RateLimiterService | null = null;
function getRateLimiter(): RateLimiterService {
    if (!rateLimiter) {
        rateLimiter = new RateLimiterService();
    }
    return rateLimiter;
}

/**
 * POST /v1/check
 * 
 * Check if a request should be allowed.
 * 
 * Request body:
 * {
 *   "ip": "optional string - client IP address",
 *   "apiKey": "optional string - API key to validate",
 *   "metadata": {
 *     "country": "optional ISO country code",
 *     "city": "optional city name",
 *     "userAgent": "optional user agent",
 *     "path": "optional request path",
 *     "method": "optional HTTP method"
 *   }
 * }
 * 
 * Response:
 * {
 *   "allowed": boolean,
 *   "reason": "ok" | "rate_limited" | "banned" | "geo_blocked" | "invalid_key" | "expired_key",
 *   "remaining": number,
 *   "resetAt": number (unix timestamp),
 *   "limit": number (optional),
 *   "retryAfter": number (optional, seconds)
 * }
 */
checkRoute.post('/', async (c) => {
    const body: CheckRequest = await c.req.json<CheckRequest>().catch(() => ({} as CheckRequest));

    // If no IP provided, extract from request
    if (!body.ip && !body.apiKey) {
        body.ip = getClientIP(c);
    }

    // Perform the check
    const result = await getRateLimiter().check(body);

    // Set standard rate limit headers
    if (result.limit) {
        c.header('X-RateLimit-Limit', result.limit.toString());
    }
    c.header('X-RateLimit-Remaining', result.remaining.toString());
    c.header('X-RateLimit-Reset', result.resetAt.toString());

    if (!result.allowed && result.retryAfter) {
        c.header('Retry-After', result.retryAfter.toString());
    }

    return c.json(result);
});

export { checkRoute };
