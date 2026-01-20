/**
 * IP Intelligence Type Definitions
 * 
 * Core types for the IP classification and reputation system.
 * These types are used across all layers of the IP intelligence module.
 */

// ============================================================================
// Classification Types
// ============================================================================

/**
 * IP classification categories.
 * An IP can belong to multiple categories simultaneously.
 */
export type IPType = 'residential' | 'proxy' | 'vpn' | 'tor' | 'hosting' | 'unknown';

/**
 * Source of the classification decision.
 * Used for debugging and confidence scoring.
 */
export type ClassificationSource =
    | 'cache'        // Previously computed and cached
    | 'heuristic'    // Internal detection logic (ASN, patterns)
    | 'provider'     // External IP intelligence provider
    | 'manual'       // Manually added by admin
    | 'tor_list';    // From Tor exit node list

/**
 * Complete IP classification result.
 * This is the primary response type for IP checks.
 */
export interface IPClassification {
    ip: string;
    isProxy: boolean;
    isVPN: boolean;
    isTor: boolean;
    isHosting: boolean;
    isResidential: boolean;
    confidence: number;         // 0-100 confidence score
    reason: string;             // Human-readable explanation
    source: ClassificationSource;
    asn?: number;               // Autonomous System Number
    asnOrg?: string;            // ASN organization name
    countryCode?: string;       // ISO 3166-1 alpha-2
    checkedAt: string;          // ISO timestamp
}

/**
 * Lightweight classification for internal use.
 * Used in detection pipeline before full result construction.
 */
export interface DetectionResult {
    type: IPType;
    confidence: number;
    reason: string;
    source: ClassificationSource;
    metadata?: Record<string, unknown>;
}

// ============================================================================
// Database Entity Types
// ============================================================================

/**
 * IP reputation record as stored in database.
 */
export interface IPReputationRecord {
    ip: string;
    is_proxy: number;           // SQLite boolean: 0 or 1
    is_vpn: number;
    is_tor: number;
    is_hosting: number;
    is_residential: number;
    confidence: number;
    reason: string;
    source: ClassificationSource;
    asn: number | null;
    asn_org: string | null;
    country_code: string | null;
    checked_at: string;
    expires_at: string;
    created_at: string;
    updated_at: string;
}

/**
 * ASN cache record.
 * Stores ASN information to avoid repeated lookups.
 */
export interface ASNCacheRecord {
    asn: number;
    org_name: string;
    is_hosting: number;         // Known hosting/datacenter ASN
    is_vpn: number;             // Known VPN provider ASN
    country_code: string | null;
    expires_at: string;
    created_at: string;
}

/**
 * Tor exit node record.
 */
export interface TorNodeRecord {
    ip: string;
    first_seen_at: string;
    last_seen_at: string;
    is_exit: number;
    created_at: string;
}

/**
 * Manual IP/ASN block record.
 */
export interface ManualBlockRecord {
    id: string;
    identifier: string;         // IP address or ASN
    identifier_type: 'ip' | 'asn' | 'range';
    reason: string;
    blocked_by: string;
    blocked_at: string;
    expires_at: string | null;  // NULL = permanent
}

/**
 * Provider cache record.
 * Caches responses from external providers.
 */
export interface ProviderCacheRecord {
    ip: string;
    provider: string;
    response: string;           // JSON-encoded provider response
    expires_at: string;
    created_at: string;
}

// ============================================================================
// Provider Interface Types
// ============================================================================

/**
 * Standardized response from any IP intelligence provider.
 * All provider adapters must normalize their responses to this format.
 */
export interface ProviderResult {
    ip: string;
    isProxy: boolean;
    isVPN: boolean;
    isTor: boolean;
    isHosting: boolean;
    confidence: number;
    asn?: number;
    asnOrg?: string;
    countryCode?: string;
    raw?: unknown;              // Original provider response
}

/**
 * IP Intelligence Provider interface.
 * All external providers must implement this interface.
 */
export interface IIPIntelProvider {
    /** Unique identifier for this provider */
    readonly name: string;

    /** Whether this provider is currently enabled/configured */
    isEnabled(): boolean;

    /** Check an IP address and return classification */
    check(ip: string): Promise<ProviderResult | null>;

    /** Provider priority (lower = higher priority) */
    readonly priority: number;
}

// ============================================================================
// API Types
// ============================================================================

/**
 * Request body for IP check endpoint.
 */
export interface IPCheckRequest {
    ip: string;
    bypassCache?: boolean;      // Force fresh lookup
}

/**
 * Request body for manual block endpoint.
 */
export interface ManualBlockRequest {
    identifier: string;         // IP or ASN
    type: 'ip' | 'asn' | 'range';
    reason: string;
    durationSeconds?: number;   // NULL = permanent
}

/**
 * Aggregated statistics for IP intelligence.
 */
export interface IPIntelStats {
    totalChecks: number;
    cacheHits: number;
    cacheHitRate: number;
    classifications: {
        residential: number;
        proxy: number;
        vpn: number;
        tor: number;
        hosting: number;
        unknown: number;
    };
    manualBlocks: {
        ips: number;
        asns: number;
    };
    torNodesCount: number;
    asnCacheSize: number;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * IP Intelligence module configuration.
 */
export interface IPIntelConfig {
    /** Cache TTL for IP reputation records (seconds) */
    cacheTTLSeconds: number;

    /** Cache TTL for ASN records (seconds) */
    asnCacheTTLSeconds: number;

    /** Confidence threshold to trust a classification (0-100) */
    confidenceThreshold: number;

    /** Enable Tor exit node detection */
    enableTorDetection: boolean;

    /** Tor exit node list update interval (seconds) */
    torListUpdateIntervalSeconds: number;

    /** Enable ASN-based heuristics */
    enableASNHeuristics: boolean;

    /** Enable burst/behavior analysis */
    enableBehaviorAnalysis: boolean;
}
