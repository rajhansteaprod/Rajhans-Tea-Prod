# PART 1: INFRASTRUCTURE — Complete Knowledge Transfer

> **Target Audience**: BTech CS student joining the project
> **Goal**: End-to-end understanding of deployment, DevOps, integrations, dependencies, testing infra, and all non-business-logic systems
> **Project**: Rajhans Tea — Production-grade MEAN stack ecommerce

---

## TABLE OF CONTENTS

- [A. Project Architecture Overview (Concepts 1–50)](#a-project-architecture-overview)
- [B. Monorepo & Package Management (Concepts 51–100)](#b-monorepo--package-management)
- [C. Docker & Containerization (Concepts 101–175)](#c-docker--containerization)
- [D. Nginx Reverse Proxy (Concepts 176–225)](#d-nginx-reverse-proxy)
- [E. MongoDB Infrastructure (Concepts 226–280)](#e-mongodb-infrastructure)
- [F. Redis Infrastructure (Concepts 281–325)](#f-redis-infrastructure)
- [G. BullMQ Job Queue System (Concepts 326–375)](#g-bullmq-job-queue-system)
- [H. Server Startup & Loader System (Concepts 376–420)](#h-server-startup--loader-system)
- [I. Environment & Configuration (Concepts 421–450)](#i-environment--configuration)
- [J. CI/CD Pipeline (Concepts 451–500)](#j-cicd-pipeline)
- [K. Monitoring, Logging & Observability (Concepts 501–535)](#k-monitoring-logging--observability)
- [L. Resilience Patterns (Concepts 536–560)](#l-resilience-patterns)
- [M. Testing Infrastructure (Concepts 561–590)](#m-testing-infrastructure)
- [N. Third-Party Integrations (Concepts 591–625)](#n-third-party-integrations)
- [O. Security Infrastructure (Concepts 626–660)](#o-security-infrastructure)
- [P. Production Deployment & Scaling (Concepts 661–700)](#p-production-deployment--scaling)

---

## A. PROJECT ARCHITECTURE OVERVIEW

### Concept 1: MEAN Stack
Ye project **MEAN stack** pe built hai:
- **M**ongoDB — NoSQL document database (data store karta hai JSON-like documents me)
- **E**xpress.js — Node.js ka web framework (HTTP requests handle karta hai)
- **A**ngular — Frontend SPA framework (browser me UI render karta hai)
- **N**ode.js — JavaScript runtime (server-side code chalata hai)

**Kyu MEAN?** Full-stack JavaScript — ek hi language (TypeScript) frontend aur backend dono me. Team ko 2 languages nahi sikhni padti.

### Concept 2: Monorepo Structure
Poora project ek single Git repository me hai (`rajhans-tea/`). Isko **monorepo** kehte hain. Iska matlab frontend, backend, infrastructure configs — sab ek jagah:
```
rajhans-tea/
├── backend/          ← Express API server
├── frontend/         ← Angular SPA
├── infrastructure/   ← Docker, Nginx, Redis, Mongo configs
├── .github/          ← CI/CD pipeline
├── docs/             ← Documentation
├── docker-compose.yml
└── package.json      ← Root package (monorepo manager)
```

**Monorepo ka fayda**: Ek `git clone` se poora project aa jata hai. Cross-cutting changes (API change + frontend update) ek hi PR me ho sakti hain.

### Concept 3: Separation of Concerns
Project 3 clear layers me divided hai:
1. **Presentation Layer** (frontend/) — User ko UI dikhata hai
2. **Business Logic Layer** (backend/src/modules/) — Rules enforce karta hai (pricing, auth, payments)
3. **Infrastructure Layer** (infrastructure/, docker-compose, loaders) — Services ko connect aur run karta hai

Ye separation ensure karta hai ki agar tum MongoDB ki jagah PostgreSQL lagao, to sirf infrastructure change hoga, business logic untouched rahegi.

### Concept 4: Client-Server Architecture
```
Browser (Angular SPA)  ──HTTP/WS──>  Backend (Express API)  ──TCP──>  MongoDB/Redis
      CLIENT                              SERVER                       DATA STORES
```
Angular browser me chalti hai, har user ke device pe. Backend ek centralized server pe chalta hai. Dono ke beech HTTP requests aur WebSocket connections hain.

### Concept 5: SPA (Single Page Application)
Angular ek **SPA** hai — matlab browser sirf 1 baar HTML page load karta hai. Uske baad saari navigation JavaScript handle karti hai bina page reload ke. `/products` se `/checkout` jaane pe browser reload nahi hota — Angular router URL change karta hai aur naya component render karta hai.

### Concept 6: REST API Pattern
Backend **RESTful API** expose karta hai:
- `GET /api/v1/catalog/products` — Products list karo
- `POST /api/v1/payments/orders` — Naya payment order banao
- `PUT /api/v1/admin/products/:id` — Product update karo
- `DELETE /api/v1/admin/users/:id` — User delete karo

Har URL ek "resource" represent karta hai, aur HTTP method (GET/POST/PUT/DELETE) action define karta hai.

### Concept 7: API Versioning (`/api/v1/`)
Saare routes `/api/v1/` prefix ke andar hain. Agar future me breaking changes aayein to `/api/v2/` bana sakte hain bina purane clients todke. Ye **backward compatibility** maintain karta hai.

### Concept 8: Stateless Backend
Backend **stateless** hai — matlab server ko yaad nahi rehta ki pichli request kaunsi thi. Har request me JWT token aata hai jo user identify karta hai. Iska fayda: multiple backend instances chala sakte ho (scaling) kyunki koi bhi instance kisi bhi request ko handle kar sakta hai.

### Concept 9: Session ID for Guest Users
Guest users (bina login ke) ke liye `X-Session-ID` header use hota hai. Ye ek UUID hai jo browser generate karta hai aur har request me bhejta hai. Isse guest ka cart bhi persist rehta hai.

### Concept 10: WebSocket for Real-Time
HTTP ek "request-response" protocol hai — client puchta hai, server jawab deta hai. Lekin real-time notifications (order status change, payment confirmation) ke liye **WebSocket** (Socket.io) use hota hai — ye ek persistent connection hai jisme server bhi client ko "push" kar sakta hai.

### Concept 11: Event-Driven Architecture
Jab payment capture hoti hai, backend directly order nahi banata. Instead:
1. `payment.captured` event emit hota hai
2. Event handler us event ko sunta hai
3. Handler BullMQ queue me job add karta hai (fulfillment, invoice, loyalty)

Ye **decoupling** hai — payment module ko order module ka code jaanne ki zarurat nahi.

### Concept 12: Queue-Based Async Processing
Heavy operations (PDF invoice generation, email sending, stock deduction) synchronously nahi hoti. BullMQ queue me job add hoti hai, alag worker process us job ko background me execute karta hai. User ko turant response milta hai, baki kaam background me hota hai.

### Concept 13: Module Architecture (Backend)
Backend 14 feature modules me organized hai:
```
modules/
├── auth/         ← Login, JWT, sessions
├── catalog/      ← Products, categories, collections
├── cart/         ← Cart, wishlist, stock reservation
├── payments/     ← Razorpay, wallet, invoices
├── pricing/      ← Price rules, tax rules
├── inventory/    ← Orders, warehouses, stock
├── promotions/   ← Coupons, loyalty, referrals
├── reviews/      ← Product reviews, Q&A
├── search/       ← Full-text search
├── cms/          ← Static pages, blogs
├── admin/        ← Admin dashboard, user management
├── audit/        ← Action logging
└── settings/     ← Store configuration
```
Har module ka apna folder hai with: models, services, controllers, routes, validators, repositories, jobs.

### Concept 14: Layered Architecture (Per Module)
Har module ke andar 6 layers hain:
```
Route → Controller → Service → Repository → Model → MongoDB
  ↑         ↑           ↑          ↑           ↑
  URL     HTTP       Business    Data        Schema
  Map     Handler     Logic      Access     Definition
```
- **Route**: URL ko controller se map karta hai
- **Controller**: Request parse karta hai, service call karta hai, response bhejta hai
- **Service**: Business logic (validation, calculations, decisions)
- **Repository**: Database queries (findById, create, update)
- **Model**: Mongoose schema (field types, indexes, constraints)

### Concept 15: Middleware Pipeline
Har HTTP request 14 middleware layers se guzarti hai (order matters!):
```
Request → Helmet → CORS → Compression → JSON Parse → Cookie Parse
→ Rate Limit → Timeout → Request ID → Logger → Metrics → Observability
→ [Route Handler] → Error Handler → Response
```
Agar koi bhi middleware fail kare (e.g., rate limit exceeded), request wahi ruk jaati hai aur error response jaata hai.

### Concept 16: Repository Pattern
Direct `Model.findById()` call karne ki jagah, ek `Repository` class hai jo database operations abstract karti hai:
```typescript
// BAD — Direct model call in service
const user = await User.findById(id);

// GOOD — Repository abstraction
const user = await userRepository.findById(id);
```
**Kyu?** Agar future me MongoDB ki jagah PostgreSQL lagana ho, sirf repository change karni padegi, service untouched rahegi.

### Concept 17: Base Repository
`core/base.repository.ts` me ek generic `BaseRepository` hai jo common CRUD operations provide karta hai. Har module-specific repository isse extend karta hai:
- `findById(id)` — ID se document dhundho
- `findMany(filter, options)` — Multiple documents dhundho
- `create(data)` — Naya document banao
- `updateById(id, data)` — Update karo
- `deleteById(id)` — Delete karo
- `count(filter)` — Count karo
- `exists(filter)` — Check karo ki hai ya nahi

### Concept 18: DTO (Data Transfer Object)
API response me raw MongoDB document nahi bhejte. **DTO** ek shaped object hai jo sirf wahi fields bhejta hai jo client ko chahiye:
```typescript
// MongoDB document me 20 fields hain
// DTO sirf 5 bhejta hai (no password hash, no internal IDs)
UserDTO = { id, name, phone, role, isAdmin }
```
**Security**: Internal fields (password hash, internal flags) kabhi client ko nahi jaate.

### Concept 19: Validator Layer (Zod)
Har route pe Zod validation hoti hai BEFORE controller execute ho:
```typescript
// Agar body me phone number galat format me hai, request reject
const schema = z.object({
  phone: z.string().length(10).regex(/^\d+$/),
});
```
Zod **runtime validation** karta hai — TypeScript compile-time pe check karta hai, Zod runtime pe.

### Concept 20: Error Handling Strategy
Custom error classes hain jo HTTP status codes se mapped hain:
- `BadRequestError` → 400 (client ne galat data bheja)
- `UnauthorizedError` → 401 (token missing/invalid)
- `ForbiddenError` → 403 (permission nahi hai)
- `NotFoundError` → 404 (resource nahi mili)
- `ConflictError` → 409 (duplicate resource)
- `TooManyRequestsError` → 429 (rate limit hit)

Global error handler middleware sabko catch karke consistent JSON response bhejta hai.

### Concept 21: Response Format
Saare API responses ek consistent format me hain:
```json
// Success
{ "success": true, "statusCode": 200, "message": "Products fetched", "data": [...] }

// Error
{ "success": false, "statusCode": 400, "message": "Invalid phone", "errors": [...] }

// Paginated
{ "success": true, "data": [...], "meta": { "page": 1, "limit": 20, "total": 100 } }
```

### Concept 22: Health Check Endpoints
```
GET /api/v1/health/live   → "Server is running" (basic check)
GET /api/v1/health/ready  → Checks MongoDB + Redis connectivity
```
Load balancers aur monitoring tools ye endpoints check karte hain. Agar `/ready` fail ho, traffic us server ko nahi jaati.

### Concept 23: CORS (Cross-Origin Resource Sharing)
Browser security feature — frontend (`localhost:4200`) se backend (`localhost:3000`) pe request tab hi jaati hai jab backend CORS header me frontend ka origin allow kare:
```typescript
cors({ origin: 'http://localhost:4200', credentials: true })
```
**Production me**: Sirf `https://rajhanstea.com` allowed hoga.

### Concept 24: Helmet Security Headers
`helmet()` middleware automatically security headers set karta hai:
- `X-Content-Type-Options: nosniff` — Browser MIME type sniffing band karo
- `X-Frame-Options: SAMEORIGIN` — Clickjacking se protection
- `X-XSS-Protection` — XSS attacks se protection

### Concept 25: Compression
`compression()` middleware HTTP responses ko **gzip** compress karta hai. Ek 500KB JSON response ~100KB me compress ho jata hai. Client automatically decompress karta hai. Network bandwidth bachta hai.

### Concept 26: Request Timeout
```typescript
requestTimeout(30000) // 30 seconds
```
Agar koi request 30 seconds me complete nahi hoti, automatically terminate ho jaati hai. Ye **stuck requests** ko prevent karta hai jo server resources hold karte hain.

### Concept 27: Request ID
Har incoming request ko ek unique ID milti hai (`X-Request-ID` header ya generated UUID). Ye ID saare logs me appear hoti hai — agar koi bug report aaye to us specific request ke saare logs trace kar sakte ho.

### Concept 28: Static File Serving
```typescript
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
```
Product images `/uploads/` folder me stored hain. Express directly serve karta hai bina kisi dynamic processing ke. Production me Nginx ye handle karta hai (faster).

### Concept 29: JSON Body Limit
```typescript
express.json({ limit: '10mb' })
```
Maximum 10MB ka JSON body accept hota hai. Isse bade payloads reject ho jaate hain. Ye **DoS (Denial of Service)** attacks se protect karta hai jahan attacker bahut bada payload bhejke server crash karne ki koshish kare.

### Concept 30: Cookie Parser
`cookie-parser` middleware HTTP cookies ko parse karke `req.cookies` object me daal deta hai. Refresh tokens aur session data cookies me stored hain.

### Concept 31: idempotencyKey
Payment creation me `idempotencyKey` bhejte hain. Agar network issue ki wajah se client same request dobara bheje, backend check karta hai ki is key ka payment already bana hai kya. Agar haan, wohi purana response return karta hai — **duplicate payment nahi banti**.

### Concept 32: Full-Stack TypeScript
Frontend (Angular) aur Backend (Express) dono **TypeScript** me hain. TypeScript JavaScript ka superset hai jo **static type checking** add karta hai — compile time pe bugs pakadta hai:
```typescript
function greet(name: string): string { // name string hona chahiye
  return `Hello ${name}`;
}
greet(42); // ← TypeScript ERROR! (JavaScript me ye silently "Hello 42" banega)
```

### Concept 33: `as const` Assertion
Backend config me `as const` use hota hai:
```typescript
export const config = { ... } as const;
```
Ye TypeScript ko bolta hai ki ye object **readonly** hai — koi field change nahi kar sakta. Accidental mutation prevent hota hai.

### Concept 34: Singleton Pattern (Loaders)
Redis client, Firebase app, Razorpay client — ye sab ek hi baar initialize hote hain aur poore application me share hote hain:
```typescript
let redisClient: Redis | null = null; // Singleton
export const getRedisClient = (): Redis => {
  if (!redisClient) throw new Error('Not initialized');
  return redisClient;
};
```
Multiple Redis connections banana wasteful hoga — ek hi connection pool enough hai.

### Concept 35: Graceful Shutdown
Jab server ko band karna ho (deploy ya restart), turant `process.exit()` nahi karta. Pehle:
1. Naye connections accept karna band karo
2. In-flight requests complete hone do
3. BullMQ workers band karo
4. Database connections close karo
5. Phir exit karo

Isse **data loss nahi hoti** — agar koi payment process ho rahi thi, wo complete hogi pehle.

### Concept 36: Signal Handling (SIGTERM/SIGINT)
Operating system 2 tarah se process ko band karne ko kehta hai:
- `SIGTERM` — "Please shut down" (polite, Docker/PM2 ye bhejte hain)
- `SIGINT` — "Interrupt" (Ctrl+C se generate hota hai)

Server dono signals pe graceful shutdown start karta hai. 10 seconds ka timeout hai — agar itne me complete nahi hua, force exit (`process.exit(1)`).

### Concept 37: Forced Shutdown Timer
```typescript
setTimeout(() => {
  logger.error('Forced shutdown after timeout');
  process.exit(1);
}, 10000); // 10 seconds
```
Kabhi kabhi graceful shutdown hang ho jaata hai (database connection close nahi ho rahi). Ye safety net hai — 10 seconds ke baad forcefully exit karo. Docker/PM2 phir naya instance start karenge.

### Concept 38: npm Workspaces
Root `package.json` me:
```json
"workspaces": ["backend"]
```
Ye **npm workspaces** feature hai — root se `npm install` chalane pe backend ke dependencies bhi install ho jaate hain. `npm run dev --workspace=backend` se specifically backend ka script chalta hai. Single `package-lock.json` poore monorepo ke liye.

### Concept 39: Entry Point Chain
Server start hone ka flow:
```
npm run dev
  → nodemon watches src/ for changes
    → ts-node executes server.ts
      → validateEnvironment()          ← Env vars check
      → registerGlobalErrorHandlers()  ← Crash handlers
      → initializeLoaders()            ← MongoDB, Redis, Firebase, Razorpay
      → registerWorkers()              ← BullMQ job processors
      → registerEventHandlers()        ← Cross-module event listeners
      → http.createServer(app)         ← HTTP server
      → initSocket(httpServer)         ← WebSocket server
      → server.listen(3000)            ← Start accepting connections
```

### Concept 40: Loader Pattern
"Loader" ek function hai jo ek external service ko initialize karta hai:
```
loaders/
├── mongoose.loader.ts   ← MongoDB connect
├── redis.loader.ts      ← Redis connect
├── bullmq.loader.ts     ← BullMQ Redis connect
├── firebase.loader.ts   ← Firebase Admin SDK init
├── razorpay.loader.ts   ← Razorpay client init
├── metrics.loader.ts    ← Prometheus init
├── socket.loader.ts     ← Socket.io init
└── index.ts             ← Orchestrator (calls all loaders in order)
```
Loaders ko alag files me rakhne se har service ka initialization code isolated hai. Agar Firebase loader fail ho, easily debug kar sakte ho.

### Concept 41: Loader Order Matters
`initializeLoaders()` me MongoDB **pehle** connect hota hai kyunki:
1. BullMQ Redis ke baad workers start hote hain
2. Workers ko MongoDB chahiye (orders create karne ke liye)
3. Isliye MongoDB ready hona chahiye workers se pehle

```typescript
await connectMongoDB();  // 1st — MUST be first (async, blocking)
connectRedis();          // 2nd — Sync (non-blocking, fires events)
connectBullMQ();         // 3rd — Needs Redis config
initMetrics();           // Any order
initFirebase();          // Any order
initRazorpay();          // Any order
```

### Concept 42: Lazy Imports in Event Handlers
```typescript
eventBus.onEvent(Events.PAYMENT_CAPTURED, async (data) => {
  const { getFulfillmentQueue } = await import('../modules/inventory/...');
  //                               ↑ LAZY IMPORT (dynamic import)
});
```
`await import()` **lazy import** hai — module tab load hota hai jab pehli baar zarurat ho, startup pe nahi. Ye **circular dependency** avoid karta hai (Module A imports Module B which imports Module A → crash).

### Concept 43: Event Constants
```typescript
export const Events = {
  PAYMENT_CAPTURED: 'payment.captured',
  ORDER_CREATED: 'order.created',
  STOCK_LOW: 'stock.low',
  // ...
} as const;
```
String constants use karte hain events ke liye, hardcoded strings ki jagah. Agar typo ho to TypeScript error dega.

### Concept 44: Environment Modes
3 environments hain:
- `development` — Local machine pe, debug logs ON, missing env vars pe warning (no crash)
- `test` — CI pipeline me, test database use hota hai
- `production` — Live server pe, missing required env vars pe crash (fail fast)

`NODE_ENV` environment variable ye decide karta hai.

### Concept 45: Fail Fast in Production
```typescript
if (process.env.NODE_ENV === 'production') {
  process.exit(1); // Missing env var → CRASH
} else {
  logger.warn('Missing env var — continuing in dev mode');
}
```
Production me agar required config missing hai to turant crash. Better to crash at startup than silently malfunction at 3 AM.

### Concept 46: Port Mapping
```
Service         Container Port    Host Port
MongoDB         27017          →  27019
MongoDB Test    27017          →  27020
Redis           6379           →  6381
Backend         3000           →  3100
Frontend        4200           →  4201
Mongo Express   8081           →  8082
Nginx           80             →  80
```
Container ke andar default port use hota hai. Host pe different port map karta hai taaki local machine pe already koi service us port pe chalti ho to conflict na ho.

### Concept 47: Volume Mounts
Docker containers ke andar files temporary hoti hain — container delete hone pe sab ud jaata hai. **Volumes** persistent storage provide karte hain:
```yaml
volumes:
  - mongo-data:/data/db          # MongoDB data persist
  - redis-data:/data             # Redis data persist
  - ./backend/src:/app/backend/src  # Live code sync (dev hot-reload)
```

### Concept 48: Hot Reload
Development me file change karne pe server automatically restart hota hai:
- **Backend**: `nodemon` watches `src/` folder → file change → restart
- **Frontend**: `ng serve` watches source files → file change → browser auto-refresh

Production me hot reload nahi hota — optimized compiled code chalta hai.

### Concept 49: Debug Port (9229)
```yaml
ports:
  - "9229:9229"
```
Node.js inspector port hai. Chrome DevTools ya VS Code se attach karke backend code me breakpoints laga sakte ho, step through kar sakte ho. `node --inspect` se enable hota hai.

### Concept 50: Service Dependencies
```yaml
backend:
  depends_on:
    mongo:
      condition: service_healthy
    redis:
      condition: service_healthy
```
Backend tab hi start hoga jab MongoDB aur Redis **healthy** hon (healthcheck pass ho). Bina iske backend start hoke immediately crash hoga kyunki database connect nahi hoga.

---

## B. MONOREPO & PACKAGE MANAGEMENT

### Concept 51: Root package.json
```json
{
  "name": "rajhans-tea",
  "private": true,
  "workspaces": ["backend"],
  "scripts": {
    "dev": "npm run dev --workspace=backend",
    "docker:dev": "docker compose up -d",
    "docker:down": "docker compose down -v",
    "seed": "npm run seed --workspace=backend",
    "prepare": "husky"
  }
}
```
`"private": true` — Ye package npm registry pe publish nahi hoga. `"workspaces"` — npm ko batata hai ki `backend/` ek sub-package hai.

### Concept 52: Workspace Commands
Root se kisi bhi workspace ka script chala sakte ho:
```bash
npm run dev                          # → backend ka dev script
npm run test --workspace=backend     # → backend ke tests
npm run build --workspace=backend    # → backend build
```
Ye convenient hai — root pe rehke saare commands chala sakte ho.

### Concept 53: Single Lock File
Poore monorepo ka ek hi `package-lock.json` root pe hai. Ye ensure karta hai ki har developer aur CI pipeline exactly same dependency versions install kare. **Reproducible builds**.

### Concept 54: npm ci vs npm install
- `npm install` — Dependencies install karta hai, `package-lock.json` update kar sakta hai
- `npm ci` — **Clean Install** — `package-lock.json` se exactly install karta hai, koi change nahi karta

CI pipeline me hamesha `npm ci` use hota hai for reproducibility.

### Concept 55: Backend Dependencies (Production)
| Package | Version | Purpose |
|---------|---------|---------|
| `express` | 5.2.1 | Web framework — routes, middleware, HTTP handling |
| `mongoose` | 9.3.0 | MongoDB ODM — schema definition, queries |
| `ioredis` | 5.4.0 | Redis client — caching, sessions |
| `bullmq` | 5.71.0 | Job queue — background tasks |
| `jsonwebtoken` | 9.0.2 | JWT token generation/verification |
| `firebase-admin` | 13.7.0 | Firebase Admin SDK — OTP verification |
| `razorpay` | 2.9.6 | Payment gateway SDK |
| `zod` | 3.23.0 | Runtime schema validation |
| `helmet` | 7.1.0 | Security headers |
| `cors` | 2.8.5 | Cross-origin request handling |
| `compression` | 1.7.4 | Response compression |
| `pino` | 9.4.0 | Structured JSON logging |
| `prom-client` | 15.1.0 | Prometheus metrics |
| `socket.io` | 4.8.3 | WebSocket server |
| `multer` | 2.1.1 | File upload handling |
| `nodemailer` | 8.0.3 | Email sending |
| `pdfkit` | 0.18.0 | PDF generation (invoices) |
| `bcryptjs` | 2.4.3 | Password/token hashing |
| `uuid` | 10.0.0 | UUID generation |
| `cookie-parser` | 1.4.6 | Cookie parsing |
| `dotenv` | 17.3.1 | Environment variable loading |
| `http-status-codes` | 2.3.0 | HTTP status code constants |
| `rate-limit-redis` | 4.2.0 | Redis-backed rate limiting |

### Concept 56: Backend Dependencies (Dev Only)
| Package | Purpose |
|---------|---------|
| `typescript` 5.6.0 | TypeScript compiler |
| `ts-node` 10.9.0 | Run TypeScript directly (no compile step) |
| `nodemon` 3.1.0 | File watcher → auto-restart |
| `jest` 29.7.0 | Test runner |
| `ts-jest` 29.2.0 | Jest ke liye TypeScript support |
| `supertest` 7.0.0 | HTTP assertion library (integration tests) |
| `eslint` 8.57.0 | Code linting |
| `prettier` 3.3.0 | Code formatting |
| `pino-pretty` 11.2.0 | Dev me readable log output |
| `@types/*` | TypeScript type definitions |

### Concept 57: Frontend Dependencies
| Package | Version | Purpose |
|---------|---------|---------|
| `@angular/core` | ^21.0.0 | Angular framework |
| `@angular/router` | ^21.0.0 | Client-side routing |
| `@angular/forms` | ^21.0.0 | Form handling |
| `@angular/animations` | ^21.2.4 | UI animations |
| `ng-zorro-antd` | ^21.1.1 | UI component library (buttons, tables, modals) |
| `gsap` | ^3.14.2 | Advanced animations (hero parallax) |
| `firebase` | ^12.10.0 | Firebase client SDK (phone auth) |
| `socket.io-client` | ^4.8.3 | WebSocket client |
| `three` | ^0.183.2 | 3D graphics library |
| `rxjs` | ~7.8.0 | Reactive programming (Observables) |
| `tslib` | ^2.3.0 | TypeScript runtime helpers |

### Concept 58: Dependency Versioning (SemVer)
```
^21.0.0  → Major.Minor.Patch
^        → Allow minor + patch updates (21.1.0 OK, 22.0.0 NOT OK)
~7.8.0   → Allow only patch updates (7.8.1 OK, 7.9.0 NOT OK)
```
**SemVer** (Semantic Versioning):
- **Major** (21→22): Breaking changes
- **Minor** (0→1): New features, backward compatible
- **Patch** (0→1): Bug fixes

### Concept 59: @types Packages
TypeScript ko type information chahiye har library ke liye. Kuch libraries apne types include karti hain (like `mongoose`), kuch nahi karti (like `express`). Un ke liye `@types/express` install karna padta hai jo separately maintained type definitions provide karta hai.

### Concept 60: Engine Requirement
```json
"engines": { "node": ">=20.0.0" }
```
Node.js 20+ required hai. Purane versions me kuch APIs nahi hain (like `crypto.randomUUID()`). CI aur Docker dono Node 22 use karte hain.

### Concept 61: Husky Git Hooks
```json
"devDependencies": { "husky": "^9.1.0" }
"scripts": { "prepare": "husky" }
```
**Husky** Git hooks manage karta hai. `npm install` ke baad `prepare` script automatically chalta hai jo Husky ko setup karta hai.

### Concept 62: Pre-Commit Hook
`.husky/pre-commit`:
```bash
npm test
```
Har `git commit` se pehle ye script chalta hai. Agar tests fail hon to commit reject ho jaata hai. Ye **broken code ko repository me jaane se rokta hai**.

### Concept 63: lint-staged
```json
"lint-staged": {
  "*.ts": ["eslint --fix", "prettier --write"]
}
```
Pre-commit pe **sirf changed files** pe lint aur format run hota hai (poore codebase pe nahi). Ye fast hai — 2 second me ho jaata hai vs 30 seconds for full lint.

### Concept 64: Prettier Configuration
Frontend `package.json` me inline Prettier config:
```json
"prettier": {
  "printWidth": 100,
  "singleQuote": true,
  "overrides": [{ "files": "*.html", "options": { "parser": "angular" } }]
}
```
**printWidth: 100** — Lines 100 characters se zyada nahi hongi. **singleQuote** — Double quotes ki jagah single quotes. Angular HTML files ke liye special parser.

### Concept 65: nodemon Configuration
Backend me `nodemon.json` hai jo define karta hai:
- Kaunse files watch karne hain (`src/**/*.ts`)
- Kaunse extensions track karne hain (`.ts`)
- Restart pe kya command chalani hai (`ts-node src/server.ts`)
- Kya ignore karna hai (`node_modules`, `dist`, `tests`)

### Concept 66: tsconfig
TypeScript compiler options:
- `strict: true` — Maximum type safety
- `target: ES2022` — Modern JavaScript features use karo
- `isolatedModules: true` — Har file independently compile honi chahiye
- `strictTemplates: true` (Angular) — HTML templates me bhi type checking

### Concept 67: Path Aliases
```typescript
// Jest config me
moduleNameMapper: {
  '^@config/(.*)$': '<rootDir>/src/config/$1',
  '^@utils/(.*)$': '<rootDir>/src/utils/$1',
}
```
`import { config } from '@config/index'` likh sakte ho `'../../../config/index'` ki jagah. Cleaner imports.

---

## C. DOCKER & CONTAINERIZATION

### Concept 68: What is Docker?
Docker ek **containerization** tool hai. Container ek lightweight virtual machine jaisi cheez hai jo application ko uski saari dependencies ke saath package karti hai. "Mere machine pe chal raha hai" ka problem solve karta hai — container me same environment hota hai everywhere.

### Concept 69: Container vs Virtual Machine
```
VM:        [App] [OS] [Hypervisor]     → Heavy (GB), minutes to start
Container: [App] [Docker Engine] [Host OS] → Light (MB), seconds to start
```
Containers host OS ka kernel share karte hain. VMs apna poora OS run karte hain. Isliye containers fast hain.

### Concept 70: Docker Image
Image ek **read-only template** hai jisse container banta hai. Jaise:
- `mongo:7` — MongoDB 7 ka official image
- `redis:7-alpine` — Redis 7 (Alpine Linux based, smaller size)
- `node:22-alpine` — Node.js 22 (Alpine based)

`alpine` variants smaller hain (~50MB vs ~400MB) kyunki Alpine Linux minimal hai.

### Concept 71: Dockerfile (Production)
```dockerfile
# Stage 1: BUILD — Heavy, all devDependencies
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
COPY backend/package.json ./backend/
RUN npm install --workspace=backend
COPY backend/ ./backend/
RUN npm run build --workspace=backend

# Stage 2: PRODUCTION — Lean, only production deps
FROM node:22-alpine AS production
WORKDIR /app
COPY package.json package-lock.json* ./
COPY backend/package.json ./backend/
RUN npm install --workspace=backend --omit=dev
COPY --from=builder /app/backend/dist ./backend/dist
EXPOSE 3000
CMD ["node", "backend/dist/server.js"]
```

### Concept 72: Multi-Stage Build
Production Dockerfile me 2 stages hain:
1. **Builder stage** — TypeScript compile karta hai (needs `typescript`, `ts-node` etc.)
2. **Production stage** — Sirf compiled JS aur production deps copy karta hai

Result: Final image me `typescript`, `jest`, `prettier` etc. nahi hain. Image **~200MB** ki jagah **~100MB**.

### Concept 73: Dockerfile.dev (Development)
```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
COPY backend/package.json ./backend/
RUN npm install
COPY backend/ ./backend/
WORKDIR /app/backend
EXPOSE 3000
CMD ["npx", "nodemon"]
```
Dev Dockerfile simple hai — saari dependencies install karo, nodemon se chalo. No multi-stage needed kyunki size matter nahi karti development me.

### Concept 74: .dockerignore
`.dockerignore` file Docker ko batati hai ki kaunsi files COPY me include nahi karni:
```
node_modules
dist
.git
*.md
```
`node_modules` copy nahi karte kyunki `npm install` container ke andar fresh install karta hai (different OS ho sakta hai).

### Concept 75: WORKDIR
```dockerfile
WORKDIR /app
```
Container ke andar `/app` directory me kaam karo. Agar exist nahi karti to automatically ban jaati hai. Ye `cd /app` jaisa hai but persistent.

### Concept 76: COPY vs ADD
```dockerfile
COPY package.json ./     # Simple file copy
ADD archive.tar.gz ./    # Copy + auto-extract archives, URL support
```
Best practice: `COPY` use karo unless archive extract karna ho. `ADD` zyada "magical" hai.

### Concept 77: RUN, CMD, ENTRYPOINT
```dockerfile
RUN npm install          # Build time pe execute (image layer banta hai)
CMD ["node", "server.js"] # Container start hone pe execute (runtime)
ENTRYPOINT ["node"]      # Fixed command (CMD becomes arguments)
```
`RUN` — Image build karte waqt chalta hai. `CMD` — Container start pe chalta hai (overridable).

### Concept 78: EXPOSE
```dockerfile
EXPOSE 3000
```
Documentation hai ki container port 3000 pe listen karta hai. **Actually port expose nahi karta** — uske liye `docker run -p 3000:3000` ya `docker-compose ports` chahiye.

### Concept 79: Docker Layer Caching
Dockerfile ki har line ek "layer" banati hai. Docker layers cache karta hai:
```dockerfile
COPY package.json ./      # Layer 1 — rarely changes
RUN npm install            # Layer 2 — cached if package.json unchanged
COPY backend/ ./backend/   # Layer 3 — changes often (code changes)
```
**Trick**: `package.json` pehle copy karo, `npm install` karo, PHIR code copy karo. Agar sirf code change hua to `npm install` ka layer cached rehta hai. Build fast.

### Concept 80: docker-compose.yml
Docker Compose multiple containers ko ek file me define karta hai:
```yaml
services:
  mongo:      # Container 1
  redis:      # Container 2
  backend:    # Container 3
  frontend:   # Container 4
  nginx:      # Container 5
```
`docker compose up -d` se sab ek command me start. `-d` = detached (background me).

### Concept 81: Service: MongoDB
```yaml
mongo:
  image: mongo:7
  command: ["mongod", "--replSet", "rs0", "--bind_ip_all"]
  ports: ["27019:27017"]
  volumes: [mongo-data:/data/db, ./mongo-init.js:/docker-entrypoint-initdb.d/mongo-init.js:ro]
  healthcheck:
    test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
    interval: 10s
    timeout: 5s
    retries: 5
```
- **Replica Set**: `--replSet rs0` — Transactions ke liye mandatory
- **bind_ip_all**: Kisi bhi IP se connect allow karo
- **Init Script**: `mongo-init.js` replica set initialize karta hai
- **Health Check**: Har 10 seconds MongoDB ko ping karo

### Concept 82: Replica Set Initialization
```javascript
// mongo-init.js
rs.initiate({
  _id: 'rs0',
  members: [{ _id: 0, host: 'mongo:27017' }],
});
```
Ye script MongoDB container start hone pe chalti hai. `rs.initiate()` replica set ko "activate" karta hai. Sirf 1 member hai (single node) but transactions unlock ho jaate hain.

### Concept 83: Service: Redis
```yaml
redis:
  image: redis:7-alpine
  command: ["redis-server", "/usr/local/etc/redis/redis.conf"]
  ports: ["6381:6379"]
  volumes: [redis-data:/data, ./redis.conf:/usr/local/etc/redis/redis.conf:ro]
```
Custom config mount hoti hai. `:ro` = **read-only** — container config file modify nahi kar sakta.

### Concept 84: Redis Configuration
```
maxmemory 256mb           # Maximum 256MB RAM use karo
maxmemory-policy allkeys-lru  # Memory full hone pe LRU (Least Recently Used) keys delete karo
appendonly yes            # Disk pe data persist karo (AOF log)
appendfsync everysec      # Har second disk pe sync karo
```
`allkeys-lru` — Jab memory full ho, sabse purani unused key delete karo naye data ke liye jagah banane ke liye.

### Concept 85: Service: Backend
```yaml
backend:
  build: { context: ., dockerfile: backend/Dockerfile.dev }
  ports: ["3100:3000", "9229:9229"]
  environment: [NODE_ENV=development, MONGO_URI=mongodb://mongo:27017/...]
  depends_on:
    mongo: { condition: service_healthy }
    redis: { condition: service_healthy }
  volumes:
    - ./backend/src:/app/backend/src     # Source code mount (hot reload)
    - ./backend/uploads:/app/backend/uploads  # Uploaded files persist
```
Source code volume mount se code change karne pe container restart nahi karna padta — nodemon detect karke auto-restart karta hai.

### Concept 86: Service: Frontend
```yaml
frontend:
  build: { context: ./frontend, dockerfile: Dockerfile.dev }
  ports: ["4201:4200"]
  volumes: ["./frontend/src:/app/src"]
  depends_on: [backend]
```
Angular dev server `ng serve` chalta hai container me. Source mount se live reload hota hai.

### Concept 87: Service: Mongo Express
```yaml
mongo-express:
  image: mongo-express
  ports: ["8082:8081"]
  environment:
    ME_CONFIG_MONGODB_URL: mongodb://mongo:27017/?replicaSet=rs0
    ME_CONFIG_BASICAUTH: false
```
**Mongo Express** ek web-based MongoDB admin UI hai. `http://localhost:8082` pe jaake directly database explore kar sakte ho — documents dekho, edit karo, delete karo. Development ke liye helpful.

### Concept 88: Service: Nginx
```yaml
nginx:
  image: nginx:alpine
  ports: ["80:80"]
  volumes: ["./nginx.conf:/etc/nginx/conf.d/default.conf:ro"]
  depends_on: [backend, frontend]
```
Nginx **reverse proxy** hai — ek hi port (80) pe saari requests aati hain, Nginx decide karta hai ki kahan forward karni hai.

### Concept 89: Docker Networking
Docker Compose automatically ek **bridge network** banata hai. Saare containers ek dusre ko naam se access kar sakte hain:
```
backend → mongo:27017     (not localhost!)
backend → redis:6379
nginx → backend:3000
nginx → frontend:4200
```
Container ke andar `localhost` sirf us container ko refer karta hai, dusre containers ko nahi.

### Concept 90: Named Volumes
```yaml
volumes:
  mongo-data:      # MongoDB data
  mongo-test-data: # Test MongoDB data
  redis-data:      # Redis data
```
Named volumes Docker manage karta hai. Container delete hone pe bhi data rehta hai. `docker compose down -v` se volumes bhi delete hote hain.

### Concept 91: docker compose up -d
```bash
docker compose up -d      # Start all services in background
docker compose down        # Stop all, keep volumes
docker compose down -v     # Stop all, DELETE volumes (data loss!)
docker compose logs -f backend  # Follow backend logs
docker compose ps          # List running containers
docker compose restart backend  # Restart specific service
```

### Concept 92: Docker Compose Override Files
```bash
docker compose -f docker-compose.yml -f docker-compose.test.yml up
docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d
```
Multiple compose files merge hote hain. `docker-compose.test.yml` test-specific overrides add karta hai. `docker-compose.monitoring.yml` Prometheus + Grafana add karta hai.

### Concept 93: Build Context
```yaml
backend:
  build:
    context: .                    # Root directory as build context
    dockerfile: backend/Dockerfile.dev
```
`context: .` — Docker daemon ko root directory ki saari files bhejta hai. Dockerfile us context ke relative COPY karta hai.

### Concept 94: Container Restart Policy
```yaml
restart: unless-stopped
```
Options:
- `no` — Kabhi restart nahi (default)
- `always` — Hamesha restart karo (even manual stop ke baad)
- `unless-stopped` — Restart karo, unless manually stop kiya
- `on-failure` — Sirf crash pe restart karo

### Concept 95: Health Checks
```yaml
healthcheck:
  test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
  interval: 10s    # Har 10 sec check karo
  timeout: 5s      # 5 sec me respond nahi kiya → unhealthy
  retries: 5       # 5 baar fail hone ke baad unhealthy mark
```
Health check Docker ko batata hai ki container actually kaam kar raha hai ya nahi. `depends_on: condition: service_healthy` isi pe depend karta hai.

### Concept 96: Test MongoDB Container
```yaml
mongo-test:
  image: mongo:7
  ports: ["27020:27017"]
```
Separate MongoDB instance tests ke liye. Test data production data ko corrupt nahi karega. Port 27020 pe accessible.

### Concept 97: Environment Variables in Docker Compose
```yaml
environment:
  - NODE_ENV=development                              # Direct value
  - SHIPROCKET_EMAIL=${SHIPROCKET_EMAIL:-}            # From host .env, default empty
  - MONGO_URI=mongodb://mongo:27017/rajhans-tea       # Container name as hostname
```
`${VAR:-default}` — Host ki env var use karo, nahi mile to default. `mongo` hostname Docker network ke through resolve hota hai.

### Concept 98: Volume Mount Modes
```yaml
volumes:
  - ./config.js:/app/config.js:ro    # :ro = Read Only
  - ./src:/app/src                    # Read-Write (default)
  - mongo-data:/data/db              # Named volume
```
`:ro` important hai config files ke liye — container accidentally modify na kare.

### Concept 99: Docker Compose for Different Environments
```bash
# Development
npm run docker:dev        # → docker compose up -d

# Testing
npm run docker:test       # → docker compose -f ... -f docker-compose.test.yml up

# Monitoring
npm run docker:monitoring # → docker compose -f ... -f docker-compose.monitoring.yml up -d

# Cleanup
npm run docker:down       # → docker compose down -v
```

### Concept 100: Container Logs
```bash
docker compose logs -f backend     # Follow backend logs (like tail -f)
docker compose logs --tail=100 mongo  # Last 100 lines of mongo logs
docker logs rajhans-tea-backend    # By container name
```
Debugging ke liye logs dekhna essential hai. `-f` flag real-time output dikhata hai.

---

## D. NGINX REVERSE PROXY

### Concept 101: What is a Reverse Proxy?
Normal proxy: Client → Proxy → Internet (hides client)
**Reverse** proxy: Internet → Nginx → Backend (hides backend)

Client ko sirf Nginx ka address pata hai. Backend servers internal network pe hidden hain. Nginx decide karta hai ki request kahan forward karni hai.

### Concept 102: Upstream Blocks
```nginx
upstream backend {
    server backend:3000;
    keepalive 32;
}
upstream frontend {
    server frontend:4200;
}
```
`upstream` ek pool of servers define karta hai. `keepalive 32` — 32 persistent connections maintain karo. Har request pe naya TCP connection banana expensive hai, persistent connections fast hain.

### Concept 103: Location Routing
```nginx
location /api     → backend (Express)
location /socket.io → backend (WebSocket)
location /uploads → backend (static files)
location /metrics → backend (Prometheus)
location /        → frontend (Angular)
```
Nginx URL pattern dekh ke decide karta hai ki kaunsa upstream handle karega. Ye **single entry point** pattern hai.

### Concept 104: Gzip Compression
```nginx
gzip on;
gzip_vary on;
gzip_min_length 256;
gzip_comp_level 4;
gzip_types text/plain application/json application/javascript text/css;
```
- `gzip on` — Compression enable karo
- `gzip_min_length 256` — 256 bytes se chhoti files compress nahi karo (overhead zyada hoga)
- `gzip_comp_level 4` — 1-9 scale (4 = good balance of speed vs compression)
- `gzip_vary` — Cache ko batao ki compressed aur uncompressed versions alag hain

### Concept 105: Proxy Cache
```nginx
proxy_cache_path /tmp/nginx-cache levels=1:2 keys_zone=api_cache:10m max_size=100m inactive=10m;
```
Nginx API responses cache kar sakta hai:
- `keys_zone=api_cache:10m` — 10MB memory for cache keys
- `max_size=100m` — Maximum 100MB disk cache
- `inactive=10m` — 10 min me access nahi hua to delete
- `levels=1:2` — Cache directory structure (performance optimization)

### Concept 106: API Proxy Configuration
```nginx
location /api {
    proxy_pass http://backend;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Request-ID $request_id;
    proxy_buffering on;
    proxy_connect_timeout 10s;
    proxy_read_timeout 30s;
}
```
Key headers:
- `X-Real-IP` — Client ka actual IP (Nginx ke peeche backend ko original IP pata chale)
- `X-Forwarded-For` — Proxy chain me saare IPs
- `X-Request-ID` — Unique request tracking ID

### Concept 107: WebSocket Proxy
```nginx
location /socket.io {
    proxy_pass http://backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 86400s;  # 24 hours
}
```
WebSocket ke liye special headers chahiye — `Upgrade` aur `Connection: upgrade`. HTTP se WebSocket protocol me "upgrade" hota hai. Timeout 24 hours hai kyunki WebSocket connections long-lived hain.

### Concept 108: Static File Caching
```nginx
location /uploads {
    proxy_pass http://backend;
    expires 7d;
    add_header Cache-Control "public, immutable";
}
```
Uploaded images 7 din ke liye browser cache me rehti hain. `immutable` — Browser ko batao ki ye file kabhi change nahi hogi, revalidate mat karo. Product image upload ke baad change nahi hoti.

### Concept 109: Security Headers in Nginx
```nginx
add_header X-Content-Type-Options nosniff always;
add_header X-Frame-Options SAMEORIGIN always;
```
`always` — Error responses pe bhi ye headers add karo. Helmet + Nginx dono security headers add karte hain — defense in depth (multiple layers).

### Concept 110: Client Max Body Size
```nginx
client_max_body_size 10m;
```
Maximum 10MB upload allowed. Isse bada file upload karne pe `413 Request Entity Too Large` error. Product images usually 2-5MB hoti hain.

### Concept 111: Proxy Buffering
```nginx
proxy_buffering on;
proxy_buffer_size 8k;
proxy_buffers 8 8k;
```
Nginx backend ka response pehle apne buffer me collect karta hai, phir ek baar me client ko bhejta hai. Bina buffering ke, Nginx client ki slow speed pe backend connection hold karta (backend busy rehta). Buffering se backend jaldi free ho jaata hai.

### Concept 112: Proxy Timeouts
```nginx
proxy_connect_timeout 10s;   # Backend se connection establish karne ka time
proxy_read_timeout 30s;      # Backend se response aane ka time
proxy_send_timeout 30s;      # Client ko response bhejne ka time
```
Agar 30 seconds me backend respond nahi karta, Nginx 504 Gateway Timeout return karta hai.

### Concept 113: Frontend Proxy with WebSocket
```nginx
location / {
    proxy_pass http://frontend;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```
Angular dev server bhi WebSocket use karta hai hot-reload ke liye (browser ko batane ke liye ki file change hui). Isliye Upgrade headers frontend proxy me bhi chahiye.

### Concept 114: Nginx as Load Balancer (Future)
```nginx
upstream backend {
    server backend1:3000;
    server backend2:3000;
    server backend3:3000;
}
```
Jab multiple backend instances hon, Nginx automatically requests distribute karta hai (round-robin by default). Abhi 1 instance hai, future me scale hoga.

### Concept 115: Why Nginx over Express for Static Files?
Express `static` middleware file serve kar sakta hai. Lekin Nginx C me written hai aur static file serving ke liye heavily optimized hai — 10x faster than Node.js. Production me Nginx static files handle karta hai, Express sirf API requests.

---

## E. MONGODB INFRASTRUCTURE

### Concept 116: MongoDB = Document Database
MongoDB relational database (MySQL, PostgreSQL) se alag hai. Data **documents** me store hota hai (JSON-like format called BSON):
```json
{
  "_id": "ObjectId('65a1b2c3d4e5f6')",
  "name": "Assam Gold Tea",
  "price": 499,
  "tags": ["premium", "black-tea"],
  "attributes": { "weight": "250g", "origin": "Assam" }
}
```
**No fixed schema at DB level** — ek document me 5 fields ho sakte hain, dusre me 10. (Mongoose application level pe schema enforce karta hai.)

### Concept 117: Mongoose ODM
**ODM** = Object Document Mapper. Jaise SQL databases ke liye ORM (Sequelize, TypeORM) hota hai, MongoDB ke liye Mongoose hai.

Mongoose kya karta hai:
1. **Schema define karta hai** — Fields, types, required, default values
2. **Validation** — Data save hone se pehle check
3. **Hooks** — Pre/post save, find, update operations pe code run
4. **Query building** — `Product.find({ price: { $lt: 500 } })`
5. **Population** — References ko resolve karta hai (like SQL JOINs)

### Concept 118: Replica Set
**Replica Set** MongoDB ka high-availability mechanism hai:
```
Primary ←→ Secondary ←→ Secondary
  ↑ writes    reads       reads
```
Normally multiple nodes hote hain. Agar Primary crash ho, ek Secondary automatically Primary ban jaata hai. Is project me **single-node replica set** hai — high availability nahi, but **transactions** unlock hoti hain.

### Concept 119: Why Replica Set for Transactions?
MongoDB transactions (atomic operations — sab karo ya kuch mat karo) sirf replica set me kaam karti hain. Example:
```
Payment capture hone pe:
1. Payment status update karo → "captured"
2. Stock deduct karo → -5 units
3. Order create karo
```
Agar step 2 fail ho to step 1 bhi rollback hona chahiye. Transaction bina replica set ke possible nahi.

### Concept 120: Connection String
```
mongodb://mongo:27017/rajhans-tea?replicaSet=rs0
```
- `mongodb://` — Protocol
- `mongo` — Hostname (Docker container name)
- `27017` — Port
- `rajhans-tea` — Database name
- `?replicaSet=rs0` — Replica set name (mandatory for transactions)

Production me Atlas ka URI alag hoga: `mongodb+srv://user:pass@cluster.mongodb.net/rajhans-tea`

### Concept 121: MongoDB Indexes
Indexes database queries fast karte hain (like book ke index se page dhundna):
```typescript
// Product model me
schema.index({ name: 'text', description: 'text', tags: 'text' }); // Full-text search
schema.index({ slug: 1 }, { unique: true }); // Unique slug, fast lookup
schema.index({ category: 1, status: 1 }); // Compound index for filtering
```
**Bina index ke**: MongoDB har document scan karta hai (100K documents = slow). **Index ke saath**: Tree structure me directly jump karta hai.

### Concept 122: TTL Index
```typescript
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
```
**Time-To-Live** index — MongoDB automatically documents delete kar deta hai jab `expiresAt` time guzar jaye. Stock reservations (15 min), refresh tokens (7 days) me use hota hai. Cron job ki zarurat nahi — MongoDB khud clean up karta hai.

### Concept 123: Mongoose Connection Events
```typescript
mongoose.connection.on('error', (error) => { /* log */ });
mongoose.connection.on('disconnected', () => { /* log warning */ });
```
Connection drop hone pe Mongoose automatically reconnect try karta hai. Events se hume pata chalta hai ki kab connection tuta aur kab wapas hua.

### Concept 124: MongoDB Atlas (Production)
Development me local Docker MongoDB chalti hai. Production me **MongoDB Atlas** — MongoDB ki managed cloud service:
- Auto-scaling (load badhne pe resources badhao)
- Automated backups
- Built-in monitoring dashboard
- Replica set automatically managed
- M10 tier se start (~$57/month), M30 tak scale

### Concept 125: ObjectId
Har MongoDB document ka `_id` field ek **ObjectId** hai:
```
65a1b2c3 d4e5 f678 90ab cdef
│         │    │    │
Timestamp  Machine Process Counter
(4 bytes)  (3b)   (2b)   (3b)
```
- Unique globally without coordination
- Sortable by creation time
- 12 bytes (24 hex characters)

### Concept 126: BSON
MongoDB internally **BSON** (Binary JSON) format me data store karta hai. JSON se alag kya hai:
- Binary format (faster to parse)
- Extra types support: `Date`, `ObjectId`, `Decimal128`, `Binary`
- Size-prefixed (length pata hai, fast skip)

### Concept 127: Mongo Express UI
`http://localhost:8082` pe web-based UI milta hai:
- Databases list dekho
- Collections (tables) browse karo
- Documents (rows) dekho, edit karo, delete karo
- Queries run karo
- Indexes dekho

Development me bahut useful — SQL workbench jaisa.

---

## F. REDIS INFRASTRUCTURE

### Concept 128: What is Redis?
Redis = **Re**mote **Di**ctionary **S**erver. Ye ek **in-memory** key-value store hai — data RAM me rehta hai (disk pe nahi), isliye bahut fast hai (microseconds me response).

Use cases is project me:
1. **Caching** — API responses cache karo
2. **Session storage** — Rate limiting counters
3. **BullMQ backend** — Job queues ka data
4. **Pub/Sub** — Real-time events (future)

### Concept 129: Redis Data Types
```
String:  SET user:123 "Rahul"           → GET user:123
Hash:    HSET product:456 name "Tea"    → HGET product:456 name
List:    LPUSH queue:jobs "job-data"    → RPOP queue:jobs
Set:     SADD online-users "user:123"   → SMEMBERS online-users
Sorted:  ZADD leaderboard 100 "user:1" → ZRANGE leaderboard 0 10
```
BullMQ internally Redis Lists aur Sorted Sets use karta hai job management ke liye.

### Concept 130: Redis as Cache
```typescript
// cache-response middleware
const cached = await redis.get(`cache:${url}`);
if (cached) return res.json(JSON.parse(cached)); // Cache HIT

// Normal response...
await redis.setex(`cache:${url}`, 300, JSON.stringify(data)); // Cache for 5 min
```
Product listing jaise requests baar baar same data return karti hain. Cache se MongoDB query skip hoti hai — response 100x faster.

### Concept 131: LRU Eviction Policy
```
maxmemory 256mb
maxmemory-policy allkeys-lru
```
Jab 256MB full ho jaye, Redis **LRU (Least Recently Used)** policy se sabse purani unused keys automatically delete karta hai naye data ke liye jagah banane ke liye.

**Production note**: BullMQ ke liye `noeviction` policy chahiye (jobs delete nahi honi chahiye). Separate Redis instances use karna better.

### Concept 132: Redis Persistence (AOF)
```
appendonly yes
appendfsync everysec
```
**AOF = Append Only File**. Har write operation ek log file me append hoti hai. Redis restart hone pe ye log replay karke data restore karta hai. `everysec` — Har second disk pe flush karo (maximum 1 second ka data loss).

### Concept 133: ioredis Client
```typescript
const redisClient = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    if (times > 3) return null;  // Stop retrying
    return Math.min(times * 200, 2000); // Exponential backoff
  },
});
```
`ioredis` Node.js ka popular Redis client hai. **Retry strategy**: Connection fail hone pe 200ms, 400ms, 600ms baad retry karo. 3 baar ke baad band karo.

### Concept 134: Redis Event Handlers
```typescript
redisClient.on('connect', () => logger.info('Redis connected'));
redisClient.on('error', (error) => logger.error('Redis error'));
```
Redis connection asynchronous hai — events se pata chalta hai ki connection successful hua ya fail.

### Concept 135: Separate BullMQ Connection
```typescript
// redis.loader.ts — General purpose Redis client
// bullmq.loader.ts — Dedicated BullMQ Redis connection
```
BullMQ ko `maxRetriesPerRequest: null` chahiye (infinite retries) aur `enableReadyCheck: false`. General Redis client ke liye ye settings different hain. Isliye 2 alag connections hain.

### Concept 136: Redis for Rate Limiting
```typescript
import RedisStore from 'rate-limit-redis';
```
Rate limiter Redis me counter store karta hai. Key = IP address, Value = request count. Har request pe increment. Window expire hone pe key automatically delete (TTL). Multiple backend instances me bhi kaam karta hai kyunki Redis centralized hai.

---

## G. BULLMQ JOB QUEUE SYSTEM

### Concept 137: What is a Job Queue?
Imagine restaurant me: Waiter order le ke kitchen me de deta hai (enqueue), cook jab free hota hai tab banata hai (dequeue). Customer ko wait karna padta hai par waiter free ho gaya next customer ke liye.

Same concept: HTTP request aati hai, backend job queue me task daal deta hai (invoice banao), user ko turant response milta hai, background worker invoice baad me banata hai.

### Concept 138: BullMQ Architecture
```
Producer (API)  →  Queue (Redis)  →  Worker (Processor)
"Generate PDF"  →  [Job1, Job2...]  →  Actually generates PDF
```
- **Producer**: Job create karta hai (controller/service)
- **Queue**: Redis me stored list of pending jobs
- **Worker**: Continuously queue check karta hai, job pick karke process karta hai

### Concept 139: Queue Types in This Project
6 job queues hain:
```
payment     → Payment timeout verification (30 min delay)
invoice     → PDF invoice generation + email
wallet      → Wallet credit/debit operations
fulfillment → Order creation from payment, stock deduction
promotions  → Loyalty points, referral completion
reviews     → Review moderation, spam detection
```

### Concept 140: Worker Registration
```typescript
// server.ts startup
registerWorkers();

// start-workers.ts
export const registerWorkers = (): void => {
  startPaymentWorker();
  startInvoiceWorker();
  startWalletWorker();
  startFulfillmentWorker();
  startPromotionsWorker();
  startReviewsWorker();
};
```
Server start pe saare workers register hote hain. Har worker apni queue ko continuously poll karta hai naye jobs ke liye.

### Concept 141: Job Options
```typescript
await queue.add('fulfillment:create-order', { paymentId }, {
  attempts: 3,                              // Maximum 3 tries
  backoff: { type: 'exponential', delay: 5000 }, // Retry after 5s, 10s, 20s
});
```
- **attempts**: Kitni baar retry karo fail hone pe
- **backoff**: Retry ke beech kitna wait karo
- **exponential**: Har retry pe delay double (5s → 10s → 20s)
- **delay**: Job ko immediately nahi, X ms baad process karo

### Concept 142: Exponential Backoff
```
Attempt 1 fails → Wait 5 seconds
Attempt 2 fails → Wait 10 seconds (5 × 2)
Attempt 3 fails → Wait 20 seconds (5 × 4)
```
Kyu? Agar external service (Razorpay, Shiprocket) down hai, baar baar turant retry karna uspe load badhata hai. Delay se service ko recover hone ka time milta hai.

### Concept 143: Dead Letter Queue (DLQ)
```typescript
// dlq-hook.ts
worker.on('failed', async (job, err) => {
  if (job.attemptsMade >= maxAttempts) {
    logger.warn({ jobName: job.name, error: err.message }, 'Job → DLQ');
  }
});
```
Jab job saari retries exhaust kar le, wo **dead letter queue** me jaati hai. Admin dashboard pe ye failed jobs dikhai deti hain. Manual investigation hoti hai — kya galat hua? Fix karke re-run karo.

### Concept 144: BullMQ Connection Options
```typescript
getBullMQConnectionOpts = () => ({
  host: config.redis.host,
  port: config.redis.port,
  maxRetriesPerRequest: null, // REQUIRED by BullMQ — infinite retries
  enableReadyCheck: false,    // Skip Redis READY check
});
```
BullMQ apni internally Redis connections manage karta hai. `maxRetriesPerRequest: null` BullMQ ka requirement hai — agar Redis temporarily unavailable ho to BullMQ indefinitely retry kare.

### Concept 145: Worker Lifecycle
```typescript
// Startup
const worker = new Worker('payment', processor, { connection: ... });

// Running — continuously polls queue
// ...processes jobs...

// Shutdown (graceful)
await worker.close(); // Current job complete hone do, phir stop
```
Graceful shutdown me `closeWorkers()` call hota hai — saare running jobs complete hone deta hai before exit.

### Concept 146: Event Handler → Queue Dispatch Flow
Payment capture hone pe poora flow:
```
1. PaymentService.verify() → payment captured
2. eventBus.emit('payment.captured', { paymentId, userId, amount })
3. event-handlers.ts catches event
4. Dispatches to 3 queues:
   - fulfillment queue (create order)
   - invoice queue (generate PDF)
   - promotions queue (earn loyalty + complete referral)
5. Workers pick up jobs asynchronously
```

### Concept 147: Job Idempotency
Wallet credit job me idempotency hai — agar same job dobara run ho (retry), duplicate credit nahi dega. Payment ID check karta hai ki is payment ka credit already hua hai kya.

### Concept 148: Delayed Jobs
```typescript
await paymentQueue.add('verify-timeout', { paymentId }, {
  delay: 30 * 60 * 1000, // 30 minutes delay
});
```
Payment create hone ke 30 min baad check karta hai ki payment verify hui ya nahi. Agar nahi, status "failed" mark karta hai. Ye **abandoned checkout cleanup** hai.

---

## H. SERVER STARTUP & LOADER SYSTEM

### Concept 149: Initialization Order
```typescript
const startServer = async () => {
  validateEnvironment();       // 1. Env vars check
  registerGlobalErrorHandlers(); // 2. Crash handlers
  await initializeLoaders();   // 3. Connect to all services
  registerWorkers();           // 4. Start job processors
  registerEventHandlers();     // 5. Wire cross-module events
  // 6. Create HTTP + WebSocket server
  // 7. Listen on port
};
```
Order critical hai — workers DB chahiye, events queues chahiye, isliye loaders pehle.

### Concept 150: Environment Validation
```typescript
const ENV_VARS = [
  { name: 'MONGO_URI', required: true },
  { name: 'JWT_ACCESS_SECRET', required: true },
  { name: 'RAZORPAY_KEY_ID', required: false }, // Optional — warn if missing
];
```
Startup pe sabse pehle check: saare required env vars set hain kya? Production me missing → crash. Development me → warning aur continue.

### Concept 151: Global Error Handlers
```typescript
process.on('uncaughtException', (err) => {
  // Log → wait 3s → exit (PM2 restarts)
});
process.on('unhandledRejection', (reason) => {
  // Log but DON'T crash — most rejections are recoverable
});
```
- **uncaughtException**: Synchronous throw jo kisi ne catch nahi kiya → FATAL, must exit
- **unhandledRejection**: Async promise reject jo catch nahi hua → Log, don't crash

### Concept 152: Memory Leak Detection
```typescript
const HEAP_LIMIT_MB = 450;
setInterval(() => {
  const heapUsedMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  if (heapUsedMB > HEAP_LIMIT_MB) {
    logger.warn({ heapUsedMB }, 'HIGH MEMORY USAGE — potential leak');
  }
}, 60000); // Check every minute
```
Har minute memory check. 450MB se zyada ho to warning log. Memory leaks slowly build up — early warning se pata chal jaata hai before crash.

### Concept 153: Firebase Initialization (3 Priority Modes)
```typescript
// Priority 1: JSON file (development — docker volume mount)
if (serviceAccountPath && fs.existsSync(serviceAccountPath)) { ... }

// Priority 2: Base64 env var (production — no file on server)
if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) { ... }

// Priority 3: GCP auto-detection
if (process.env.GOOGLE_APPLICATION_CREDENTIALS) { ... }

// Fallback: Skip in dev (phone auth won't work)
```
3 tarike se Firebase credentials provide kar sakte ho. Production me Base64 env var best hai — file upload ki zarurat nahi, env var set karo.

### Concept 154: Socket.io Initialization
```typescript
const io = new Server(httpServer, {
  cors: { origin: config.cors.origin, credentials: true },
  path: '/socket.io',
});
```
Socket.io HTTP server ke upar mount hota hai. Same port (3000) pe HTTP aur WebSocket dono handle hote hain. `path: '/socket.io'` — Nginx isi path pe WebSocket traffic route karta hai.

### Concept 155: WebSocket Authentication
```typescript
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  const payload = jwt.verify(token, config.jwt.accessSecret);
  socket.userId = payload.userId;
  next();
});
```
WebSocket connection establish hone se pehle JWT verify hota hai. Bina valid token ke connection reject. Ye middleware pattern hai — HTTP interceptors jaisa.

### Concept 156: User-Socket Mapping
```typescript
const userSockets = new Map<string, Set<string>>();
// user:123 → { socketId_1, socketId_2 } (2 tabs open)
```
Ek user ke multiple tabs/devices open ho sakte hain. Map track karta hai ki kaunse socket IDs kaunse user ke hain. `emitToUser(userId, event, data)` saare tabs/devices pe notification bhejta hai.

### Concept 157: Socket.io Rooms
```typescript
socket.join(`user:${userId}`);
// Later:
io.to(`user:${userId}`).emit('order-status', { ... });
```
Room ek logical group hai. User join karta hai apne room me, server room me message bhejta hai — automatically saare members ko jaata hai.

### Concept 158: Prometheus Metrics Initialization
```typescript
client.collectDefaultMetrics({ prefix: 'rajhans_tea_' });
```
**Prometheus** ek time-series metrics database hai. `collectDefaultMetrics` automatically track karta hai:
- CPU usage
- Memory usage (heap, RSS)
- Event loop lag
- Active handles/requests
- Garbage collection stats

Sab metrics `rajhans_tea_` prefix ke saath store hoti hain.

---

## I. ENVIRONMENT & CONFIGURATION

### Concept 159: Centralized Config
```typescript
// config/index.ts
export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  mongo: { uri: process.env.MONGO_URI || 'mongodb://localhost:27017/...' },
  jwt: { accessSecret: process.env.JWT_ACCESS_SECRET || 'dev-secret' },
  // ...
} as const;
```
Poore application me `config.jwt.accessSecret` use hota hai, direct `process.env.JWT_ACCESS_SECRET` nahi. Benefits:
1. Default values ek jagah defined
2. Type safety (TypeScript auto-complete)
3. Easy to test (config mock kar sakte ho)

### Concept 160: Environment Variable Categories
```
CORE:         NODE_ENV, PORT
DATABASE:     MONGO_URI, REDIS_HOST, REDIS_PORT
AUTH:         JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, JWT_ACCESS_EXPIRY
SECURITY:     CORS_ORIGIN, RATE_LIMIT_*
FIREBASE:     FIREBASE_PROJECT_ID, GOOGLE_APPLICATION_CREDENTIALS
PAYMENTS:     RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET
EMAIL:        SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
SMS:          SMS_PROVIDER, MSG91_AUTH_KEY, MSG91_SENDER_ID
SHIPPING:     SHIPPING_PROVIDER, SHIPROCKET_EMAIL, SHIPROCKET_PASSWORD
LOGGING:      LOG_LEVEL
```

### Concept 161: dotenv
```typescript
import dotenv from 'dotenv';
dotenv.config();
```
`.env` file se environment variables load karta hai. Development me `.env` file me secrets rakhte hain. Production me actual env vars set hote hain (Docker, PM2, cloud provider).

### Concept 162: .env vs .env.example
- `.env` — Actual secrets (NEVER commit to Git, `.gitignore` me hona chahiye)
- `.env.example` — Template with dummy values (committed to Git, new developers ke liye)

### Concept 163: Default Values
```typescript
port: parseInt(process.env.PORT || '3000', 10),
```
Agar `PORT` env var set nahi hai, default 3000 use hoga. `parseInt(..., 10)` string ko number me convert karta hai (base 10).

### Concept 164: JWT Configuration
```typescript
jwt: {
  accessSecret: '...',
  refreshSecret: '...',   // DIFFERENT secret than access
  accessExpiry: '15m',    // 15 minutes
  refreshExpiry: '7d',    // 7 days
}
```
2 alag secrets kyun? Agar access token ka secret leak ho jaye, refresh tokens still safe hain. Minimum exposure.

### Concept 165: Rate Limit Configuration
```typescript
rateLimit: {
  windowMs: 60000,        // 1 minute window
  maxRequests: 100,       // 100 requests per minute (general)
  authMaxRequests: 10,    // 10 requests per minute (auth endpoints)
}
```
Auth endpoints pe strict limit (OTP brute force prevention). General endpoints pe lenient limit.

---

## J. CI/CD PIPELINE

### Concept 166: What is CI/CD?
- **CI** (Continuous Integration) — Har push pe automatically code quality check, tests run, build verify
- **CD** (Continuous Delivery/Deployment) — Successful CI ke baad automatically deploy

Is project me CI hai (GitHub Actions), CD manually hota hai (PM2/Docker deploy).

### Concept 167: GitHub Actions
GitHub ka built-in CI/CD service. `.github/workflows/ci.yml` file read karke GitHub ke cloud servers ("runners") pe commands execute karta hai. Free for public repos, limited free minutes for private.

### Concept 168: Workflow Triggers
```yaml
on:
  push:
    branches: [master]
  pull_request:
    branches: [master]
```
CI pipeline tab chalta hai jab:
1. Koi `master` branch pe push kare
2. Koi `master` ke against Pull Request open/update kare

### Concept 169: Concurrency Control
```yaml
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
```
Agar ek PR pe 2 pushes jaldi jaldi hon, purana CI run cancel ho jaata hai aur naya start hota hai. CI minutes save hote hain.

### Concept 170: Job 1 — Code Quality
```yaml
quality:
  steps:
    - Checkout code (git clone)
    - Setup Node.js 22 (with npm cache)
    - npm ci (clean install)
    - TypeScript type check (tsc --noEmit)
    - ESLint (code pattern check)
    - Prettier format check (--check, no auto-fix)
```
Fastest job (~1 min). Typos, type errors, formatting issues turant pakadta hai.

### Concept 171: Job 2 — Unit Tests
```yaml
unit-tests:
  steps:
    - Checkout + Setup + Install
    - Run unit tests with coverage
    - Upload coverage report as artifact
  env:
    NODE_ENV: test
    JWT_ACCESS_SECRET: test-secret    # Dummy values (no real services hit)
```
Unit tests real database nahi hit karte — dependencies mocked hain. Fast (~2 min).

### Concept 172: Job 3 — Integration Tests
```yaml
integration-tests:
  steps:
    - Checkout + Setup + Install
    - Start MongoDB Docker container with replica set
    - Start Redis Docker container
    - Run integration tests (--runInBand)
  env:
    MONGO_TEST_URI: mongodb://localhost:27017/rajhans-tea-test?replicaSet=rs0
```
Real MongoDB + Redis containers spin up hote hain CI me. Tests actual DB queries run karte hain. `--runInBand` — Serial execution (tests parallel me chalein to DB conflicts hon).

### Concept 173: Job 4 — Build & Security Audit
```yaml
build-and-security:
  steps:
    - Checkout + Setup + Install
    - TypeScript full build (tsc → dist/)
    - npm audit --audit-level=high
```
Build verify karta hai ki compiled code valid hai. `npm audit` dependencies me known security vulnerabilities check karta hai.

### Concept 174: Parallel Job Execution
```
quality ─────┐
unit-tests ──┤ ALL RUN IN PARALLEL
integration ─┤ Total time = slowest job (not sum)
build ───────┘
```
4 jobs simultaneously chalta hain alag alag machines pe. Agar quality 1 min, unit-tests 3 min, integration 5 min, build 2 min → Total CI time = 5 min (not 11 min).

### Concept 175: npm ci in CI
```yaml
- name: Install dependencies
  run: npm ci
```
`npm install` nahi, `npm ci` kyunki:
1. `package-lock.json` se exact versions install (reproducible)
2. Faster (skips dependency resolution)
3. Clean state (deletes existing node_modules)
4. Fails if lock file out of sync with package.json

### Concept 176: Node.js Version Caching
```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '22'
    cache: 'npm'
    cache-dependency-path: package-lock.json
```
`cache: 'npm'` — npm cache save hoti hai between CI runs. Subsequent runs me `npm ci` faster hota hai kyunki packages already cached hain.

### Concept 177: Test Environment Variables in CI
```yaml
env:
  NODE_ENV: test
  JWT_ACCESS_SECRET: test-access-secret-for-ci
  FIREBASE_PROJECT_ID: test-project
```
CI me real secrets nahi use hote. Dummy values sufficient hain kyunki:
- Unit tests mock everything
- Integration tests real DB hit karte hain but fake tokens use karte hain

### Concept 178: Coverage Artifacts
```yaml
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: unit-coverage-report
    path: backend/coverage/
    retention-days: 7
```
Coverage HTML report GitHub pe downloadable artifact ke roop me save hota hai. `if: always()` — Tests fail bhi hon to bhi report upload ho.

### Concept 179: Security Audit
```yaml
- name: Security audit
  run: npm audit --audit-level=high
```
`--audit-level=high` — Sirf HIGH aur CRITICAL vulnerabilities pe fail. Low/Moderate ignore (too noisy). Enterprise me quarterly moderate review hota hai.

### Concept 180: Why Separate Quality + Tests?
Quality check (lint, typecheck, format) ~1 min me hota hai. Agar typo hai to turant pata chal jaata hai bina 5 min integration tests wait kiye. Fast feedback loop.

---

## K. MONITORING, LOGGING & OBSERVABILITY

### Concept 181: Three Pillars of Observability
1. **Logs** — Events ki detailed record (Pino)
2. **Metrics** — Numerical measurements over time (Prometheus)
3. **Traces** — Request ka end-to-end journey (Request Tracer)

### Concept 182: Structured Logging (Pino)
```typescript
import pino from 'pino';
export const logger = pino({ level: config.log.level });

// Usage
logger.info({ userId, paymentId }, 'Payment captured');
logger.error({ err: error.message, stack: error.stack }, 'DB query failed');
```
Pino **structured JSON logs** produce karta hai:
```json
{"level":30,"time":1703123456789,"userId":"abc","paymentId":"xyz","msg":"Payment captured"}
```
JSON format machine-parsable hai — log aggregation tools (ELK, Datadog) automatically fields extract kar sakte hain.

### Concept 183: Log Levels
```
FATAL (60) → Application crash, must restart
ERROR (50) → Something failed but app continues
WARN  (40) → Unusual situation, not critical
INFO  (30) → Normal operation milestones
DEBUG (20) → Detailed troubleshooting info
TRACE (10) → Very granular (rarely used)
```
Production me `LOG_LEVEL=info` (debug skip). Development me `LOG_LEVEL=debug` (everything).

### Concept 184: pino-pretty
Development me JSON logs hard to read hain. `pino-pretty` dev dependency beautiful formatted output deta hai:
```
[14:30:45] INFO: Payment captured
    userId: "abc"
    paymentId: "xyz"
```
Production me pretty formatting nahi — raw JSON efficient hai.

### Concept 185: Request ID Logging
```typescript
// Middleware adds requestId
req.requestId = uuid();
// All subsequent logs include it
logger.info({ requestId: req.requestId }, 'Processing...');
```
Ek request ke saare logs same `requestId` se correlated hain. Bug report aaye to: "Request ID de do" → us ID ke saare logs filter karo → poora flow dekho.

### Concept 186: Request Logger Middleware
```
→ POST /api/v1/payments/orders 200 45ms
→ GET /api/v1/catalog/products 200 12ms
→ POST /api/v1/auth/verify-token 401 3ms
```
Har HTTP request automatically log hoti hai: method, URL, status code, response time. Slow requests (>1s) identify karna easy.

### Concept 187: Prometheus Metrics
Prometheus ek **time-series database** hai jo metrics collect karta hai:
- `rajhans_tea_http_request_duration_seconds` — API response times
- `rajhans_tea_http_requests_total` — Total request count by status code
- `rajhans_tea_nodejs_heap_used_bytes` — Memory usage
- `rajhans_tea_nodejs_active_handles` — Active I/O handles

### Concept 188: Metrics Endpoint
```
GET /metrics → Prometheus text format
# TYPE rajhans_tea_http_request_duration_seconds histogram
rajhans_tea_http_request_duration_seconds_bucket{le="0.1"} 4523
rajhans_tea_http_request_duration_seconds_bucket{le="0.5"} 4890
```
Prometheus server periodically `/metrics` scrape karta hai (pull model). Grafana dashboard pe visualize hota hai.

### Concept 189: Grafana Dashboards
Grafana = Metrics visualization tool. Prometheus se data fetch karke beautiful dashboards banata hai:
- API latency graphs
- Request rate charts
- Error rate alerts
- Memory/CPU usage
- Queue depth (BullMQ jobs pending)

### Concept 190: Request Tracer (Distributed Tracing)
```typescript
const store = new AsyncLocalStorage<{ traceId: string }>();

requestTracer.run(traceId, () => next());
// Anywhere in code:
const traceId = requestTracer.getTraceId();
```
**AsyncLocalStorage** Node.js ka feature hai jo data propagate karta hai through async call chain. Ek request ke andar kahi bhi `getTraceId()` call karo — same ID milegi. BullMQ jobs me bhi propagate hota hai.

### Concept 191: Observability Middleware
Trace context headers add karta hai (`X-Trace-ID`) aur request latency record karta hai. External services ko call karte waqt trace ID forward hota hai — end-to-end tracing.

### Concept 192: Metrics Middleware
```typescript
// Records for every HTTP request:
// - Method (GET/POST/PUT/DELETE)
// - Route pattern (/api/v1/products/:id)
// - Status code (200, 404, 500)
// - Duration (milliseconds)
```
Ye data Prometheus me jaata hai. Grafana pe dekh sakte ho: "GET /products ka average response time kya hai?"

---

## L. RESILIENCE PATTERNS

### Concept 193: Circuit Breaker Pattern
```
CLOSED (normal) → 5 failures → OPEN (reject all) → 60s → HALF_OPEN (test 1) → success → CLOSED
```
External API (Razorpay) repeatedly fail ho rahi hai. Bina circuit breaker ke, har request 30 seconds wait karti hai timeout tak. Circuit breaker ke saath:
1. 5 failures hone pe circuit "OPEN" — requests turant reject (fail fast)
2. 60 seconds baad 1 test request jaane do
3. Success → circuit "CLOSED" (normal operation resume)
4. Fail → wapas OPEN

### Concept 194: Pre-configured Circuit Breakers
```typescript
export const razorpayBreaker = new CircuitBreaker('razorpay', {
  failureThreshold: 5, resetTimeout: 60000,  // 5 fails → 60s cooldown
});
export const shiprocketBreaker = new CircuitBreaker('shiprocket', {
  failureThreshold: 3, resetTimeout: 120000,  // 3 fails → 2min cooldown
});
export const smsBreaker = new CircuitBreaker('sms', {
  failureThreshold: 5, resetTimeout: 60000,
});
```
Har external service ka apna circuit breaker hai with different thresholds. Shiprocket zyada sensitive hai (3 fails), kyunki shipping order creation critical hai.

### Concept 195: Database Retry Pattern
```typescript
export async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, baseDelayMs = 500) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isTransientError(err) || attempt === maxRetries) throw err;
      await sleep(baseDelayMs * (attempt + 1)); // Linear backoff
    }
  }
}
```
MongoDB connection briefly drop ho sakti hai (network blip). **Transient errors** (ECONNRESET, ETIMEDOUT) automatically retry hote hain. **Non-transient errors** (validation fail, duplicate key) immediately throw hote hain.

### Concept 196: Transient Error Detection
```typescript
const TRANSIENT_CODES = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE'];
const TRANSIENT_MESSAGES = ['not primary', 'node is recovering', 'socket disconnected', ...];
```
Har error transient nahi hoti. Code aur message dekh ke decide karta hai ki retry karna chahiye ya nahi. "not primary" — MongoDB primary switch hua, naya primary pe retry safe hai.

### Concept 197: Event Bus Error Isolation
```typescript
this.on(event, async (data) => {
  try {
    await handler(data);
  } catch (err) {
    logger.error({ event, error: err.message }, 'Event handler failed');
  }
});
```
Agar ek event handler fail ho, doosre handlers pe effect nahi padta. Error log hota hai lekin application crash nahi hoti.

### Concept 198: Stock Reservation with TTL
```typescript
// StockReservation — TTL index: expires after 15 minutes
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
```
Checkout pe stock reserve hota hai (doosra user wo item buy na kar sake). 15 min me payment complete nahi hua → reservation automatically expire → stock wapas available. Abandoned carts se stock permanently lock nahi hota.

---

## M. TESTING INFRASTRUCTURE

### Concept 199: Jest Configuration (3 Projects)
```typescript
projects: [
  { displayName: 'unit', testMatch: ['tests/unit/**/*.test.ts'] },
  { displayName: 'integration', testMatch: ['tests/integration/**/*.test.ts'] },
  { displayName: 'sanity', testMatch: ['tests/sanity/**/*.test.ts'] },
]
```
3 types of tests, alag folders me:
- **Unit** — Fast, mocked, no DB
- **Integration** — Real DB, slow, serial (`--runInBand`)
- **Sanity** — Smoke tests (basic "does it start?" checks)

### Concept 200: Unit Tests
```bash
npm run test:unit     # Run only unit tests
# Test individual components in isolation
# Mock all dependencies (DB, Redis, external APIs)
# Fast: runs in milliseconds
```
Example: Test `PricingService.calculatePrice()` with mocked product data. No DB needed.

### Concept 201: Integration Tests
```bash
npm run test:integration   # Run with real MongoDB + Redis
# Tests use globalSetup to connect DB before all tests
# globalTeardown to disconnect after
# --runInBand: serial execution (prevent DB conflicts)
```
Example: Test full API endpoint — HTTP request → controller → service → DB → response.

### Concept 202: Coverage Thresholds
```typescript
coverageThreshold: {
  global: { branches: 0, functions: 0, lines: 0, statements: 0 }
}
```
Currently 0% (development phase). Target 70% before production. Coverage metrics:
- **Branches**: Har if/else ka dono path test hua?
- **Functions**: Har function call hua?
- **Lines**: Har line execute hui?
- **Statements**: Har statement execute hua?

### Concept 203: Coverage Exclusions
```typescript
collectCoverageFrom: [
  'src/**/*.ts',
  '!src/server.ts',      // Entry point — not unit-testable
  '!src/config/index.ts', // Just reads env vars
  '!src/**/*.d.ts',       // Type declarations
]
```
Kuch files coverage me include nahi hoti — server startup code, config reading, type definitions.

### Concept 204: Module Name Mapper (Path Aliases in Tests)
```typescript
moduleNameMapper: {
  '^@config/(.*)$': '<rootDir>/src/config/$1',
  '^@utils/(.*)$': '<rootDir>/src/utils/$1',
}
```
Source code me `@config/index` use hota hai. Jest ko batana padta hai ki ye actual path me kahan resolve hoga.

### Concept 205: Supertest
```typescript
import supertest from 'supertest';
const request = supertest(app);

const response = await request
  .get('/api/v1/catalog/products')
  .set('Authorization', `Bearer ${token}`)
  .expect(200);
```
**Supertest** integration tests me HTTP requests simulate karta hai bina server actually start kiye. Express app directly test hota hai.

---

## N. THIRD-PARTY INTEGRATIONS

### Concept 206: Firebase (Phone Authentication)
```
Flow:
1. User enters phone number in Angular app
2. Firebase sends OTP SMS
3. User enters OTP
4. Firebase verifies → returns ID token
5. Frontend sends ID token to backend
6. Backend verifies ID token with Firebase Admin SDK
7. Backend creates/finds user, generates JWT
```
Firebase handle karta hai: Phone number verification, OTP sending, SMS delivery, reCAPTCHA (bot prevention).

### Concept 207: Firebase Admin SDK vs Client SDK
```
Client SDK (frontend/):  firebase package   → User-facing (send OTP, verify OTP)
Admin SDK (backend/):    firebase-admin      → Server-side (verify ID tokens, manage users)
```
Client SDK browser me chalta hai, Admin SDK server pe. Admin SDK ke paas elevated privileges hain — kisi bhi user ka token verify kar sakta hai.

### Concept 208: Razorpay Payment Gateway
```
Flow:
1. Backend creates Razorpay Order (amount, currency)
2. Frontend opens Razorpay checkout modal
3. User pays (card/UPI/netbanking)
4. Razorpay returns paymentId + signature
5. Backend verifies signature (HMAC-SHA256)
6. Payment captured → order created
```
Razorpay India ka popular payment gateway hai. Test mode me fake payments kar sakte ho (`rzp_test_*` key).

### Concept 209: Razorpay Webhook
```
Razorpay server → POST /api/v1/payments/webhook → Backend
```
Kuch scenarios me frontend callback miss ho sakta hai (browser band, network issue). Razorpay **webhook** bhejta hai — server-to-server notification. Ye backup mechanism hai — payment status reliably update hota hai.

### Concept 210: Shiprocket (Shipping)
```
Flow:
1. Order created → Backend calls Shiprocket API
2. Shiprocket assigns courier (cheapest/fastest)
3. AWB (Air Waybill) number generated
4. Pickup scheduled from warehouse
5. Tracking URL available
6. Shiprocket webhook → status updates (shipped, in-transit, delivered)
```
Shiprocket multiple courier partners aggregate karta hai (Delhivery, BlueDart, DTDC etc.). Best courier auto-select hota hai.

### Concept 211: Nodemailer (Email)
```typescript
// Uses SMTP protocol
transport = nodemailer.createTransport({
  host: 'smtp.sendgrid.net',
  port: 587,
  auth: { user: 'apikey', pass: config.smtp.pass }
});
```
Invoice emails, order confirmations, password reset emails — sab Nodemailer se. SendGrid/Gmail SMTP backend hai.

### Concept 212: MSG91 (SMS)
```typescript
config.communication.sms.provider = 'msg91';
config.communication.sms.msg91.authKey = '...';
```
OTP delivery ke liye backup (Firebase primary hai). Order status SMS notifications bhi MSG91 se.

### Concept 213: PDFKit (Invoice Generation)
```typescript
import PDFKit from 'pdfkit';
```
Invoice worker PDFKit se programmatically PDF generate karta hai — header, line items, totals, footer. Generated PDF file save hoti hai aur download link user ko milta hai.

---

## O. SECURITY INFRASTRUCTURE

### Concept 214: JWT (JSON Web Token)
```
Header.Payload.Signature
eyJhbGc.eyJ1c2Vy.SflKxwRJ
```
JWT ek encoded token hai jo user identity carry karta hai:
- **Header**: Algorithm (HS256)
- **Payload**: userId, role, expiry
- **Signature**: HMAC-SHA256(header + payload, secret)

Server signature verify karke token ki authenticity check karta hai. Tamper proof — payload change karo to signature match nahi karega.

### Concept 215: Access Token + Refresh Token
```
Access Token:  Short-lived (15 min), sent in Authorization header
Refresh Token: Long-lived (7 days), used to get new access token
```
Access token expire hone pe client refresh token se naya access token le leta hai bina re-login ke. Agar access token leak ho, 15 min me expire ho jaata hai.

### Concept 216: Token Rotation
```
Old refresh token → new access token + NEW refresh token
(old refresh token deleted from DB)
```
Har refresh pe naya refresh token milta hai aur purana delete hota hai. Agar attacker purana refresh token use kare, wo already deleted hai → access denied. **Single-use refresh tokens**.

### Concept 217: Refresh Token Hashing
```typescript
const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
// Store hashedToken in DB, NOT the raw token
```
Database me raw refresh token store nahi hota — SHA256 hash store hota hai. Agar database breach ho, attacker ko actual tokens nahi milte.

### Concept 218: Rate Limiting
```typescript
globalRateLimiter → 100 requests/minute (all endpoints)
authRateLimiter   → 10 requests/minute (auth endpoints only)
```
Brute force attacks prevent karta hai. Ek IP address se limited requests allowed. Redis-backed — multiple server instances me bhi consistent counting.

### Concept 219: RBAC (Role-Based Access Control)
```typescript
// rbac.middleware.ts
const authorize = (...roles: string[]) => (req, res, next) => {
  if (!roles.includes(req.user.role)) throw new ForbiddenError();
  next();
};

// Usage
router.delete('/users/:id', auth, authorize('admin'), controller.deleteUser);
```
2 roles: `customer` aur `admin`. Admin-only routes pe `authorize('admin')` middleware lagta hai. Customer access kare to 403 Forbidden.

### Concept 220: Ban System
```typescript
// auth.middleware.ts
if (user.isBanned) throw new ForbiddenError('Account suspended');
```
Admin kisi bhi user ko ban kar sakta hai. Banned user ka har request immediately reject hota hai. Frontend pe 403 aane pe logout + ban message.

### Concept 221: Idempotency for Payments
```typescript
// Payment creation me
const existing = await Payment.findOne({ idempotencyKey, status: 'created' });
if (existing && existing.createdAt > Date.now() - 25 * 60 * 1000) {
  return existing; // Return existing, don't create duplicate
}
```
Network retry se duplicate payment prevent. Client unique key generate karta hai per checkout attempt. 25-minute window.

### Concept 222: Webhook Signature Verification
```typescript
const expectedSignature = crypto.createHmac('sha256', webhookSecret)
  .update(JSON.stringify(body))
  .digest('hex');
if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
  throw new UnauthorizedError('Invalid webhook signature');
}
```
Razorpay webhook me signature hota hai. Backend verify karta hai ki request actually Razorpay se aayi hai, koi attacker ne spoof nahi ki. `timingSafeEqual` timing attacks prevent karta hai.

### Concept 223: Input Validation (Zod)
```typescript
const schema = z.object({
  phone: z.string().length(10).regex(/^\d+$/),
  address: z.object({
    street: z.string().min(1).max(200),
    city: z.string().min(1),
    postalCode: z.string().regex(/^\d{6}$/),
  }),
});
```
Har user input validate hota hai BEFORE business logic execute ho. SQL injection, XSS — sab prevent hota hai kyunki unexpected input allowed nahi.

### Concept 224: File Upload Security
```typescript
// upload.middleware.ts (Multer)
const upload = multer({
  storage: diskStorage({ filename: uuid + ext }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype)) cb(new Error('Invalid file type'));
  },
});
```
- Max 5MB file size
- Only JPEG/PNG/WebP allowed (no .exe, .php)
- UUID filename (original filename se path traversal attack nahi)

---

## P. PRODUCTION DEPLOYMENT & SCALING

### Concept 225: Production Architecture
```
CloudFlare (CDN + DDoS + SSL)
      ↓
Nginx (reverse proxy + gzip + cache)
      ↓
Backend (PM2 cluster x4) + WebSocket + Frontend (static CDN)
      ↓
Redis (BullMQ + cache)
      ↓
MongoDB Atlas (M10+ replica set)
```

### Concept 226: PM2 Cluster Mode
```javascript
module.exports = {
  apps: [{
    name: 'rajhans-tea-api',
    script: 'dist/server.js',
    instances: 'max',        // All CPU cores use karo
    exec_mode: 'cluster',
    max_memory_restart: '512M',
  }]
};
```
**PM2** Node.js process manager hai. `cluster` mode me CPU ke har core pe ek instance chalta hai. 4-core server → 4 backend instances → 4x throughput.

### Concept 227: Vertical Scaling
```
Start:  2 vCPU, 4GB RAM, MongoDB M10
Medium: 4 vCPU, 8GB RAM, MongoDB M20
Large:  8 vCPU, 16GB RAM, MongoDB M30
```
Ek server ko zyada powerful banana = vertical scaling. Simple but limited (ek server kitna powerful ho sakta hai?).

### Concept 228: Horizontal Scaling
```
Server 1 (Backend x4)  ←  ALB  →  Server 2 (Backend x4)
                                   Server 3 (BullMQ workers)
```
Multiple servers add karo with Load Balancer. Theoretically unlimited scaling. Complex but powerful.

### Concept 229: CDN for Frontend
```
1. ng build --configuration production → dist/ folder
2. Upload dist/ to S3 bucket
3. CloudFront distribution → S3
4. Route53 DNS → CloudFront
```
Angular build karne pe static files banti hain (HTML, JS, CSS). Ye S3 + CloudFront pe serve hoti hain — backend server pe load nahi. Global edge locations se fast delivery.

### Concept 230: CloudFlare
CloudFlare proxy layer hai jo:
1. **DDoS protection** — Attack traffic filter karta hai
2. **SSL/TLS** — HTTPS encryption
3. **CDN** — Static assets global edge pe cache
4. **WAF** — Web Application Firewall (common attacks block)

### Concept 231: Redis Scaling
```
Option 1: Vertical — 256MB → 1GB → 4GB
Option 2: Separate instances — BullMQ (noeviction) + Cache (allkeys-lru)
Option 3: Redis ElastiCache (AWS managed)
```
BullMQ aur caching ke liye alag Redis instances best practice hai — caching me LRU eviction chahiye, BullMQ me nahi (jobs delete nahi honi chahiye).

### Concept 232: WebSocket Scaling
Multiple backend instances pe WebSocket tricky hai — user Server 1 pe connected hai lekin notification Server 2 pe trigger hoti hai. Solutions:
1. **Sticky sessions** — Same user hamesha same server pe
2. **Redis adapter** — Socket.io messages Redis pub/sub se broadcast

### Concept 233: Security Hardening Checklist
```
[x] HTTPS everywhere (CloudFlare SSL)
[x] JWT secrets (256-bit random)
[x] MongoDB authentication
[x] Redis password
[x] Firewall (only 80/443)
[x] Rate limiting
[x] CORS restricted
[x] Helmet headers
[x] Zod validation
[ ] CSP (Content Security Policy)
[ ] HSTS (HTTP Strict Transport Security)
```

### Concept 234: Rollback Strategies
3 levels:
1. **Quick** — `git revert HEAD` → redeploy (~2 min)
2. **Docker** — Previous image tag use karo
3. **Feature Flag** — Toggle OFF problematic feature (zero deploy)

### Concept 235: Health Check Monitoring
```bash
curl https://domain.com/api/v1/health/ready  # Checks DB + Redis
curl https://domain.com/api/v1/health/live   # Basic alive check
```
UptimeRobot/BetterUptime har 1 min ye check karte hain. Fail hone pe SMS/Slack alert.

### Concept 236: Smoke Tests After Deploy
```bash
curl -f https://domain.com/api/v1/health/ready || echo "FAILED"
curl -f https://domain.com/api/v1/catalog/categories || echo "CATALOG BROKEN"
```
Deploy ke baad critical endpoints hit karo. Koi fail ho to turant rollback.

### Concept 237: Backup Strategy
```
MongoDB Atlas:
- Continuous backup (point-in-time recovery)
- Daily snapshots retained 7 days
- Monthly snapshots retained 12 months

Redis:
- AOF (append only file) — every second persistence
- RDB snapshots — periodic full dump
```

### Concept 238: Multi-Region (Future)
```
MongoDB Atlas → Global Clusters (replicate across regions)
Redis → ElastiCache Global Datastore
CloudFront → Automatic edge locations worldwide
```
Users globally distributed hon to latency reduce karne ke liye data centers multiple regions me.

---

## QUICK REFERENCE — Key Files

| What | Path |
|------|------|
| Docker Compose | `docker-compose.yml` |
| Nginx Config | `infrastructure/docker/nginx/nginx.conf` |
| Redis Config | `infrastructure/docker/redis/redis.conf` |
| MongoDB Init | `infrastructure/docker/mongo/mongo-init.js` |
| Backend Dockerfile (prod) | `backend/Dockerfile` |
| Backend Dockerfile (dev) | `backend/Dockerfile.dev` |
| CI Pipeline | `.github/workflows/ci.yml` |
| Server Entry | `backend/src/server.ts` |
| Express App | `backend/src/app.ts` |
| Config | `backend/src/config/index.ts` |
| All Loaders | `backend/src/loaders/` |
| All Middleware | `backend/src/middleware/` |
| Core Utilities | `backend/src/core/` |
| Worker Registration | `backend/src/jobs/start-workers.ts` |
| Event Handlers | `backend/src/core/event-handlers.ts` |
| Root package.json | `package.json` |
| Backend package.json | `backend/package.json` |
| Frontend package.json | `frontend/package.json` |
| Deployment Guide | `DEPLOYMENT.md` |
| Pre-commit Hook | `.husky/pre-commit` |

---

## DEBUGGING TIPS (Infrastructure)

1. **Container not starting?** → `docker compose logs <service>` se error dekho
2. **MongoDB connection failed?** → Replica set initialized hai? `docker exec rajhans-tea-mongo mongosh --eval "rs.status()"`
3. **Redis connection refused?** → Port check: `docker exec rajhans-tea-redis redis-cli ping`
4. **Backend crash loop?** → `docker compose logs -f backend` — usually missing env var
5. **Nginx 502 Bad Gateway?** → Backend container healthy hai? `docker compose ps`
6. **BullMQ jobs stuck?** → Redis connection check, worker logs dekho
7. **Memory warning?** → `docker stats` se container memory usage dekho
8. **Slow API?** → Prometheus metrics check, MongoDB slow query logs
9. **CI failing?** → GitHub Actions tab pe specific job ka log dekho
10. **Tests flaky?** → Integration tests me shared state cleanup check

---

*Next: [Part 2 — Frontend KT](./02-frontend.md)*
