/**
 * IP Intelligence Module - Barrel Export
 * 
 * This is the main entry point for the IP intelligence module.
 * 
 * Quick Start:
 * 
 *   import { initIPIntel, classifyIP, ipIntelRoutes, ipIntelMiddleware } from './ip-intel';
 *   
 *   // Initialize (run once at startup)
 *   await initIPIntel();
 *   
 *   // Use the API routes
 *   app.route('/v1/ip', ipIntelRoutes);
 *   
 *   // Use middleware to block suspicious IPs
 *   app.use('/api/*', ipIntelMiddleware({ blockVPN: true, blockTor: true }));
 *   
 *   // Or classify IPs directly
 *   const result = await classifyIP('1.2.3.4');
 */

// Re-export types
export type {
    IPClassification,
    IPCheckRequest,
    ManualBlockRequest,
    IPIntelStats,
    IPType,
    ClassificationSource,
    ProviderResult,
    IIPIntelProvider,
} from './types';

// Re-export config
export { ipIntelConfig } from './config';

// Re-export routes
export { ipIntelRoutes } from './routes';

// Re-export engine functions
export { classifyIP, classifyIPs, addBlock, removeBlock, listBlocks } from './engine';

// Re-export middleware
export { ipIntelMiddleware, ipIntelPresets, type IPIntelMiddlewareOptions } from './middleware';

// Re-export provider utilities
export { getProviders, getProvider } from './providers';

// Re-export Tor list utilities
export { isTorExitNode, getTorListStatus, updateTorList } from './tor-list';

// Re-export repository stats
export { getStats, runCleanup } from './repository';

// ============================================================================
// Initialization
// ============================================================================

import { getDatabaseSync } from '../db';
import { IP_INTEL_SCHEMA } from './schema';
import { startTorListUpdater, stopTorListUpdater } from './tor-list';
import { logger } from '../utils/logger';

const log = logger.child({ module: 'ip-intel' });

let initialized = false;

/**
 * Initialize the IP intelligence module.
 * This should be called once at application startup.
 * 
 * Performs:
 * - Database schema migration
 * - Starts Tor exit node list updater
 */
export async function initIPIntel(): Promise<void> {
    if (initialized) {
        log.warn('IP Intelligence module already initialized');
        return;
    }

    log.info('Initializing IP Intelligence module');

    // Run schema migrations
    const db = getDatabaseSync();
    db.exec(IP_INTEL_SCHEMA);
    log.debug('IP Intelligence schema initialized');

    // Start Tor list updater
    startTorListUpdater();

    initialized = true;
    log.info('IP Intelligence module initialized');
}

/**
 * Shutdown the IP intelligence module.
 * Call this during graceful shutdown.
 */
export function shutdownIPIntel(): void {
    log.info('Shutting down IP Intelligence module');
    stopTorListUpdater();
    initialized = false;
}
