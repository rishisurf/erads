# Edge-Inspired Rate Limiting & Abuse Detection Service

A production-grade, edge-style rate limiting and abuse detection service built with **Bun**, **Hono**, and **SQLite**.

## Features

- ✅ **IP-based rate limiting** - Limit requests by client IP address
- ✅ **API key-based rate limiting** - Tiered limits per API key
- ✅ **Fixed and sliding window algorithms** - Choose accuracy vs performance
- ✅ **Burst detection** - Automatic detection of traffic spikes
- ✅ **Automatic temporary bans** - TTL-based bans for abuse
- ✅ **Geo-blocking** - Optional country-based blocking
- ✅ **Comprehensive statistics** - Analytics and metrics
- ✅ **Middleware-first design** - Reusable in other Bun/Hono apps

## Quick Start

```bash
# Install dependencies
bun install

# Run database migrations
bun run db:migrate

# (Optional) Seed with test data
bun run db:seed

# Start the server
bun run dev
```

The server starts at `http://localhost:3000`.

## Project Structure

```
backend/
├── src/
│   ├── config/
│   │   └── env.ts           # Environment configuration
│   ├── db/
│   │   ├── connection.ts    # SQLite connection manager
│   │   ├── schema.ts        # Database schema definitions
│   │   ├── migrate.ts       # Migration script
│   │   └── seed.ts          # Seed script for testing
│   ├── middleware/
│   │   ├── rateLimit.ts     # Rate limiting middleware
│   │   └── errorHandler.ts  # Error handling middleware
│   ├── repositories/
│   │   ├── apiKeys.ts       # API keys data access
│   │   ├── rateLimits.ts    # Rate limit tracking
│   │   ├── bans.ts          # Ban management
│   │   └── requestLogs.ts   # Request logging & analytics
│   ├── routes/
│   │   ├── check.ts         # POST /v1/check
│   │   ├── keys.ts          # API key management
│   │   ├── stats.ts         # Statistics endpoints
│   │   └── bans.ts          # Ban management endpoints
│   ├── services/
│   │   ├── rateLimiter.ts   # Core rate limiting logic
│   │   ├── apiKeys.ts       # API key business logic
│   │   └── stats.ts         # Statistics service
│   ├── types/
│   │   └── index.ts         # TypeScript type definitions
│   ├── utils/
│   │   └── logger.ts        # Structured logging
│   └── index.ts             # Application entry point
├── data/                    # SQLite database directory
├── .env.example             # Environment template
└── package.json
```

## API Endpoints

### Check Rate Limit

```http
POST /v1/check
Content-Type: application/json

{
  "ip": "203.0.113.42",           // Optional: Client IP
  "apiKey": "rl_xxx...",          // Optional: API key
  "metadata": {                    // Optional: Request metadata
    "country": "US",
    "path": "/api/users",
    "method": "POST",
    "userAgent": "Mozilla/5.0..."
  }
}
```

**Response:**
```json
{
  "allowed": true,
  "reason": "ok",
  "remaining": 95,
  "resetAt": 1705680000,
  "limit": 100
}
```

Possible `reason` values:
- `ok` - Request allowed
- `rate_limited` - Rate limit exceeded
- `banned` - Identifier is banned
- `geo_blocked` - Country is blocked
- `invalid_key` - API key not found
- `expired_key` - API key has expired

### Create API Key

```http
POST /v1/keys
Content-Type: application/json

{
  "name": "Production API",
  "rateLimit": 1000,
  "windowSeconds": 60,
  "expiresAt": "2025-12-31T23:59:59Z",
  "metadata": { "tier": "enterprise" }
}
```

**Response:**
```json
{
  "id": "abc123",
  "key": "rl_xyz...",  // ⚠️ SAVE THIS - Only shown once!
  "name": "Production API",
  "rateLimit": 1000,
  "windowSeconds": 60,
  "expiresAt": "2025-12-31T23:59:59Z",
  "createdAt": "2024-01-19T12:00:00Z"
}
```

### Rotate API Key

```http
POST /v1/keys/:id/rotate
```

### Get Statistics

```http
GET /v1/stats?startDate=2024-01-01&endDate=2024-01-19&limit=10
```

**Response:**
```json
{
  "period": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-19T23:59:59Z"
  },
  "requests": {
    "total": 15420,
    "allowed": 14980,
    "blocked": 440,
    "byReason": {
      "ok": 14980,
      "rate_limited": 400,
      "banned": 40
    }
  },
  "topIdentifiers": [...],
  "topPaths": [...],
  "activeBans": 5,
  "activeApiKeys": 12
}
```

### Create Ban

```http
POST /v1/bans
Content-Type: application/json

{
  "identifier": "203.0.113.42",
  "identifierType": "ip",
  "reason": "Abusive behavior",
  "durationSeconds": 86400  // null for permanent
}
```

### Health Check

```http
GET /v1/stats/health
```

## How Rate Limiting Works

### Fixed Window Algorithm

Time is divided into fixed windows (e.g., 00:00-01:00, 01:00-02:00). Each window has its own counter.

**Pros:** Simple, memory efficient  
**Cons:** Can allow 2x traffic at window boundaries

```
Window 1          Window 2
[----100 req----][----100 req----]
              ↑  ↑
              200 requests here possible!
```

### Sliding Window Algorithm (Default)

Uses weighted average of current and previous windows to prevent boundary bursts.

```
Formula: effective_count = (prev_count × overlap) + current_count
```

**Pros:** Smoother limiting, no boundary bursts  
**Cons:** Slightly more computation

## Abuse Detection

### Burst Detection

The service monitors for sudden traffic spikes:

1. **Absolute threshold**: If requests in burst window exceed `ABUSE_BURST_THRESHOLD`, auto-ban is triggered
2. **Baseline comparison**: If current rate > baseline × `ABUSE_BURST_MULTIPLIER`, auto-ban is triggered

### Automatic Bans

When abuse is detected, a temporary ban is created with configurable TTL. Bans are checked before rate limits for efficiency.

## Database Schema

### api_keys
Stores API keys (hashed) with per-key rate limit configurations.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT | Unique identifier |
| key_hash | TEXT | SHA-256 hash of API key |
| name | TEXT | Human-readable name |
| rate_limit | INTEGER | Requests per window |
| window_seconds | INTEGER | Window duration |
| is_active | INTEGER | 0=disabled, 1=active |
| expires_at | TEXT | Expiry date (null=never) |
| metadata | TEXT | JSON custom data |

### rate_limits
Tracks current window counters for rate limiting.

| Column | Type | Description |
|--------|------|-------------|
| identifier | TEXT | IP or API key ID |
| identifier_type | TEXT | 'ip' or 'api_key' |
| window_start | TEXT | Window start timestamp |
| request_count | INTEGER | Requests in window |

### bans
Stores temporary and permanent bans.

| Column | Type | Description |
|--------|------|-------------|
| identifier | TEXT | IP or API key ID |
| identifier_type | TEXT | 'ip' or 'api_key' |
| reason | TEXT | Human-readable reason |
| expires_at | TEXT | Expiry (null=permanent) |
| created_by | TEXT | 'system' or admin ID |

### request_logs
Time-series log for analytics and abuse detection baseline.

| Column | Type | Description |
|--------|------|-------------|
| identifier | TEXT | IP or API key ID |
| path | TEXT | Request path |
| method | TEXT | HTTP method |
| allowed | INTEGER | 0=blocked, 1=allowed |
| reason | TEXT | Check result reason |
| country | TEXT | ISO country code |
| timestamp | TEXT | Request timestamp |

## Using as Middleware

The rate limiting middleware can be used in other Bun/Hono applications:

```typescript
import { Hono } from 'hono';
import { rateLimitMiddleware } from './middleware/rateLimit';

const app = new Hono();

// Apply to all API routes
app.use('/api/*', rateLimitMiddleware({
  apiKeyHeader: 'x-api-key',
  skipPaths: ['/api/health'],
  includeGeo: true,
}));

// Your routes
app.get('/api/users', (c) => {
  // Rate limited automatically
  return c.json({ users: [] });
});
```

## Consuming from a React Frontend

This service is designed to be consumed by a separate frontend. Here's how to integrate:

### 1. Create a Rate Limiter Client

```typescript
// lib/rateLimiter.ts
const API_URL = process.env.REACT_APP_RATE_LIMITER_URL || 'http://localhost:3000';

interface CheckResult {
  allowed: boolean;
  reason: string;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

export async function checkRateLimit(apiKey?: string): Promise<CheckResult> {
  const response = await fetch(`${API_URL}/v1/check`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      apiKey,
      metadata: {
        path: window.location.pathname,
        userAgent: navigator.userAgent,
      },
    }),
  });

  return response.json();
}
```

### 2. Use in Components

```tsx
// hooks/useRateLimitedFetch.ts
import { useState } from 'react';
import { checkRateLimit } from '../lib/rateLimiter';

export function useRateLimitedFetch() {
  const [rateLimited, setRateLimited] = useState(false);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);

  const fetchWithLimit = async (url: string, options?: RequestInit) => {
    // Check rate limit first
    const check = await checkRateLimit(localStorage.getItem('apiKey') || undefined);
    
    if (!check.allowed) {
      setRateLimited(true);
      setRetryAfter(check.retryAfter || null);
      throw new Error(`Rate limited: ${check.reason}`);
    }

    // Proceed with actual request
    return fetch(url, options);
  };

  return { fetchWithLimit, rateLimited, retryAfter };
}
```

### 3. Handle Rate Limit Responses

```tsx
function MyComponent() {
  const { fetchWithLimit, rateLimited, retryAfter } = useRateLimitedFetch();

  if (rateLimited) {
    return (
      <div className="error">
        Too many requests. Please try again in {retryAfter} seconds.
      </div>
    );
  }

  // Normal component render
}
```

## Environment Variables

See `.env.example` for all available configuration options.

## Production Considerations

1. **Database**: For high-traffic production, consider using a proper database with replication
2. **CORS**: Update the allowed origins in `src/index.ts`
3. **Cleanup jobs**: Set up cron jobs to run cleanup queries for old logs/windows
4. **Monitoring**: Export metrics to your monitoring system
5. **Clustering**: For horizontal scaling, consider Redis for shared rate limit state

## License

MIT
