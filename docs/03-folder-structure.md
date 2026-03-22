# 03 — Folder & File Guide

Every file in this repo explained. Beginners: read top to bottom. Experienced engineers: use as a reference.

---

## Root Level

```
Rajhans Tea/
├── backend/                  ← Node.js API server
├── frontend/                 ← Angular web app
├── infrastructure/           ← Docker configs, seeds, nginx
├── docs/                     ← This knowledge book
├── .github/workflows/        ← CI/CD pipeline
├── docker-compose.yml        ← Development environment
├── docker-compose.test.yml   ← Test environment overrides
├── docker-compose.monitoring.yml ← Prometheus + Grafana stack
├── package.json              ← Root npm workspace config
├── package-lock.json         ← Single lock file for all workspaces
├── tsconfig.base.json        ← Shared TypeScript config
├── sonar-project.properties  ← SonarCloud SAST configuration
└── .github/workflows/ci.yml  ← GitHub Actions pipeline
```

---

## Backend (`backend/`)

```
backend/
├── src/
│   ├── server.ts             ← Entry point. Starts HTTP server, graceful shutdown.
│   ├── app.ts                ← Express app setup. Registers ALL middleware and routes.
│   │
│   ├── config/
│   │   └── index.ts          ← All environment variables in one place. Never read process.env directly.
│   │
│   ├── api/v1/               ← Versioned API. "v1" means if we break the API in future, we add "v2" here.
│   │   ├── routes/
│   │   │   ├── index.ts      ← Combines all route files into one router.
│   │   │   ├── auth.routes.ts    ← /auth/* endpoints
│   │   │   ├── admin.routes.ts   ← /admin/* endpoints (require auth + admin role)
│   │   │   ├── health.routes.ts  ← /health and /health/ready (liveness + readiness probes)
│   │   │   └── metrics.routes.ts ← /metrics (Prometheus scraping endpoint)
│   │   │
│   │   ├── controllers/
│   │   │   ├── auth.controller.ts         ← Handles login, refresh, logout, /me
│   │   │   ├── admin-user.controller.ts   ← Handles user listing for admin
│   │   │   └── admin-dashboard.controller.ts ← Handles dashboard stats
│   │   │
│   │   └── validators/
│   │       ├── auth.validator.ts       ← Zod schemas for auth request bodies
│   │       └── admin-user.validator.ts ← Zod schema for user list query params
│   │
│   ├── services/             ← Business logic. No HTTP. No database queries.
│   │   ├── auth.service.ts           ← Firebase verification, JWT generation, token rotation
│   │   ├── admin-user.service.ts     ← User listing with filter/pagination
│   │   └── admin-dashboard.service.ts ← Aggregate stats for dashboard
│   │
│   ├── repositories/         ← Database layer. Only talks to MongoDB.
│   │   ├── base.repository.ts    ← Generic CRUD: findById, findMany, create, updateById, deleteById, count
│   │   ├── user.repository.ts    ← Extends Base + findByPhone, findActiveByPhone, updateLastLogin
│   │   └── token.repository.ts   ← Extends Base + findByToken (checks expiry), deleteByUserId, deleteByToken
│   │
│   ├── models/               ← MongoDB schemas (Mongoose)
│   │   ├── user.model.ts     ← User schema: phone, name, email, role, addresses, isActive, etc.
│   │   └── token.model.ts    ← Token schema: user ref, hashed token, type, expiresAt (with TTL index)
│   │
│   ├── middleware/           ← Express middleware functions
│   │   ├── auth.middleware.ts        ← authenticate(): verify JWT, attach req.user
│   │   ├── rbac.middleware.ts        ← authorize('admin'): check req.user.role
│   │   ├── validate.middleware.ts    ← validate(schema): run Zod validation, throw on fail
│   │   ├── rate-limit.middleware.ts  ← globalRateLimiter + authRateLimiter
│   │   ├── error-handler.middleware.ts ← Catch all errors, format response, hide stack in prod
│   │   ├── not-found.middleware.ts   ← Catch unknown routes, return 404
│   │   ├── request-id.middleware.ts  ← Assign UUID to every request for tracing
│   │   ├── request-logger.middleware.ts ← Log every request with pino-http
│   │   └── metrics.middleware.ts    ← Record request count + duration for Prometheus
│   │
│   ├── loaders/              ← Service initialization (runs once at startup)
│   │   ├── index.ts          ← Orchestrates all loaders
│   │   ├── mongoose.loader.ts  ← Connect to MongoDB, handle reconnects
│   │   ├── redis.loader.ts     ← Connect to Redis, expose getRedisClient()
│   │   ├── firebase.loader.ts  ← Initialize Firebase Admin SDK (3 credential strategies)
│   │   └── metrics.loader.ts   ← Initialize Prometheus default metrics
│   │
│   ├── types/                ← TypeScript interfaces (no runtime code)
│   │   ├── auth.types.ts     ← ITokenPayload, IAuthResponse, IAuthTokens, etc.
│   │   ├── common.types.ts   ← IPaginationMeta, IApiResponse, IFieldError, etc.
│   │   ├── user.types.ts     ← IUser, IUserPublic, IAddress
│   │   └── express.ts        ← Extends Express Request type to include req.user, req.requestId
│   │
│   └── utils/                ← Pure helper functions (no side effects)
│       ├── api-error.ts      ← Error class hierarchy (BadRequestError, UnauthorizedError, etc.)
│       ├── api-response.ts   ← sendSuccess(), sendCreated(), sendPaginated(), sendNoContent()
│       ├── logger.ts         ← Pino logger instance (pretty in dev, JSON in prod)
│       └── pagination.ts     ← parsePagination(), buildPaginationMeta()
│
├── tests/
│   ├── unit/
│   │   └── services/
│   │       └── auth.service.test.ts  ← Unit tests for AuthService (mocked repos + Firebase)
│   └── integration/
│       └── setup/
│           ├── global-setup.ts    ← Runs before all integration tests (set NODE_ENV=test)
│           └── global-teardown.ts ← Runs after all integration tests (disconnect DBs)
│
├── Dockerfile                ← Production multi-stage build
├── Dockerfile.dev            ← Development build with nodemon hot-reload
├── jest.config.ts            ← Jest configuration: unit/integration/sanity projects + coverage
├── tsconfig.json             ← TypeScript config for backend
├── nodemon.json              ← Nodemon config for hot-reload in dev
├── package.json              ← Backend dependencies and scripts
└── .env.example              ← Template for required environment variables
```

---

## Frontend (`frontend/`)

```
frontend/
├── src/
│   ├── main.ts               ← Angular bootstrap entry point
│   ├── index.html            ← HTML shell — Angular renders into <app-root>
│   ├── styles.scss           ← Global styles (imports design tokens)
│   │
│   ├── environments/
│   │   ├── environment.ts      ← Dev config: API URL, Firebase keys
│   │   └── environment.prod.ts ← Prod config: same but production values
│   │
│   ├── proxy.conf.json       ← Dev proxy: /api → http://localhost:3100 (avoids CORS in dev)
│   │
│   └── app/
│       ├── app.ts            ← Root component (just <router-outlet>)
│       ├── app.html          ← Root template
│       ├── app.routes.ts     ← Top-level routing: home, /dashboard, /admin, /auth
│       ├── app.config.ts     ← App-level providers: Router, HttpClient, NZ-I18n, interceptors
│       │
│       ├── core/             ← Singletons — created once, shared everywhere
│       │   ├── design-tokens/
│       │   │   ├── tokens.scss  ← All design tokens: colors, spacing, fonts, shadows, breakpoints
│       │   │   └── mixins.scss  ← respond-to() breakpoint mixin
│       │   │
│       │   ├── guards/
│       │   │   └── auth.guard.ts ← authGuard, guestGuard, adminGuard
│       │   │
│       │   ├── interceptors/
│       │   │   └── auth.interceptor.ts ← Auto-attach JWT, auto-refresh on 401
│       │   │
│       │   └── services/
│       │       ├── auth.service.ts    ← Signals-based auth state, token storage, API calls
│       │       ├── firebase.service.ts ← Firebase OTP: initRecaptcha, sendOtp, verifyOtp
│       │       └── admin.service.ts   ← Admin API calls: getDashboardStats, getUsers
│       │
│       ├── features/         ← One folder per feature (self-contained)
│       │   ├── auth/
│       │   │   ├── auth.routes.ts  ← /auth/login route
│       │   │   └── login/
│       │   │       └── login.ts    ← Full login page (phone + OTP, signals, Firebase)
│       │   │
│       │   ├── home/
│       │   │   └── home.ts         ← Public landing page
│       │   │
│       │   ├── dashboard/
│       │   │   └── dashboard.ts    ← Customer dashboard (requires auth)
│       │   │
│       │   └── admin/
│       │       ├── admin.routes.ts  ← Admin sub-routes
│       │       ├── dashboard/
│       │       │   └── admin-dashboard.ts ← Admin stats dashboard
│       │       └── users/
│       │           └── user-list/
│       │               └── user-list.ts ← User management table
│       │
│       └── layouts/          ← Page shells (persistent chrome around content)
│           ├── main-layout/
│           │   ├── main-layout.ts  ← Shell for public/customer pages (header + router-outlet)
│           │   └── header/
│           │       └── header.ts   ← Top navigation bar
│           └── admin-layout/
│               └── admin-layout.ts ← Shell for admin pages (sidebar + content)
│
├── nginx.conf                ← Production Nginx config for serving the Angular build
├── Dockerfile                ← Production: build Angular → serve with Nginx
├── Dockerfile.dev            ← Development: ng serve with live reload
├── angular.json              ← Angular CLI project config (build targets, proxy, etc.)
└── package.json              ← Frontend dependencies
```

---

## Infrastructure (`infrastructure/`)

```
infrastructure/
├── docker/
│   ├── mongo/
│   │   └── mongo-init.js     ← Initializes MongoDB replica set (rs0) on first start
│   │
│   ├── nginx/
│   │   └── nginx.conf        ← Reverse proxy: /api → backend:3000, / → frontend:4200
│   │
│   ├── redis/
│   │   └── redis.conf        ← Redis configuration (persistence, memory limits)
│   │
│   ├── prometheus/
│   │   └── prometheus.yml    ← What to scrape and how often
│   │
│   └── grafana/
│       └── provisioning/
│           ├── datasources/
│           │   └── prometheus.yml ← Auto-configure Prometheus as Grafana data source
│           └── dashboards/
│               └── dashboard.yml  ← Auto-load dashboards on Grafana start
│
└── seeds/
    └── seed-admin.js         ← Upsert a user as admin by phone number
```
