/**
 * Bans Repository
 * 
 * Data access layer for ban management.
 * Supports both temporary (with TTL) and permanent bans.
 * 
 * Architecture Decision:
 * - Bans are checked before rate limits for efficiency
 * - Expired bans are cleaned up periodically, not on every check
 * - Ban records are kept for audit history
 */

import { Database } from 'bun:sqlite';
import { nanoid } from 'nanoid';
import { getDatabaseSync } from '../db/connection';
import { config } from '../config/env';
import type { Ban, BanRow, CreateBanRequest } from '../types';
import { logger } from '../utils/logger';

/**
 * Convert database row to Ban type
 */
function rowToBan(row: BanRow): Ban {
    return {
        id: row.id,
        identifier: row.identifier,
        identifierType: row.identifier_type as 'ip' | 'api_key',
        reason: row.reason,
        bannedAt: new Date(row.banned_at),
        expiresAt: row.expires_at ? new Date(row.expires_at) : null,
        createdBy: row.created_by,
    };
}

export class BanRepository {
    private db: Database;

    constructor() {
        this.db = getDatabaseSync();
    }

    /**
     * Create a new ban
     */
    create(request: CreateBanRequest, createdBy = 'system'): Ban {
        const id = nanoid();
        const expiresAt = request.durationSeconds
            ? new Date(Date.now() + request.durationSeconds * 1000).toISOString()
            : null;

        this.db.run(`
      INSERT INTO bans (id, identifier, identifier_type, reason, expires_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [id, request.identifier, request.identifierType, request.reason, expiresAt, createdBy]);

        const row = this.db.query(`SELECT * FROM bans WHERE id = ?`).get(id) as BanRow;

        logger.warn('Ban created', {
            id,
            identifier: request.identifier,
            type: request.identifierType,
            reason: request.reason,
            expiresAt,
        });

        return rowToBan(row);
    }

    /**
     * Check if an identifier is currently banned
     * Returns the ban record if banned, null otherwise
     */
    isCurrentlyBanned(identifier: string, identifierType: 'ip' | 'api_key'): Ban | null {
        const row = this.db.query(`
      SELECT * FROM bans 
      WHERE identifier = ? 
        AND identifier_type = ? 
        AND (expires_at IS NULL OR expires_at > datetime('now'))
      ORDER BY banned_at DESC
      LIMIT 1
    `).get(identifier, identifierType) as BanRow | null;

        return row ? rowToBan(row) : null;
    }

    /**
     * Get all active bans
     */
    getActiveBans(limit = 100, offset = 0): Ban[] {
        const rows = this.db.query(`
      SELECT * FROM bans 
      WHERE expires_at IS NULL OR expires_at > datetime('now')
      ORDER BY banned_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as BanRow[];

        return rows.map(rowToBan);
    }

    /**
     * Get ban by ID
     */
    getById(id: string): Ban | null {
        const row = this.db.query(`SELECT * FROM bans WHERE id = ?`).get(id) as BanRow | null;
        return row ? rowToBan(row) : null;
    }

    /**
     * Remove a ban (unban)
     */
    remove(id: string): boolean {
        const result = this.db.run(`DELETE FROM bans WHERE id = ?`, [id]);

        if (result.changes > 0) {
            logger.info('Ban removed', { id });
            return true;
        }
        return false;
    }

    /**
     * Remove all bans for an identifier
     */
    unban(identifier: string, identifierType: 'ip' | 'api_key'): number {
        const result = this.db.run(`
      DELETE FROM bans 
      WHERE identifier = ? AND identifier_type = ?
    `, [identifier, identifierType]);

        if (result.changes > 0) {
            logger.info('Identifier unbanned', { identifier, type: identifierType, count: result.changes });
        }

        return result.changes;
    }

    /**
     * Count active bans
     */
    countActive(): number {
        const result = this.db.query(`
      SELECT COUNT(*) as count FROM bans 
      WHERE expires_at IS NULL OR expires_at > datetime('now')
    `).get() as { count: number };
        return result.count;
    }

    /**
     * Clean up expired bans
     */
    cleanup(): number {
        const result = this.db.run(`
      DELETE FROM bans 
      WHERE expires_at IS NOT NULL AND expires_at < datetime('now')
    `);

        if (result.changes > 0) {
            logger.info('Expired bans cleaned up', { count: result.changes });
        }

        return result.changes;
    }

    /**
     * Create a temporary ban from abuse detection
     */
    createAutoBan(
        identifier: string,
        identifierType: 'ip' | 'api_key',
        reason: string,
        durationSeconds?: number
    ): Ban {
        return this.create({
            identifier,
            identifierType,
            reason,
            durationSeconds: durationSeconds ?? config.abuse.defaultBanDurationSeconds,
        }, 'system');
    }
}
