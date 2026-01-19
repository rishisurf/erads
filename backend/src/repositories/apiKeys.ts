/**
 * API Keys Repository
 * 
 * Data access layer for API key management.
 * Encapsulates all database operations for the api_keys table.
 * 
 * Security Note:
 * - API keys are hashed using SHA-256 before storage
 * - Plain text keys are only returned at creation time
 * - lookupByKey() hashes the incoming key to compare
 */

import { Database } from 'bun:sqlite';
import { nanoid } from 'nanoid';
import { getDatabaseSync } from '../db/connection';
import { config } from '../config/env';
import type { ApiKey, ApiKeyRow, CreateApiKeyRequest } from '../types';
import { logger } from '../utils/logger';

/**
 * Hash an API key using SHA-256
 */
function hashKey(key: string): string {
    return new Bun.CryptoHasher('sha256').update(key).digest('hex');
}

/**
 * Generate a new API key with prefix for easy identification
 */
function generateApiKey(): string {
    return `rl_${nanoid(config.apiKey.keyLength)}`;
}

/**
 * Convert database row to ApiKey type
 */
function rowToApiKey(row: ApiKeyRow): ApiKey {
    return {
        id: row.id,
        key: row.key_hash, // This is the hash, not the actual key
        name: row.name,
        rateLimit: row.rate_limit,
        windowSeconds: row.window_seconds,
        isActive: row.is_active === 1,
        createdAt: new Date(row.created_at),
        expiresAt: row.expires_at ? new Date(row.expires_at) : null,
        lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : null,
        metadata: JSON.parse(row.metadata),
    };
}

export class ApiKeyRepository {
    private db: Database;

    constructor() {
        this.db = getDatabaseSync();
    }

    /**
     * Create a new API key
     * Returns the plain text key (only time it's available!)
     */
    create(request: CreateApiKeyRequest): { apiKey: ApiKey; plainTextKey: string } {
        const id = nanoid();
        const plainTextKey = generateApiKey();
        const keyHash = hashKey(plainTextKey);

        const rateLimit = request.rateLimit ?? config.apiKey.defaultRateLimit;
        const windowSeconds = request.windowSeconds ?? config.rateLimit.defaultWindowSeconds;
        const expiresAt = request.expiresAt ?? null;
        const metadata = JSON.stringify(request.metadata ?? {});

        this.db.run(`
      INSERT INTO api_keys (id, key_hash, name, rate_limit, window_seconds, expires_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [id, keyHash, request.name, rateLimit, windowSeconds, expiresAt, metadata]);

        const row = this.db.query(`SELECT * FROM api_keys WHERE id = ?`).get(id) as ApiKeyRow;

        logger.info('API key created', { id, name: request.name });

        return {
            apiKey: rowToApiKey(row),
            plainTextKey,
        };
    }

    /**
     * Look up an API key by its plain text value
     * Used during request authentication
     */
    lookupByKey(plainTextKey: string): ApiKey | null {
        const keyHash = hashKey(plainTextKey);
        const row = this.db.query(`
      SELECT * FROM api_keys 
      WHERE key_hash = ? AND is_active = 1
    `).get(keyHash) as ApiKeyRow | null;

        if (!row) return null;

        // Update last_used_at
        this.db.run(`
      UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?
    `, [row.id]);

        return rowToApiKey(row);
    }

    /**
     * Get an API key by ID
     */
    getById(id: string): ApiKey | null {
        const row = this.db.query(`SELECT * FROM api_keys WHERE id = ?`).get(id) as ApiKeyRow | null;
        return row ? rowToApiKey(row) : null;
    }

    /**
     * List all API keys (paginated)
     */
    list(limit = 50, offset = 0): ApiKey[] {
        const rows = this.db.query(`
      SELECT * FROM api_keys 
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `).all(limit, offset) as ApiKeyRow[];

        return rows.map(rowToApiKey);
    }

    /**
     * Rotate an API key (generate new key, invalidate old)
     */
    rotate(id: string): { apiKey: ApiKey; plainTextKey: string } | null {
        const existing = this.getById(id);
        if (!existing) return null;

        const newPlainTextKey = generateApiKey();
        const newKeyHash = hashKey(newPlainTextKey);

        this.db.run(`
      UPDATE api_keys 
      SET key_hash = ?, last_used_at = NULL 
      WHERE id = ?
    `, [newKeyHash, id]);

        const row = this.db.query(`SELECT * FROM api_keys WHERE id = ?`).get(id) as ApiKeyRow;

        logger.info('API key rotated', { id });

        return {
            apiKey: rowToApiKey(row),
            plainTextKey: newPlainTextKey,
        };
    }

    /**
     * Deactivate an API key
     */
    deactivate(id: string): boolean {
        const result = this.db.run(`
      UPDATE api_keys SET is_active = 0 WHERE id = ?
    `, [id]);

        if (result.changes > 0) {
            logger.info('API key deactivated', { id });
            return true;
        }
        return false;
    }

    /**
     * Delete an API key permanently
     */
    delete(id: string): boolean {
        const result = this.db.run(`DELETE FROM api_keys WHERE id = ?`, [id]);

        if (result.changes > 0) {
            logger.info('API key deleted', { id });
            return true;
        }
        return false;
    }

    /**
     * Count active API keys
     */
    countActive(): number {
        const result = this.db.query(`
      SELECT COUNT(*) as count FROM api_keys WHERE is_active = 1
    `).get() as { count: number };
        return result.count;
    }

    /**
     * Check if an API key is expired
     */
    isExpired(apiKey: ApiKey): boolean {
        if (!apiKey.expiresAt) return false;
        return apiKey.expiresAt < new Date();
    }
}
