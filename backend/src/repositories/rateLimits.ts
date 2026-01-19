/**
 * Rate Limits Repository
 * 
 * Data access layer for rate limit tracking.
 * Implements both fixed and sliding window algorithms.
 * 
 * Architecture Decision:
 * - Fixed window: Simple, uses discrete time buckets (e.g., 00:00-01:00)
 * - Sliding window: More accurate, uses weighted combination of current and previous windows
 * 
 * The sliding window approach prevents the "burst at boundary" problem where
 * a user could make 2x requests by timing them at window boundaries.
 */

import { Database } from 'bun:sqlite';
import { nanoid } from 'nanoid';
import { getDatabaseSync } from '../db/connection';
import { config } from '../config/env';
import type { RateLimitRow, RateLimitResult, RateLimitConfig } from '../types';

export class RateLimitRepository {
    private db: Database;

    constructor() {
        this.db = getDatabaseSync();
    }

    /**
     * Calculate the window start time for fixed window algorithm
     * Windows are aligned to clock boundaries (e.g., minute, hour)
     */
    private getWindowStart(windowSeconds: number): string {
        const now = Math.floor(Date.now() / 1000);
        const windowStart = Math.floor(now / windowSeconds) * windowSeconds;
        return new Date(windowStart * 1000).toISOString();
    }

    /**
     * Get the previous window start for sliding window calculations
     */
    private getPreviousWindowStart(windowSeconds: number): string {
        const now = Math.floor(Date.now() / 1000);
        const windowStart = Math.floor(now / windowSeconds) * windowSeconds;
        const previousStart = windowStart - windowSeconds;
        return new Date(previousStart * 1000).toISOString();
    }

    /**
     * Check rate limit using fixed window algorithm
     * 
     * Fixed window divides time into discrete buckets.
     * Pros: Simple, memory efficient
     * Cons: Can allow burst at window boundaries (2x traffic)
     */
    checkFixedWindow(
        identifier: string,
        identifierType: 'ip' | 'api_key',
        limitConfig: RateLimitConfig
    ): RateLimitResult {
        const windowStart = this.getWindowStart(limitConfig.windowSeconds);

        // Get or create the rate limit record for this window
        let row = this.db.query(`
      SELECT * FROM rate_limits 
      WHERE identifier = ? AND identifier_type = ? AND window_start = ?
    `).get(identifier, identifierType, windowStart) as RateLimitRow | null;

        if (!row) {
            // Create new window record
            const id = nanoid();
            this.db.run(`
        INSERT INTO rate_limits (id, identifier, identifier_type, window_start, request_count)
        VALUES (?, ?, ?, ?, 0)
      `, [id, identifier, identifierType, windowStart]);

            row = {
                id,
                identifier,
                identifier_type: identifierType,
                window_start: windowStart,
                request_count: 0,
                last_request_at: new Date().toISOString(),
            };
        }

        const currentCount = row.request_count;
        const allowed = currentCount < limitConfig.limit;
        const remaining = Math.max(0, limitConfig.limit - currentCount - (allowed ? 1 : 0));

        // Calculate reset time
        const windowStartTime = new Date(windowStart).getTime();
        const resetAt = Math.floor((windowStartTime + limitConfig.windowSeconds * 1000) / 1000);

        if (allowed) {
            // Increment the counter
            this.db.run(`
        UPDATE rate_limits 
        SET request_count = request_count + 1, last_request_at = datetime('now')
        WHERE id = ?
      `, [row.id]);
        }

        return {
            allowed,
            remaining,
            resetAt,
            limit: limitConfig.limit,
            windowSeconds: limitConfig.windowSeconds,
        };
    }

    /**
     * Check rate limit using sliding window algorithm
     * 
     * Sliding window uses weighted average of current and previous windows.
     * This provides smoother rate limiting without boundary burst issues.
     * 
     * Formula: effective_count = previous_count * overlap_ratio + current_count
     * Where overlap_ratio = (windowSeconds - elapsed_in_current) / windowSeconds
     */
    checkSlidingWindow(
        identifier: string,
        identifierType: 'ip' | 'api_key',
        limitConfig: RateLimitConfig
    ): RateLimitResult {
        const now = Date.now();
        const windowSeconds = limitConfig.windowSeconds;
        const windowMs = windowSeconds * 1000;

        const currentWindowStart = this.getWindowStart(windowSeconds);
        const previousWindowStart = this.getPreviousWindowStart(windowSeconds);

        // Get both current and previous window counts
        const currentRow = this.db.query(`
      SELECT request_count FROM rate_limits 
      WHERE identifier = ? AND identifier_type = ? AND window_start = ?
    `).get(identifier, identifierType, currentWindowStart) as { request_count: number } | null;

        const previousRow = this.db.query(`
      SELECT request_count FROM rate_limits 
      WHERE identifier = ? AND identifier_type = ? AND window_start = ?
    `).get(identifier, identifierType, previousWindowStart) as { request_count: number } | null;

        const currentCount = currentRow?.request_count ?? 0;
        const previousCount = previousRow?.request_count ?? 0;

        // Calculate elapsed time in current window
        const currentWindowStartTime = new Date(currentWindowStart).getTime();
        const elapsedInCurrent = now - currentWindowStartTime;

        // Weight for previous window (how much of it overlaps with our sliding window)
        const overlapRatio = Math.max(0, (windowMs - elapsedInCurrent) / windowMs);

        // Effective count using weighted average
        const effectiveCount = (previousCount * overlapRatio) + currentCount;

        const allowed = effectiveCount < limitConfig.limit;
        const remaining = Math.max(0, Math.floor(limitConfig.limit - effectiveCount - (allowed ? 1 : 0)));

        // Reset time is sliding - estimate when the window will clear enough
        const resetAt = Math.floor((now + windowMs) / 1000);

        if (allowed) {
            // Ensure current window record exists and increment
            if (!currentRow) {
                const id = nanoid();
                this.db.run(`
          INSERT INTO rate_limits (id, identifier, identifier_type, window_start, request_count)
          VALUES (?, ?, ?, ?, 1)
        `, [id, identifier, identifierType, currentWindowStart]);
            } else {
                this.db.run(`
          UPDATE rate_limits 
          SET request_count = request_count + 1, last_request_at = datetime('now')
          WHERE identifier = ? AND identifier_type = ? AND window_start = ?
        `, [identifier, identifierType, currentWindowStart]);
            }
        }

        return {
            allowed,
            remaining,
            resetAt,
            limit: limitConfig.limit,
            windowSeconds: limitConfig.windowSeconds,
        };
    }

    /**
     * Main rate limit check - uses configured algorithm
     */
    check(
        identifier: string,
        identifierType: 'ip' | 'api_key',
        limitConfig?: Partial<RateLimitConfig>
    ): RateLimitResult {
        const fullConfig: RateLimitConfig = {
            limit: limitConfig?.limit ?? config.rateLimit.defaultLimit,
            windowSeconds: limitConfig?.windowSeconds ?? config.rateLimit.defaultWindowSeconds,
            useSlidingWindow: limitConfig?.useSlidingWindow ?? config.rateLimit.useSlidingWindow,
        };

        if (fullConfig.useSlidingWindow) {
            return this.checkSlidingWindow(identifier, identifierType, fullConfig);
        } else {
            return this.checkFixedWindow(identifier, identifierType, fullConfig);
        }
    }

    /**
     * Get current request count for an identifier
     * Useful for abuse detection baseline calculations
     */
    getCurrentCount(
        identifier: string,
        identifierType: 'ip' | 'api_key',
        windowSeconds: number
    ): number {
        const windowStart = this.getWindowStart(windowSeconds);
        const row = this.db.query(`
      SELECT request_count FROM rate_limits 
      WHERE identifier = ? AND identifier_type = ? AND window_start = ?
    `).get(identifier, identifierType, windowStart) as { request_count: number } | null;

        return row?.request_count ?? 0;
    }

    /**
     * Clean up old rate limit windows
     */
    cleanup(): number {
        const result = this.db.run(`
      DELETE FROM rate_limits 
      WHERE window_start < datetime('now', '-2 hours')
    `);
        return result.changes;
    }
}
