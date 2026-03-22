# Production Deployment Guide — RnD Ecommerce

## Architecture for 10k+ Users

```
                    ┌──────────────┐
                    │  CloudFlare  │  ← CDN + DDoS protection + SSL
                    └──────┬───────┘
                           │
                    ┌──────┴───────┐
                    │    Nginx     │  ← Reverse proxy + gzip + static cache
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────┴─────┐ ┌───┴───┐ ┌──────┴──────┐
        │  Backend   │ │ WS    │ │  Frontend   │
        │  (Node.js) │ │(Sock) │ │  (Angular)  │
        │  PM2 x4    │ │       │ │  Static     │
        └─────┬──────┘ └───┬───┘ └─────────────┘
              │            │
        ┌─────┴────────────┴─────┐
        │       Redis (7)        │  ← BullMQ + Cache + Sessions
        └────────────────────────┘
              │
        ┌─────┴────────────────────┐
        │   MongoDB Atlas (M10+)   │  ← Replica Set + Auto-scaling
        └──────────────────────────┘
```

## Pre-deployment Checklist

### 1. Environment Variables
```env
NODE_ENV=production
PORT=3000
MONGO_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/rnd?retryWrites=true
REDIS_HOST=<redis-host>
REDIS_PORT=6379
JWT_ACCESS_SECRET=<strong-random-256bit>
JWT_REFRESH_SECRET=<strong-random-256bit>
RAZORPAY_KEY_ID=rzp_live_xxxxx
RAZORPAY_KEY_SECRET=xxxxx
RAZORPAY_WEBHOOK_SECRET=xxxxx
CORS_ORIGIN=https://yourdomain.com
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=SG.xxxxx
SMTP_FROM=RnD <noreply@rnd.com>
```

### 2. MongoDB Indexes
All indexes are defined in models (auto-created on startup). Verify with:
```
db.products.getIndexes()
db.orders.getIndexes()
db.payments.getIndexes()
```

### 3. Redis Configuration
```
maxmemory 256mb
maxmemory-policy allkeys-lru  → Change to: noeviction (for BullMQ)
```
Or use separate Redis instances: one for BullMQ (noeviction), one for cache (allkeys-lru).

### 4. Node.js Cluster Mode (PM2)
```bash
# ecosystem.config.js
module.exports = {
  apps: [{
    name: 'rnd-api',
    script: 'dist/server.js',
    instances: 'max',        # Uses all CPU cores
    exec_mode: 'cluster',
    max_memory_restart: '512M',
    env_production: {
      NODE_ENV: 'production'
    }
  }]
};

pm2 start ecosystem.config.js --env production
```

### 5. Nginx Production Config
- Enable HTTPS (certbot / CloudFlare SSL)
- Rate limiting per IP
- Block common attack paths
- Enable proxy caching for /api/v1/catalog/* and /api/v1/search

### 6. Monitoring
- **PM2 monitoring**: `pm2 monit`
- **Admin System Health**: `/admin/system-health` (built-in)
- **BullMQ queues**: `/admin/system-health` shows all queue stats
- **MongoDB Atlas**: built-in monitoring dashboard
- **Uptime**: UptimeRobot / BetterUptime for `/api/v1/health`

## Scaling Strategy

### Vertical (first):
- MongoDB Atlas: M10 → M20 → M30
- Redis: 256MB → 1GB
- Server: 2 vCPU → 4 vCPU

### Horizontal (when needed):
- **Backend**: PM2 cluster (4 instances per server) → multiple servers behind ALB
- **WebSocket**: Requires sticky sessions OR Redis adapter for Socket.io
- **BullMQ workers**: Can run on separate servers (shared Redis)
- **MongoDB**: Atlas auto-scaling handles this
- **Frontend**: Deploy as static files on CDN (S3 + CloudFront)

### CDN Setup
1. Build Angular: `ng build --configuration production`
2. Upload `dist/` to S3 bucket
3. CloudFront distribution pointing to S3
4. Route53 DNS → CloudFront

### Multi-Region (future):
- MongoDB Atlas global clusters
- Redis ElastiCache with read replicas
- CloudFront edge locations (automatic)

## Security Hardening
- [ ] Enable HTTPS everywhere
- [ ] Set secure JWT secrets (256-bit random)
- [ ] Enable MongoDB authentication
- [ ] Redis password protection
- [ ] Firewall: only expose ports 80/443
- [ ] Rate limiting on auth endpoints (already done)
- [ ] CORS restricted to production domain (already done)
- [ ] Helmet security headers (already done)
- [ ] Input validation on all endpoints (Zod, already done)

## Rollback Procedure

### Quick Rollback (< 2 minutes)
```bash
# 1. Find previous working commit
git log --oneline -10

# 2. Revert to previous commit
git revert HEAD --no-edit
git push origin main

# 3. Redeploy (PM2)
pm2 reload rnd-api

# 4. Verify health
curl https://yourdomain.com/api/v1/health/ready
```

### Docker Rollback
```bash
# 1. List previous images
docker images rndecommerce-backend --format "table {{.ID}}\t{{.CreatedAt}}"

# 2. Tag previous image as latest
docker tag <previous-image-id> rndecommerce-backend:latest

# 3. Restart
docker compose up -d backend
```

### Feature Flag Rollback (zero deploy)
```
If a new feature causes issues:
1. Go to Admin → Feature Flags
2. Toggle OFF the problematic flag
3. Feature instantly disabled — no deploy needed
4. Fix the bug at your own pace
5. Toggle ON when ready
```

## Smoke Test After Deploy
```bash
# Run after every deployment
curl -f https://yourdomain.com/api/v1/health/ready || echo "DEPLOY FAILED"
curl -f https://yourdomain.com/api/v1/health/live || echo "DEPLOY FAILED"
curl -f https://yourdomain.com/api/v1/catalog/categories || echo "CATALOG BROKEN"
```
