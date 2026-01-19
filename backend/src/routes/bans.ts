/**
 * Bans Route - POST /v1/bans, GET /v1/bans, DELETE /v1/bans/:id
 * 
 * Endpoints for manual ban management.
 */

import { Hono } from 'hono';
import { BanRepository } from '../repositories/bans';
import type { CreateBanRequest } from '../types';

const bansRoute = new Hono();

// Lazy initialization to avoid database initialization order issues
let banRepo: BanRepository | null = null;
function getBanRepo(): BanRepository {
    if (!banRepo) {
        banRepo = new BanRepository();
    }
    return banRepo;
}

/**
 * POST /v1/bans
 * Create a new ban
 * 
 * Request body:
 * {
 *   "identifier": "IP address or API key ID",
 *   "identifierType": "ip" | "api_key",
 *   "reason": "Human readable reason",
 *   "durationSeconds": optional number (null = permanent)
 * }
 */
bansRoute.post('/', async (c) => {
    const body = await c.req.json<CreateBanRequest>();

    if (!body.identifier || !body.identifierType || !body.reason) {
        return c.json({
            error: 'identifier, identifierType, and reason are required',
            code: 'validation_error',
        }, 400);
    }

    if (!['ip', 'api_key'].includes(body.identifierType)) {
        return c.json({
            error: 'identifierType must be "ip" or "api_key"',
            code: 'validation_error',
        }, 400);
    }

    const ban = getBanRepo().create(body, 'admin');

    return c.json({
        id: ban.id,
        identifier: ban.identifier,
        identifierType: ban.identifierType,
        reason: ban.reason,
        bannedAt: ban.bannedAt.toISOString(),
        expiresAt: ban.expiresAt?.toISOString() ?? null,
    }, 201);
});

/**
 * GET /v1/bans
 * List active bans
 */
bansRoute.get('/', (c) => {
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
    const offset = parseInt(c.req.query('offset') || '0');

    const bans = getBanRepo().getActiveBans(limit, offset);

    return c.json({
        data: bans.map(ban => ({
            id: ban.id,
            identifier: ban.identifier,
            identifierType: ban.identifierType,
            reason: ban.reason,
            bannedAt: ban.bannedAt.toISOString(),
            expiresAt: ban.expiresAt?.toISOString() ?? null,
            createdBy: ban.createdBy,
        })),
        pagination: {
            limit,
            offset,
            hasMore: bans.length === limit,
        },
    });
});

/**
 * GET /v1/bans/:id
 * Get a specific ban
 */
bansRoute.get('/:id', (c) => {
    const id = c.req.param('id');
    const ban = getBanRepo().getById(id);

    if (!ban) {
        return c.json({
            error: 'Ban not found',
            code: 'not_found',
        }, 404);
    }

    return c.json({
        id: ban.id,
        identifier: ban.identifier,
        identifierType: ban.identifierType,
        reason: ban.reason,
        bannedAt: ban.bannedAt.toISOString(),
        expiresAt: ban.expiresAt?.toISOString() ?? null,
        createdBy: ban.createdBy,
    });
});

/**
 * DELETE /v1/bans/:id
 * Remove a specific ban
 */
bansRoute.delete('/:id', (c) => {
    const id = c.req.param('id');
    const success = getBanRepo().remove(id);

    if (!success) {
        return c.json({
            error: 'Ban not found',
            code: 'not_found',
        }, 404);
    }

    return c.json({ success: true, removedAt: new Date().toISOString() });
});

/**
 * DELETE /v1/bans/identifier/:type/:identifier
 * Remove all bans for an identifier
 */
bansRoute.delete('/identifier/:type/:identifier', (c) => {
    const type = c.req.param('type') as 'ip' | 'api_key';
    const identifier = c.req.param('identifier');

    if (!['ip', 'api_key'].includes(type)) {
        return c.json({
            error: 'type must be "ip" or "api_key"',
            code: 'validation_error',
        }, 400);
    }

    const count = getBanRepo().unban(identifier, type);

    return c.json({
        success: true,
        removedCount: count,
        removedAt: new Date().toISOString(),
    });
});

export { bansRoute };
