# 02 — Architecture

## Backend: 4-Layer Architecture

Every request passes through exactly 4 layers in order. Each layer has one job and doesn't do the job of any other layer.

```
HTTP Request
     │
     ▼
┌─────────────────────────────────────┐
│  Layer 1: MIDDLEWARE CHAIN          │
│  app.ts                             │
│                                     │
│  Helmet → CORS → Rate Limit →       │
│  RequestID → Logger → Metrics       │
│                                     │
│  Job: Cross-cutting concerns that   │
│  apply to EVERY request             │
└──────────────────┬──────────────────┘
                   │
                   ▼
┌─────────────────────────────────────┐
│  Layer 2: ROUTES + VALIDATORS       │
│  api/v1/routes/*.routes.ts          │
│  api/v1/validators/*.validator.ts   │
│                                     │
│  - Authenticate (check JWT)         │
│  - Authorize (check role)           │
│  - Validate (Zod schema)            │
│  - Route to correct controller      │
│                                     │
│  Job: "Who can call this? Is the    │
│  input valid?"                      │
└──────────────────┬──────────────────┘
                   │
                   ▼
┌─────────────────────────────────────┐
│  Layer 3: CONTROLLERS               │
│  api/v1/controllers/*.controller.ts │
│                                     │
│  - Receive validated request        │
│  - Call service                     │
│  - Send formatted response          │
│                                     │
│  Job: Traffic cop between HTTP and  │
│  business logic. Usually 3-5 lines. │
└──────────────────┬──────────────────┘
                   │
                   ▼
┌─────────────────────────────────────┐
│  Layer 4: SERVICES + REPOSITORIES  │
│  services/*.service.ts              │
│  repositories/*.repository.ts       │
│                                     │
│  Service: Business logic            │
│  Repository: Database queries only  │
│                                     │
│  Job: "What does this operation     │
│  actually DO?"                      │
└─────────────────────────────────────┘
```

### Why This Layering Matters

**Scenario: You want to change how pagination works.**
- Change `utils/pagination.ts` and the `services/*.service.ts` that uses it
- The controller, route, and validator are untouched
- Zero risk of breaking the HTTP layer

**Scenario: You switch from MongoDB to PostgreSQL.**
- Rewrite only `repositories/*.repository.ts`
- Everything above it (services, controllers, routes) is untouched
- The service doesn't know or care what database you use

---

## Design Patterns Used

### 1. Repository Pattern
```
BaseRepository<T> (generic)
    ├── UserRepository (extends Base, adds findByPhone, updateLastLogin)
    └── TokenRepository (extends Base, adds findByToken, deleteByUserId)
```
**What it is:** A class that wraps all database queries for one model.
**Why:** Services never write MongoDB queries directly. If you need to change how you query users, you change ONE file.

### 2. Service Layer Pattern
```
AuthService
  - knows about: UserRepository, TokenRepository, Firebase
  - knows nothing about: HTTP, Express, Request, Response

AdminUserService
  - knows about: UserRepository
  - knows nothing about: HTTP, Express, Request, Response
```
**What it is:** Business logic lives in a class that is independent of HTTP.
**Why:** You could call `authService.verifyFirebaseToken()` from a CLI script, a test, or a webhook — it doesn't care.

### 3. Middleware Chain Pattern
Every request runs through a fixed chain of middleware in `app.ts`:
```typescript
app.use(helmet())           // security headers
app.use(cors(...))          // CORS
app.use(globalRateLimiter)  // rate limiting
app.use(express.json())     // body parsing
app.use(requestIdMiddleware) // assign unique ID
app.use(requestLoggerMiddleware) // log request
app.use(metricsMiddleware)  // record metrics
app.use('/api/v1', routes)  // your actual logic
app.use(notFoundHandler)    // catch unknown routes
app.use(errorHandler)       // catch all errors
```
Order matters. Helmet must run before routing. Error handler must be last.

### 4. Singleton Loader Pattern
Services like MongoDB, Redis, Firebase are initialized once at startup and shared:
```typescript
// loaders/index.ts — runs ONCE on startup
await connectMongoDB();
connectRedis();
initMetrics();
initFirebase();

// Then anywhere in the app:
getRedisClient()   // returns the same client
getFirebaseAuth()  // returns the same auth instance
```

### 5. Error Class Hierarchy
```
Error (native JavaScript)
  └── ApiError (base, has statusCode + errors[])
        ├── BadRequestError     (400)
        ├── UnauthorizedError   (401)
        ├── ForbiddenError      (403)
        ├── NotFoundError       (404)
        ├── ConflictError       (409)
        └── TooManyRequestsError (429)
```
The global `errorHandler` middleware catches any thrown `ApiError` and formats it correctly. You never need to manually `res.status(400).json(...)` in your code — just `throw new BadRequestError('message')`.

---

## Frontend Architecture

Angular 21 uses a **feature-based modular structure** with **standalone components**.

```
app/
├── core/           ← Singletons. Run once. Used everywhere.
│   ├── services/   ← AuthService, AdminService, FirebaseService
│   ├── guards/     ← authGuard, guestGuard, adminGuard
│   └── interceptors/ ← authInterceptor (auto-attaches JWT)
│
├── features/       ← Self-contained feature modules
│   ├── auth/       ← Login page
│   ├── home/       ← Public home page
│   ├── dashboard/  ← Logged-in user dashboard
│   └── admin/      ← Admin panel (lazy loaded)
│
└── layouts/        ← Page shells (header + content area)
    ├── main-layout/  ← Public/customer layout with header
    └── admin-layout/ ← Admin sidebar layout
```

### State Management: Angular Signals

No NgRx, no BehaviorSubject. Uses Angular 17+ Signals:

```typescript
// In AuthService:
private _user = signal<AuthUser | null>(null);  // writable
readonly user = this._user.asReadonly();          // public read-only
readonly isLoggedIn = computed(() => !!this._user()); // derived
readonly isAdmin = computed(() => this._user()?.role === 'admin');

// In a component:
authService.isLoggedIn()  // reactive — auto-updates template
authService.isAdmin()     // auto-updates when user changes
```

**Why Signals over NgRx?** The app is currently simple enough that NgRx would be over-engineering. Signals are built into Angular, reactive, and require zero boilerplate. When the product/cart/order modules are added, evaluate if NgRx store is needed.

---

## Monorepo Structure

This project uses npm workspaces:
```json
// root package.json
{
  "workspaces": ["backend"]
}
```
One `package-lock.json` at the root covers all workspaces. The frontend has its own separate `package.json` and `node_modules` because Angular CLI manages its own dependencies.

---

## Module Boundaries (what can depend on what)

```
frontend → backend API (HTTP only, never direct imports)
backend controllers → services (yes)
backend services → repositories (yes)
backend repositories → models (yes)
backend controllers → repositories (NO — skip the service layer)
backend services → HTTP/Express (NO — services must be framework-agnostic)
```
