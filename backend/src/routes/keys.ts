/**
 * API Keys Routes - POST /v1/keys, GET /v1/keys, etc.
 * 
 * Endpoints for API key management: create, rotate, list, delete.
 */

import { Hono } from 'hono';
import { ApiKeyService } from '../services/apiKeys';
import type { CreateApiKeyRequest } from '../types';

const keysRoute = new Hono();

// Lazy initialization to avoid database initialization order issues
let apiKeyService: ApiKeyService | null = null;
function getApiKeyService(): ApiKeyService {
    if (!apiKeyService) {
        apiKeyService = new ApiKeyService();
    }
    return apiKeyService;
}

/**
 * POST /v1/keys
 * Create a new API key
 * 
 * Request body:
 * {
 *   "name": "required string - human readable name",
 *   "rateLimit": "optional number - requests per window",
 *   "windowSeconds": "optional number - rate limit window",
 *   "expiresAt": "optional ISO date - expiry time",
 *   "metadata": "optional object - custom metadata"
 * }
 * 
 * Response:
 * {
 *   "id": "string",
 *   "key": "string - SAVE THIS! Only shown once",
 *   "name": "string",
 *   "rateLimit": number,
 *   "windowSeconds": number,
 *   "expiresAt": "string | null",
 *   "createdAt": "string"
 * }
 */
keysRoute.post('/', async (c) => {
    const body = await c.req.json<CreateApiKeyRequest>();

    if (!body.name) {
        return c.json({
            error: 'Name is required',
            code: 'validation_error',
        }, 400);
    }

    try {
        const result = getApiKeyService().create(body);
        return c.json(result, 201);
    } catch (error) {
        if (error instanceof Error) {
            return c.json({
                error: error.message,
                code: 'validation_error',
            }, 400);
        }
        throw error;
    }
});

/**
 * GET /v1/keys
 * List all API keys (metadata only, not the actual keys)
 * 
 * Query params:
 * - limit: number (default 50, max 100)
 * - offset: number (default 0)
 */
keysRoute.get('/', (c) => {
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
    const offset = parseInt(c.req.query('offset') || '0');

    const keys = getApiKeyService().list(limit, offset);

    return c.json({
        data: keys,
        pagination: {
            limit,
            offset,
            hasMore: keys.length === limit,
        },
    });
});

/**
 * GET /v1/keys/:id
 * Get a specific API key by ID
 */
keysRoute.get('/:id', (c) => {
    const id = c.req.param('id');
    const key = getApiKeyService().get(id);

    if (!key) {
        return c.json({
            error: 'API key not found',
            code: 'not_found',
        }, 404);
    }

    return c.json(key);
});

/**
 * POST /v1/keys/:id/rotate
 * Rotate an API key (generate new key, invalidate old)
 * 
 * Response:
 * {
 *   "id": "string",
 *   "newKey": "string - SAVE THIS! Only shown once",
 *   "rotatedAt": "string"
 * }
 */
keysRoute.post('/:id/rotate', (c) => {
    const id = c.req.param('id');

    try {
        const result = getApiKeyService().rotate(id);
        return c.json(result);
    } catch (error) {
        if (error instanceof Error && error.message === 'API key not found') {
            return c.json({
                error: 'API key not found',
                code: 'not_found',
            }, 404);
        }
        throw error;
    }
});

/**
 * POST /v1/keys/:id/deactivate
 * Deactivate an API key (can be reactivated later)
 */
keysRoute.post('/:id/deactivate', (c) => {
    const id = c.req.param('id');
    const success = getApiKeyService().deactivate(id);

    if (!success) {
        return c.json({
            error: 'API key not found',
            code: 'not_found',
        }, 404);
    }

    return c.json({ success: true, deactivatedAt: new Date().toISOString() });
});

/**
 * DELETE /v1/keys/:id
 * Permanently delete an API key
 */
keysRoute.delete('/:id', (c) => {
    const id = c.req.param('id');
    const success = getApiKeyService().delete(id);

    if (!success) {
        return c.json({
            error: 'API key not found',
            code: 'not_found',
        }, 404);
    }

    return c.json({ success: true, deletedAt: new Date().toISOString() });
});

export { keysRoute };
