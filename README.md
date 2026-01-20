# ERADS: Edge Rate-Limiting & Abuse Detection Service

ERADS is a high-performance, centralized security layer designed to protect modern web applications from brute-force attacks, API abuse, and excessive traffic. Inspired by edge-computing principles, it provides sub-millisecond decision-making with a focus on simplicity and engineering excellence.

## 🚀 Key Features

- **Multi-Layer Defense**: Combines IP-based limiting, API Key quotas, and behavior-based burst detection.
- **Smart Algorithms**: Supports both Fixed Window and Sliding Window algorithms for precise traffic control.
- **Automated Enforcement**: System-wide automatic temporary bans for IPs exhibiting malicious patterns.
- **Geo-Blocking**: Enforce access control at the country level using database-driven blocklists.
- **Brutalist Admin Dashboard**: A high-contrast, technical interface for real-time monitoring and administrative control.
- **Centralized Management**: Manage security policies for multiple microservices from a single location.

## 🛠 Tech Stack

- **Backend**: Built with [Bun](https://bun.sh) and [Hono](https://hono.dev) for high-concurrency performance.
- **Storage**: Highly optimized [SQLite](https://sqlite.org) with WAL (Write-Ahead Logging) mode.
- **Frontend**: [React](https://reactjs.org), [Vite](https://vitejs.dev), and [Tailwind CSS v4](https://tailwindcss.com) following a strict brutalist design aesthetic.

## 🚀 Quick Start

1. **Clone & Install**:
   ```bash
   git clone https://github.com/your-repo/erads.git
   cd erads
   ```

2. **Backend Setup**:
   ```bash
   cd backend
   cp .env.example .env
   bun install
   bun run db:migrate
   bun run dev
   ```

3. **Frontend Setup**:
   ```bash
   cd ../frontend
   cp .env.example .env
   bun install
   bun run dev
   ```

## 📖 Documentation

- **[Installation & Setup (SETUP.md)](./SETUP.md)**: How to get the service running in development and production.
- **[API Reference (API.md)](./API.md)**: Detailed documentation of all public and administrative endpoints.
- **[Use Cases](./README.md#⚡-use-cases)**: Examples of how to integrate ERADS into your workflow.

## ⚡ Use Cases

### 1. Cost Protection for AI/LLM Gateways
Prevent unexpected expenses by limiting users' access to expensive upstream AI APIs. Issue specific API keys to clients with strictly enforced monthly or per-minute budgets.

### 2. Login Brute-Force Shielding
Protect authenticated routes from credential stuffing. If an IP hits your `/login` endpoint suspiciously fast, ERADS will trigger an automatic 1-hour ban, stopping bots in their tracks.

### 3. SaaS Tenant Isolation
Ensure no single customer can degrade the performance of your system for others. Use API Key-based limiting to enforce different service tiers (e.g., Free, Pro, Enterprise).

### 4. Anti-Scraping
Mitigate automated data harvesting by detecting machine-speed request bursts and imposing temporary blocks on crawlers.

## 🛡 Security

Administrative access to the dashboard and management APIs is secured via a protected `ADMIN_SECRET`. The public-facing `/v1/check` endpoint is designed for high-frequency consumption with minimal overhead.

---

Designed with a focus on performance and minimal abstraction.
MIT Licensed.
