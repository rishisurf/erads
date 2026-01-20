# IP Intelligence Module

Proxy, VPN, and Hosting IP Detection Service for the ERADS rate-limiting system.

## Overview

This module classifies IP addresses to detect:
- **Residential** - Normal consumer ISP connections
- **Proxy** - HTTP/SOCKS proxies
- **VPN** - Commercial VPN providers
- **Tor** - Tor exit nodes
- **Hosting** - Datacenter/cloud provider IPs

## Detection Strategy

The module uses a **layered detection approach**, processing each layer in order until a high-confidence result is found:

### Layer 1: Cache
- Cached classifications are returned immediately
- Default TTL: 1 hour
- Reduces external API calls and improves latency

### Layer 2: Manual Blocks
- Admin-defined IP and ASN blocks take highest priority
- Supports temporary and permanent blocks
- Ideal for known bad actors

### Layer 3: Tor Exit Nodes
- Maintains local list from Tor Project
- Updated hourly from `check.torproject.org/torbulkexitlist`
- 100% confidence for known exit nodes

### Layer 4: ASN Heuristics  
- Pre-populated database of known hosting/VPN ASNs
- Includes: AWS, GCP, Azure, Cloudflare, DigitalOcean, Vultr, Hetzner, OVH
- VPN providers: NordVPN, M247, Datacamp, etc.
- No external API needed, instant classification

### Layer 5: External Providers
- Query configured IP intelligence APIs
- Providers are optional and swappable
- Currently supported:
  - **IP-API** (free tier, no key required)
  - **IPInfo** (requires API token)
  - **AbuseIPDB** (requires API key)

### Layer 6: Fallback
- Returns "unknown" with low confidence if no data available

## Confidence Scoring

| Score | Level | Description |
|-------|-------|-------------|
| 90-100 | High | Multiple sources agree, or from authoritative list (Tor) |
| 70-89 | Medium | Single reliable source or known ASN match |
| 50-69 | Low | Heuristics only, may have false positives |
| 0-49 | Very Low | Guesses, insufficient data |

The `confidenceThreshold` setting (default: 70) determines when to trust a classification for blocking decisions.

## API Endpoints

### POST /v1/ip/check
Check IP classification.

**Request:**
```json
{
  "ip": "1.2.3.4",
  "bypassCache": false
}
```

**Response:**
```json
{
  "ip": "1.2.3.4",
  "isProxy": false,
  "isVPN": false,
  "isTor": false,
  "isHosting": true,
  "confidence": 85,
  "reason": "ASN 16509 (Amazon AWS) is a known hosting provider",
  "source": "heuristic",
  "asn": 16509,
  "asnOrg": "Amazon.com, Inc.",
  "countryCode": "US"
}
```

### POST /v1/ip/block
Manually block an IP or ASN.

**Request:**
```json
{
  "identifier": "1.2.3.4",
  "type": "ip",
  "reason": "Suspicious activity",
  "durationSeconds": 3600
}
```

### DELETE /v1/ip/block?identifier=1.2.3.4&type=ip
Remove a manual block.

### GET /v1/ip/blocks
List all active manual blocks.

### GET /v1/ip/stats
Get aggregated detection statistics.

## Integration with Rate Limiter

### Option 1: Middleware (Recommended)

Block suspicious traffic before it hits your routes:

```typescript
import { ipIntelMiddleware, ipIntelPresets } from './ip-intel';

// Block VPN and Tor traffic
app.use('/api/*', ipIntelMiddleware({ 
  blockVPN: true, 
  blockTor: true,
  confidenceThreshold: 80,
}));

// Or use presets
app.use('/api/*', ipIntelPresets.blockAnonymizers());
app.use('/sensitive/*', ipIntelPresets.residentialOnly());
```

### Option 2: Check Endpoint

Call the `/v1/ip/check` endpoint from your rate limiter:

```typescript
// In your rate limit middleware
const response = await fetch('http://localhost:3001/v1/ip/check', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ip: clientIP }),
});

const classification = await response.json();

if (classification.isVPN || classification.isTor) {
  // Apply stricter rate limits or block
}
```

### Option 3: Direct Engine Access

For same-process integration:

```typescript
import { classifyIP, initIPIntel } from './ip-intel';

// Initialize once at startup
await initIPIntel();

// Classify IPs directly
const result = await classifyIP('1.2.3.4');

if (result.isHosting && result.confidence > 70) {
  // This is likely a bot or scraper
}
```

## Configuration

Add these to your `.env` file:

```env
# Cache TTLs
IP_INTEL_CACHE_TTL_SECONDS=3600
IP_INTEL_ASN_CACHE_TTL_SECONDS=86400
IP_INTEL_PROVIDER_CACHE_TTL_SECONDS=21600

# Detection settings
IP_INTEL_CONFIDENCE_THRESHOLD=70
IP_INTEL_TOR_DETECTION_ENABLED=true
IP_INTEL_ASN_HEURISTICS_ENABLED=true
IP_INTEL_BEHAVIOR_ANALYSIS_ENABLED=true

# External providers (all optional)
IPINFO_TOKEN=           # IPInfo.io API token
IP_API_KEY=             # IP-API.com Pro key (free tier works without)
ABUSEIPDB_KEY=          # AbuseIPDB API key

# Logging
IP_INTEL_LOG_DECISIONS=true
IP_INTEL_LOG_PROVIDER_CALLS=false
```

## Database Tables

The module creates and manages these tables:

- `ip_reputation` - Cached IP classifications
- `asn_cache` - ASN information with hosting/VPN flags
- `tor_nodes` - Known Tor exit nodes
- `ip_intel_blocks` - Manual IP/ASN blocks
- `provider_cache` - Cached provider API responses
- `ip_intel_stats` - Aggregated metrics

## Performance Characteristics

- **Cache hit:** < 1ms (SQLite lookup)
- **ASN heuristic:** < 5ms (database + free API)
- **Provider query:** 100-500ms (external API call)
- **Tor check:** < 1ms (database lookup)

The layered approach ensures most requests are served from cache or heuristics, minimizing external API calls.

## Extending Providers

To add a new provider, implement the `IIPIntelProvider` interface:

```typescript
import { BaseProvider, ProviderResult } from './providers';

export class MyProvider extends BaseProvider {
  readonly name = 'myprovider';
  readonly priority = 7;
  
  isEnabled(): boolean {
    return !!process.env.MY_PROVIDER_KEY;
  }
  
  protected async doCheck(ip: string): Promise<ProviderResult | null> {
    // Your API call here
    // Normalize response to ProviderResult format
  }
}
```

Then add it to the `getProviders()` function in `providers.ts`.

## License

MIT
