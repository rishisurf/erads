/**
 * Request Logs Repository
 * 
 * Data access layer for request logging and analytics.
 * Used for abuse detection baseline and statistics.
 * 
 * Architecture Decision:
 * - Logs are write-optimized (async where possible)
 * - Read queries are optimized for time-range analytics
 * - Old logs are periodically cleaned up to manage storage
 */

import { Database } from 'bun:sqlite';
import { nanoid } from 'nanoid';
import { getDatabaseSync } from '../db/connection';
import type { RequestLog, RequestLogRow, StatsQuery, StatsResponse } from '../types';

/**
 * Convert database row to RequestLog type
 */
function rowToRequestLog(row: RequestLogRow): RequestLog {
    return {
        id: row.id,
        identifier: row.identifier,
        identifierType: row.identifier_type as 'ip' | 'api_key',
        path: row.path,
        method: row.method,
        allowed: row.allowed === 1,
        reason: row.reason,
        country: row.country,
        city: row.city,
        userAgent: row.user_agent,
        timestamp: new Date(row.timestamp),
    };
}

export class RequestLogRepository {
    private db: Database;

    constructor() {
        this.db = getDatabaseSync();
    }

    /**
     * Log a request check
     */
    log(params: {
        identifier: string;
        identifierType: 'ip' | 'api_key';
        path?: string;
        method?: string;
        allowed: boolean;
        reason: string;
        country?: string;
        city?: string;
        userAgent?: string;
    }): void {
        const id = nanoid();

        this.db.run(`
      INSERT INTO request_logs (id, identifier, identifier_type, path, method, allowed, reason, country, city, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
            id,
            params.identifier,
            params.identifierType,
            params.path ?? '/',
            params.method ?? 'GET',
            params.allowed ? 1 : 0,
            params.reason,
            params.country ?? null,
            params.city ?? null,
            params.userAgent ?? null,
        ]);
    }

    /**
     * Get request count in a time window for burst detection
     */
    getCountInWindow(
        identifier: string,
        identifierType: 'ip' | 'api_key',
        windowSeconds: number
    ): number {
        const result = this.db.query(`
      SELECT COUNT(*) as count FROM request_logs 
      WHERE identifier = ? 
        AND identifier_type = ? 
        AND timestamp > datetime('now', '-' || ? || ' seconds')
    `).get(identifier, identifierType, windowSeconds.toString()) as { count: number };

        return result.count;
    }

    /**
     * Get average request rate over a longer period (for baseline)
     * Returns average requests per minute
     */
    getBaselineRate(
        identifier: string,
        identifierType: 'ip' | 'api_key',
        periodMinutes = 60
    ): number {
        const result = this.db.query(`
      SELECT COUNT(*) as count FROM request_logs 
      WHERE identifier = ? 
        AND identifier_type = ? 
        AND timestamp > datetime('now', '-' || ? || ' minutes')
    `).get(identifier, identifierType, periodMinutes.toString()) as { count: number };

        return result.count / periodMinutes;
    }

    /**
     * Get aggregated statistics
     */
    getStats(query?: StatsQuery): StatsResponse {
        const startDate = query?.startDate ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const endDate = query?.endDate ?? new Date().toISOString();
        const topLimit = query?.limit ?? 10;

        // Total requests
        const totalResult = this.db.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN allowed = 1 THEN 1 ELSE 0 END) as allowed,
        SUM(CASE WHEN allowed = 0 THEN 1 ELSE 0 END) as blocked
      FROM request_logs 
      WHERE timestamp BETWEEN ? AND ?
    `).get(startDate, endDate) as { total: number; allowed: number; blocked: number };

        // Requests by reason
        const byReasonRows = this.db.query(`
      SELECT reason, COUNT(*) as count FROM request_logs 
      WHERE timestamp BETWEEN ? AND ?
      GROUP BY reason
    `).all(startDate, endDate) as { reason: string; count: number }[];

        const byReason: Record<string, number> = {};
        for (const row of byReasonRows) {
            byReason[row.reason] = row.count;
        }

        // Top identifiers
        const topIdentifiersRows = this.db.query(`
      SELECT identifier, identifier_type, COUNT(*) as count FROM request_logs 
      WHERE timestamp BETWEEN ? AND ?
      GROUP BY identifier, identifier_type
      ORDER BY count DESC
      LIMIT ?
    `).all(startDate, endDate, topLimit) as { identifier: string; identifier_type: string; count: number }[];

        // Top paths
        const topPathsRows = this.db.query(`
      SELECT path, COUNT(*) as count FROM request_logs 
      WHERE timestamp BETWEEN ? AND ?
      GROUP BY path
      ORDER BY count DESC
      LIMIT ?
    `).all(startDate, endDate, topLimit) as { path: string; count: number }[];

        // Active bans count (from bans table)
        const activeBansResult = this.db.query(`
      SELECT COUNT(*) as count FROM bans 
      WHERE expires_at IS NULL OR expires_at > datetime('now')
    `).get() as { count: number };

        // Active API keys count
        const activeKeysResult = this.db.query(`
      SELECT COUNT(*) as count FROM api_keys WHERE is_active = 1
    `).get() as { count: number };

        return {
            period: {
                start: startDate,
                end: endDate,
            },
            requests: {
                total: totalResult.total,
                allowed: totalResult.allowed,
                blocked: totalResult.blocked,
                byReason,
            },
            topIdentifiers: topIdentifiersRows.map(row => ({
                identifier: row.identifier,
                type: row.identifier_type as 'ip' | 'api_key',
                count: row.count,
            })),
            topPaths: topPathsRows.map(row => ({
                path: row.path,
                count: row.count,
            })),
            activeBans: activeBansResult.count,
            activeApiKeys: activeKeysResult.count,
        };
    }

    /**
     * Get recent logs for an identifier
     */
    getRecentLogs(
        identifier: string,
        identifierType: 'ip' | 'api_key',
        limit = 100
    ): RequestLog[] {
        const rows = this.db.query(`
      SELECT * FROM request_logs 
      WHERE identifier = ? AND identifier_type = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(identifier, identifierType, limit) as RequestLogRow[];

        return rows.map(rowToRequestLog);
    }

    /**
     * Clean up old logs
     */
    cleanup(retentionDays = 30): number {
        const result = this.db.run(`
      DELETE FROM request_logs 
      WHERE timestamp < datetime('now', '-' || ? || ' days')
    `, [retentionDays.toString()]);

        return result.changes;
    }
}
