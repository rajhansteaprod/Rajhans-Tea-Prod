# PART 3: BACKEND — Complete Knowledge Transfer

> **Target Audience**: BTech CS student joining the project
> **Goal**: End-to-end understanding of the Express.js backend — architecture, all 14 modules, middleware, database models, business logic, job queues, and API patterns
> **Project**: Rajhans Tea — Production-grade Express.js + TypeScript ecommerce backend

---

## TABLE OF CONTENTS

- [A. Backend Architecture & Patterns (Concepts 1–60)](#a-backend-architecture--patterns)
- [B. Middleware Pipeline (Concepts 61–110)](#b-middleware-pipeline)
- [C. Core Utilities (Concepts 111–145)](#c-core-utilities)
- [D. Auth Module (Concepts 146–205)](#d-auth-module)
- [E. Catalog Module (Concepts 206–255)](#e-catalog-module)
- [F. Cart & Checkout Module (Concepts 256–295)](#f-cart--checkout-module)
- [G. Pricing Module (Concepts 296–325)](#g-pricing-module)
- [H. Payments Module (Concepts 326–400)](#h-payments-module)
- [I. Inventory & Orders Module (Concepts 401–455)](#i-inventory--orders-module)
- [J. Promotions Module (Concepts 456–500)](#j-promotions-module)
- [K. Reviews & Q&A Module (Concepts 501–535)](#k-reviews--qa-module)
- [L. Search Module (Concepts 536–555)](#l-search-module)
- [M. Admin, Audit, CMS & Settings (Concepts 556–585)](#m-admin-audit-cms--settings)
- [N. API Route Map (Concepts 586–600)](#n-api-route-map)

---

## A. BACKEND ARCHITECTURE & PATTERNS

### Concept 1: Express.js
Express ek **minimalist web framework** hai Node.js ke liye. HTTP requests receive karta hai, middleware chain se process karta hai, aur response bhejta hai. Is project me Express 5.2.1 use ho raha hai.

### Concept 2: TypeScript Backend
Poora backend TypeScript me hai. `ts-node` development me directly TypeScript run karta hai (compile step skip). Production me `tsc` compile karke `dist/` folder me JavaScript generate hota hai.

### Concept 3: app.ts vs server.ts
```
app.ts    → Express application configure karo (middleware, routes, error handling)
server.ts → HTTP server banao, loaders initialize, workers start, listen on port
```
**Separation kyu?** Testing me `app` directly import kar sakte ho (Supertest) bina server start kiye. Production me `server.ts` entry point hai.

### Concept 4: Module Architecture
Backend 14 feature modules me organized hai. Har module self-contained hai:
```
modules/auth/
├── models/           ← Mongoose schemas (DB structure)
├── repositories/     ← Data access layer (DB queries)
├── services/         ← Business logic (rules, calculations)
├── controllers/      ← HTTP handlers (request → response)
├── routes/           ← URL mapping + middleware
├── validators/       ← Zod schemas (input validation)
├── dto/              ← Data shaping (what client sees)
└── jobs/             ← BullMQ queues & workers (async tasks)
    ├── queues/
    └── workers/
```

### Concept 5: Request Flow (Full Lifecycle)
```
HTTP Request arrives at Express
  → Helmet (security headers)
  → CORS (origin check)
  → Compression (gzip)
  → Body Parser (JSON → req.body)
  → Cookie Parser (cookies → req.cookies)
  → Rate Limiter (request counting)
  → Request Timeout (30s limit)
  → Request ID (unique UUID)
  → Request Logger (log entry)
  → Metrics (Prometheus counter)
  → Observability (trace context)
  → Route Matched?
    → YES: Route-specific middleware (auth, validate, rbac)
      → Controller (parse request)
        → Service (business logic)
          → Repository (DB query)
            → MongoDB
          ← Data returned
        ← DTO shaped
      ← JSON response
    → NO: 404 Not Found
  → Error? → Error Handler → JSON error response
```

### Concept 6: Layered Architecture — Why?
```
Controller  → "Kya data aaya request me?"
Service     → "Business rules kya kehte hain?"
Repository  → "Database me kaise store/fetch karun?"
Model       → "Data ka shape kya hai?"
```
Agar future me MongoDB ki jagah PostgreSQL lagana ho — sirf Repository layer change karni padegi. Service, Controller untouched. **Loose coupling**.

### Concept 7: Route → Controller → Service → Repository
```typescript
// ROUTE (URL mapping)
router.get('/products', cacheResponse(120), catalogController.listProductsPublic);

// CONTROLLER (HTTP handling)
listProductsPublic = async (req, res) => {
  const params = parsePagination(req.query);
  const result = await productService.listPublic(params);
  sendPaginated(res, result.data, result.meta);
};

// SERVICE (business logic)
listPublic = async (params) => {
  const result = await productRepo.findList({ ...params, status: 'active' });
  return { data: result.docs.map(ProductDTO.toPublic), meta: result.meta };
};

// REPOSITORY (database query)
findList = async (params) => {
  const query = Product.find(filter).sort(sort).skip(skip).limit(limit);
  return { docs: await query.exec(), meta: buildPaginationMeta(total, page, limit) };
};
```

### Concept 8: Dependency Flow
```
Routes → Controllers → Services → Repositories → Models
  ↓          ↓            ↓            ↓            ↓
  URL      HTTP        Business     Database     Mongoose
  Map     Handler       Logic       Queries      Schema
```
Arrows **sirf ek direction me** jaate hain. Repository kabhi Controller import nahi karta. Service kabhi Route import nahi karta. **Unidirectional dependency**.

### Concept 9: Error Propagation
```typescript
// Repository — throws raw errors
const user = await User.findById(id);
if (!user) throw new NotFoundError('User not found');

// Service — throws business errors
if (user.isBanned) throw new ForbiddenError('Account suspended');

// Controller — doesn't catch (let it propagate)
// ...

// Error Handler Middleware — catches everything
app.use(errorHandler); // Sends formatted JSON error response
```
Errors bubble up from Repository → Service → Controller → Error Handler. Nobody explicitly catches — global error handler sab handle karta hai.

### Concept 10: Mongoose ODM
```typescript
import mongoose, { Schema, Document } from 'mongoose';

interface IProductDoc extends Document {
  name: string;
  slug: string;
  basePrice: number;
  status: 'draft' | 'active' | 'archived';
}

const productSchema = new Schema<IProductDoc>({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true },
  basePrice: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['draft', 'active', 'archived'], default: 'draft' },
}, { timestamps: true });

export const Product = mongoose.model<IProductDoc>('Product', productSchema);
```
**Schema definition**: Fields, types, required, defaults, enums, validators. `timestamps: true` — automatically `createdAt` aur `updatedAt` fields add karta hai.

### Concept 11: Interface + Schema Pattern
```typescript
// 1. TypeScript interface (compile-time type safety)
interface IUserDoc extends Document {
  phone: string;
  role: 'customer' | 'admin';
}

// 2. Mongoose schema (runtime validation + DB structure)
const userSchema = new Schema<IUserDoc>({
  phone: { type: String, required: true, unique: true },
  role: { type: String, enum: ['customer', 'admin'], default: 'customer' },
});
```
Interface TypeScript ko type information deta hai. Schema MongoDB ko structure information deta hai. Dono sync me hone chahiye.

### Concept 12: Document Methods vs Static Methods
```typescript
// Document method — ek specific document pe kaam karta hai
userSchema.methods.isAdminUser = function(): boolean {
  return this.role === 'admin';
};

// Static method — model level pe kaam karta hai
userSchema.statics.findByPhone = function(phone: string) {
  return this.findOne({ phone });
};
```

### Concept 13: Mongoose Hooks (Middleware)
```typescript
productSchema.pre('save', function(next) {
  if (!this.slug) {
    this.slug = slugify(this.name);
  }
  next();
});
```
`pre('save')` — Document save hone se pehle run hota hai. Slug auto-generation, password hashing jaise tasks ke liye.

### Concept 14: Population (References)
```typescript
// Schema me reference define karo
const productSchema = new Schema({
  category: { type: Schema.Types.ObjectId, ref: 'Category' },
});

// Query me populate karo (like SQL JOIN)
const product = await Product.findById(id).populate('category');
// product.category = { _id: '...', name: 'Black Tea', slug: 'black-tea' }
```
MongoDB me JOINs nahi hote — `populate()` multiple queries karke related documents attach karta hai.

### Concept 15: Lean Queries
```typescript
const products = await Product.find().lean(); // Returns plain JS objects
const product = await Product.findById(id);    // Returns Mongoose Document
```
`.lean()` — Mongoose document ki jagah plain JavaScript object return karta hai. **10x faster** for read-only queries (no change tracking, no methods).

### Concept 16: Indexes
```typescript
productSchema.index({ name: 'text', description: 'text', tags: 'text' }); // Full-text search
productSchema.index({ slug: 1 }, { unique: true }); // Unique + fast lookup
productSchema.index({ category: 1, status: 1 }); // Compound (filter by category + status)
productSchema.index({ createdAt: -1 }); // Sorted by newest
```
**Bina index**: MongoDB har document scan karta hai (slow on 100K+ docs).
**Index ke saath**: B-tree structure me direct lookup (fast).

### Concept 17: TTL Index
```typescript
stockReservationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
```
Time-To-Live index — MongoDB automatically document delete kar deta hai jab `expiresAt` time guzar jaye. Stock reservations (15 min), refresh tokens (7 days) me use hota hai. **No cron job needed**.

### Concept 18: Compound Index
```typescript
reviewSchema.index({ productId: 1, userId: 1 }, { unique: true });
```
Ek user ek product pe sirf 1 review de sakta hai. Compound unique index database level pe enforce karta hai. Application code me check karne ki zarurat nahi.

### Concept 19: DTO (Data Transfer Object) Pattern
```typescript
export class UserDTO {
  static forAdmin(user: IUserDoc) {
    return {
      _id: user._id, phone: user.phone, firstName: user.firstName,
      role: user.role, isBanned: user.isBanned, bannedReason: user.bannedReason,
      lastLogin: user.lastLogin, createdAt: user.createdAt,
    };
  }

  static forUser(user: IUserDoc) {
    return {
      _id: user._id, phone: user.phone, firstName: user.firstName,
      role: user.role,
      // NO isBanned, NO bannedReason, NO lastLogin (privacy)
    };
  }

  static fromRole(user: IUserDoc, role: string) {
    return role === 'admin' ? this.forAdmin(user) : this.forUser(user);
  }
}
```
**Role-aware DTOs** — Admin ko sab fields dikhte hain, customer ko limited. Security by default.

### Concept 20: Repository Pattern
```typescript
export class UserRepository extends BaseRepository<IUserDoc> {
  constructor() {
    super(User); // Pass Mongoose model to base
  }

  // Domain-specific queries
  async findByPhone(phone: string): Promise<IUserDoc | null> {
    return this.model.findOne({ phone, isActive: true });
  }

  async banUser(userId: string, reason: string): Promise<IUserDoc | null> {
    return this.model.findByIdAndUpdate(userId, {
      isBanned: true, bannedAt: new Date(), bannedReason: reason,
    }, { new: true });
  }
}
```
Repository specific database queries encapsulate karta hai. Service ko database internals jaanne ki zarurat nahi.

### Concept 21: BaseRepository
```typescript
export class BaseRepository<T extends Document> {
  constructor(protected model: Model<T>) {}

  async findById(id: string): Promise<T | null> {
    return this.model.findById(id);
  }

  async findMany(filter = {}, options = {}): Promise<T[]> {
    return this.model.find(filter, null, options);
  }

  async create(data: Partial<T>): Promise<T> {
    return this.model.create(data);
  }

  async updateById(id: string, data: Partial<T>): Promise<T | null> {
    return this.model.findByIdAndUpdate(id, data, { new: true });
  }

  async deleteById(id: string): Promise<T | null> {
    return this.model.findByIdAndDelete(id);
  }

  async count(filter = {}): Promise<number> {
    return this.model.countDocuments(filter);
  }

  async exists(filter: object): Promise<boolean> {
    return !!(await this.model.exists(filter));
  }
}
```
Generic CRUD — har module ka repository isse extend karta hai aur domain-specific methods add karta hai.

### Concept 22: Service Layer
```typescript
export class ProductService {
  private productRepo = new ProductRepository();

  async listPublic(params: ProductListParams) {
    const result = await this.productRepo.findList({
      ...params,
      status: 'active', // Business rule: public me sirf active products
    });
    return {
      data: result.docs.map(ProductDTO.toPublic), // DTO transform
      meta: result.meta,
    };
  }

  async create(payload: CreateProductPayload) {
    // Business logic: auto-generate slug, validate uniqueness
    const slug = await ensureUniqueSlug(payload.name, this.productRepo);
    return this.productRepo.create({ ...payload, slug });
  }
}
```
Service me business rules hain — "public listings me sirf active products", "slug unique hona chahiye". Repository ko ye rules nahi pata.

### Concept 23: Controller Layer
```typescript
export class CatalogController {
  private productService = new ProductService();

  listProductsPublic = async (req: Request, res: Response): Promise<void> => {
    const params = parsePagination(req.query);     // Parse query params
    const result = await this.productService.listPublic(params); // Call service
    sendPaginated(res, result.data, result.meta);  // Send formatted response
  };

  createProduct = async (req: Request, res: Response): Promise<void> => {
    const payload = req.body;                     // Already validated by middleware
    const product = await this.productService.create(payload);
    sendCreated(res, product, 'Product created');
  };
}
```
Controller sirf **glue code** hai — request parse karo, service call karo, response format karo. Business logic NAHI.

### Concept 24: Validator Layer (Zod)
```typescript
import { z } from 'zod';

export const createProductSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(200),
    categoryId: z.string().regex(/^[0-9a-fA-F]{24}$/), // MongoDB ObjectId format
    basePrice: z.number().positive(),
    status: z.enum(['draft', 'active', 'archived']).optional(),
    images: z.array(z.string().url()).max(10).optional(),
    tags: z.array(z.string()).max(20).optional(),
  }),
});

// Route me use:
router.post('/products', auth, authorize('admin'), validate(createProductSchema), controller.create);
```
Zod request body, params, query sab validate karta hai BEFORE controller execute ho. Invalid data → 400 Bad Request with field-level errors.

### Concept 25: Validation Middleware
```typescript
export const validate = (schema: AnyZodObject) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next(); // Validation passed → continue
    } catch (error) {
      // ZodError → 400 Bad Request with field errors
      next(error); // Error handler catches
    }
  };
```

### Concept 26: Async Handler Pattern
Express me async errors by default catch nahi hote. Express 5 me ye fix hua hai — async functions ka error automatically `next(error)` me jaata hai. Isliye `async (req, res)` directly use kar sakte hain.

### Concept 27: Response Helpers
```typescript
// utils/api-response.ts
export const sendSuccess = (res: Response, data: any, message = 'Success', statusCode = 200) => {
  res.status(statusCode).json({ success: true, statusCode, message, data });
};

export const sendCreated = (res: Response, data: any, message = 'Created') => {
  sendSuccess(res, data, message, 201);
};

export const sendPaginated = (res: Response, data: any[], meta: PaginationMeta, message = 'Success') => {
  res.status(200).json({ success: true, statusCode: 200, message, data, meta });
};

export const sendNoContent = (res: Response) => {
  res.status(204).send();
};
```
Consistent response format — har endpoint same structure return karta hai.

### Concept 28: Error Classes
```typescript
export class ApiError extends Error {
  constructor(public statusCode: number, message: string, public errors: any[] = []) {
    super(message);
  }
}

export class BadRequestError extends ApiError {
  constructor(message = 'Bad request', errors: any[] = []) { super(400, message, errors); }
}
export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized') { super(401, message); }
}
export class ForbiddenError extends ApiError {
  constructor(message = 'Forbidden') { super(403, message); }
}
export class NotFoundError extends ApiError {
  constructor(message = 'Not found') { super(404, message); }
}
export class ConflictError extends ApiError {
  constructor(message = 'Conflict') { super(409, message); }
}
export class TooManyRequestsError extends ApiError {
  constructor(message = 'Too many requests') { super(429, message); }
}
```
Custom error class throw karo kahin bhi — error handler middleware automatically correct HTTP status code set karega.

### Concept 29: Pagination Helper
```typescript
export const parsePagination = (query: any) => ({
  page: Math.max(1, parseInt(query.page) || 1),
  limit: Math.min(100, Math.max(1, parseInt(query.limit) || 20)),
  sortBy: query.sortBy || 'createdAt',
  sortOrder: query.sortOrder === 'asc' ? 'asc' : 'desc',
  search: query.search || '',
});

export const buildPaginationMeta = (total: number, page: number, limit: number) => ({
  page, limit, total,
  totalPages: Math.ceil(total / limit),
});
```
Default: page 1, limit 20, sort by createdAt desc. Max limit 100 (prevent client se 10000 items request).

### Concept 30: Slug Generation
```typescript
export const slugify = (text: string): string => {
  return text.toLowerCase()
    .replace(/[^\w\s-]/g, '')    // Remove special chars
    .replace(/\s+/g, '-')        // Spaces → hyphens
    .replace(/-+/g, '-')         // Multiple hyphens → single
    .trim();
};

export const ensureUniqueSlug = async (name: string, repo: any): Promise<string> => {
  let slug = slugify(name);
  let exists = await repo.exists({ slug });
  let counter = 1;
  while (exists) {
    slug = `${slugify(name)}-${counter++}`;
    exists = await repo.exists({ slug });
  }
  return slug;
};
```
"Assam Gold Premium Tea" → `assam-gold-premium-tea`. Duplicate hone pe → `assam-gold-premium-tea-1`, `assam-gold-premium-tea-2`.

### Concept 31: Logger (Pino)
```typescript
import pino from 'pino';

export const logger = pino({
  level: config.log.level, // 'debug' in dev, 'info' in prod
  transport: config.env === 'development'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});
```
Pino fastest Node.js logger hai. JSON output (machine-parsable). Dev me `pino-pretty` human-readable format deta hai.

### Concept 32: Device Parser
```typescript
export const extractDeviceInfo = (req: Request) => ({
  userAgent: req.headers['user-agent'] || '',
  ip: req.ip || req.headers['x-forwarded-for'] || '',
  browser: parseBrowser(ua),  // "Chrome 120"
  os: parseOS(ua),            // "Windows 11"
  deviceType: parseDeviceType(ua), // "desktop" | "mobile" | "tablet"
  deviceName: `${parseBrowser(ua)} on ${parseOS(ua)}`, // "Chrome 120 on Windows 11"
});
```
Session management me device info store hota hai. Admin dekh sakta hai ki user kaunse devices se logged in hai.

### Concept 33: Request-Response Cycle Timing
```
Request arrives → start timer
  → All middleware execute
  → Controller → Service → DB
  ← Response sent → stop timer
  → Log: "POST /api/v1/payments/orders 200 145ms"
```
Har request ki duration log hoti hai. 145ms acceptable, 5000ms → investigate.

### Concept 34: Express 5 Features Used
- **Async error handling** — No need for `try-catch` or `asyncHandler` wrapper
- **Path matching** — Improved pattern matching
- **Subpath imports** — Modern import syntax

### Concept 35: TypeScript Express Augmentation
```typescript
// types/express.d.ts
declare namespace Express {
  interface Request {
    user?: { userId: string; role: string };  // Set by auth middleware
    requestId?: string;                        // Set by request-id middleware
  }
}
```
Express ke `Request` type me custom fields add karo. Ab `req.user.userId` pe TypeScript error nahi dega.

---

## B. MIDDLEWARE PIPELINE

### Concept 36: Middleware Execution Order
```typescript
// app.ts — Order matters!
app.use(helmet());                         // 1. Security headers
app.use(cors({ origin: config.cors.origin, credentials: true }));  // 2. CORS
app.use(compression());                    // 3. Gzip compression
app.use(express.json({ limit: '10mb' })); // 4. JSON body parse
app.use(express.urlencoded({ extended: true })); // 5. URL-encoded forms
app.use(cookieParser());                   // 6. Cookie parse
app.use(globalRateLimiter);                // 7. Rate limiting
app.use(requestTimeout(30000));            // 8. 30s timeout
app.use(requestIdMiddleware);              // 9. Request ID
app.use(requestLoggerMiddleware);          // 10. HTTP logging
app.use(metricsMiddleware);                // 11. Prometheus metrics
app.use(observabilityMiddleware);          // 12. Trace context
app.use('/uploads', express.static(...));  // 13. Static files
app.use('/api/v1', routes);                // 14. API routes
app.use(notFoundHandler);                  // 15. 404 handler
app.use(errorHandler);                     // 16. Error handler (MUST be last)
```

### Concept 37: Auth Middleware
```typescript
export const auth = async (req: Request, res: Response, next: NextFunction) => {
  // 1. Extract token
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) throw new UnauthorizedError('No token');
  const token = authHeader.split(' ')[1];

  // 2. Verify JWT
  const payload = jwt.verify(token, config.jwt.accessSecret) as TokenPayload;

  // 3. Check user exists and not banned
  const user = await User.findById(payload.userId);
  if (!user) throw new UnauthorizedError('User not found');
  if (user.isBanned) throw new ForbiddenError('Account suspended');

  // 4. Attach to request
  req.user = { userId: payload.userId, role: payload.role };
  next();
};
```
Har authenticated route pe ye middleware lagta hai. Token missing/invalid/expired → 401. User banned → 403.

### Concept 38: RBAC Middleware
```typescript
export const authorize = (...roles: string[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) throw new UnauthorizedError();
    if (!roles.includes(req.user.role)) throw new ForbiddenError('Insufficient permissions');
    next();
  };

// Usage:
router.delete('/products/:id', auth, authorize('admin'), controller.delete);
```
`authorize('admin')` — Sirf admin access kar sakta hai. `authorize('admin', 'manager')` — Admin ya manager.

### Concept 39: Rate Limiting
```typescript
export const globalRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,     // 60 seconds
  max: config.rateLimit.maxRequests,       // 100 requests
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({ sendCommand: (...args) => redis.call(...args) }),
});

export const authRateLimiter = rateLimit({
  windowMs: 60000,
  max: config.rateLimit.authMaxRequests,   // 10 requests
  message: { success: false, message: 'Too many auth attempts' },
});
```
**Redis-backed** — Multiple server instances me bhi accurate counting. Auth endpoints pe strict limit (10/min) — OTP brute force prevention.

### Concept 40: Cache Response Middleware
```typescript
export const cacheResponse = (ttlSeconds: number) =>
  async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') return next(); // Only cache GETs

    const key = `cache:${req.originalUrl}`;
    const cached = await redis.get(key);
    if (cached) {
      return res.json(JSON.parse(cached)); // Cache HIT
    }

    // Intercept res.json to cache the response
    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      redis.setex(key, ttlSeconds, JSON.stringify(body)); // Cache for TTL
      return originalJson(body);
    };
    next();
  };

// Usage:
router.get('/categories', cacheResponse(300), controller.listPublic); // 5 min cache
router.get('/products', cacheResponse(120), controller.listPublic);   // 2 min cache
```
**Transparent caching** — First request database se, baad ki requests Redis cache se (100x faster). TTL ke baad cache expire → fresh data.

### Concept 41: Idempotency Middleware
```typescript
export const idempotency = async (req: Request, res: Response, next: NextFunction) => {
  const key = req.headers['x-idempotency-key'] as string;
  if (!key) return next(); // No key → normal processing

  const cacheKey = `idempotency:${key}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    const response = JSON.parse(cached);
    return res.status(response.statusCode).json(response.body);
  }

  // Intercept response to cache it
  const originalJson = res.json.bind(res);
  res.json = (body: any) => {
    redis.setex(cacheKey, 86400, JSON.stringify({ statusCode: res.statusCode, body })); // 24hr
    return originalJson(body);
  };
  next();
};
```
Client same request dobara bheje (network retry) → cached response return. **Duplicate payment prevention** ka key mechanism.

### Concept 42: Request Timeout Middleware
```typescript
export const requestTimeout = (ms: number) =>
  (req: Request, res: Response, next: NextFunction) => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        res.status(503).json({ success: false, message: 'Request timeout' });
      }
    }, ms);

    res.on('finish', () => clearTimeout(timer));
    next();
  };
```
30 seconds me response nahi gaya → 503 Service Unavailable. Stuck requests server resources hold nahi karte.

### Concept 43: Error Handler Middleware
```typescript
export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  // Known API errors
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false, statusCode: err.statusCode, message: err.message, errors: err.errors,
    });
  }

  // Zod validation errors
  if (err.name === 'ZodError') {
    const errors = (err as ZodError).errors.map(e => ({
      field: e.path.join('.'), message: e.message,
    }));
    return res.status(400).json({
      success: false, statusCode: 400, message: 'Validation failed', errors,
    });
  }

  // Mongoose duplicate key
  if ((err as any).code === 11000) {
    return res.status(409).json({
      success: false, statusCode: 409, message: 'Duplicate entry',
    });
  }

  // Unknown errors — don't expose internals
  logger.error({ err }, 'Unhandled error');
  return res.status(500).json({
    success: false, statusCode: 500, message: 'Internal server error',
  });
};
```
**Centralized error handling** — koi bhi error kahi bhi throw ho, yahan catch hogi. ApiError → proper status code. ZodError → field-level errors. Unknown → 500 (no stack trace exposed to client).

### Concept 44: Metrics Middleware
```typescript
export const metricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestsTotal.inc({ method: req.method, route: req.route?.path || req.path, status: res.statusCode });
    httpRequestDuration.observe({ method: req.method, route: req.route?.path }, duration);
  });
  next();
};
```
Prometheus metrics collect karta hai — request count, duration, status codes. Grafana dashboard pe visualize.

### Concept 45: Upload Middleware (Multer)
```typescript
const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuid()}${ext}`); // UUID filename (prevents collisions + path traversal)
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      cb(new BadRequestError('Only JPEG, PNG, WebP allowed'));
    }
    cb(null, true);
  },
});
```
- Max 5MB
- Only JPEG/PNG/WebP (no .exe, .php)
- UUID filename (security — no path traversal with `../../etc/passwd`)
- Disk storage (not memory — large files won't crash server)

---

## C. CORE UTILITIES

### Concept 46: Event Bus
```typescript
class EventBus {
  private emitter = new EventEmitter();

  emit(event: string, data: any): void {
    this.emitter.emit(event, data);
  }

  onEvent(event: string, handler: (data: any) => Promise<void>): void {
    this.emitter.on(event, async (data) => {
      try {
        await handler(data);
      } catch (err) {
        logger.error({ event, error: err }, 'Event handler failed');
        // Error isolated — other handlers unaffected
      }
    });
  }
}

export const eventBus = new EventBus();

export const Events = {
  PAYMENT_CAPTURED: 'payment.captured',
  PAYMENT_FAILED: 'payment.failed',
  PAYMENT_REFUNDED: 'payment.refunded',
  ORDER_CREATED: 'order.created',
  ORDER_SHIPPED: 'order.shipped',
  ORDER_DELIVERED: 'order.delivered',
  ORDER_CANCELLED: 'order.cancelled',
  REVIEW_SUBMITTED: 'review.submitted',
  REVIEW_APPROVED: 'review.approved',
  USER_REGISTERED: 'user.registered',
  STOCK_LOW: 'stock.low',
  STOCK_OUT: 'stock.out',
} as const;
```

### Concept 47: Event Handlers (Cross-Module Wiring)
```typescript
// core/event-handlers.ts
export const registerEventHandlers = (): void => {
  // Payment captured → create order + invoice + loyalty points
  eventBus.onEvent(Events.PAYMENT_CAPTURED, async (data) => {
    const { getFulfillmentQueue } = await import('../modules/inventory/jobs/queues/fulfillment.queue');
    const { getInvoiceQueue } = await import('../modules/payments/jobs/queues/invoice.queue');
    const { getPromotionsQueue } = await import('../modules/promotions/jobs/queues/promotions.queue');

    await getFulfillmentQueue().add('create-order', { paymentId: data.paymentId });
    await getInvoiceQueue().add('generate', { paymentId: data.paymentId });
    await getPromotionsQueue().add('earn-loyalty', { userId: data.userId, amount: data.amount });
  });

  // Review approved → recalculate rating summary
  eventBus.onEvent(Events.REVIEW_APPROVED, async (data) => {
    const { getReviewsQueue } = await import('../modules/reviews/jobs/queues/reviews.queue');
    await getReviewsQueue().add('calculate-summary', { productId: data.productId });
  });
};
```
**Lazy imports** (`await import(...)`) — Circular dependency avoid. Payment module ko inventory module ke internals jaanne ki zarurat nahi — event emit karo, handler kaam karega.

### Concept 48: Circuit Breaker
```typescript
export class CircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failures = 0;
  private lastFailure = 0;

  constructor(private name: string, private options: {
    failureThreshold: number;  // 5 failures
    resetTimeout: number;      // 60000ms (1 min)
  }) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailure > this.options.resetTimeout) {
        this.state = 'HALF_OPEN'; // Try one request
      } else {
        throw new Error(`Circuit breaker ${this.name} is OPEN`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }
}

// Pre-configured breakers
export const razorpayBreaker = new CircuitBreaker('razorpay', { failureThreshold: 5, resetTimeout: 60000 });
export const shiprocketBreaker = new CircuitBreaker('shiprocket', { failureThreshold: 3, resetTimeout: 120000 });
```

### Concept 49: Database Retry
```typescript
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 500,
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isTransientError(err) || attempt === maxRetries) throw err;
      await sleep(baseDelayMs * (attempt + 1)); // 500ms, 1000ms, 1500ms
    }
  }
  throw new Error('Unreachable');
}

const isTransientError = (err: any): boolean => {
  const codes = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE'];
  const messages = ['not primary', 'node is recovering', 'socket disconnected'];
  return codes.includes(err.code) || messages.some(m => err.message?.includes(m));
};
```

### Concept 50: Request Tracer (AsyncLocalStorage)
```typescript
import { AsyncLocalStorage } from 'async_hooks';

const store = new AsyncLocalStorage<{ traceId: string; requestId: string }>();

export const requestTracer = {
  run: (traceId: string, fn: () => void) => {
    store.run({ traceId, requestId: traceId }, fn);
  },
  getTraceId: (): string | undefined => {
    return store.getStore()?.traceId;
  },
};
```
`AsyncLocalStorage` — data propagate karta hai through entire async chain. Ek request ke andar kahi bhi `getTraceId()` call karo — same ID milegi. Logging aur debugging ke liye essential.

---

## D. AUTH MODULE

### Concept 51: User Model
```typescript
interface IUserDoc extends Document {
  phone: string;           // Unique, 10-digit Indian format
  firstName?: string;
  lastName?: string;
  email?: string;
  role: 'customer' | 'admin';
  isPhoneVerified: boolean;
  addresses: IAddress[];   // Array of shipping addresses
  avatar?: string;
  isActive: boolean;
  isBanned: boolean;
  bannedAt?: Date;
  bannedReason?: string;
  lastLogin?: Date;
}
```
**phone** primary identifier hai (not email). Indian market — phone number se OTP login. `addresses` embedded array — user ke multiple shipping addresses.

### Concept 52: Token Model
```typescript
interface ITokenDoc extends Document {
  userId: ObjectId;
  token: string;          // SHA256 hash (NOT raw token)
  type: 'refresh';
  expiresAt: Date;        // TTL index auto-deletes
  deviceInfo: {
    userAgent: string;
    ip: string;
    browser: string;
    os: string;
    deviceType: 'mobile' | 'desktop' | 'tablet';
    deviceName: string;
  };
  lastUsedAt: Date;       // Updated on every refresh
}
```
Raw refresh token kabhi DB me store nahi hota — SHA256 hash store hota hai. `deviceInfo` — "Chrome on Windows" jaisi info. `lastUsedAt` — Last active kab tha.

### Concept 53: JWT Token Generation
```typescript
const generateTokens = (userId: string, role: string) => {
  const accessToken = jwt.sign(
    { userId, role },
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessExpiry } // '15m'
  );

  const refreshToken = crypto.randomBytes(40).toString('hex'); // Raw 80-char hex string

  return { accessToken, refreshToken };
};
```
- **Access token**: JWT with userId + role, signed with secret, 15 min expiry
- **Refresh token**: Random 40-byte hex string, NOT a JWT (no payload to leak)

### Concept 54: Refresh Token Storage
```typescript
// Raw token → hash → store in DB
const hashedToken = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
await Token.create({
  userId, token: hashedToken, type: 'refresh',
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
  deviceInfo: extractDeviceInfo(req),
});

// Client gets raw token (in cookie)
res.cookie('refreshToken', rawRefreshToken, {
  httpOnly: true,   // JavaScript access nahi kar sakta (XSS protection)
  secure: true,     // HTTPS only
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000,
});
```
**Security layers**: Raw token sirf client ke paas (cookie me). DB me hash hai. Database breach → attacker ko actual tokens nahi milte. `httpOnly` → XSS attack se bhi token safe.

### Concept 55: Firebase Token Verification
```typescript
async verifyFirebaseToken(idToken: string, req: Request) {
  // 1. Verify with Firebase Admin SDK
  const decoded = await firebaseAdmin.auth().verifyIdToken(idToken);
  const phone = decoded.phone_number?.replace('+91', ''); // Strip country code

  // 2. Find or create user
  let user = await userRepo.findByPhone(phone);
  const isNewUser = !user;
  if (!user) {
    user = await userRepo.create({ phone, isPhoneVerified: true, role: 'customer' });
  }

  // 3. Generate JWT tokens
  const { accessToken, refreshToken } = generateTokens(user._id, user.role);

  // 4. Store refresh token (hashed) with device info
  await tokenRepo.create({ userId: user._id, token: hash(refreshToken), deviceInfo: extractDeviceInfo(req) });

  // 5. Update last login
  await userRepo.updateLastLogin(user._id);

  return { user: UserDTO.forAuth(user), tokens: { accessToken, refreshToken }, isNewUser };
}
```

### Concept 56: Token Refresh Flow
```typescript
async refreshToken(rawToken: string, req: Request) {
  // 1. Hash the raw token
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

  // 2. Find in DB (only non-expired)
  const tokenDoc = await tokenRepo.findByToken(hashedToken);
  if (!tokenDoc) throw new UnauthorizedError('Invalid refresh token');

  // 3. Check user status
  const user = await userRepo.findById(tokenDoc.userId);
  if (!user || !user.isActive) throw new UnauthorizedError('User inactive');
  if (user.isBanned) throw new ForbiddenError('Account suspended');

  // 4. Delete old token (single-use!)
  await tokenRepo.deleteByToken(hashedToken);

  // 5. Generate new pair
  const { accessToken, refreshToken: newRefreshToken } = generateTokens(user._id, user.role);

  // 6. Store new refresh token
  await tokenRepo.create({ userId: user._id, token: hash(newRefreshToken), deviceInfo: extractDeviceInfo(req) });

  return { tokens: { accessToken, refreshToken: newRefreshToken } };
}
```
**Token rotation** — Har refresh pe purana token delete, naya generate. Agar attacker purana token use kare → already deleted → fail. **Single-use refresh tokens**.

### Concept 57: Session Management
```typescript
// User dekh sakta hai ki kaunse devices pe logged in hai
async getUserSessions(userId: string, currentRefreshToken?: string) {
  const tokens = await tokenRepo.findByUserId(userId);
  return tokens.map(t => {
    const currentHash = currentRefreshToken
      ? crypto.createHash('sha256').update(currentRefreshToken).digest('hex')
      : null;
    return SessionDTO.forUser(t, t.token === currentHash); // isCurrent flag
  });
}

// Individual session revoke (logout specific device)
async revokeSession(userId: string, sessionId: string) {
  const token = await tokenRepo.findById(sessionId);
  if (!token || token.userId.toString() !== userId) throw new NotFoundError();
  await tokenRepo.deleteById(sessionId);
}
```

### Concept 58: Session DTO — Role-Aware
```typescript
export class SessionDTO {
  static forUser(token: ITokenDoc, isCurrent: boolean) {
    return {
      _id: token._id,
      deviceName: token.deviceInfo.deviceName,
      browser: token.deviceInfo.browser,
      os: token.deviceInfo.os,
      ip: maskIp(token.deviceInfo.ip),  // "192.168.1.xxx" (masked!)
      isCurrent,
      lastUsedAt: token.lastUsedAt,
    };
  }

  static forAdmin(token: ITokenDoc) {
    return {
      ...this.forUser(token, false),
      fullIp: token.deviceInfo.ip,       // Unmasked IP (admin only)
      userAgent: token.deviceInfo.userAgent, // Raw UA (admin only)
    };
  }
}
```
User ko masked IP dikhta hai (`192.168.1.xxx`). Admin ko full IP + raw User-Agent dikhta hai.

### Concept 59: Ban System
```typescript
// Admin bans user
async banUser(userId: string, reason: string) {
  const user = await userRepo.banUser(userId, reason);
  // Delete all refresh tokens → force logout on all devices
  await tokenRepo.deleteByUserId(userId);
  return user;
}

// Auth middleware checks on every request
if (user.isBanned) throw new ForbiddenError('Account suspended');
```
Ban karne pe saare tokens delete → saare devices pe next request fail → forced logout. Ban reason stored for records.

---

## E. CATALOG MODULE

### Concept 60: Product Model
```typescript
interface IProductDoc extends Document {
  name: string;
  slug: string;                    // URL-friendly unique identifier
  description?: string;
  shortDescription?: string;
  category: ObjectId;              // Reference to Category
  collections: ObjectId[];         // References to Collections
  basePrice: number;               // In rupees
  images: string[];                // Array of image URLs
  attributes: Map<string, string>; // { "weight": "250g", "origin": "Assam" }
  tags: string[];                  // ["premium", "organic"]
  status: 'draft' | 'active' | 'archived';
  isFeatured: boolean;
  stock: number;
  trackInventory: boolean;
}
```
**Slug** — `/product/assam-gold-tea` URL me use hota hai (SEO-friendly). **attributes** Map — flexible key-value pairs (har product ke alag attributes ho sakte hain). **trackInventory** — false means unlimited stock.

### Concept 61: Product Repository — Filtering
```typescript
async findList(params: {
  search?: string;
  categoryId?: string;
  collectionId?: string;
  status?: string;
  isFeatured?: boolean;
  priceMin?: number;
  priceMax?: number;
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}) {
  const filter: any = {};

  if (params.search) filter.$text = { $search: params.search }; // Full-text search
  if (params.categoryId) filter.category = params.categoryId;
  if (params.collectionId) filter.collections = params.collectionId;
  if (params.status) filter.status = params.status;
  if (params.isFeatured !== undefined) filter.isFeatured = params.isFeatured;
  if (params.priceMin || params.priceMax) {
    filter.basePrice = {};
    if (params.priceMin) filter.basePrice.$gte = params.priceMin;
    if (params.priceMax) filter.basePrice.$lte = params.priceMax;
  }

  const total = await Product.countDocuments(filter);
  const docs = await Product.find(filter)
    .populate('category', 'name slug')
    .populate('collections', 'name slug')
    .sort({ [params.sortBy]: params.sortOrder === 'asc' ? 1 : -1 })
    .skip((params.page - 1) * params.limit)
    .limit(params.limit);

  return { docs, meta: buildPaginationMeta(total, params.page, params.limit) };
}
```
Dynamic filter building — sirf provided parameters use hote hain. `$text` full-text search MongoDB text index se.

### Concept 62: Category Model — Self-Referencing
```typescript
interface ICategoryDoc extends Document {
  name: string;
  slug: string;
  description?: string;
  image?: string;
  parent?: ObjectId;      // Self-reference (tree structure)
  isActive: boolean;
  sortOrder: number;
}
```
`parent` — Category hierarchy bana sakte ho: "Tea" → "Black Tea" → "Assam Black Tea". Root categories ka `parent` null hota hai.

### Concept 63: Category Deletion Safety
```typescript
async deleteCategory(id: string) {
  const hasChildren = await categoryRepo.hasChildren(id);
  if (hasChildren) throw new BadRequestError('Cannot delete category with subcategories');

  const productCount = await productRepo.countByCategory(id);
  if (productCount > 0) throw new BadRequestError('Cannot delete category with products');

  return categoryRepo.deleteById(id);
}
```
Category delete karne se pehle check: subcategories hain? Products assigned hain? Agar haan → prevent deletion. **Referential integrity** application level pe.

### Concept 64: Collection Model
```typescript
interface ICollectionDoc extends Document {
  name: string;
  slug: string;
  description?: string;
  image?: string;
  isActive: boolean;
  isFeatured: boolean;
  sortOrder: number;
}
```
Collection = curated group of products (e.g., "Summer Collection", "Gift Sets"). Products multiple collections me ho sakte hain (many-to-many via Product.collections array).

### Concept 65: Image Upload Flow
```typescript
// Route
router.post('/uploads', auth, authorize('admin'), upload.single('image'), controller.uploadImage);

// Controller
uploadImage = async (req: Request, res: Response) => {
  if (!req.file) throw new BadRequestError('No file');
  const url = `/uploads/${req.file.filename}`; // Relative URL
  sendCreated(res, { url }, 'Image uploaded');
};
```
Admin image upload karta hai → Multer file save karta hai `uploads/` me UUID filename se → URL return hota hai → Product create/update me ye URL use hota hai.

---

## F. CART & CHECKOUT MODULE

### Concept 66: Cart Model
```typescript
interface ICartDoc extends Document {
  sessionId: string;        // Guest cart identifier (UUID)
  userId?: ObjectId;        // Null for guests, set for logged-in users
  items: {
    productId: ObjectId;
    qty: number;
    addedAt: Date;
  }[];
}
```
**Dual identity** — Guest cart `sessionId` se, logged-in cart `userId` se. Login pe merge hota hai.

### Concept 67: Cart Service — Add Item
```typescript
async addItem(sessionId: string, userId: string | null, productId: string, qty: number) {
  // 1. Find or create cart
  let cart = userId
    ? await Cart.findOne({ userId })
    : await Cart.findOne({ sessionId });
  if (!cart) cart = await Cart.create({ sessionId, userId });

  // 2. Check if item already exists
  const existingItem = cart.items.find(i => i.productId.toString() === productId);
  if (existingItem) {
    existingItem.qty += qty; // Increment quantity
  } else {
    cart.items.push({ productId, qty, addedAt: new Date() }); // New item
  }

  // 3. Save and return populated cart
  await cart.save();
  return this.getCart(sessionId, userId); // Returns with product details
}
```

### Concept 68: Cart Merge on Login
```typescript
async mergeCart(guestSessionId: string, userId: string) {
  const guestCart = await Cart.findOne({ sessionId: guestSessionId });
  if (!guestCart || guestCart.items.length === 0) return this.getCart(null, userId);

  let userCart = await Cart.findOne({ userId });
  if (!userCart) {
    // Simple: assign guest cart to user
    guestCart.userId = userId;
    await guestCart.save();
    return this.getCart(null, userId);
  }

  // Merge: add guest items to user cart
  for (const guestItem of guestCart.items) {
    const existing = userCart.items.find(i => i.productId.toString() === guestItem.productId.toString());
    if (existing) {
      existing.qty = Math.max(existing.qty, guestItem.qty); // Keep higher qty
    } else {
      userCart.items.push(guestItem);
    }
  }
  await userCart.save();
  await Cart.deleteOne({ _id: guestCart._id }); // Delete guest cart
  return this.getCart(null, userId);
}
```
Guest ne 3 items cart me daale → Login kiya → Guest items user cart me merge → Guest cart delete.

### Concept 69: Stock Reservation
```typescript
interface IStockReservationDoc extends Document {
  productId: ObjectId;
  qty: number;
  sessionId: string;
  expiresAt: Date;  // TTL index → auto-delete after 15 min
}

// Checkout pe reserve karo
async reserveStock(sessionId: string, items: CartItem[]) {
  for (const item of items) {
    const product = await Product.findById(item.productId);
    if (product.trackInventory && product.stock < item.qty) {
      throw new BadRequestError(`${product.name}: only ${product.stock} available`);
    }
    await StockReservation.create({
      productId: item.productId, qty: item.qty, sessionId,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 min
    });
  }
}
```
Checkout start hone pe stock reserve — doosra user wo items buy na kar sake. 15 min me payment complete nahi hua → TTL index automatically reservation delete → stock wapas available.

### Concept 70: Checkout Summary
```typescript
async getSummary(sessionId: string) {
  const cart = await this.getCart(sessionId);

  // Apply pricing engine on each item
  const items = await Promise.all(cart.items.map(async (item) => {
    const pricing = await pricingService.calculatePrice({
      productId: item.productId,
      basePrice: item.basePrice,
      categoryId: item.category,
      qty: item.qty,
    });
    return { ...item, pricing };
  }));

  const subtotal = items.reduce((s, i) => s + i.pricing.totalPrice, 0);
  const totalDiscount = items.reduce((s, i) => s + i.pricing.discountAmount * i.qty, 0);
  const totalTax = items.reduce((s, i) => s + i.pricing.taxAmount * i.qty, 0);

  return { items, subtotal, totalDiscount, totalTax, total: subtotal };
}
```

### Concept 71: Wishlist Model
```typescript
interface IWishlistDoc extends Document {
  sessionId: string;
  userId?: ObjectId;
  productIds: ObjectId[];
}
```
Simple array of product IDs. Toggle pattern — add if not present, remove if present.

---

## G. PRICING MODULE

### Concept 72: Price Rule Model
```typescript
interface IPriceRuleDoc extends Document {
  name: string;
  type: 'percentage' | 'fixed' | 'fixed_price'; // Discount type
  value: number;              // Discount value
  minQty?: number;            // Minimum quantity required
  maxQty?: number;            // Maximum quantity cap
  startDate?: Date;           // Valid from
  endDate?: Date;             // Valid until
  scope: 'global' | 'product' | 'category';
  productIds?: ObjectId[];    // For product scope
  categoryIds?: ObjectId[];   // For category scope
  priority: number;           // Higher = applied first
  isActive: boolean;
}
```
**Price rules** = discount definitions. "All products 10% off", "Black Tea category ₹50 off", "Buy 5+ units → 15% off".

### Concept 73: Tax Rule Model
```typescript
interface ITaxRuleDoc extends Document {
  name: string;
  rate: number;           // e.g., 18 (for 18% GST)
  categoryId?: ObjectId;  // Category-specific tax
  isInclusive: boolean;   // Tax included in price or added on top?
  isActive: boolean;
}
```
**isInclusive** — Important distinction:
- `true`: ₹500 me 18% GST already included (base = ₹423.73, tax = ₹76.27)
- `false`: ₹500 + 18% GST = ₹590 total

### Concept 74: Pricing Engine
```typescript
async calculatePrice(input: {
  productId: string;
  basePrice: number;
  categoryId: string;
  collectionIds?: string[];
  qty: number;
}) {
  // 1. Find applicable price rules (sorted by priority)
  const rules = await PriceRule.find({
    isActive: true,
    $or: [
      { scope: 'global' },
      { scope: 'product', productIds: input.productId },
      { scope: 'category', categoryIds: input.categoryId },
    ],
    $or: [{ startDate: null }, { startDate: { $lte: new Date() } }],
    $or: [{ endDate: null }, { endDate: { $gte: new Date() } }],
  }).sort({ priority: -1 });

  // 2. Apply best matching rule
  let discountPercent = 0, discountAmount = 0, appliedRule = null;
  for (const rule of rules) {
    if (rule.minQty && input.qty < rule.minQty) continue;
    if (rule.maxQty && input.qty > rule.maxQty) continue;

    if (rule.type === 'percentage') {
      discountPercent = rule.value;
      discountAmount = input.basePrice * (rule.value / 100);
    } else if (rule.type === 'fixed') {
      discountAmount = rule.value;
      discountPercent = (rule.value / input.basePrice) * 100;
    }
    appliedRule = rule.name;
    break; // First matching rule wins (highest priority)
  }

  // 3. Apply tax
  const priceAfterDiscount = input.basePrice - discountAmount;
  const taxRule = await TaxRule.findOne({ categoryId: input.categoryId, isActive: true });
  const taxRate = taxRule?.rate || 0;
  let taxAmount = 0, finalPrice = priceAfterDiscount;

  if (taxRule?.isInclusive) {
    taxAmount = priceAfterDiscount - (priceAfterDiscount / (1 + taxRate / 100));
    finalPrice = priceAfterDiscount; // Already included
  } else {
    taxAmount = priceAfterDiscount * (taxRate / 100);
    finalPrice = priceAfterDiscount + taxAmount; // Added on top
  }

  return {
    basePrice: input.basePrice, qty: input.qty,
    discountPercent, discountAmount, priceAfterDiscount,
    taxRate, taxAmount, isInclusive: !!taxRule?.isInclusive,
    finalPrice, unitPrice: finalPrice,
    totalPrice: finalPrice * input.qty,
    isOnSale: discountAmount > 0, appliedRule,
  };
}
```
Pricing engine completely **decoupled** — kisi bhi product ke liye independently calculate kar sakta hai.

---

## H. PAYMENTS MODULE

### Concept 75: Payment Model
```typescript
interface IPaymentDoc extends Document {
  sessionId: string;
  userId: ObjectId;
  razorpayOrderId: string;         // Unique
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  amountPaise: number;             // Amount in paise (₹500 = 50000)
  currency: string;                // 'INR'
  status: 'created' | 'authorized' | 'captured' | 'failed' | 'refunded' | 'partially_refunded';
  checkoutSnapshot: {              // Immutable copy of cart at payment time
    items: CheckoutLineItem[];
    subtotal: number;
    totalDiscount: number;
    totalTax: number;
    total: number;
  };
  shippingAddress: IAddress;
  walletDeductPaise: number;       // How much deducted from wallet
  refunds: { amount: number; razorpayRefundId: string; createdAt: Date }[];
  idempotencyKey: string;          // Unique per checkout attempt
  invoiceId?: ObjectId;
}
```
**checkoutSnapshot** — Cart prices payment time pe freeze. Baad me prices change hon to bhi invoice correct rahegi. `amountPaise` — Razorpay paise me kaam karta hai (₹1 = 100 paise).

### Concept 76: Payment Service — Create Order (Most Complex Function)
```typescript
async createOrder(userId: string, sessionId: string, address: IAddress, idempotencyKey: string, walletAmount = 0) {
  // 1. IDEMPOTENCY CHECK
  const existing = await paymentRepo.findByIdempotencyKey(idempotencyKey);
  if (existing && existing.status === 'created' && existing.createdAt > new Date(Date.now() - 25 * 60 * 1000)) {
    return existing; // Return same order (prevent duplicate)
  }

  // 2. GET CHECKOUT SUMMARY (pricing engine runs)
  const summary = await checkoutService.getSummary(sessionId);
  if (summary.items.length === 0) throw new BadRequestError('Cart is empty');

  // 3. RESERVE STOCK (15 min TTL)
  await checkoutService.reserveStock(sessionId, summary.items);

  // 4. WALLET DEDUCTION CALCULATION
  const totalPaise = Math.round(summary.total * 100);
  let walletDeductPaise = 0;
  let razorpayAmountPaise = totalPaise;

  if (walletAmount > 0) {
    const wallet = await walletService.getBalance(userId);
    walletDeductPaise = Math.min(Math.round(walletAmount * 100), totalPaise, wallet.balance * 100);
    razorpayAmountPaise = totalPaise - walletDeductPaise;
  }

  // 5. FULL WALLET PAYMENT (no Razorpay needed!)
  if (razorpayAmountPaise === 0) {
    await walletService.debit(userId, walletDeductPaise / 100, 'purchase', idempotencyKey);
    const payment = await paymentRepo.create({
      sessionId, userId, amountPaise: totalPaise, currency: 'INR',
      status: 'captured', checkoutSnapshot: summary, shippingAddress: address,
      walletDeductPaise, idempotencyKey, razorpayOrderId: `wallet_${idempotencyKey}`,
    });
    // Dispatch post-payment events
    eventBus.emit(Events.PAYMENT_CAPTURED, { paymentId: payment._id, userId, amount: summary.total });
    await cartService.clearCart(sessionId, userId);
    return { ...payment.toObject(), paidViaWallet: true };
  }

  // 6. CREATE RAZORPAY ORDER
  const razorpayOrder = await razorpay.orders.create({
    amount: razorpayAmountPaise,
    currency: 'INR',
    receipt: crypto.createHash('md5').update(idempotencyKey).digest('hex').slice(0, 40),
  });

  // 7. SAVE PAYMENT RECORD
  const payment = await paymentRepo.create({
    sessionId, userId,
    razorpayOrderId: razorpayOrder.id,
    amountPaise: totalPaise, currency: 'INR', status: 'created',
    checkoutSnapshot: summary, shippingAddress: address,
    walletDeductPaise, idempotencyKey,
  });

  // 8. SCHEDULE TIMEOUT CHECK (30 min)
  await paymentQueue.add('verify-timeout', { paymentId: payment._id }, { delay: 30 * 60 * 1000 });

  return {
    paymentId: payment._id, razorpayOrderId: razorpayOrder.id,
    amountPaise: razorpayAmountPaise, currency: 'INR',
    keyId: config.razorpay.keyId,
  };
}
```
**THE most complex function** in the entire backend. 8 steps, multiple services, idempotency, wallet integration, event dispatch, timeout scheduling.

### Concept 77: Payment Verification
```typescript
async verifyPayment(razorpayOrderId: string, razorpayPaymentId: string, razorpaySignature: string, userId: string) {
  // 1. SIGNATURE VERIFICATION (HMAC-SHA256)
  const expected = crypto.createHmac('sha256', config.razorpay.keySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(razorpaySignature), Buffer.from(expected))) {
    throw new BadRequestError('Invalid payment signature');
  }

  // 2. FIND & UPDATE PAYMENT
  const payment = await paymentRepo.findByRazorpayOrderId(razorpayOrderId);
  if (!payment || payment.status !== 'created') throw new BadRequestError('Invalid payment');

  payment.razorpayPaymentId = razorpayPaymentId;
  payment.razorpaySignature = razorpaySignature;
  payment.status = 'captured';
  await payment.save();

  // 3. DEBIT WALLET (if applicable)
  if (payment.walletDeductPaise > 0) {
    await walletService.debit(userId, payment.walletDeductPaise / 100, 'purchase', payment.idempotencyKey);
  }

  // 4. CLEAR CART
  await cartService.clearCart(payment.sessionId, userId);

  // 5. EMIT EVENT (triggers fulfillment, invoice, loyalty)
  eventBus.emit(Events.PAYMENT_CAPTURED, {
    paymentId: payment._id, userId, amount: payment.amountPaise / 100,
  });

  return payment;
}
```
**timingSafeEqual** — Timing attack prevention. Normal `===` comparison timing vary karta hai based on how many characters match. `timingSafeEqual` constant-time comparison karta hai.

### Concept 78: Webhook Handler
```typescript
async handleWebhook(body: any, signature: string) {
  // 1. Verify webhook signature
  const expected = crypto.createHmac('sha256', config.razorpay.webhookSecret)
    .update(JSON.stringify(body))
    .digest('hex');
  if (signature !== expected) throw new UnauthorizedError('Invalid webhook signature');

  // 2. Process based on event type
  const event = body.event;
  const paymentEntity = body.payload?.payment?.entity;

  if (event === 'payment.captured') {
    await this.handlePaymentCaptured(paymentEntity);
  } else if (event === 'payment.failed') {
    await this.handlePaymentFailed(paymentEntity);
  } else if (event === 'refund.created') {
    await this.handleRefundCreated(body.payload?.refund?.entity);
  }
}
```
Webhook = Razorpay server → our server notification. Backup mechanism — agar frontend verify call miss kare, webhook se bhi payment status update hoga.

### Concept 79: Refund Flow
```typescript
async initiateRefund(paymentId: string, amount?: number) {
  const payment = await paymentRepo.findById(paymentId);
  if (!payment || !['captured', 'partially_refunded'].includes(payment.status)) {
    throw new BadRequestError('Cannot refund this payment');
  }

  const refundAmount = amount || payment.amountPaise; // Full refund if no amount specified

  // 1. Call Razorpay refund API
  const razorpayRefund = await razorpay.payments.refund(payment.razorpayPaymentId, {
    amount: refundAmount,
  });

  // 2. Record refund
  payment.refunds.push({ amount: refundAmount, razorpayRefundId: razorpayRefund.id, createdAt: new Date() });
  const totalRefunded = payment.refunds.reduce((s, r) => s + r.amount, 0);
  payment.status = totalRefunded >= payment.amountPaise ? 'refunded' : 'partially_refunded';
  await payment.save();

  // 3. Credit wallet (if wallet was used)
  if (payment.walletDeductPaise > 0) {
    const walletRefund = Math.min(payment.walletDeductPaise, refundAmount);
    await walletQueue.add('credit', { userId: payment.userId, amount: walletRefund / 100, reason: 'refund' });
  }

  return payment;
}
```

### Concept 80: Wallet Model
```typescript
interface IWalletDoc extends Document {
  userId: ObjectId;     // Unique
  balance: number;      // In rupees
  currency: string;     // 'INR'
  isActive: boolean;
}

interface IWalletTransactionDoc extends Document {
  userId: ObjectId;
  type: 'credit' | 'debit';
  amount: number;
  reason: string;       // 'purchase', 'refund', 'admin_credit', 'referral_bonus'
  referenceId?: string; // Payment ID, order ID
  description: string;
  idempotencyKey?: string; // Prevent duplicate transactions
  balanceAfter: number;
}
```

### Concept 81: Invoice Generation (BullMQ Worker)
```typescript
// invoice.worker.ts
processor: async (job) => {
  const { paymentId } = job.data;
  const payment = await Payment.findById(paymentId).populate('userId');

  // Generate PDF using PDFKit
  const doc = new PDFDocument();
  doc.fontSize(20).text('Rajhans Tea — Invoice');
  doc.text(`Invoice #: INV-${Date.now()}`);
  doc.text(`Date: ${new Date().toLocaleDateString()}`);

  // Line items
  for (const item of payment.checkoutSnapshot.items) {
    doc.text(`${item.name} x${item.qty} — ₹${item.totalPrice}`);
  }
  doc.text(`Total: ₹${payment.amountPaise / 100}`);

  // Save PDF
  const pdfPath = `/uploads/invoices/INV-${paymentId}.pdf`;
  doc.pipe(fs.createWriteStream(pdfPath));
  doc.end();

  // Create invoice record
  await Invoice.create({ paymentId, invoiceNumber: `INV-${Date.now()}`, pdfPath, ... });
}
```

### Concept 82: Payment Timeout Worker
```typescript
// payment.worker.ts
processor: async (job) => {
  const { paymentId } = job.data;
  const payment = await Payment.findById(paymentId);

  if (payment && payment.status === 'created') {
    // 30 min passed, still "created" → mark failed
    payment.status = 'failed';
    await payment.save();

    // Release stock reservation
    await checkoutService.releaseStock(payment.sessionId);

    // Refund wallet if partially deducted
    if (payment.walletDeductPaise > 0) {
      await walletQueue.add('credit', { userId: payment.userId, amount: payment.walletDeductPaise / 100, reason: 'payment_timeout' });
    }
  }
}
```

---

## I. INVENTORY & ORDERS MODULE

### Concept 83: Order Model
```typescript
interface IOrderDoc extends Document {
  orderNumber: string;     // "ORD-1711530000-ABC123"
  userId: ObjectId;
  paymentId: ObjectId;     // Unique
  items: {
    productId: ObjectId;
    name: string;
    qty: number;
    unitPrice: number;
    totalPrice: number;
    fulfillmentStatus: string;
  }[];
  subtotal: number;
  totalDiscount: number;
  totalTax: number;
  shippingCost: number;
  total: number;
  status: 'confirmed' | 'processing' | 'shipped' | 'in_transit' |
          'out_for_delivery' | 'delivered' | 'cancelled' |
          'return_requested' | 'returned';
  statusHistory: { status: string; timestamp: Date; note?: string; updatedBy?: ObjectId }[];
  shippingAddress: IAddress;
  warehouseId?: ObjectId;
  shiprocket: {
    orderId?: number;
    shipmentId?: number;
    awbCode?: string;        // Air Waybill number
    courierName?: string;
    trackingUrl?: string;
    label?: string;          // Shipping label URL
    estimatedDelivery?: Date;
    pickupScheduledDate?: Date;
  };
}
```
**statusHistory** — Har status change recorded with timestamp. "Shipped at 2:30 PM by admin Rahul". **shiprocket** — Shipping integration data (AWB = tracking number).

### Concept 84: Order Status Machine
```
confirmed → processing → shipped → in_transit → out_for_delivery → delivered
    ↓
    ↓→ cancelled
                                                       delivered → return_requested → returned
```
Status transitions validated hain — "confirmed" se directly "delivered" nahi ja sakte. Har transition ke rules hain.

### Concept 85: Fulfillment Worker
```typescript
// fulfillment.worker.ts — Triggered by PAYMENT_CAPTURED event
processor: async (job) => {
  const { paymentId } = job.data;
  const payment = await Payment.findById(paymentId);

  // 1. Create Order from payment snapshot
  const order = await Order.create({
    orderNumber: generateOrderNumber(),
    userId: payment.userId,
    paymentId: payment._id,
    items: payment.checkoutSnapshot.items.map(i => ({
      productId: i.productId, name: i.name, qty: i.qty,
      unitPrice: i.pricing.unitPrice, totalPrice: i.pricing.totalPrice,
      fulfillmentStatus: 'pending',
    })),
    subtotal: payment.checkoutSnapshot.subtotal,
    total: payment.amountPaise / 100,
    status: 'confirmed',
    statusHistory: [{ status: 'confirmed', timestamp: new Date() }],
    shippingAddress: payment.shippingAddress,
  });

  // 2. Deduct stock
  for (const item of order.items) {
    await Product.findByIdAndUpdate(item.productId, { $inc: { stock: -item.qty } });
    await StockMovement.create({
      productId: item.productId, qty: -item.qty,
      type: 'out', reason: `Order ${order.orderNumber}`,
    });
  }

  // 3. Check low stock alerts
  for (const item of order.items) {
    const product = await Product.findById(item.productId);
    if (product.stock <= 5 && product.trackInventory) {
      eventBus.emit(Events.STOCK_LOW, { productId: product._id, stock: product.stock });
    }
  }
}
```

### Concept 86: Shiprocket Integration
```typescript
class ShiprocketProvider {
  private token: string | null = null;
  private tokenExpiry = 0;

  // Token-based auth (10-day cache)
  private async getToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiry) return this.token;

    const res = await axios.post(`${baseUrl}/auth/login`, {
      email: config.shiprocket.email,
      password: config.shiprocket.password,
    });
    this.token = res.data.token;
    this.tokenExpiry = Date.now() + 10 * 24 * 60 * 60 * 1000; // 10 days
    return this.token!;
  }

  async createOrder(order: IOrderDoc, warehouse: IWarehouseDoc) {
    const token = await this.getToken();
    return shiprocketBreaker.execute(async () => {
      const res = await axios.post(`${baseUrl}/orders/create/adhoc`, {
        order_id: order.orderNumber,
        billing_customer_name: order.shippingAddress.name,
        // ... all shipping details
      }, { headers: { Authorization: `Bearer ${token}` } });
      return res.data;
    });
  }

  async trackShipment(awbCode: string) { /* ... */ }
  async cancelOrder(shiprocketOrderId: number) { /* ... */ }
  async generateLabel(shipmentId: number) { /* ... */ }
  async schedulePickup(shipmentId: number) { /* ... */ }
}
```
**Circuit breaker** wraps every Shiprocket call — agar API down hai to fast-fail.

### Concept 87: Warehouse Model
```typescript
interface IWarehouseDoc extends Document {
  name: string;
  address: IAddress;
  isDefault: boolean;
  isActive: boolean;
  shiprocketPickupLocationId?: number;
}
```
Multiple warehouses support — order nearest warehouse se fulfill. Default warehouse fallback.

### Concept 88: Stock Movement Audit Trail
```typescript
interface IStockMovementDoc extends Document {
  productId: ObjectId;
  qty: number;           // Negative for deductions
  type: 'in' | 'out' | 'adjustment';
  reason: string;        // "Order ORD-123", "Manual adjustment", "Return ORD-456"
  refOrderId?: string;
  performedBy?: ObjectId;
}
```
Har stock change recorded — kab, kitna, kyu, kisne. Audit trail for inventory accountability.

---

## J. PROMOTIONS MODULE

### Concept 89: Coupon Model
```typescript
interface ICouponDoc extends Document {
  code: string;              // "SUMMER20" (uppercase, unique)
  discountType: 'percentage' | 'fixed';
  discountValue: number;     // 20 (for 20% or ₹20)
  minOrderAmount?: number;   // Minimum cart total
  maxDiscountCap?: number;   // Max ₹ discount (for percentage)
  usageLimitTotal?: number;  // Total uses allowed
  usageLimitPerUser?: number; // Uses per user
  usedCount: number;
  validFrom: Date;
  validUntil: Date;
  scope: 'all' | 'products' | 'categories';
  productIds?: ObjectId[];
  categoryIds?: ObjectId[];
  stackable: boolean;        // Can combine with other coupons?
  isActive: boolean;
  createdBy: ObjectId;
}
```

### Concept 90: Coupon Validation
```typescript
async validateCoupon(code: string, userId: string, cartTotal: number) {
  const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });
  if (!coupon) throw new NotFoundError('Invalid coupon code');

  // Date check
  const now = new Date();
  if (coupon.validFrom > now) throw new BadRequestError('Coupon not yet active');
  if (coupon.validUntil < now) throw new BadRequestError('Coupon expired');

  // Usage limits
  if (coupon.usageLimitTotal && coupon.usedCount >= coupon.usageLimitTotal) {
    throw new BadRequestError('Coupon usage limit reached');
  }
  const userUsage = await CouponUsage.countDocuments({ couponId: coupon._id, userId });
  if (coupon.usageLimitPerUser && userUsage >= coupon.usageLimitPerUser) {
    throw new BadRequestError('You have already used this coupon');
  }

  // Minimum order amount
  if (coupon.minOrderAmount && cartTotal < coupon.minOrderAmount) {
    throw new BadRequestError(`Minimum order amount: ₹${coupon.minOrderAmount}`);
  }

  // Calculate discount
  let discount = coupon.discountType === 'percentage'
    ? cartTotal * (coupon.discountValue / 100)
    : coupon.discountValue;

  // Cap discount
  if (coupon.maxDiscountCap) discount = Math.min(discount, coupon.maxDiscountCap);

  return { coupon, discount };
}
```
Multi-layer validation — date, usage limits, minimum amount, scope matching. All edge cases handled.

### Concept 91: Loyalty Program
```typescript
interface ILoyaltyAccountDoc extends Document {
  userId: ObjectId;       // Unique
  points: number;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  lifetimeSpent: number;
}
```
Payment capture pe points earn. Points redeem kar sakte ho wallet credit ke roop me. Tier based on lifetime spending.

### Concept 92: Referral System
```typescript
interface IReferralDoc extends Document {
  referrerId: ObjectId;    // Who referred
  refereeId: ObjectId;     // Who was referred
  status: 'pending' | 'completed';
  rewardPoints: number;
}
```
Existing user referral code share karta hai → New user sign up karta hai with code → New user pehli purchase kare → dono ko reward points.

---

## K. REVIEWS & Q&A MODULE

### Concept 93: Review Model
```typescript
interface IReviewDoc extends Document {
  userId: ObjectId;
  productId: ObjectId;
  rating: number;           // 1-5
  title: string;
  body: string;
  images: string[];
  isVerifiedPurchase: boolean;  // User ne actually buy kiya?
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  helpfulVotes: number;
  reportCount: number;
  adminReply?: { body: string; repliedBy: ObjectId; repliedAt: Date };
  isPinned: boolean;
}
```
`isVerifiedPurchase` — System automatically check karta hai ki user ne ye product order kiya hai kya. Verified reviews zyada trustworthy.

### Concept 94: Rating Summary (Denormalized)
```typescript
interface IRatingSummaryDoc extends Document {
  productId: ObjectId;     // Unique
  averageRating: number;   // 4.3
  totalReviews: number;    // 127
  distribution: { 1: number; 2: number; 3: number; 4: number; 5: number };
}
```
Har review approve hone pe summary recalculate hota hai (BullMQ job). **Denormalized** — har request pe aggregate query nahi lagani padti, pre-computed data directly serve hota hai.

### Concept 95: Q&A System
```typescript
interface IQuestionDoc extends Document {
  productId: ObjectId;
  userId: ObjectId;
  questionText: string;
  answers: {
    userId: ObjectId;
    body: string;
    isAdminAnswer: boolean;
    createdAt: Date;
  }[];
  voteCount: number;
}
```
Users product pe questions puch sakte hain. Other users ya admin answer kar sakte hain. Admin answers highlighted.

---

## L. SEARCH MODULE

### Concept 96: Full-Text Search
```typescript
async search(params: { q: string; filters: SearchFilters; sort: SortOption; page: number }) {
  const filter: any = { status: 'active' };

  // Full-text search
  if (params.q) {
    filter.$text = { $search: params.q };
  }

  // Apply filters
  if (params.filters.categoryId) filter.category = params.filters.categoryId;
  if (params.filters.priceMin || params.filters.priceMax) {
    filter.basePrice = {};
    if (params.filters.priceMin) filter.basePrice.$gte = params.filters.priceMin;
    if (params.filters.priceMax) filter.basePrice.$lte = params.filters.priceMax;
  }
  if (params.filters.inStock) filter.stock = { $gt: 0 };
  if (params.filters.tags?.length) filter.tags = { $in: params.filters.tags };

  const products = await Product.find(filter)
    .populate('category', 'name slug')
    .sort(this.buildSort(params.sort, !!params.q))
    .skip((params.page - 1) * 20)
    .limit(20);

  // Build facets (aggregation)
  const facets = await this.buildFacets(filter);

  // Log search analytics
  await SearchAnalytics.create({ query: params.q, resultCount: products.length });

  return { data: products, meta: { page: params.page, total, totalPages }, facets };
}
```

### Concept 97: Search Facets
```typescript
async buildFacets(baseFilter: any) {
  const [categories, priceRange, tags] = await Promise.all([
    Product.aggregate([
      { $match: baseFilter },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'cat' } },
    ]),
    Product.aggregate([
      { $match: baseFilter },
      { $group: { _id: null, min: { $min: '$basePrice' }, max: { $max: '$basePrice' } } },
    ]),
    Product.aggregate([
      { $match: baseFilter },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
    ]),
  ]);

  return { categories, priceRange: priceRange[0], tags };
}
```
Facets = "search results ke based pe available filters". MongoDB aggregation pipeline se calculate.

### Concept 98: Autocomplete
```typescript
async autocomplete(q: string, limit = 8) {
  const products = await Product.find(
    { $text: { $search: q }, status: 'active' },
    { score: { $meta: 'textScore' } },
  ).sort({ score: { $meta: 'textScore' } }).limit(limit).select('name slug images');

  const categories = await Category.find(
    { name: { $regex: q, $options: 'i' }, isActive: true },
  ).limit(3).select('name slug');

  return [
    ...products.map(p => ({ type: 'product', name: p.name, slug: p.slug, image: p.images[0] })),
    ...categories.map(c => ({ type: 'category', name: c.name, slug: c.slug })),
  ];
}
```
Products + categories dono me search. Text score se relevance ranking.

---

## M. ADMIN, AUDIT, CMS & SETTINGS

### Concept 99: Admin Dashboard Stats
```typescript
async getDashboardStats() {
  const [totalUsers, todaySignups, totalOrders, revenue] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ createdAt: { $gte: startOfToday() } }),
    Order.countDocuments(),
    Payment.aggregate([
      { $match: { status: 'captured' } },
      { $group: { _id: null, total: { $sum: '$amountPaise' } } },
    ]),
  ]);

  return {
    totalUsers, todaySignups, totalOrders,
    revenue: (revenue[0]?.total || 0) / 100, // Paise → Rupees
  };
}
```
`Promise.all` — 4 queries parallel me chalti hain. Sequential hoti to 4x slow hota.

### Concept 100: Audit Log
```typescript
interface IAuditLogDoc extends Document {
  userId: ObjectId;
  action: string;        // "user.ban", "product.update", "order.refund"
  resource: string;      // "user", "product", "order"
  resourceId: string;
  changes: {
    before: any;         // Previous state
    after: any;          // New state
  };
  ipAddress: string;
  timestamp: Date;
}
```
Har mutation (create, update, delete, ban) logged with before/after snapshots. "Kaun ne kya kiya kab" — compliance aur debugging ke liye.

### Concept 101: CMS — Pages & Blog
```typescript
// Page (static content)
interface IPageDoc { title: string; slug: string; content: string; isPublished: boolean; }

// Blog (articles)
interface IBlogDoc { title: string; slug: string; content: string; excerpt: string;
  author: ObjectId; tags: string[]; featuredImage?: string; isPublished: boolean; views: number; }
```
About Us, Terms & Conditions, Privacy Policy — CMS se manage. Blog posts for content marketing.

### Concept 102: Store Settings
```typescript
interface IStoreSettingsDoc {
  storeName: string;
  supportEmail: string;
  supportPhone: string;
  address: IAddress;
  policies: { returns: string; shipping: string; privacy: string };
  socialMedia: { instagram?: string; facebook?: string; twitter?: string };
}
```
Admin se configurable store settings — support info, policies, social links.

---

## N. API ROUTE MAP

### Concept 103: Complete Route Structure
```
/api/v1/
├── health/
│   ├── GET /live                    ← Basic alive check
│   └── GET /ready                   ← DB + Redis check
│
├── auth/
│   ├── POST /verify-token           ← Firebase → JWT (public, rate-limited)
│   ├── POST /refresh-token          ← Token rotation (public)
│   ├── POST /logout                 ← Single session logout
│   ├── POST /logout-all             ← All sessions logout (auth)
│   ├── GET  /me                     ← User profile (auth)
│   ├── GET  /sessions               ← List active sessions (auth)
│   └── DELETE /sessions/:id         ← Revoke session (auth)
│
├── catalog/
│   ├── GET /categories              ← Public category list (cached 5min)
│   ├── GET /collections             ← Public collection list (cached 5min)
│   ├── GET /products                ← Public product list (cached 2min)
│   └── GET /products/:slug          ← Product detail
│
├── cart/
│   ├── GET  /                       ← Get cart (X-Session-ID)
│   ├── POST /items                  ← Add item
│   ├── PUT  /items/:productId       ← Update qty
│   ├── DELETE /items/:productId     ← Remove item
│   ├── DELETE /                     ← Clear cart
│   └── POST /merge                  ← Merge guest → user (auth)
│
├── wishlist/
│   ├── GET  /                       ← Get wishlist
│   ├── POST /:productId             ← Toggle wishlist
│   └── POST /merge                  ← Merge guest → user (auth)
│
├── checkout/
│   ├── GET  /summary                ← Pricing summary (X-Session-ID)
│   └── POST /reserve                ← Reserve stock
│
├── payments/
│   ├── POST /orders                 ← Create Razorpay order (auth)
│   ├── POST /verify                 ← Verify payment (auth)
│   ├── POST /webhook                ← Razorpay webhook (raw body)
│   ├── GET  /history                ← Payment history (auth)
│   └── POST /:id/refund            ← Initiate refund (admin)
│
├── wallet/
│   ├── GET  /                       ← Balance (auth)
│   ├── GET  /transactions           ← Transaction history (auth)
│   └── POST /credit                 ← Manual credit (admin)
│
├── invoices/
│   ├── GET  /                       ← User's invoices (auth)
│   └── GET  /:id/download           ← Download PDF
│
├── orders/
│   ├── GET  /user                   ← User's orders (auth)
│   ├── GET  /user/:id               ← Order detail (auth)
│   └── GET  /user/:id/tracking      ← Tracking info (auth)
│
├── search/
│   ├── GET  /                       ← Full-text search with facets
│   └── GET  /autocomplete           ← Suggestions
│
├── reviews/
│   ├── GET  /products/:id/reviews   ← Product reviews
│   ├── GET  /products/:id/summary   ← Rating summary
│   ├── POST /products/:id/reviews   ← Submit review (auth)
│   ├── POST /reviews/:id/vote       ← Helpful vote (auth)
│   ├── POST /reviews/:id/report     ← Report review (auth)
│   ├── GET  /products/:id/qa        ← Q&A
│   └── POST /products/:id/questions ← Ask question (auth)
│
├── promotions/
│   ├── POST /coupons/validate       ← Validate coupon
│   ├── GET  /loyalty                ← Loyalty balance (auth)
│   └── GET  /referral/code          ← Referral code (auth)
│
├── cms/
│   ├── GET  /pages                  ← Published pages
│   └── GET  /pages/:slug            ← Page by slug
│
├── admin/ (all routes: auth + authorize('admin'))
│   ├── GET  /dashboard/stats        ← Dashboard KPIs
│   ├── CRUD /users                  ← User management
│   ├── PATCH /users/:id/ban         ← Ban user
│   ├── PATCH /users/:id/unban       ← Unban user
│   ├── CRUD /products               ← Product management
│   ├── POST /uploads                ← Image upload
│   ├── CRUD /categories             ← Category management
│   ├── CRUD /collections            ← Collection management
│   ├── CRUD /orders                 ← Order management + shipping
│   ├── CRUD /pricing/rules          ← Price rules
│   ├── CRUD /pricing/tax            ← Tax rules
│   ├── CRUD /promotions/coupons     ← Coupon management
│   ├── CRUD /inventory              ← Stock management
│   ├── CRUD /warehouses             ← Warehouse management
│   ├── GET  /reviews/moderation     ← Review moderation
│   ├── PUT  /settings               ← Store settings
│   └── CRUD /cms                    ← Page/blog management
│
└── GET /metrics                     ← Prometheus metrics
```

---

## QUICK REFERENCE — Key Backend Files

| What | Path |
|------|------|
| **Entry & Config** | |
| Server entry | `backend/src/server.ts` |
| Express app | `backend/src/app.ts` |
| Config | `backend/src/config/index.ts` |
| Route mounting | `backend/src/api/v1/routes/index.ts` |
| **Core** | |
| Base repository | `backend/src/core/base.repository.ts` |
| Event bus | `backend/src/core/event-bus.ts` |
| Event handlers | `backend/src/core/event-handlers.ts` |
| Circuit breaker | `backend/src/core/circuit-breaker.ts` |
| DB retry | `backend/src/core/db-retry.ts` |
| Request tracer | `backend/src/core/request-tracer.ts` |
| **Auth Module** | |
| User model | `backend/src/modules/auth/models/user.model.ts` |
| Token model | `backend/src/modules/auth/models/token.model.ts` |
| Auth service | `backend/src/modules/auth/services/auth.service.ts` |
| Session service | `backend/src/modules/auth/services/session.service.ts` |
| User DTO | `backend/src/modules/auth/dto/user.dto.ts` |
| **Catalog Module** | |
| Product model | `backend/src/modules/catalog/models/product.model.ts` |
| Product service | `backend/src/modules/catalog/services/product.service.ts` |
| Product repo | `backend/src/modules/catalog/repositories/product.repository.ts` |
| **Payments Module** | |
| Payment model | `backend/src/modules/payments/models/payment.model.ts` |
| Payment service | `backend/src/modules/payments/services/payment.service.ts` |
| Wallet service | `backend/src/modules/payments/services/wallet.service.ts` |
| Invoice worker | `backend/src/modules/payments/jobs/workers/invoice.worker.ts` |
| Payment worker | `backend/src/modules/payments/jobs/workers/payment.worker.ts` |
| **Inventory Module** | |
| Order model | `backend/src/modules/inventory/models/order.model.ts` |
| Order service | `backend/src/modules/inventory/services/order.service.ts` |
| Fulfillment worker | `backend/src/modules/inventory/jobs/workers/fulfillment.worker.ts` |
| Shiprocket | `backend/src/modules/inventory/services/shipping/shiprocket.provider.ts` |
| **Pricing Module** | |
| Pricing service | `backend/src/modules/pricing/services/pricing.service.ts` |
| **Promotions Module** | |
| Coupon service | `backend/src/modules/promotions/services/coupon.service.ts` |
| Loyalty service | `backend/src/modules/promotions/services/loyalty.service.ts` |
| **Other Modules** | |
| Review store | `backend/src/modules/reviews/services/review.service.ts` |
| Search service | `backend/src/modules/search/services/search.service.ts` |
| CMS service | `backend/src/modules/cms/services/cms.service.ts` |
| Audit service | `backend/src/modules/audit/services/audit.service.ts` |

---

## DEBUGGING TIPS (Backend)

1. **API returning 401?** → Check JWT token in Authorization header. Expired? Refresh token.
2. **API returning 403?** → User banned? Role mismatch? Check `req.user.role`
3. **API returning 400?** → Zod validation failed. Check error.errors array for field details
4. **API returning 404?** → Wrong URL? Resource deleted? Check route pattern matches
5. **API returning 409?** → Duplicate entry (unique constraint). Check slug, phone, etc.
6. **API returning 429?** → Rate limit hit. Wait 60 seconds
7. **Payment not captured?** → Check webhook received? Signature valid? Check payment.status
8. **Order not created?** → Fulfillment queue running? Check BullMQ worker logs
9. **Invoice not generated?** → Invoice queue running? PDFKit error? Check worker logs
10. **Stock not deducting?** → Fulfillment worker ran? Check StockMovement records
11. **Search returning nothing?** → Text index exists? Product status 'active'?
12. **Slow API?** → Check for missing indexes. Enable MongoDB query profiling.

---

*Previous: [Part 2 — Frontend KT](./02-frontend.md)*
*First: [Part 1 — Infrastructure KT](./01-infrastructure.md)*
