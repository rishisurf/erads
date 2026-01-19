/**
 * Database Schema Definitions
 * 
 * This file contains the SQL schema for all tables.
 * 
 * Architecture Decisions:
 * 
 * 1. api_keys table:
 *    - Stores API key hashes (never plain text) for security
 *    - Supports per-key rate limits for tiered API access
 *    - Metadata JSON field for extensibility
 * 
 * 2. request_logs table:
 *    - Time-series data for analytics and abuse detection
 *    - Indexed on timestamp and identifier for fast queries
 *    - Stores minimal data to keep size manageable
 * 
 * 3. rate_limits table:
 *    - Tracks current window counters for rate limiting
 *    - Uses composite index on (identifier, identifier_type, window_start)
 *    - Designed for both fixed and sliding window algorithms
 * 
 * 4. bans table:
 *    - Stores temporary and permanent bans
 *    - expires_at = NULL means permanent ban
 *    - Indexed for fast lookup during request checks
 */

export const SCHEMA = `
-- ============================================================================
-- API Keys Table
-- ============================================================================
-- Stores registered API keys with their rate limit configurations.
-- Keys are hashed for security - the plain text key is only shown once at creation.
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL UNIQUE,        -- SHA-256 hash of the API key
  name TEXT NOT NULL,                    -- Human-readable identifier
  rate_limit INTEGER NOT NULL DEFAULT 1000,  -- Requests per window
  window_seconds INTEGER NOT NULL DEFAULT 60, -- Rate limit window in seconds
  is_active INTEGER NOT NULL DEFAULT 1,  -- 0 = disabled, 1 = active
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT,                       -- NULL = never expires
  last_used_at TEXT,                     -- Track last usage for cleanup
  metadata TEXT NOT NULL DEFAULT '{}'    -- JSON field for extensibility
);

-- Index for fast key lookups (primary auth path)
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
-- Index for listing active keys
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active);

-- ============================================================================
-- Request Logs Table
-- ============================================================================
-- Time-series log of all rate limit checks.
-- Used for analytics, abuse detection baseline, and debugging.
-- Consider partitioning or archiving old data in production.
CREATE TABLE IF NOT EXISTS request_logs (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,              -- IP address or API key ID
  identifier_type TEXT NOT NULL,         -- 'ip' or 'api_key'
  path TEXT NOT NULL DEFAULT '/',        -- Request path
  method TEXT NOT NULL DEFAULT 'GET',    -- HTTP method
  allowed INTEGER NOT NULL,              -- 0 = blocked, 1 = allowed
  reason TEXT NOT NULL,                  -- 'ok', 'rate_limited', 'banned', etc.
  country TEXT,                          -- ISO country code (from request metadata)
  city TEXT,                             -- City name
  user_agent TEXT,                       -- Client user agent
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Composite index for time-range queries per identifier (abuse detection)
CREATE INDEX IF NOT EXISTS idx_request_logs_identifier_time 
  ON request_logs(identifier, identifier_type, timestamp);
-- Index for time-range analytics queries
CREATE INDEX IF NOT EXISTS idx_request_logs_timestamp ON request_logs(timestamp);
-- Index for blocked request analysis
CREATE INDEX IF NOT EXISTS idx_request_logs_reason ON request_logs(reason, timestamp);

-- ============================================================================
-- Rate Limits Table
-- ============================================================================
-- Tracks current request counts per window.
-- This is the hot path for rate limiting - optimized for fast reads/writes.
-- Old windows are cleaned up periodically.
CREATE TABLE IF NOT EXISTS rate_limits (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,              -- IP or API key ID
  identifier_type TEXT NOT NULL,         -- 'ip' or 'api_key'
  window_start TEXT NOT NULL,            -- Start of the current window (ISO datetime)
  request_count INTEGER NOT NULL DEFAULT 0,
  last_request_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- Unique constraint ensures one row per identifier per window
  UNIQUE(identifier, identifier_type, window_start)
);

-- Primary lookup index for rate limit checks
CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup 
  ON rate_limits(identifier, identifier_type, window_start);

-- ============================================================================
-- Bans Table
-- ============================================================================
-- Tracks temporary and permanent bans.
-- Bans can be applied to IPs or API keys.
CREATE TABLE IF NOT EXISTS bans (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,              -- IP or API key ID
  identifier_type TEXT NOT NULL,         -- 'ip' or 'api_key'
  reason TEXT NOT NULL,                  -- Human-readable reason
  banned_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT,                       -- NULL = permanent ban
  created_by TEXT NOT NULL DEFAULT 'system', -- 'system' for auto-bans
  -- Can have multiple ban records (history), but only one active
  UNIQUE(identifier, identifier_type, expires_at)
);

-- Index for active ban lookups (most common query)
CREATE INDEX IF NOT EXISTS idx_bans_active 
  ON bans(identifier, identifier_type, expires_at);
-- Index for finding expired bans to clean up
CREATE INDEX IF NOT EXISTS idx_bans_expiry ON bans(expires_at);
`;

/**
 * Cleanup queries for maintenance jobs
 */
export const CLEANUP_QUERIES = {
    // Remove request logs older than 30 days
    deleteOldLogs: `
    DELETE FROM request_logs 
    WHERE timestamp < datetime('now', '-30 days')
  `,

    // Remove expired rate limit windows
    deleteExpiredWindows: `
    DELETE FROM rate_limits 
    WHERE window_start < datetime('now', '-1 hour')
  `,

    // Remove expired bans (keep for history, mark as inactive)
    deleteExpiredBans: `
    DELETE FROM bans 
    WHERE expires_at IS NOT NULL 
    AND expires_at < datetime('now')
  `,
};
