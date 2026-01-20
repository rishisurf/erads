/**
 * IP Intelligence Database Schema
 * 
 * Defines all tables required for the IP reputation and classification system.
 * 
 * Architecture Decisions:
 * 
 * 1. ip_reputation table:
 *    - Primary cache for IP classification results
 *    - TTL-based expiry for automatic cache invalidation
 *    - Stores all classification flags for fast retrieval
 * 
 * 2. asn_cache table:
 *    - Caches ASN lookups to avoid repeated WHOIS queries
 *    - Pre-tagged hosting/VPN ASNs for fast classification
 * 
 * 3. tor_nodes table:
 *    - Maintains list of known Tor exit nodes
 *    - Updated periodically from Tor Project's exit list
 * 
 * 4. manual_blocks table:
 *    - Admin-defined IP and ASN blocks
 *    - Highest priority in detection pipeline
 * 
 * 5. provider_cache table:
 *    - Caches raw responses from external providers
 *    - Reduces API calls and costs
 * 
 * 6. ip_intel_stats table:
 *    - Aggregated metrics for monitoring
 */

export const IP_INTEL_SCHEMA = `
-- ============================================================================
-- IP Reputation Table
-- ============================================================================
-- Primary cache for IP classification results.
-- Each IP has a single active record; old records are replaced on refresh.
CREATE TABLE IF NOT EXISTS ip_reputation (
  ip TEXT PRIMARY KEY,
  is_proxy INTEGER NOT NULL DEFAULT 0,
  is_vpn INTEGER NOT NULL DEFAULT 0,
  is_tor INTEGER NOT NULL DEFAULT 0,
  is_hosting INTEGER NOT NULL DEFAULT 0,
  is_residential INTEGER NOT NULL DEFAULT 0,
  confidence INTEGER NOT NULL DEFAULT 0,      -- 0-100
  reason TEXT NOT NULL DEFAULT 'unknown',
  source TEXT NOT NULL DEFAULT 'unknown',     -- cache, heuristic, provider, manual, tor_list
  asn INTEGER,
  asn_org TEXT,
  country_code TEXT,                          -- ISO 3166-1 alpha-2
  checked_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Index for cache expiry cleanup
CREATE INDEX IF NOT EXISTS idx_ip_reputation_expires ON ip_reputation(expires_at);
-- Index for statistics queries
CREATE INDEX IF NOT EXISTS idx_ip_reputation_source ON ip_reputation(source);

-- ============================================================================
-- ASN Cache Table  
-- ============================================================================
-- Caches ASN information with known hosting/VPN flags.
-- ASN data changes infrequently, so we use longer TTLs.
CREATE TABLE IF NOT EXISTS asn_cache (
  asn INTEGER PRIMARY KEY,
  org_name TEXT NOT NULL,
  is_hosting INTEGER NOT NULL DEFAULT 0,      -- Known datacenter/hosting
  is_vpn INTEGER NOT NULL DEFAULT 0,          -- Known VPN provider
  country_code TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_asn_cache_expires ON asn_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_asn_cache_hosting ON asn_cache(is_hosting);

-- ============================================================================
-- Tor Exit Nodes Table
-- ============================================================================
-- List of known Tor exit nodes, updated periodically.
-- Used for instant Tor detection without external lookups.
CREATE TABLE IF NOT EXISTS tor_nodes (
  ip TEXT PRIMARY KEY,
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_exit INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tor_nodes_exit ON tor_nodes(is_exit);

-- ============================================================================
-- Manual Blocks Table
-- ============================================================================
-- Admin-defined IP and ASN blocks.
-- Takes highest priority in the detection pipeline.
CREATE TABLE IF NOT EXISTS ip_intel_blocks (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,                   -- IP address or ASN number
  identifier_type TEXT NOT NULL,              -- 'ip' or 'asn'
  reason TEXT NOT NULL,
  blocked_by TEXT NOT NULL DEFAULT 'admin',
  blocked_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT,                            -- NULL = permanent
  UNIQUE(identifier, identifier_type)
);

CREATE INDEX IF NOT EXISTS idx_ip_intel_blocks_lookup 
  ON ip_intel_blocks(identifier, identifier_type);
CREATE INDEX IF NOT EXISTS idx_ip_intel_blocks_expires ON ip_intel_blocks(expires_at);

-- ============================================================================
-- Provider Cache Table
-- ============================================================================
-- Caches raw responses from external IP intelligence providers.
-- Reduces API calls and associated costs.
CREATE TABLE IF NOT EXISTS provider_cache (
  ip TEXT NOT NULL,
  provider TEXT NOT NULL,
  response TEXT NOT NULL,                     -- JSON-encoded response
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (ip, provider)
);

CREATE INDEX IF NOT EXISTS idx_provider_cache_expires ON provider_cache(expires_at);

-- ============================================================================
-- IP Intelligence Statistics Table
-- ============================================================================
-- Aggregated daily statistics for monitoring and dashboards.
CREATE TABLE IF NOT EXISTS ip_intel_stats (
  date TEXT NOT NULL,                         -- YYYY-MM-DD
  stat_type TEXT NOT NULL,                    -- 'check', 'cache_hit', 'proxy', etc.
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, stat_type)
);

-- ============================================================================
-- Known Hosting ASNs Seed Data
-- ============================================================================
-- Pre-populate with well-known hosting/datacenter ASNs.
-- This improves detection accuracy without external lookups.
INSERT OR IGNORE INTO asn_cache (asn, org_name, is_hosting, is_vpn, expires_at) VALUES
  -- Major cloud providers
  (16509, 'Amazon AWS', 1, 0, datetime('now', '+365 days')),
  (14618, 'Amazon AWS', 1, 0, datetime('now', '+365 days')),
  (15169, 'Google Cloud', 1, 0, datetime('now', '+365 days')),
  (396982, 'Google Cloud', 1, 0, datetime('now', '+365 days')),
  (8075, 'Microsoft Azure', 1, 0, datetime('now', '+365 days')),
  (13335, 'Cloudflare', 1, 0, datetime('now', '+365 days')),
  (20940, 'Akamai', 1, 0, datetime('now', '+365 days')),
  (16276, 'OVH', 1, 0, datetime('now', '+365 days')),
  (24940, 'Hetzner', 1, 0, datetime('now', '+365 days')),
  (14061, 'DigitalOcean', 1, 0, datetime('now', '+365 days')),
  (63949, 'Linode', 1, 0, datetime('now', '+365 days')),
  (20473, 'Vultr', 1, 0, datetime('now', '+365 days')),
  (46844, 'Alibaba Cloud', 1, 0, datetime('now', '+365 days')),
  (45102, 'Alibaba Cloud', 1, 0, datetime('now', '+365 days')),
  (16591, 'Google Fiber', 0, 0, datetime('now', '+365 days')),
  -- Known VPN providers
  (9009, 'M247 (VPN hosting)', 1, 1, datetime('now', '+365 days')),
  (212238, 'Datacamp Limited (VPN)', 1, 1, datetime('now', '+365 days')),
  (60068, 'Datacamp Limited (VPN)', 1, 1, datetime('now', '+365 days')),
  (136787, 'TEFINCOM (NordVPN)', 0, 1, datetime('now', '+365 days')),
  (9002, 'RETN (VPN transit)', 1, 1, datetime('now', '+365 days')),
  (206092, 'VPNTRANET (VPN)', 0, 1, datetime('now', '+365 days')),
  (25369, 'Hydra Communications (VPN)', 0, 1, datetime('now', '+365 days'))
;

-- ============================================================================
-- IP Intelligence Settings
-- ============================================================================
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('ip_intel_cache_ttl_seconds', '3600'),
  ('ip_intel_asn_cache_ttl_seconds', '86400'),
  ('ip_intel_confidence_threshold', '70'),
  ('ip_intel_tor_detection_enabled', 'true'),
  ('ip_intel_asn_heuristics_enabled', 'true'),
  ('ip_intel_behavior_analysis_enabled', 'true')
;
`;

/**
 * Cleanup queries for IP intelligence tables
 */
export const IP_INTEL_CLEANUP_QUERIES = {
    // Remove expired IP reputation cache entries
    deleteExpiredReputations: `
    DELETE FROM ip_reputation 
    WHERE expires_at < datetime('now')
  `,

    // Remove expired ASN cache entries
    deleteExpiredASNCache: `
    DELETE FROM asn_cache 
    WHERE expires_at < datetime('now')
  `,

    // Remove expired provider cache entries
    deleteExpiredProviderCache: `
    DELETE FROM provider_cache 
    WHERE expires_at < datetime('now')
  `,

    // Remove expired manual blocks
    deleteExpiredBlocks: `
    DELETE FROM ip_intel_blocks 
    WHERE expires_at IS NOT NULL 
    AND expires_at < datetime('now')
  `,

    // Remove old statistics (keep 90 days)
    deleteOldStats: `
    DELETE FROM ip_intel_stats 
    WHERE date < date('now', '-90 days')
  `,
};
