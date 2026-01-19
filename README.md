# Edge Rate-Limiting & Abuse Detection Service (ERADS)

A production-grade, centralized security service designed to protect APIs from abuse, manage traffic quotas, and secure sensitive endpoints.

![System Status](https://img.shields.io/badge/status-operational-green) ![License](https://img.shields.io/badge/license-MIT-blue)

## ⚡ Use Cases (Why use this?)

1.  **💰 Protect Expensive AI Routes**
    *   Prevent users from spamming your OpenAI/LLM endpoints and draining your credits.
    *   *Example*: Limit free users to 5 requests/minute on expensive generation routes.

2.  **🔐 SaaS API Monetization**
    *   Enforce tiered access limits for your customers.
    *   *Example*: **Free Tier** (100 req/hour) vs **Pro Tier** (10,000 req/hour) managed via API Keys.

3.  **🛡️ Brute-Force & DDoS Protection**
    *   Automatically detect and ban IPs that exhibit aggressive behavior (bursts).
    *   *Example*: Instantly ban an IP for 1 hour if it hits `/login` 20 times in 10 seconds.

4.  **🌍 Centralized Traffic Control**
    *   Manage limits for multiple microservices from a single dashboard.
    *   Stop abuse at the "edge" before it loads your primary database.

---

## Overview

This project consists of two main components:
1.  **Backend**: A high-performance API built with **Bun + Hono + SQLite**. It handles high-speed logic: rate limiting, abuse detection, and token buckets.
2.  **Frontend**: A strict minimalist/brutalist admin dashboard built with **Vite + React**. It provides full visibility into traffic patterns and control over bans and keys.

## Project Structure

```
erads/
├── backend/            # The "Brain" (API)
│   ├── src/
│   │   ├── services/   # Burst detection & limiting logic
│   │   ├── routes/     # Checks, Keys, and Stats endpoints
│   │   └── db/         # SQLite storage (WAL mode enabled)
│   └── data/           # Local database file
│
└── frontend/           # The "Control Center" (Dashboard)
    ├── src/
    │   ├── pages/      # Analytics, Key Management, Live Monitoring
    │   └── components/ # Reusable brutalist UI elements
```

## Quick Start

### 1. Start the Backend (Port 3001)

```bash
cd backend
bun install
bun run db:migrate  # Create database tables
bun run dev         # Start API server
```

### 2. Start the Dashboard (Port 5173)

```bash
cd frontend
bun install
bun run dev         # Start Admin UI
```

### 3. Usage

**Check a Request (in your app code):**

```bash
curl -X POST http://localhost:3001/v1/check \
  -H "Content-Type: application/json" \
  -d '{"ip": "1.2.3.4", "apiKey": "optional_key"}'
```

**Response:**
```json
{
  "allowed": true,
  "remaining": 99,
  "resetAt": 1705680000
}
```

## Features

### Backend API
- **High Performance**: Built on Bun for sub-millisecond overhead.
- **Smart Algorithms**: Supports both *Fixed Window* and *Sliding Window* limiting.
- **Abuse Detection**: "Trap" logic that detects machine-speed bursts and auto-bans.
- **Geo-Blocking**: Optional checking of country codes (requires upstream proxy headers).

### Admin Dashboard (Brutalist UI)
- **Live Analytics**: Monitor blocked vs allowed requests in real-time.
- **Key Registry**: Create specific API keys with custom quota limits.
- **Ban Manager**: View auto-banned IPs and manually lift or impose bans.
- **Traffic Viz**: Visual breakdown of block reasons (Rate Limit vs Abuse vs Manual Ban).

## Tech Stack
- **Runtime**: Bun
- **Framework**: Hono (Backend), React (Frontend)
- **Database**: SQLite
- **Styling**: TailwindCSS v4 (Brutalist Theme)

## License
MIT
