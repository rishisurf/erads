# Setup & Installation Guide

This guide provides step-by-step instructions for deploying and configuring ERADS.

## Prerequisites

- [Bun](https://bun.sh) (v1.0.0 or later)
- SQLite (included with Bun)

## 1. Backend Configuration

Navigate to the `backend` directory and install dependencies:

```bash
cd backend
bun install
```

### Environment Variables

Prepare your environment by copying the example file:

```bash
cp .env.example .env
```

The `.env` file contains:

```env
PORT=3001
HOST=0.0.0.0
NODE_ENV=production

# Security - IMPORTANT
ADMIN_SECRET=your_secure_random_secret_here

# Database
DATABASE_PATH=./data/rate_limiter.db

# Defaults
RATE_LIMIT_DEFAULT=100
RATE_LIMIT_WINDOW_SECONDS=60
ABUSE_BURST_THRESHOLD=50
```

### Initialize Database

```bash
bun run db:migrate
```

### Start Production Server

```bash
bun run start
```

## 2. Frontend Configuration

Navigate to the `frontend` directory and install dependencies:

```bash
cd frontend
bun install
```

### Environment Variables

Prepare your environment by copying the example file:

```bash
cp .env.example .env
```

The `.env` file should include:

```env
VITE_API_BASE_URL=http://your-backend-domain:3001/v1
```

### Build & Serve

```bash
# Build for production
bun run build

# Preview locally
bun run preview
```

## 3. Deployment Considerations

### Reverse Proxy (Recommended)
It is highly recommended to run the backend behind a reverse proxy like Nginx or Cloudflare. This ensures:
1. SSL/TLS termination.
2. Proper `X-Forwarded-For` headers so the backend can identify the actual user IP.

### Persistent Storage
Ensure the `data/` directory in the backend is persisted across deployments, as it contains your SQLite database.
