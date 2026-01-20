/**
 * IP Intelligence Detection Engine
 * 
 * Core classification logic for determining IP reputation.
 * Implements a layered detection approach:
 * 
 * 1. Cache layer - Return cached results if valid
 * 2. Manual blocks - Check admin-defined blocks (highest priority)
 * 3. Tor detection - Check against Tor exit node list
 * 4. ASN heuristics - Check known hosting/VPN ASNs
 * 5. External providers - Query configured providers
 * 6. Fallback - Return unknown with low confidence
 * 
 * Confidence Scoring:
 * - 90-100: High confidence (multiple sources agree, known lists)
 * - 70-89:  Medium confidence (single reliable source)
 * - 50-69:  Low confidence (heuristics only)
 * - 0-49:   Very low confidence (guesses, no data)
 * 
 * Design Principles:
 * - Works with ZERO external providers enabled
 * - Fast path for cached and known IPs
 * - Structured logging for all decisions
 * - Deterministic results for same inputs
 */

import { logger } from '../utils/logger';
import { ipIntelConfig } from './config';
import * as repo from './repository';
import { getProviders } from './providers';
import { isTorExitNode } from './tor-list';
import type {
    IPClassification,
    DetectionResult,
    ProviderResult,
    ASNCacheRecord,
} from './types';

const log = logger.child({ module: 'ip-intel-engine' });

// ============================================================================
// Main Classification Function
// ============================================================================

/**
 * Classify an IP address and determine its reputation.
 * 
 * @param ip - The IP address to classify
 * @param bypassCache - If true, skip cache lookup
 * @returns Complete IP classification result
 */
export async function classifyIP(
    ip: string,
    bypassCache: boolean = false
): Promise<IPClassification> {
    const startTime = performance.now();

    // Track this check for statistics
    repo.incrementStat('check');

    // Layer 1: Cache lookup
    if (!bypassCache) {
        const cached = repo.getIPReputation(ip);
        if (cached) {
            repo.incrementStat('cache_hit');

            const result = repo.recordToClassification(cached);
            result.source = 'cache';

            logDecision(ip, result, performance.now() - startTime);
            return result;
        }
    }

    // Run detection pipeline
    const detection = await runDetectionPipeline(ip);

    // Build final classification
    const classification = buildClassification(ip, detection);

    // Cache the result
    repo.upsertIPReputation(classification);

    // Track classification type
    trackClassificationType(classification);

    logDecision(ip, classification, performance.now() - startTime);

    return classification;
}

/**
 * Directly look up ASN information.
 */
export async function lookupASNInfo(asn: number): Promise<ASNCacheRecord | null> {
    const cached = repo.getASNCache(asn);
    if (cached) return cached;

    // If not in cache, we need an IP to query a provider (IP-API quirk)
    // or use a dedicated ASN provider. For now, we return null if not in cache
    // but in a real app, we would use a dedicated ASN metadata API.
    return null;
}

// ============================================================================
// Detection Pipeline
// ============================================================================

/**
 * Run the layered detection pipeline.
 * Returns after the first high-confidence result.
 */
async function runDetectionPipeline(ip: string): Promise<DetectionResult> {
    // Layer 2: Manual blocks (highest priority)
    const manualBlock = checkManualBlocks(ip);
    if (manualBlock) {
        return manualBlock;
    }

    // Layer 3: Tor detection
    if (ipIntelConfig.detection.torDetectionEnabled) {
        const torResult = checkTorExitNode(ip);
        if (torResult) {
            return torResult;
        }
    }

    // Layer 4: ASN-based heuristics
    if (ipIntelConfig.detection.asnHeuristicsEnabled) {
        const asnResult = await checkASNHeuristics(ip);
        if (asnResult && asnResult.confidence >= ipIntelConfig.detection.confidenceThreshold) {
            return asnResult;
        }
    }

    // Layer 5: External providers
    const providerResult = await queryProviders(ip);
    if (providerResult) {
        return providerResult;
    }

    // Layer 6: Fallback - unknown
    return {
        type: 'unknown',
        confidence: 30,
        reason: 'No classification data available',
        source: 'heuristic',
    };
}

// ============================================================================
// Detection Layers
// ============================================================================

/**
 * Layer 2: Check manual IP and ASN blocks.
 */
function checkManualBlocks(ip: string): DetectionResult | null {
    // Check direct IP block
    const ipBlock = repo.getManualBlock(ip, 'ip');
    if (ipBlock) {
        return {
            type: 'proxy',
            confidence: 100,
            reason: `Manually blocked: ${ipBlock.reason}`,
            source: 'manual',
        };
    }

    // Check range blocks
    const rangeBlocks = repo.getActiveRangeBlocks();
    for (const block of rangeBlocks) {
        if (isIpInCidr(ip, block.identifier)) {
            return {
                type: 'proxy',
                confidence: 100,
                reason: `IP matches blocked range ${block.identifier}: ${block.reason}`,
                source: 'manual',
            };
        }
    }

    // Note: ASN-based manual blocks are checked in ASN heuristics layer
    return null;
}

/**
 * Layer 3: Check if IP is a Tor exit node.
 */
function checkTorExitNode(ip: string): DetectionResult | null {
    if (isTorExitNode(ip)) {
        return {
            type: 'tor',
            confidence: 100,
            reason: 'IP is a known Tor exit node',
            source: 'tor_list',
        };
    }
    return null;
}

/**
 * Layer 4: ASN-based heuristics.
 * 
 * Uses pre-populated list of known hosting/VPN ASNs.
 * Also checks for manual ASN blocks.
 */
async function checkASNHeuristics(ip: string): Promise<DetectionResult | null> {
    // Try to get ASN for this IP
    const asnInfo = await lookupASN(ip);
    if (!asnInfo) {
        return null;
    }

    // Check manual ASN block
    const asnBlock = repo.getManualBlock(String(asnInfo.asn), 'asn');
    if (asnBlock) {
        return {
            type: 'hosting',
            confidence: 100,
            reason: `ASN ${asnInfo.asn} manually blocked: ${asnBlock.reason}`,
            source: 'manual',
            metadata: { asn: asnInfo.asn, asnOrg: asnInfo.org_name },
        };
    }

    // Check known hosting ASN
    if (asnInfo.is_hosting) {
        const type = asnInfo.is_vpn ? 'vpn' : 'hosting';
        return {
            type,
            confidence: 85,
            reason: `ASN ${asnInfo.asn} (${asnInfo.org_name}) is a known ${type} provider`,
            source: 'heuristic',
            metadata: { asn: asnInfo.asn, asnOrg: asnInfo.org_name },
        };
    }

    // Check known VPN ASN
    if (asnInfo.is_vpn) {
        return {
            type: 'vpn',
            confidence: 85,
            reason: `ASN ${asnInfo.asn} (${asnInfo.org_name}) is a known VPN provider`,
            source: 'heuristic',
            metadata: { asn: asnInfo.asn, asnOrg: asnInfo.org_name },
        };
    }

    // ASN exists but isn't flagged
    return {
        type: 'residential',
        confidence: 60,
        reason: `ASN ${asnInfo.asn} (${asnInfo.org_name}) appears residential`,
        source: 'heuristic',
        metadata: { asn: asnInfo.asn, asnOrg: asnInfo.org_name },
    };
}

/**
 * Lookup ASN for an IP address.
 * First checks cache, then queries free provider if needed.
 */
async function lookupASN(ip: string): Promise<ASNCacheRecord | null> {
    // We need to query a provider to get ASN if not cached
    // Use IP-API since it's free and returns ASN
    try {
        const response = await fetch(`http://ip-api.com/json/${ip}?fields=as,org,isp,countryCode`, {
            headers: { 'Accept': 'application/json' },
        });

        if (!response.ok) {
            return null;
        }

        const data = await response.json() as {
            as?: string;
            org?: string;
            isp?: string;
            countryCode?: string;
        };

        if (!data.as) {
            return null;
        }

        // Parse ASN from "AS12345 Org Name" format
        const match = data.as.match(/^AS(\d+)/);
        if (!match) {
            return null;
        }

        const asn = parseInt(match[1], 10);
        const orgName = data.org ?? data.isp ?? 'Unknown';

        // Check if this ASN is in our cache (for hosting/VPN flags)
        const cached = repo.getASNCache(asn);
        if (cached) {
            return cached;
        }

        // Not in cache, return basic info
        // In production, you'd want to populate hosting/VPN flags from IP-API
        return {
            asn,
            org_name: orgName,
            is_hosting: 0, // Unknown
            is_vpn: 0,     // Unknown
            country_code: data.countryCode ?? null,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            created_at: new Date().toISOString(),
        };
    } catch (error) {
        log.debug('ASN lookup failed', { ip, error: error instanceof Error ? error.message : 'Unknown' });
        return null;
    }
}

/**
 * Layer 5: Query external providers.
 */
async function queryProviders(ip: string): Promise<DetectionResult | null> {
    const providers = getProviders();

    if (providers.length === 0) {
        log.debug('No providers enabled, skipping provider layer');
        return null;
    }

    // Query providers in priority order
    for (const provider of providers) {
        try {
            // Check provider cache first
            const cached = repo.getProviderCache(ip, provider.name);
            let result: ProviderResult | null = null;

            if (cached) {
                result = JSON.parse(cached) as ProviderResult;
            } else {
                result = await provider.check(ip);

                if (result) {
                    // Cache the result
                    repo.setProviderCache(ip, provider.name, JSON.stringify(result));
                }
            }

            if (result && hasPositiveIndicators(result)) {
                return providerResultToDetection(result);
            }
        } catch (error) {
            log.warn(`Provider ${provider.name} failed`, {
                ip,
                error: error instanceof Error ? error.message : 'Unknown',
            });
        }
    }

    return null;
}

/**
 * Check if provider result has any positive indicators.
 */
function hasPositiveIndicators(result: ProviderResult): boolean {
    return result.isProxy || result.isVPN || result.isTor || result.isHosting;
}

/**
 * Convert provider result to detection result.
 */
function providerResultToDetection(result: ProviderResult): DetectionResult {
    // Determine primary type
    let type: 'proxy' | 'vpn' | 'tor' | 'hosting' | 'residential' | 'unknown';
    let reason: string;

    if (result.isTor) {
        type = 'tor';
        reason = 'Provider detected Tor exit node';
    } else if (result.isVPN) {
        type = 'vpn';
        reason = 'Provider detected VPN';
    } else if (result.isProxy) {
        type = 'proxy';
        reason = 'Provider detected proxy';
    } else if (result.isHosting) {
        type = 'hosting';
        reason = 'Provider detected hosting/datacenter IP';
    } else {
        type = 'residential';
        reason = 'Provider detected residential IP';
    }

    return {
        type,
        confidence: result.confidence,
        reason,
        source: 'provider',
        metadata: {
            asn: result.asn,
            asnOrg: result.asnOrg,
            countryCode: result.countryCode,
        },
    };
}

// ============================================================================
// Result Building
// ============================================================================

/**
 * Build final classification from detection result.
 */
function buildClassification(ip: string, detection: DetectionResult): IPClassification {
    const now = new Date().toISOString();

    const classification: IPClassification = {
        ip,
        isProxy: detection.type === 'proxy',
        isVPN: detection.type === 'vpn',
        isTor: detection.type === 'tor',
        isHosting: detection.type === 'hosting',
        isResidential: detection.type === 'residential',
        confidence: detection.confidence,
        reason: detection.reason,
        source: detection.source,
        checkedAt: now,
    };

    // Add metadata if available
    if (detection.metadata) {
        if (typeof detection.metadata.asn === 'number') {
            classification.asn = detection.metadata.asn;
        }
        if (typeof detection.metadata.asnOrg === 'string') {
            classification.asnOrg = detection.metadata.asnOrg;
        }
        if (typeof detection.metadata.countryCode === 'string') {
            classification.countryCode = detection.metadata.countryCode;
        }
    }

    return classification;
}

// ============================================================================
// Statistics & Logging
// ============================================================================

/**
 * Track classification type in statistics.
 */
function trackClassificationType(classification: IPClassification): void {
    if (classification.isTor) {
        repo.incrementStat('tor');
    } else if (classification.isVPN) {
        repo.incrementStat('vpn');
    } else if (classification.isProxy) {
        repo.incrementStat('proxy');
    } else if (classification.isHosting) {
        repo.incrementStat('hosting');
    } else if (classification.isResidential) {
        repo.incrementStat('residential');
    } else {
        repo.incrementStat('unknown');
    }
}

/**
 * Log classification decision.
 */
function logDecision(ip: string, result: IPClassification, durationMs: number): void {
    if (!ipIntelConfig.logging.logDecisions) {
        return;
    }

    const suspicious = result.isProxy || result.isVPN || result.isTor || result.isHosting;

    const logFn = suspicious ? log.warn.bind(log) : log.debug.bind(log);
    logFn('IP classification decision', {
        ip,
        type: getClassificationType(result),
        confidence: result.confidence,
        source: result.source,
        reason: result.reason,
        durationMs: Math.round(durationMs * 100) / 100,
    });
}

/**
 * Get human-readable classification type.
 */
function getClassificationType(classification: IPClassification): string {
    if (classification.isTor) return 'tor';
    if (classification.isVPN) return 'vpn';
    if (classification.isProxy) return 'proxy';
    if (classification.isHosting) return 'hosting';
    if (classification.isResidential) return 'residential';
    return 'unknown';
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Classify multiple IPs in parallel.
 * Useful for batch processing.
 */
export async function classifyIPs(
    ips: string[],
    bypassCache: boolean = false
): Promise<IPClassification[]> {
    return Promise.all(ips.map(ip => classifyIP(ip, bypassCache)));
}

// ============================================================================
// Manual Block Operations (exposed for routes)
// ============================================================================

/**
 * Add a manual block for an IP or ASN.
 */
export function addBlock(
    identifier: string,
    type: 'ip' | 'asn' | 'range',
    reason: string,
    durationSeconds?: number
): void {
    repo.addManualBlock(identifier, type, reason, 'admin', durationSeconds);

    // If blocking an IP, invalidate its cache
    if (type === 'ip') {
        // We could delete from cache, but simpler to just let it expire
        // and the next check will see the block
    }
}

/**
 * Remove a manual block.
 */
export function removeBlock(identifier: string, type: 'ip' | 'asn' | 'range'): boolean {
    return repo.removeManualBlock(identifier, type);
}

/**
 * List all manual blocks.
 */
export function listBlocks() {
    return repo.listManualBlocks();
}

/**
 * Helper to check if an IP is in a CIDR range.
 */
function isIpInCidr(ip: string, cidr: string): boolean {
    try {
        const [range, bitsStr] = cidr.split('/');
        if (!bitsStr) return ip === range;

        const bits = parseInt(bitsStr, 10);
        if (isNaN(bits) || bits < 0 || bits > 32) return false;

        const ipLong = ipToLong(ip);
        const rangeLong = ipToLong(range);

        // CIDR mask: bits 1s followed by 0s
        const mask = bits === 0 ? 0 : (0xFFFFFFFF << (32 - bits)) >>> 0;

        return (ipLong & mask) === (rangeLong & mask);
    } catch {
        return false;
    }
}

/**
 * Convert IPv4 to unsigned 32-bit integer.
 */
function ipToLong(ip: string): number {
    const parts = ip.split('.').map(o => parseInt(o, 10));
    if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
        throw new Error('Invalid IP');
    }
    return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}
