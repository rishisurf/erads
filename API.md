# API Documentation

The Edge Rate-Limiting & Abuse Detection Service (ERADS) provides a high-performance REST API. The API is divided into public endpoints for integration and administrative endpoints for management.

## Authentication

Administrative endpoints are protected by an Bearer token. Include your `ADMIN_SECRET` in the `Authorization` header.

```http
Authorization: Bearer YOUR_ADMIN_SECRET
```

## Public Endpoints

### Check Request
`POST /v1/check`

Determines if a request from a specific identifier (IP or API Key) should be allowed based on active bans, geo-blocking, and rate limits.

**Request Body:**
```json
{
  "ip": "1.2.3.4",
  "apiKey": "optional_key_string",
  "metadata": {
    "path": "/api/v1/resource",
    "method": "POST",
    "country": "US",
    "userAgent": "Mozilla/5.0..."
  }
}
```

**Response:**
```json
{
  "allowed": true,
  "reason": "ok",
  "remaining": 99,
  "resetAt": 1705680000,
  "limit": 100
}
```
*Note: `reason` can be `ok`, `rate_limited`, `banned`, `geo_blocked`, `invalid_key`, or `expired_key`.*

### Verify Auth
`POST /v1/auth/verify`

Verifies if the provided admin secret is valid.

**Response:**
```json
{
  "authenticated": true
}
```

---

## Administrative Endpoints (Auth Required)

### Statistics
- `GET /v1/stats`: Returns aggregated traffic statistics, top identifiers, top paths, and hourly timeseries data.
- `GET /v1/stats/health`: Basic system health information.

### API Key Management
- `GET /v1/keys`: List all provisioned API keys.
- `POST /v1/keys`: Create a new API key.
- `POST /v1/keys/:id/rotate`: Generate a new key string for an existing ID.
- `DELETE /v1/keys/:id`: Revoke an API key.

### Ban Management
- `GET /v1/bans`: List all active and past bans.
- `POST /v1/bans`: Manually impose a ban on an IP or API Key ID.
- `DELETE /v1/bans/:id`: Lift a specific ban.

### Settings & Geo-Blocking
- `GET /v1/settings/geo-blocking`: Get status and blocked country list.
- `PUT /v1/settings/geo-blocking`: Enable or disable global geo-blocking.
- `POST /v1/settings/geo-blocking/countries`: Add a country code to the blocklist.
- `DELETE /v1/settings/geo-blocking/countries/:code`: Remove a country from the blocklist.

---

## Error Codes

| Code | Description |
|------|-------------|
| `auth_required` | No Authorization header provided. |
| `invalid_credentials` | The provided admin secret is incorrect. |
| `not_found` | The requested resource does not exist. |
| `validation_error` | The request body is missing required fields or has invalid formats. |
