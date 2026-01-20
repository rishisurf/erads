/**
 * IP Intelligence Middleware
 * 
 * Hono middleware for integrating IP classification into request pipelines.
 * Can be used to automatically block suspicious IPs before they reach your routes.
 * 
 * Usage:
 *   // Block all VPN/proxy traffic
 *   app.use('/api/*', ipIntelMiddleware({ blockVPN: true, blockProxy: true }));
 *   
 *   // Just tag requests without blocking
 *   app.use('*', ipIntelMiddleware({ blockNone: true }));
 * 
 * The middleware adds the following to the Hono context:
 *   c.get('ipIntel') -> IPClassification | undefined
 * 
 * Response headers added:
 *   X-IP-Classification: residential | proxy | vpn | tor | hosting | unknown
 *   X-IP-Confidence: 0-100
 */

import { createMiddleware } from 'hono/factory';
import { classifyIP } from './engine';
import { logger } from '../utils/logger';
import type { IPClassification } from './types';

const log = logger.child({ module: 'ip-intel-middleware' });

/**
 * Middleware options.
 */
export interface IPIntelMiddlewareOptions {
    /** Block requests from VPN IPs */
    blockVPN?: boolean;

    /** Block requests from proxy IPs */
    blockProxy?: boolean;

    /** Block requests from Tor exit nodes */
    blockTor?: boolean;

    /** Block requests from hosting/datacenter IPs */
    blockHosting?: boolean;

    /** Minimum confidence to enforce blocks (default: 70) */
    confidenceThreshold?: number;

    /** Skip classification (just pass through) */
    blockNone?: boolean;

    /** Custom function to extract IP from request */
    getIP?: (c: any) => string | null;

    /** Paths to skip (e.g., health checks) */
    skipPaths?: string[];

    /** Add classification headers to response */
    addHeaders?: boolean;

    /** Custom block handler */
    onBlock?: (c: any, classification: IPClassification) => Response | Promise<Response>;
}

/**
 * Default IP extraction.
 * Checks X-Forwarded-For, X-Real-IP, then falls back to connection IP.
 */
function defaultGetIP(c: any): string | null {
    // Check common proxy headers
    const forwarded = c.req.header('x-forwarded-for');
    if (forwarded) {
        // Take the first IP (original client)
        return forwarded.split(',')[0].trim();
    }

    const realIP = c.req.header('x-real-ip');
    if (realIP) {
        return realIP.trim();
    }

    // Fallback to connection info (Bun-specific, may not always be available)
    // In production behind a reverse proxy, this would be the proxy IP
    return c.env?.ip ?? null;
}

/**
 * Get classification type string.
 */
function getClassificationType(classification: IPClassification): string {
    if (classification.isTor) return 'tor';
    if (classification.isVPN) return 'vpn';
    if (classification.isProxy) return 'proxy';
    if (classification.isHosting) return 'hosting';
    if (classification.isResidential) return 'residential';
    return 'unknown';
}

/**
 * Default block response.
 */
function defaultBlockResponse(c: any, classification: IPClassification): Response {
    return c.json({
        error: 'Access denied',
        code: 'ip_blocked',
        reason: `Traffic from ${getClassificationType(classification)} IPs is not allowed`,
    }, 403);
}

/**
 * Create IP intelligence middleware.
 */
export function ipIntelMiddleware(options: IPIntelMiddlewareOptions = {}) {
    const {
        blockVPN = false,
        blockProxy = false,
        blockTor = false,
        blockHosting = false,
        confidenceThreshold = 70,
        blockNone = false,
        getIP = defaultGetIP,
        skipPaths = [],
        addHeaders = true,
        onBlock = defaultBlockResponse,
    } = options;

    const shouldBlock = blockVPN || blockProxy || blockTor || blockHosting;

    return createMiddleware(async (c, next) => {
        // Skip certain paths
        const path = new URL(c.req.url).pathname;
        if (skipPaths.some(p => path.startsWith(p))) {
            return next();
        }

        // Extract IP
        const ip = getIP(c);
        if (!ip) {
            log.warn('Could not extract IP from request');
            return next();
        }

        try {
            // Classify the IP
            const classification = await classifyIP(ip);

            // Store in context for downstream use
            c.set('ipIntel', classification);

            // Add headers if enabled
            if (addHeaders) {
                c.header('X-IP-Classification', getClassificationType(classification));
                c.header('X-IP-Confidence', String(classification.confidence));
            }

            // Check if we should block
            if (shouldBlock && !blockNone && classification.confidence >= confidenceThreshold) {
                if (
                    (blockVPN && classification.isVPN) ||
                    (blockProxy && classification.isProxy) ||
                    (blockTor && classification.isTor) ||
                    (blockHosting && classification.isHosting)
                ) {
                    log.warn('Blocking request based on IP classification', {
                        ip,
                        type: getClassificationType(classification),
                        confidence: classification.confidence,
                    });

                    return onBlock(c, classification);
                }
            }

            return next();
        } catch (error) {
            // On error, allow request through but log
            log.error('IP classification failed in middleware', {
                ip,
                error: error instanceof Error ? error.message : 'Unknown',
            });

            return next();
        }
    });
}

/**
 * Convenience middleware presets.
 */
export const ipIntelPresets = {
    /**
     * Block VPN and Tor traffic.
     * Good for preventing abuse while allowing proxies/hosting.
     */
    blockAnonymizers: () => ipIntelMiddleware({
        blockVPN: true,
        blockTor: true,
        confidenceThreshold: 80,
    }),

    /**
     * Block all non-residential traffic.
     * Strict mode for sensitive endpoints.
     */
    residentialOnly: () => ipIntelMiddleware({
        blockVPN: true,
        blockProxy: true,
        blockTor: true,
        blockHosting: true,
        confidenceThreshold: 70,
    }),

    /**
     * Block Tor only.
     * Minimal blocking, often required for compliance.
     */
    blockTorOnly: () => ipIntelMiddleware({
        blockTor: true,
        confidenceThreshold: 90,
    }),

    /**
     * Tag only - no blocking.
     * Just adds classification headers for logging/analytics.
     */
    tagOnly: () => ipIntelMiddleware({
        blockNone: true,
        addHeaders: true,
    }),
};
