/**
 * IP Intelligence Repository
 * 
 * Data access layer for all IP intelligence database operations.
 * Handles caching, CRUD operations, and statistics tracking.
 * 
 * Architecture Decisions:
 * - All database access is centralized here
 * - Prepared statements for performance
 * - TTL-based cache management
 * - Atomic statistics updates
 */

import { getDatabaseSync } from '../db';
import { logger } from '../utils/logger';
import { ipIntelConfig } from './config';
import type {
    IPReputationRecord,
    ASNCacheRecord,
    TorNodeRecord,
    ManualBlockRecord,
    ProviderCacheRecord,
    ClassificationSource,
    IPClassification,
} from './types';

const log = logger.child({ module: 'ip-intel-repo' });

// ============================================================================
// IP Reputation Operations
// ============================================================================

/**
 * Get cached IP reputation record if not expired.
 */
export function getIPReputation(ip: string): IPReputationRecord | null {
    const db = getDatabaseSync();

    const stmt = db.prepare(`
    SELECT * FROM ip_reputation 
    WHERE ip = ? AND expires_at > datetime('now')
  `);

    const record = stmt.get(ip) as IPReputationRecord | undefined;
    return record ?? null;
}

/**
 * Store or update IP reputation record.
 */
export function upsertIPReputation(
    classification: IPClassification,
    ttlSeconds?: number
): void {
    const db = getDatabaseSync();
    const ttl = ttlSeconds ?? ipIntelConfig.cache.ipTTLSeconds;

    const stmt = db.prepare(`
    INSERT INTO ip_reputation (
      ip, is_proxy, is_vpn, is_tor, is_hosting, is_residential,
      confidence, reason, source, asn, asn_org, country_code,
      checked_at, expires_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+${ttl} seconds'), datetime('now'))
    ON CONFLICT(ip) DO UPDATE SET
      is_proxy = excluded.is_proxy,
      is_vpn = excluded.is_vpn,
      is_tor = excluded.is_tor,
      is_hosting = excluded.is_hosting,
      is_residential = excluded.is_residential,
      confidence = excluded.confidence,
      reason = excluded.reason,
      source = excluded.source,
      asn = excluded.asn,
      asn_org = excluded.asn_org,
      country_code = excluded.country_code,
      checked_at = excluded.checked_at,
      expires_at = excluded.expires_at,
      updated_at = datetime('now')
  `);

    stmt.run(
        classification.ip,
        classification.isProxy ? 1 : 0,
        classification.isVPN ? 1 : 0,
        classification.isTor ? 1 : 0,
        classification.isHosting ? 1 : 0,
        classification.isResidential ? 1 : 0,
        classification.confidence,
        classification.reason,
        classification.source,
        classification.asn ?? null,
        classification.asnOrg ?? null,
        classification.countryCode ?? null,
        classification.checkedAt
    );
}

/**
 * Convert database record to IPClassification.
 */
export function recordToClassification(record: IPReputationRecord): IPClassification {
    return {
        ip: record.ip,
        isProxy: record.is_proxy === 1,
        isVPN: record.is_vpn === 1,
        isTor: record.is_tor === 1,
        isHosting: record.is_hosting === 1,
        isResidential: record.is_residential === 1,
        confidence: record.confidence,
        reason: record.reason,
        source: record.source as ClassificationSource,
        asn: record.asn ?? undefined,
        asnOrg: record.asn_org ?? undefined,
        countryCode: record.country_code ?? undefined,
        checkedAt: record.checked_at,
    };
}

// ============================================================================
// ASN Cache Operations
// ============================================================================

/**
 * Get cached ASN record if not expired.
 */
export function getASNCache(asn: number): ASNCacheRecord | null {
    const db = getDatabaseSync();

    const stmt = db.prepare(`
    SELECT * FROM asn_cache 
    WHERE asn = ? AND expires_at > datetime('now')
  `);

    const record = stmt.get(asn) as ASNCacheRecord | undefined;
    return record ?? null;
}

/**
 * Store ASN cache record.
 */
export function upsertASNCache(
    asn: number,
    orgName: string,
    isHosting: boolean,
    isVPN: boolean,
    countryCode?: string
): void {
    const db = getDatabaseSync();
    const ttl = ipIntelConfig.cache.asnTTLSeconds;

    const stmt = db.prepare(`
    INSERT INTO asn_cache (asn, org_name, is_hosting, is_vpn, country_code, expires_at)
    VALUES (?, ?, ?, ?, ?, datetime('now', '+${ttl} seconds'))
    ON CONFLICT(asn) DO UPDATE SET
      org_name = excluded.org_name,
      is_hosting = excluded.is_hosting,
      is_vpn = excluded.is_vpn,
      country_code = excluded.country_code,
      expires_at = excluded.expires_at
  `);

    stmt.run(asn, orgName, isHosting ? 1 : 0, isVPN ? 1 : 0, countryCode ?? null);
}

// ============================================================================
// Tor Node Operations
// ============================================================================

/**
 * Check if an IP is a known Tor exit node.
 */
export function isTorExitNode(ip: string): boolean {
    const db = getDatabaseSync();

    const stmt = db.prepare(`
    SELECT 1 FROM tor_nodes WHERE ip = ? AND is_exit = 1
  `);

    const result = stmt.get(ip);
    // SQLite returns null when no rows found, not undefined
    return result != null;
}

/**
 * Bulk insert/update Tor exit nodes.
 * Used during periodic list refresh.
 */
export function syncTorNodes(ips: string[]): { added: number; updated: number } {
    const db = getDatabaseSync();
    let added = 0;
    let updated = 0;

    const insertStmt = db.prepare(`
    INSERT INTO tor_nodes (ip, is_exit, last_seen_at)
    VALUES (?, 1, datetime('now'))
    ON CONFLICT(ip) DO UPDATE SET
      last_seen_at = datetime('now'),
      is_exit = 1
  `);

    // Use a transaction for bulk inserts
    const insertMany = db.transaction((ips: string[]) => {
        for (const ip of ips) {
            const result = insertStmt.run(ip);
            if (result.changes > 0) {
                // SQLite doesn't easily distinguish insert vs update in UPSERT,
                // so we count all as processed
                added++;
            }
        }
    });

    insertMany(ips);

    log.info('Synced Tor exit nodes', { count: ips.length, added });
    return { added, updated };
}

/**
 * Get count of Tor nodes in database.
 */
export function getTorNodeCount(): number {
    const db = getDatabaseSync();
    const stmt = db.prepare(`SELECT COUNT(*) as count FROM tor_nodes WHERE is_exit = 1`);
    const result = stmt.get() as { count: number };
    return result.count;
}

// ============================================================================
// Manual Block Operations
// ============================================================================

/**
 * Check if an IP or ASN is manually blocked.
 */
export function getManualBlock(
    identifier: string,
    type: 'ip' | 'asn' | 'range'
): ManualBlockRecord | null {
    const db = getDatabaseSync();

    const stmt = db.prepare(`
    SELECT * FROM ip_intel_blocks 
    WHERE identifier = ? 
    AND identifier_type = ?
    AND (expires_at IS NULL OR expires_at > datetime('now'))
  `);

    const record = stmt.get(identifier, type) as ManualBlockRecord | undefined;
    return record ?? null;
}

/**
 * Add a manual block.
 */
export function addManualBlock(
    identifier: string,
    type: 'ip' | 'asn' | 'range',
    reason: string,
    blockedBy: string = 'admin',
    durationSeconds?: number
): ManualBlockRecord {
    const db = getDatabaseSync();
    const id = crypto.randomUUID();

    const expiresAt = durationSeconds
        ? `datetime('now', '+${durationSeconds} seconds')`
        : 'NULL';

    const stmt = db.prepare(`
    INSERT INTO ip_intel_blocks (id, identifier, identifier_type, reason, blocked_by, expires_at)
    VALUES (?, ?, ?, ?, ?, ${expiresAt})
    ON CONFLICT(identifier, identifier_type) DO UPDATE SET
      reason = excluded.reason,
      blocked_by = excluded.blocked_by,
      blocked_at = datetime('now'),
      expires_at = excluded.expires_at
  `);

    stmt.run(id, identifier, type, reason, blockedBy);

    log.info('Added manual block', { identifier, type, reason, blockedBy });

    return {
        id,
        identifier,
        identifier_type: type,
        reason,
        blocked_by: blockedBy,
        blocked_at: new Date().toISOString(),
        expires_at: null,
    };
}

/**
 * Remove a manual block.
 */
export function removeManualBlock(identifier: string, type: 'ip' | 'asn' | 'range'): boolean {
    const db = getDatabaseSync();

    const stmt = db.prepare(`
    DELETE FROM ip_intel_blocks 
    WHERE identifier = ? AND identifier_type = ?
  `);

    const result = stmt.run(identifier, type);
    return result.changes > 0;
}

/**
 * List all manual blocks.
 */
export function listManualBlocks(): ManualBlockRecord[] {
    const db = getDatabaseSync();

    const stmt = db.prepare(`
    SELECT * FROM ip_intel_blocks 
    WHERE expires_at IS NULL OR expires_at > datetime('now')
    ORDER BY blocked_at DESC
  `);

    return stmt.all() as ManualBlockRecord[];
}

/**
 * Get all active range blocks.
 */
export function getActiveRangeBlocks(): ManualBlockRecord[] {
    const db = getDatabaseSync();

    const stmt = db.prepare(`
    SELECT * FROM ip_intel_blocks 
    WHERE identifier_type = 'range'
    AND (expires_at IS NULL OR expires_at > datetime('now'))
  `);

    return stmt.all() as ManualBlockRecord[];
}

// ============================================================================
// Provider Cache Operations
// ============================================================================

/**
 * Get cached provider response.
 */
export function getProviderCache(ip: string, provider: string): string | null {
    const db = getDatabaseSync();

    const stmt = db.prepare(`
    SELECT response FROM provider_cache 
    WHERE ip = ? AND provider = ? AND expires_at > datetime('now')
  `);

    const record = stmt.get(ip, provider) as { response: string } | undefined;
    return record?.response ?? null;
}

/**
 * Store provider response in cache.
 */
export function setProviderCache(ip: string, provider: string, response: string): void {
    const db = getDatabaseSync();
    const ttl = ipIntelConfig.cache.providerTTLSeconds;

    const stmt = db.prepare(`
    INSERT INTO provider_cache (ip, provider, response, expires_at)
    VALUES (?, ?, ?, datetime('now', '+${ttl} seconds'))
    ON CONFLICT(ip, provider) DO UPDATE SET
      response = excluded.response,
      expires_at = excluded.expires_at
  `);

    stmt.run(ip, provider, response);
}

// ============================================================================
// Statistics Operations
// ============================================================================

/**
 * Increment a statistic counter for today.
 */
export function incrementStat(statType: string, count: number = 1): void {
    const db = getDatabaseSync();

    const stmt = db.prepare(`
    INSERT INTO ip_intel_stats (date, stat_type, count)
    VALUES (date('now'), ?, ?)
    ON CONFLICT(date, stat_type) DO UPDATE SET
      count = count + excluded.count
  `);

    stmt.run(statType, count);
}

/**
 * Get aggregated statistics.
 */
export function getStats(): {
    totalChecks: number;
    cacheHits: number;
    classifications: Record<string, number>;
    manualBlocks: { ips: number; asns: number; ranges: number };
    torNodesCount: number;
    asnCacheSize: number;
} {
    const db = getDatabaseSync();

    // Total checks and cache hits (last 30 days)
    const statsStmt = db.prepare(`
    SELECT stat_type, SUM(count) as total
    FROM ip_intel_stats
    WHERE date >= date('now', '-30 days')
    GROUP BY stat_type
  `);
    const statsRows = statsStmt.all() as { stat_type: string; total: number }[];
    const statsMap: Record<string, number> = {};
    for (const row of statsRows) {
        statsMap[row.stat_type] = row.total;
    }

    // Manual blocks count
    const blocksStmt = db.prepare(`
    SELECT identifier_type, COUNT(*) as count
    FROM ip_intel_blocks
    WHERE expires_at IS NULL OR expires_at > datetime('now')
    GROUP BY identifier_type
  `);
    const blocksRows = blocksStmt.all() as { identifier_type: string; count: number }[];
    const blocksMap: Record<string, number> = { ip: 0, asn: 0, range: 0 };
    for (const row of blocksRows) {
        blocksMap[row.identifier_type] = row.count;
    }

    // Tor nodes count
    const torCount = getTorNodeCount();

    // ASN cache size
    const asnStmt = db.prepare(`SELECT COUNT(*) as count FROM asn_cache`);
    const asnResult = asnStmt.get() as { count: number };

    return {
        totalChecks: statsMap['check'] ?? 0,
        cacheHits: statsMap['cache_hit'] ?? 0,
        classifications: {
            residential: statsMap['residential'] ?? 0,
            proxy: statsMap['proxy'] ?? 0,
            vpn: statsMap['vpn'] ?? 0,
            tor: statsMap['tor'] ?? 0,
            hosting: statsMap['hosting'] ?? 0,
            unknown: statsMap['unknown'] ?? 0,
        },
        manualBlocks: {
            ips: blocksMap.ip,
            asns: blocksMap.asn,
            ranges: blocksMap.range,
        },
        torNodesCount: torCount,
        asnCacheSize: asnResult.count,
    };
}

// ============================================================================
// Cleanup Operations
// ============================================================================

/**
 * Run cleanup for expired records.
 */
export function runCleanup(): { deleted: Record<string, number> } {
    const db = getDatabaseSync();
    const deleted: Record<string, number> = {};

    const queries = [
        { name: 'ip_reputation', sql: `DELETE FROM ip_reputation WHERE expires_at < datetime('now')` },
        { name: 'asn_cache', sql: `DELETE FROM asn_cache WHERE expires_at < datetime('now')` },
        { name: 'provider_cache', sql: `DELETE FROM provider_cache WHERE expires_at < datetime('now')` },
        { name: 'ip_intel_blocks', sql: `DELETE FROM ip_intel_blocks WHERE expires_at IS NOT NULL AND expires_at < datetime('now')` },
        { name: 'ip_intel_stats', sql: `DELETE FROM ip_intel_stats WHERE date < date('now', '-90 days')` },
    ];

    for (const query of queries) {
        const stmt = db.prepare(query.sql);
        const result = stmt.run();
        deleted[query.name] = result.changes;
    }

    log.debug('Cleanup completed', { deleted });
    return { deleted };
}
