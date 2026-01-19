/**
 * Settings Repository
 * 
 * Manages global settings including geo-blocking configuration.
 */

import { Database } from 'bun:sqlite';
import { getDatabaseSync } from '../db/connection';

export interface BlockedCountry {
    countryCode: string;
    countryName: string | null;
    blockedAt: string;
    blockedBy: string;
}

export class SettingsRepository {
    private db: Database;

    constructor() {
        this.db = getDatabaseSync();
    }

    // ========================================================================
    // Geo-Blocking Settings
    // ========================================================================

    /**
     * Check if geo-blocking is enabled
     */
    isGeoBlockingEnabled(): boolean {
        const result = this.db.query(`
            SELECT value FROM settings WHERE key = 'geo_blocking_enabled'
        `).get() as { value: string } | null;

        return result?.value === 'true';
    }

    /**
     * Enable or disable geo-blocking
     */
    setGeoBlockingEnabled(enabled: boolean): void {
        this.db.run(`
            INSERT INTO settings (key, value, updated_at) 
            VALUES ('geo_blocking_enabled', ?, datetime('now'))
            ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')
        `, [enabled ? 'true' : 'false', enabled ? 'true' : 'false']);
    }

    /**
     * Get all blocked countries
     */
    getBlockedCountries(): BlockedCountry[] {
        const rows = this.db.query(`
            SELECT country_code, country_name, blocked_at, blocked_by 
            FROM blocked_countries 
            ORDER BY country_code
        `).all() as { country_code: string; country_name: string | null; blocked_at: string; blocked_by: string }[];

        return rows.map(row => ({
            countryCode: row.country_code,
            countryName: row.country_name,
            blockedAt: row.blocked_at,
            blockedBy: row.blocked_by,
        }));
    }

    /**
     * Check if a country is blocked
     */
    isCountryBlocked(countryCode: string): boolean {
        const result = this.db.query(`
            SELECT 1 FROM blocked_countries WHERE country_code = ?
        `).get(countryCode.toUpperCase());

        return result !== null;
    }

    /**
     * Block a country
     */
    blockCountry(countryCode: string, countryName?: string, blockedBy = 'admin'): void {
        this.db.run(`
            INSERT OR REPLACE INTO blocked_countries (country_code, country_name, blocked_at, blocked_by)
            VALUES (?, ?, datetime('now'), ?)
        `, [countryCode.toUpperCase(), countryName ?? null, blockedBy]);
    }

    /**
     * Unblock a country
     */
    unblockCountry(countryCode: string): boolean {
        const result = this.db.run(`
            DELETE FROM blocked_countries WHERE country_code = ?
        `, [countryCode.toUpperCase()]);

        return result.changes > 0;
    }

    /**
     * Bulk update blocked countries (replace all)
     */
    setBlockedCountries(countries: { code: string; name?: string }[]): void {
        // Clear existing
        this.db.run(`DELETE FROM blocked_countries`);

        // Insert new
        const stmt = this.db.prepare(`
            INSERT INTO blocked_countries (country_code, country_name, blocked_at, blocked_by)
            VALUES (?, ?, datetime('now'), 'admin')
        `);

        for (const country of countries) {
            stmt.run(country.code.toUpperCase(), country.name ?? null);
        }
    }

    // ========================================================================
    // Generic Settings
    // ========================================================================

    getSetting(key: string): string | null {
        const result = this.db.query(`
            SELECT value FROM settings WHERE key = ?
        `).get(key) as { value: string } | null;

        return result?.value ?? null;
    }

    setSetting(key: string, value: string): void {
        this.db.run(`
            INSERT INTO settings (key, value, updated_at) 
            VALUES (?, ?, datetime('now'))
            ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')
        `, [key, value, value]);
    }
}
