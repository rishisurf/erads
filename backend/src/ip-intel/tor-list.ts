/**
 * Tor Exit Node List Manager
 * 
 * Periodically fetches and maintains a list of Tor exit nodes.
 * This enables instant Tor detection without external API calls.
 * 
 * Data Source:
 * - Tor Project's official bulk exit list: https://check.torproject.org/torbulkexitlist
 * 
 * Architecture:
 * - Fetches on startup and at configurable intervals
 * - Stores in SQLite for persistence across restarts
 * - Returns from cache for all lookups
 */

import { logger } from '../utils/logger';
import { ipIntelConfig } from './config';
import * as repo from './repository';

const log = logger.child({ module: 'tor-list' });

let updateInterval: Timer | null = null;
let lastUpdate: Date | null = null;
let isUpdating = false;

/**
 * Fetch the Tor exit node list from the Tor Project.
 */
async function fetchTorExitList(): Promise<string[]> {
    const url = ipIntelConfig.tor.exitListUrl;
    const timeout = ipIntelConfig.tor.fetchTimeoutMs;

    log.debug('Fetching Tor exit node list', { url });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'ERADS/1.0 IP-Intelligence',
            },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const text = await response.text();

        // Parse the list - one IP per line, may have comments starting with #
        const ips = text
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'))
            .filter(ip => isValidIPv4(ip));

        log.info('Fetched Tor exit node list', { count: ips.length });
        return ips;
    } catch (error) {
        clearTimeout(timeoutId);

        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error('Tor list fetch timed out');
        }
        throw error;
    }
}

/**
 * Simple IPv4 validation.
 */
function isValidIPv4(ip: string): boolean {
    const parts = ip.split('.');
    if (parts.length !== 4) return false;

    for (const part of parts) {
        const num = parseInt(part, 10);
        if (isNaN(num) || num < 0 || num > 255) return false;
        if (part !== String(num)) return false; // No leading zeros
    }

    return true;
}

/**
 * Update the Tor exit node list in the database.
 */
export async function updateTorList(): Promise<{ success: boolean; count: number }> {
    if (isUpdating) {
        log.debug('Tor list update already in progress, skipping');
        return { success: false, count: 0 };
    }

    if (!ipIntelConfig.detection.torDetectionEnabled) {
        log.debug('Tor detection disabled, skipping update');
        return { success: false, count: 0 };
    }

    isUpdating = true;

    try {
        const ips = await fetchTorExitList();

        if (ips.length === 0) {
            log.warn('Tor list is empty, keeping existing data');
            return { success: false, count: 0 };
        }

        // Sync to database
        const result = repo.syncTorNodes(ips);
        lastUpdate = new Date();

        log.info('Tor exit node list updated', {
            count: ips.length,
            added: result.added,
            lastUpdate: lastUpdate.toISOString(),
        });

        return { success: true, count: ips.length };
    } catch (error) {
        log.error('Failed to update Tor exit node list', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return { success: false, count: 0 };
    } finally {
        isUpdating = false;
    }
}

/**
 * Start periodic updates of the Tor list.
 */
export function startTorListUpdater(): void {
    if (!ipIntelConfig.detection.torDetectionEnabled) {
        log.info('Tor detection disabled, skipping Tor list updater');
        return;
    }

    // Initial update
    updateTorList().catch(err => {
        log.error('Initial Tor list update failed', { error: err });
    });

    // Schedule periodic updates
    const intervalMs = ipIntelConfig.tor.updateIntervalSeconds * 1000;
    updateInterval = setInterval(() => {
        updateTorList().catch(err => {
            log.error('Periodic Tor list update failed', { error: err });
        });
    }, intervalMs);

    log.info('Tor list updater started', {
        intervalSeconds: ipIntelConfig.tor.updateIntervalSeconds,
    });
}

/**
 * Stop periodic updates.
 */
export function stopTorListUpdater(): void {
    if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
        log.info('Tor list updater stopped');
    }
}

/**
 * Check if an IP is a known Tor exit node.
 * This is a fast database lookup.
 */
export function isTorExitNode(ip: string): boolean {
    return repo.isTorExitNode(ip);
}

/**
 * Get status information about the Tor list.
 */
export function getTorListStatus(): {
    enabled: boolean;
    nodeCount: number;
    lastUpdate: string | null;
    isUpdating: boolean;
} {
    return {
        enabled: ipIntelConfig.detection.torDetectionEnabled,
        nodeCount: repo.getTorNodeCount(),
        lastUpdate: lastUpdate?.toISOString() ?? null,
        isUpdating,
    };
}
