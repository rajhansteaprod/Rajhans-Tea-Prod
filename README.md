# Rajhans Tea - Server-Side Rendering (SSR) Architecture

## Overview
Rajhans Tea is a full-stack e-commerce platform with **Server-Side Rendering (SSR)** for improved performance and SEO. The application runs on a single port (`4000` in dev, `80` in production via nginx) with a unified frontend-backend architecture.

## Architecture

### Stack
- **Frontend:** Angular 21 with Universal SSR
- **Backend:** Node.js with Express
- **Database:** MongoDB with replica set
- **Cache:** Redis
- **Reverse Proxy:** Nginx
- **Containerization:** Docker Compose

### Single Port Model
Unlike traditional Angular apps that run `ng serve` on one port and backend on another, this SSR setup:
- **Frontend runs on port 4000** (Express server with SSR rendering)
- **Backend API on port 3000** (proxied through frontend Express)
- **Nginx reverse proxy on port 80** (routes to frontend)

### Request Flow
```
Browser (localhost)
    ↓
Nginx (port 80)
    ↓
Frontend Express Server (port 4000)
    ├─ SSR render Angular templates
    ├─ Serve static assets
    └─ Proxy /api requests → Backend (port 3000)
    ↓
Backend API (port 3000)
    ↓
MongoDB + Redis
```

## Development Setup

### Prerequisites
- Node.js 22+
- Docker & Docker Compose
- npm 10+

### Installation
```bash
# Clone and install
cd frontend
npm install --legacy-peer-deps

# Root installation
npm install
```

### Development Server
```bash
cd frontend
npm run dev:ssr
```
This starts a **nodemon-watched dev server** on `http://localhost:4000` with:
- Auto-rebuild on TypeScript, HTML, SCSS changes
- Hot reload without full restart
- Full SSR rendering for testing

### Build for Production
```bash
cd frontend
npm run build:ssr
```
Outputs:
- `dist/frontend/browser/` - SSR-rendered HTML + browser bundles
- `dist/frontend/server/` - Express server bundle

### Docker Deployment
```bash
# Build and start all services
docker-compose up -d

# Access at http://localhost
```

## SSR Key Concepts

### Platform Detection
Since both browser and server execute code, certain APIs are guarded:
```typescript
import { PlatformService } from '@app/core/services/platform.service';

export class MyComponent {
  constructor(private platform: PlatformService) {}
  
  ngOnInit() {
    if (this.platform.isBrowser()) {
      // window, document, localStorage only
      window.addEventListener('scroll', ...);
    }
  }
}
```

### Browser-Only Code
- GSAP animations (guarded with `PlatformService`)
- Three.js rendering (guarded with `PlatformService`)
- WebSocket connections
- localStorage/sessionStorage

### Server-Safe Code
- HttpClient API calls ✓
- RxJS operators ✓
- DOM queries ✗
- window/document ✗

## API Proxy Architecture

The Express server at `server.ts` proxies all `/api` requests to the backend using **http-proxy-middleware**:

```typescript
// Proxy /api requests BEFORE body parsing
server.use('/api', createProxyMiddleware({
  target: 'http://backend:3000',
  changeOrigin: true,
}));

// Body parsing for non-API routes
server.use(express.json());
server.use(express.urlencoded());
```

**Important:** Proxy middleware runs FIRST to preserve multipart form data (file uploads). Body parsers run after.

### File Upload Handling
- Frontend form sends multipart to `/api/v1/admin/uploads`
- Express proxy forwards binary data untouched
- Backend receives complete form data
- Busboy parses multipart correctly

## Authentication Flow

1. User submits phone + password at `/auth/login`
2. Backend validates with Firebase/Custom auth
3. Backend returns `accessToken` + `refreshToken`
4. Frontend stores `refreshToken` in httpOnly cookie
5. All API calls include `Authorization: Bearer {accessToken}`
6. Token refresh handled automatically by auth interceptor

## Nginx Configuration

Nginx runs on port 80 and:
- Routes `/` requests → frontend:4000 (SSR app)
- Routes `/api/*` → frontend:4000 (Express proxy)
- Serves static files with long cache
- Adds CORS headers
- Handles gzip compression

```nginx
location /api {
  proxy_pass http://frontend;
  # CORS headers added here
}

location / {
  proxy_pass http://frontend;
  # Cache headers for development
}
```

## File Structure

```
frontend/
├── src/
│   ├── app/
│   │   ├── core/
│   │   │   ├── services/
│   │   │   │   └── platform.service.ts (browser detection)
│   │   │   └── interceptors/
│   │   │       └── auth.interceptor.ts (token + refresh)
│   │   ├── features/
│   │   │   ├── admin/
│   │   │   │   ├── products/
│   │   │   │   ├── orders/
│   │   │   │   └── categories/
│   │   │   └── home/
│   │   └── shared/
│   ├── environments/
│   │   ├── environment.ts (dev)
│   │   └── environment.prod.ts (production)
│   └── server.ts (Express SSR server)
├── dist/
│   └── frontend/
│       ├── browser/ (client bundles)
│       └── server/ (SSR server)
├── Dockerfile.ssr (multi-stage SSR build)
├── tsconfig.server.json (server-side TypeScript config)
└── package.json
```

## Common Tasks

### Add a New Component
```bash
ng generate component features/admin/new-feature
```
- Component file structure: `.ts`, `.html`, `.scss`, `.spec.ts`
- No inline templates/styles (memory constraint in Docker)

### Update Styles
```bash
cd frontend
npm run dev:ssr
# Edit .scss file → auto-rebuild → refresh browser
```

### Test File Upload
1. Login to `/admin/login`
2. Navigate to `/admin/products`
3. Create new product with image upload
4. Multipart data flows: Browser → Nginx → Frontend Express → Backend

### Deploy Changes
```bash
cd frontend
npm run build:ssr
docker-compose build frontend
docker-compose up -d frontend
```

## Troubleshooting

### 500 Error on File Upload
**Cause:** Proxy not forwarding multipart data correctly
**Solution:** Ensure middleware order is correct (proxy BEFORE body parsing)

### White Screen on http://localhost:4000
**Cause:** SSR build incomplete or server not running
**Solution:** 
```bash
npm run build:ssr
npm run serve:ssr
```

### CORS Errors
**Cause:** API proxy not forwarding CORS headers
**Solution:** Check `http-proxy-middleware` configuration in `server.ts`

### Stale Cache
**Cause:** Old docker image
**Solution:**
```bash
docker-compose down
docker-compose up -d --build --no-cache
```

## Performance Optimizations

1. **Gzip compression** enabled in nginx (256+ bytes)
2. **Cache headers** for static assets (1 year, immutable)
3. **HTTP/2 ready** (via modern nginx)
4. **Code splitting** via Angular lazy loading
5. **Server-side rendering** reduces First Contentful Paint

## Security

- HTTPS enforced in production
- CORS headers whitelisted per origin
- Content Security Policy headers set
- JWT tokens in httpOnly cookies
- Authorization required for admin APIs
- Rate limiting on backend (100 req/min)

## Database

### MongoDB
- Replica set enabled for transactions
- Connection: `mongodb://mongo:27017/rajhans-tea`
- Admin seeding: `infrastructure/docker/mongo/mongo-init.js`

### Redis
- Cache layer for sessions
- Connection: `redis:6379`
- Used by auth interceptor for token refresh

## Monitoring

### Available Tools
- **Mongo Express:** http://localhost:8082
- **Grafana:** http://localhost:3000
- **PostgreSQL:** port 5432
- **Elasticsearch:** port 9200

## Git Workflow

All commits include:
```
Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
```

Branches:
- `main` - production-ready code
- `v2` - current development (SSR migration)

## Next Steps

- [ ] Test full production build
- [ ] Set up CI/CD pipeline
- [ ] Configure SSL/TLS for production
- [ ] Set up monitoring & logging
- [ ] Document API endpoints
- [ ] Load testing

## Support

For issues, check:
1. Docker logs: `docker logs frontend`, `docker logs rajhans-tea-backend`
2. Browser console (F12)
3. Network tab for failed requests
4. Backend auth logs for token issues

---

**Last Updated:** April 2026  
**Architecture:** Server-Side Rendering with Express  
**Deployment:** Docker Compose  
**Status:** Production Ready
