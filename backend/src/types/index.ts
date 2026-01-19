/**
 * Core Type Definitions
 * 
 * Centralizes all TypeScript interfaces and types used throughout the service.
 * This ensures type consistency and makes the API contracts explicit.
 */

// ============================================================================
// API Key Types
// ============================================================================

export interface ApiKey {
    id: string;
    key: string;              // The actual API key (hashed in DB)
    name: string;             // Human-readable name
    rateLimit: number;        // Requests per window
    windowSeconds: number;    // Rate limit window
    isActive: boolean;
    createdAt: Date;
    expiresAt: Date | null;   // null = never expires
    lastUsedAt: Date | null;
    metadata: Record<string, unknown>;  // Custom metadata
}

export interface CreateApiKeyRequest {
    name: string;
    rateLimit?: number;
    windowSeconds?: number;
    expiresAt?: string;       // ISO date string
    metadata?: Record<string, unknown>;
}

export interface CreateApiKeyResponse {
    id: string;
    key: string;              // Plain text key (only shown once!)
    name: string;
    rateLimit: number;
    windowSeconds: number;
    expiresAt: string | null;
    createdAt: string;
}

export interface RotateApiKeyResponse {
    id: string;
    newKey: string;           // New plain text key
    rotatedAt: string;
}

// ============================================================================
// Rate Limit Types
// ============================================================================

export interface RateLimitConfig {
    limit: number;            // Max requests
    windowSeconds: number;    // Time window
    useSlidingWindow: boolean;
}

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;        // Requests remaining in window
    resetAt: number;          // Unix timestamp when window resets
    limit: number;            // Total limit
    windowSeconds: number;
}

// ============================================================================
// Check Request/Response Types
// ============================================================================

export interface CheckRequest {
    // Identifier (at least one required)
    ip?: string;
    apiKey?: string;

    // Optional metadata for geo-blocking and analytics
    metadata?: {
        country?: string;       // ISO country code
        city?: string;
        userAgent?: string;
        path?: string;          // Request path being checked
        method?: string;        // HTTP method
    };
}

export interface CheckResponse {
    allowed: boolean;
    reason: 'ok' | 'rate_limited' | 'banned' | 'geo_blocked' | 'invalid_key' | 'expired_key';
    remaining: number;
    resetAt: number;          // Unix timestamp
    limit?: number;
    retryAfter?: number;      // Seconds until retry (if not allowed)
}

// ============================================================================
// Ban Types
// ============================================================================

export interface Ban {
    id: string;
    identifier: string;       // IP or API key
    identifierType: 'ip' | 'api_key';
    reason: string;
    bannedAt: Date;
    expiresAt: Date | null;   // null = permanent
    createdBy: string;        // 'system' or admin identifier
}

export interface CreateBanRequest {
    identifier: string;
    identifierType: 'ip' | 'api_key';
    reason: string;
    durationSeconds?: number; // null/undefined = permanent
}

// ============================================================================
// Request Log Types
// ============================================================================

export interface RequestLog {
    id: string;
    identifier: string;
    identifierType: 'ip' | 'api_key';
    path: string;
    method: string;
    allowed: boolean;
    reason: string;
    country: string | null;
    city: string | null;
    userAgent: string | null;
    timestamp: Date;
}

// ============================================================================
// Stats Types
// ============================================================================

export interface StatsResponse {
    period: {
        start: string;          // ISO date
        end: string;            // ISO date
    };
    requests: {
        total: number;
        allowed: number;
        blocked: number;
        byReason: Record<string, number>;
    };
    topIdentifiers: Array<{
        identifier: string;
        type: 'ip' | 'api_key';
        count: number;
    }>;
    topPaths: Array<{
        path: string;
        count: number;
    }>;
    timeSeries: Array<{
        time: string;
        requests: number;
    }>;
    activeBans: number;
    activeApiKeys: number;
}

export interface StatsQuery {
    startDate?: string;       // ISO date
    endDate?: string;         // ISO date
    limit?: number;           // For top lists
}

// ============================================================================
// Error Types
// ============================================================================

export interface ApiError {
    error: string;
    code: string;
    details?: unknown;
}

// ============================================================================
// Database Row Types (raw from SQLite)
// ============================================================================

export interface ApiKeyRow {
    id: string;
    key_hash: string;
    name: string;
    rate_limit: number;
    window_seconds: number;
    is_active: number;        // SQLite boolean (0/1)
    created_at: string;
    expires_at: string | null;
    last_used_at: string | null;
    metadata: string;         // JSON string
}

export interface RequestLogRow {
    id: string;
    identifier: string;
    identifier_type: string;
    path: string;
    method: string;
    allowed: number;          // SQLite boolean
    reason: string;
    country: string | null;
    city: string | null;
    user_agent: string | null;
    timestamp: string;
}

export interface BanRow {
    id: string;
    identifier: string;
    identifier_type: string;
    reason: string;
    banned_at: string;
    expires_at: string | null;
    created_by: string;
}

export interface RateLimitRow {
    id: string;
    identifier: string;
    identifier_type: string;
    window_start: string;
    request_count: number;
    last_request_at: string;
}
