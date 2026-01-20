/**
 * IP Intelligence HTTP Routes
 * 
 * JSON API endpoints for IP classification and management.
 * 
 * Endpoints:
 * - POST /v1/ip/check  - Check IP classification (main endpoint)
 * - POST /v1/ip/block  - Manually block an IP or ASN  
 * - DELETE /v1/ip/block - Remove a manual block
 * - GET /v1/ip/blocks  - List all manual blocks
 * - GET /v1/ip/stats   - Get aggregated statistics
 */

import { Hono } from 'hono';
import { classifyIP, addBlock, removeBlock, listBlocks, lookupASNInfo } from './engine';
import { getStats, runCleanup } from './repository';
import { getTorListStatus, updateTorList } from './tor-list';
import { logger } from '../utils/logger';
import type { IPCheckRequest, ManualBlockRequest } from './types';

const log = logger.child({ module: 'ip-intel-routes' });

export const ipIntelRoutes = new Hono();

// ============================================================================
// IP Check Endpoint (Main)
// ============================================================================

/**
 * POST /check
 * 
 * Check if an IP is a proxy, VPN, Tor, or hosting IP.
 * 
 * Request:
 *   { "ip": "1.2.3.4", "bypassCache": false }
 * 
 * Response:
 *   {
 *     "ip": "1.2.3.4",
 *     "isProxy": false,
 *     "isVPN": false,
 *     "isTor": false,
 *     "isHosting": true,
 *     "confidence": 85,
 *     "reason": "ASN 16509 (Amazon AWS) is a known hosting provider",
 *     "source": "heuristic"
 *   }
 */
ipIntelRoutes.post('/check', async (c) => {
    const body = await c.req.json<IPCheckRequest>().catch(() => null);

    if (!body || !body.ip) {
        return c.json({
            error: 'Missing required field: ip',
            code: 'invalid_request',
        }, 400);
    }

    // Validate IP format
    if (!isValidIP(body.ip)) {
        return c.json({
            error: 'Invalid IP address format',
            code: 'invalid_ip',
        }, 400);
    }

    try {
        const result = await classifyIP(body.ip, body.bypassCache ?? false);

        return c.json({
            ip: result.ip,
            isProxy: result.isProxy,
            isVPN: result.isVPN,
            isTor: result.isTor,
            isHosting: result.isHosting,
            confidence: result.confidence,
            reason: result.reason,
            source: result.source,
            asn: result.asn,
            asnOrg: result.asnOrg,
            countryCode: result.countryCode,
        });
    } catch (error) {
        log.error('IP check failed', {
            ip: body.ip,
            error: error instanceof Error ? error.message : 'Unknown',
        });

        return c.json({
            error: 'Classification failed',
            code: 'internal_error',
        }, 500);
    }
});

/**
 * GET /asn/:asn
 * 
 * Get information about an Autonomous System (ASN).
 */
ipIntelRoutes.get('/asn/:asn', async (c) => {
    const asnStr = c.req.param('asn').replace(/^AS/i, '');
    const asn = parseInt(asnStr, 10);

    if (isNaN(asn)) {
        return c.json({
            error: 'Invalid ASN format',
            code: 'invalid_asn',
        }, 400);
    }

    try {
        const info = await lookupASNInfo(asn);
        if (!info) {
            return c.json({
                error: 'ASN not found in cache. Access this ASN via an IP check first to populate metadata.',
                code: 'not_found',
            }, 404);
        }

        return c.json({
            asn: info.asn,
            orgName: info.org_name,
            isHosting: info.is_hosting === 1,
            isVPN: info.is_vpn === 1,
            countryCode: info.country_code,
            expiresAt: info.expires_at,
        });
    } catch (error) {
        log.error('ASN lookup failed', { asn, error: error instanceof Error ? error.message : 'Unknown' });
        return c.json({ error: 'Internal server error', code: 'internal_error' }, 500);
    }
});

// ============================================================================
// Manual Block Endpoints
// ============================================================================

/**
 * POST /block
 * 
 * Add a manual block for an IP or ASN.
 * 
 * Request:
 *   { 
 *     "identifier": "1.2.3.4" | "AS16509",
 *     "type": "ip" | "asn",
 *     "reason": "Suspicious activity",
 *     "durationSeconds": 3600  // optional, null = permanent
 *   }
 */
ipIntelRoutes.post('/block', async (c) => {
    const body = await c.req.json<ManualBlockRequest>().catch(() => null);

    if (!body || !body.identifier || !body.type || !body.reason) {
        return c.json({
            error: 'Missing required fields: identifier, type, reason',
            code: 'invalid_request',
        }, 400);
    }

    if (body.type !== 'ip' && body.type !== 'asn' && body.type !== 'range') {
        return c.json({
            error: 'Type must be "ip", "asn", or "range"',
            code: 'invalid_type',
        }, 400);
    }

    // Normalize identifier
    let identifier = body.identifier;
    if (body.type === 'asn') {
        // Remove "AS" prefix if present
        identifier = identifier.replace(/^AS/i, '');
        if (!/^\d+$/.test(identifier)) {
            return c.json({
                error: 'ASN must be a number (e.g., "16509" or "AS16509")',
                code: 'invalid_asn',
            }, 400);
        }
    } else if (body.type === 'range') {
        if (!isValidCidr(identifier)) {
            return c.json({
                error: 'Invalid CIDR format (e.g., "192.168.1.0/24")',
                code: 'invalid_range',
            }, 400);
        }
    } else {
        if (!isValidIP(identifier)) {
            return c.json({
                error: 'Invalid IP address format',
                code: 'invalid_ip',
            }, 400);
        }
    }

    try {
        addBlock(identifier, body.type, body.reason, body.durationSeconds);

        return c.json({
            success: true,
            message: `${body.type.toUpperCase()} ${identifier} blocked`,
            identifier,
            type: body.type,
            reason: body.reason,
            permanent: !body.durationSeconds,
        });
    } catch (error) {
        log.error('Block failed', {
            identifier,
            type: body.type,
            error: error instanceof Error ? error.message : 'Unknown',
        });

        return c.json({
            error: 'Failed to add block',
            code: 'internal_error',
        }, 500);
    }
});

/**
 * DELETE /block
 * 
 * Remove a manual block.
 * 
 * Query params:
 *   ?identifier=1.2.3.4&type=ip
 */
ipIntelRoutes.delete('/block', async (c) => {
    const identifier = c.req.query('identifier');
    const type = c.req.query('type') as 'ip' | 'asn' | undefined;

    if (!identifier || !type) {
        return c.json({
            error: 'Missing required query params: identifier, type',
            code: 'invalid_request',
        }, 400);
    }

    if (type !== 'ip' && type !== 'asn' && type !== 'range') {
        return c.json({
            error: 'Type must be "ip", "asn", or "range"',
            code: 'invalid_type',
        }, 400);
    }

    const removed = removeBlock(identifier, type);

    if (!removed) {
        return c.json({
            error: 'Block not found',
            code: 'not_found',
        }, 404);
    }

    return c.json({
        success: true,
        message: `Block removed for ${type.toUpperCase()} ${identifier}`,
    });
});

/**
 * GET /blocks
 * 
 * List all manual blocks.
 */
ipIntelRoutes.get('/blocks', async (c) => {
    const blocks = listBlocks();

    return c.json({
        count: blocks.length,
        blocks: blocks.map(b => ({
            identifier: b.identifier,
            type: b.identifier_type,
            reason: b.reason,
            blockedBy: b.blocked_by,
            blockedAt: b.blocked_at,
            expiresAt: b.expires_at,
            isPermanent: !b.expires_at,
        })),
    });
});

// ============================================================================
// Statistics Endpoint
// ============================================================================

/**
 * GET /stats
 * 
 * Get aggregated IP intelligence statistics.
 */
ipIntelRoutes.get('/stats', async (c) => {
    const stats = getStats();
    const torStatus = getTorListStatus();

    const cacheHitRate = stats.totalChecks > 0
        ? Math.round((stats.cacheHits / stats.totalChecks) * 100)
        : 0;

    return c.json({
        period: 'last_30_days',
        totalChecks: stats.totalChecks,
        cacheHits: stats.cacheHits,
        cacheHitRate: `${cacheHitRate}%`,
        classifications: stats.classifications,
        manualBlocks: stats.manualBlocks,
        tor: {
            enabled: torStatus.enabled,
            nodeCount: torStatus.nodeCount,
            lastUpdate: torStatus.lastUpdate,
        },
        asnCacheSize: stats.asnCacheSize,
    });
});

// ============================================================================
// Maintenance Endpoints
// ============================================================================

/**
 * POST /maintenance/cleanup
 * 
 * Run cleanup for expired records.
 */
ipIntelRoutes.post('/maintenance/cleanup', async (c) => {
    const result = runCleanup();

    return c.json({
        success: true,
        deleted: result.deleted,
    });
});

/**
 * POST /maintenance/tor-update
 * 
 * Manually trigger Tor exit node list update.
 */
ipIntelRoutes.post('/maintenance/tor-update', async (c) => {
    const result = await updateTorList();

    return c.json({
        success: result.success,
        nodeCount: result.count,
    });
});

// ============================================================================
// Helpers
// ============================================================================

/**
 * Validate IP address format (IPv4 or IPv6).
 */
function isValidIP(ip: string): boolean {
    // IPv4
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipv4Regex.test(ip)) {
        const parts = ip.split('.').map(Number);
        return parts.every(p => p >= 0 && p <= 255);
    }

    // IPv6 (simplified check)
    const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    const ipv6CompressedRegex = /^(([0-9a-fA-F]{1,4}:)*)?::?(([0-9a-fA-F]{1,4}:)*[0-9a-fA-F]{1,4})?$/;

    return ipv6Regex.test(ip) || ipv6CompressedRegex.test(ip);
}

/**
 * Validate CIDR range format.
 */
function isValidCidr(cidr: string): boolean {
    const [ip, bitsStr] = cidr.split('/');
    if (!ip || !bitsStr) return false;
    const bits = parseInt(bitsStr, 10);
    return isValidIP(ip) && !isNaN(bits) && bits >= 0 && bits <= 32;
}
