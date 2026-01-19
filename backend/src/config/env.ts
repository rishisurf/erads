/**
 * Environment Configuration
 * 
 * Centralizes all environment variables with type safety and defaults.
 * This follows the 12-factor app methodology for configuration.
 * 
 * Architecture Decision:
 * - All env vars are validated at startup to fail fast
 * - Sensible defaults for development, strict requirements for production
 * - Type-safe access throughout the application
 */

// Helper to get env var with optional default
const getEnv = (key: string, defaultValue?: string): string => {
    const value = process.env[key] ?? defaultValue;
    if (value === undefined) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
};

// Helper to get numeric env var
const getEnvNumber = (key: string, defaultValue: number): number => {
    const value = process.env[key];
    if (value === undefined) return defaultValue;
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
        throw new Error(`Environment variable ${key} must be a number`);
    }
    return parsed;
};

// Helper to get boolean env var
const getEnvBoolean = (key: string, defaultValue: boolean): boolean => {
    const value = process.env[key];
    if (value === undefined) return defaultValue;
    return value.toLowerCase() === 'true' || value === '1';
};

export const config = {
    // Server configuration
    server: {
        port: getEnvNumber('PORT', 3000),
        host: getEnv('HOST', '0.0.0.0'),
        env: getEnv('NODE_ENV', 'development'),
        isProduction: getEnv('NODE_ENV', 'development') === 'production',
    },

    // Database configuration
    db: {
        path: getEnv('DATABASE_PATH', './data/rate_limiter.db'),
    },

    // Rate limiting defaults
    rateLimit: {
        // Default requests per window
        defaultLimit: getEnvNumber('RATE_LIMIT_DEFAULT', 100),
        // Default window in seconds
        defaultWindowSeconds: getEnvNumber('RATE_LIMIT_WINDOW_SECONDS', 60),
        // Use sliding window by default (more accurate but slightly more expensive)
        useSlidingWindow: getEnvBoolean('RATE_LIMIT_SLIDING_WINDOW', true),
    },

    // Abuse detection configuration
    abuse: {
        // Burst detection: max requests in burst window
        burstThreshold: getEnvNumber('ABUSE_BURST_THRESHOLD', 50),
        // Burst window in seconds (short window to detect spikes)
        burstWindowSeconds: getEnvNumber('ABUSE_BURST_WINDOW_SECONDS', 10),
        // Baseline multiplier: if current rate > baseline * multiplier, flag as burst
        burstMultiplier: getEnvNumber('ABUSE_BURST_MULTIPLIER', 5),
        // Default ban duration in seconds (1 hour)
        defaultBanDurationSeconds: getEnvNumber('ABUSE_BAN_DURATION_SECONDS', 3600),
        // Enable geo-blocking
        geoBlockingEnabled: getEnvBoolean('ABUSE_GEO_BLOCKING_ENABLED', false),
        // Comma-separated list of blocked country codes
        blockedCountries: getEnv('ABUSE_BLOCKED_COUNTRIES', '').split(',').filter(Boolean),
    },

    // Logging configuration
    logging: {
        level: getEnv('LOG_LEVEL', 'info'),
        // Whether to log all requests (can be verbose)
        logAllRequests: getEnvBoolean('LOG_ALL_REQUESTS', false),
    },

    // API key configuration
    apiKey: {
        // Length of generated API keys
        keyLength: getEnvNumber('API_KEY_LENGTH', 32),
        // Default rate limit for API keys (can be overridden per-key)
        defaultRateLimit: getEnvNumber('API_KEY_RATE_LIMIT', 1000),
    },
} as const;

export type Config = typeof config;
