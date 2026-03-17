# 09 — Local Setup Guide

Complete beginner-friendly guide. Follow every step in order.

---

## Prerequisites

Install these first. Click the links for official installers.

| Tool | Why | How to check |
|------|-----|-------------|
| Docker Desktop | Runs all services (MongoDB, Redis, etc.) | `docker --version` |
| Node.js 22 | For running npm commands | `node --version` |
| Git | Clone the repo | `git --version` |
| A code editor | VS Code recommended | — |

Also needed:
- A **Firebase project** with phone authentication enabled
- A **Firebase service account JSON file**

---

## Step 1 — Clone the Repository

```bash
git clone https://github.com/saransh-bairagi/RAJHANS-ECOMMERCE-PROD.git
cd "RAJHANS-ECOMMERCE-PROD"
```

---

## Step 2 — Set Up Environment Variables

```bash
cp backend/.env.example backend/.env
```

Open `backend/.env` and fill in the values:

```env
# Server
NODE_ENV=development
PORT=3000

# MongoDB — leave as-is for Docker
MONGO_URI=mongodb://mongo:27017/rajhans-ecommerce?replicaSet=rs0
MONGO_TEST_URI=mongodb://mongo-test:27017/rajhans-ecommerce-test?replicaSet=rs0

# Redis — leave as-is for Docker
REDIS_HOST=redis
REDIS_PORT=6379

# JWT — CHANGE THESE to long random strings in production
JWT_ACCESS_SECRET=your-super-secret-access-key-min-32-chars
JWT_REFRESH_SECRET=your-super-secret-refresh-key-min-32-chars
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
AUTH_RATE_LIMIT_MAX_REQUESTS=10

# CORS — Angular dev server
CORS_ORIGIN=http://localhost:4201

# Firebase
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_SERVICE_ACCOUNT_PATH=/app/backend/firebase-service-account.json

# Logging
LOG_LEVEL=debug
```

---

## Step 3 — Add Firebase Service Account

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project → Project Settings → Service Accounts
3. Click "Generate new private key" → download JSON file
4. Rename it to `firebase-service-account.json`
5. Place it at: `backend/firebase-service-account.json`

> The `docker-compose.yml` mounts this file into the container automatically.

---

## Step 4 — Start Docker

```bash
docker compose up -d
```

This starts:
- MongoDB (port 27019 on host)
- MongoDB Test instance (port 27020)
- Redis (port 6381)
- Backend API (port 3100)
- Frontend Angular (port 4201)
- Nginx reverse proxy (port 80)
- Mongo Express DB viewer (port 8082)

**Check everything is running:**
```bash
docker compose ps
```

All services should show `Up` or `healthy`.

---

## Step 5 — Verify the Backend

```bash
curl http://localhost:3100/health
```

Expected:
```json
{ "success": true, "data": { "status": "healthy" } }
```

```bash
curl http://localhost:3100/health/ready
```

Expected:
```json
{ "data": { "checks": { "mongodb": "connected", "redis": "connected" } } }
```

---

## Step 6 — Open the App

| URL | What |
|-----|------|
| `http://localhost:4201` | Angular frontend |
| `http://localhost:80` | Nginx (same app, cleaner URL) |
| `http://localhost:3100/api/v1` | Backend API directly |
| `http://localhost:8082` | Mongo Express (DB viewer) |

---

## Step 7 (Optional) — Create an Admin User

```bash
docker exec rajhans-ecom-mongo mongosh \
  "mongodb://localhost:27017/rajhans-ecommerce?replicaSet=rs0" \
  /seeds/seed-admin.js
```

Then login with that phone number on the frontend.

---

## Step 8 (Optional) — Start Monitoring

```bash
docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d
```

| URL | What |
|-----|------|
| `http://localhost:9090` | Prometheus |
| `http://localhost:3001` | Grafana (admin/admin) |

---

## Running Tests Locally

```bash
# Install dependencies
npm ci

# Unit tests only (fast, no DB needed)
npm run test:unit

# Unit tests with coverage report
npm run test:unit -- --coverage

# Integration tests (needs Docker running)
npm run test:integration

# All tests
npm run test:all
```

---

## Common Issues

### "Cannot connect to MongoDB"
- Check Docker is running: `docker compose ps`
- Check MongoDB health: `docker logs rajhans-ecom-mongo`
- Ensure replica set initialized: `docker exec rajhans-ecom-mongo mongosh --eval "rs.status()"`

### "Firebase credentials not configured"
- Check `backend/firebase-service-account.json` exists
- Check `FIREBASE_SERVICE_ACCOUNT_PATH` in `.env` matches the Docker mount path

### "Port already in use"
- Something else is using port 3100, 4201, 27019, etc.
- Change the port in `docker-compose.yml` (left side of `x:y`)

### "ng serve fails"
- Run `cd frontend && npm install` first
- Angular CLI must be available: `npm install -g @angular/cli`

### Hot reload not working
- Backend: nodemon watches `src/` — save any `.ts` file to trigger
- Frontend: Angular CLI watches automatically — check the browser console for errors
