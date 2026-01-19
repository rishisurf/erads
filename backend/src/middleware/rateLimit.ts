/**
 * Rate Limiting Middleware
 * 
 * Reusable Hono middleware for rate limiting.
 * Can be used to protect other Bun/Hono applications.
 * 
 * Usage:
 * ```typescript
 * import { rateLimitMiddleware } from './middleware/rateLimit';
 * 
 * app.use('/api/*', rateLimitMiddleware());
 * ```
 * 
 * Architecture Decision:
 * - Extracts client IP from various headers (proxy-aware)
 * - Supports API key authentication via header
 * - Sets standard rate limit headers in response
 */

import { Context, Next, MiddlewareHandler } from 'hono';
import { RateLimiterService } from '../services/rateLimiter';
import type { CheckRequest } from '../types';

interface RateLimitMiddlewareOptions {
    // Custom header for API key
    apiKeyHeader?: string;
    // Skip rate limiting for certain paths
    skipPaths?: string[];
    // Whether to include geo metadata
    includeGeo?: boolean;
}

/**
 * Extract client IP address from request
 * Handles various proxy headers (Cloudflare, X-Forwarded-For, etc.)
 */
export function getClientIP(c: Context): string {
    // Cloudflare
    const cfConnectingIP = c.req.header('cf-connecting-ip');
    if (cfConnectingIP) return cfConnectingIP;

    // Standard proxy header
    const xForwardedFor = c.req.header('x-forwarded-for');
    if (xForwardedFor) {
        // Take the first IP (original client)
        return xForwardedFor.split(',')[0].trim();
    }

    // Real IP header (Nginx)
    const xRealIP = c.req.header('x-real-ip');
    if (xRealIP) return xRealIP;

    // Fallback to connection info
    // Note: In Bun, we need to get this from the raw request
    return '127.0.0.1';
}

/**
 * Extract API key from request
 */
export function getApiKey(c: Context, headerName: string): string | undefined {
    const header = c.req.header(headerName);
    if (!header) return undefined;

    // Support "Bearer <token>" format
    if (header.startsWith('Bearer ')) {
        return header.substring(7);
    }

    return header;
}

/**
 * Create rate limit middleware
 * Uses lazy initialization to avoid database initialization order issues
 */
export function rateLimitMiddleware(
    options: RateLimitMiddlewareOptions = {}
): MiddlewareHandler {
    const {
        apiKeyHeader = 'x-api-key',
        skipPaths = [],
        includeGeo = true,
    } = options;

    // Lazy initialization
    let rateLimiter: RateLimiterService | null = null;
    function getRateLimiter(): RateLimiterService {
        if (!rateLimiter) {
            rateLimiter = new RateLimiterService();
        }
        return rateLimiter;
    }

    return async (c: Context, next: Next) => {
        // Skip if path is in skip list
        const path = new URL(c.req.url).pathname;
        if (skipPaths.some(p => path.startsWith(p))) {
            return next();
        }

        // Build check request
        const checkRequest: CheckRequest = {
            ip: getClientIP(c),
            apiKey: getApiKey(c, apiKeyHeader),
            metadata: {
                path,
                method: c.req.method,
                userAgent: c.req.header('user-agent'),
            },
        };

        // Add geo metadata if available (from headers set by CDN)
        if (includeGeo) {
            checkRequest.metadata!.country = c.req.header('cf-ipcountry')
                || c.req.header('x-country-code');
            checkRequest.metadata!.city = c.req.header('cf-ipcity')
                || c.req.header('x-city');
        }

        // Perform rate limit check
        const result = await getRateLimiter().check(checkRequest);

        // Set standard rate limit headers
        c.header('X-RateLimit-Limit', result.limit?.toString() ?? '');
        c.header('X-RateLimit-Remaining', result.remaining.toString());
        c.header('X-RateLimit-Reset', result.resetAt.toString());

        if (!result.allowed) {
            // Set Retry-After header
            if (result.retryAfter) {
                c.header('Retry-After', result.retryAfter.toString());
            }

            return c.json({
                error: 'Rate limit exceeded',
                code: result.reason,
                retryAfter: result.retryAfter,
                resetAt: result.resetAt,
            }, 429);
        }

        return next();
    };
}

/**
 * Middleware specifically for API key authentication
 * Use this when API key is required (not optional)
 */
export function requireApiKey(
    headerName = 'x-api-key'
): MiddlewareHandler {
    return async (c: Context, next: Next) => {
        const apiKey = getApiKey(c, headerName);

        if (!apiKey) {
            return c.json({
                error: 'API key required',
                code: 'missing_api_key',
            }, 401);
        }

        // Store API key in context for later use
        c.set('apiKey', apiKey);

        return next();
    };
}
