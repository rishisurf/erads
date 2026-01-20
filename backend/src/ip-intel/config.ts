/**
 * IP Intelligence Configuration
 * 
 * Centralizes all configuration for the IP intelligence module.
 * Uses environment variables with sensible defaults.
 */

// Helper to get env var with optional default
const getEnv = (key: string, defaultValue: string): string => {
    return process.env[key] ?? defaultValue;
};

// Helper to get numeric env var
const getEnvNumber = (key: string, defaultValue: number): number => {
    const value = process.env[key];
    if (value === undefined) return defaultValue;
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) return defaultValue;
    return parsed;
};

// Helper to get boolean env var
const getEnvBoolean = (key: string, defaultValue: boolean): boolean => {
    const value = process.env[key];
    if (value === undefined) return defaultValue;
    return value.toLowerCase() === 'true' || value === '1';
};

export const ipIntelConfig = {
    // Cache configuration
    cache: {
        /** TTL for IP reputation cache entries (default: 1 hour) */
        ipTTLSeconds: getEnvNumber('IP_INTEL_CACHE_TTL_SECONDS', 3600),

        /** TTL for ASN cache entries (default: 24 hours) */
        asnTTLSeconds: getEnvNumber('IP_INTEL_ASN_CACHE_TTL_SECONDS', 86400),

        /** TTL for provider response cache (default: 6 hours) */
        providerTTLSeconds: getEnvNumber('IP_INTEL_PROVIDER_CACHE_TTL_SECONDS', 21600),
    },

    // Detection configuration
    detection: {
        /** Minimum confidence to trust a classification (0-100) */
        confidenceThreshold: getEnvNumber('IP_INTEL_CONFIDENCE_THRESHOLD', 70),

        /** Enable Tor exit node detection */
        torDetectionEnabled: getEnvBoolean('IP_INTEL_TOR_DETECTION_ENABLED', true),

        /** Enable ASN-based hosting/VPN detection */
        asnHeuristicsEnabled: getEnvBoolean('IP_INTEL_ASN_HEURISTICS_ENABLED', true),

        /** Enable behavior-based analysis (burst detection) */
        behaviorAnalysisEnabled: getEnvBoolean('IP_INTEL_BEHAVIOR_ANALYSIS_ENABLED', true),

        /** Burst threshold: requests in short window to flag as suspicious */
        burstThreshold: getEnvNumber('IP_INTEL_BURST_THRESHOLD', 100),

        /** Burst window in seconds */
        burstWindowSeconds: getEnvNumber('IP_INTEL_BURST_WINDOW_SECONDS', 60),
    },

    // Tor list configuration
    tor: {
        /** URL for Tor exit node list */
        exitListUrl: getEnv('IP_INTEL_TOR_LIST_URL', 'https://check.torproject.org/torbulkexitlist'),

        /** Update interval for Tor list (default: 1 hour) */
        updateIntervalSeconds: getEnvNumber('IP_INTEL_TOR_UPDATE_INTERVAL_SECONDS', 3600),

        /** Timeout for Tor list fetch (ms) */
        fetchTimeoutMs: getEnvNumber('IP_INTEL_TOR_FETCH_TIMEOUT_MS', 10000),
    },

    // Provider configuration
    providers: {
        /** IPInfo.io API token (optional) */
        ipinfoToken: getEnv('IPINFO_TOKEN', ''),

        /** IP-API.com Pro key (optional, free tier available) */
        ipApiKey: getEnv('IP_API_KEY', ''),

        /** AbuseIPDB API key (optional) */
        abuseIpDbKey: getEnv('ABUSEIPDB_KEY', ''),

        /** MaxMind Account ID (optional) */
        maxmindAccountId: getEnv('MAXMIND_ACCOUNT_ID', ''),

        /** MaxMind License Key (optional) */
        maxmindLicenseKey: getEnv('MAXMIND_LICENSE_KEY', ''),

        /** Request timeout for provider APIs (ms) */
        requestTimeoutMs: getEnvNumber('IP_INTEL_PROVIDER_TIMEOUT_MS', 5000),
    },

    // Logging
    logging: {
        /** Log all classification decisions */
        logDecisions: getEnvBoolean('IP_INTEL_LOG_DECISIONS', true),

        /** Log provider API calls */
        logProviderCalls: getEnvBoolean('IP_INTEL_LOG_PROVIDER_CALLS', false),
    },
} as const;

export type IPIntelConfig = typeof ipIntelConfig;
