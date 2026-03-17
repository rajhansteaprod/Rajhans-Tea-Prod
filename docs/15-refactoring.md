# 15 — Refactoring Opportunities

Issues found from the current codebase. Each includes: what's wrong, why it matters, exact fix.

---

## RF-001 — Stale Type Definitions in `auth.types.ts`

**Severity:** Low | **Effort:** 15 min

**What's wrong:**
`backend/src/types/auth.types.ts` contains interfaces from the old OTP flow that no longer exists:
```typescript
// These don't map to anything in the current codebase:
export interface ISendOtpRequest { phone: string; }
export interface ISendOtpResponse { message: string; expiresIn: number; }
export interface IVerifyOtpRequest { phone: string; otp: string; }
```

**Why it matters:** Dead code creates confusion. A new developer reads these and thinks `sendOtp` is a valid API operation.

**Fix:** Delete the three stale interfaces. Keep `IAuthTokens`, `IAuthResponse`, `IRefreshTokenRequest`, `IRefreshTokenResponse`, `ITokenPayload`.

---

## RF-002 — Manual Dependency Instantiation in Services

**Severity:** Medium | **Effort:** 1 hour

**What's wrong:**
Services create their own repositories with `new`:
```typescript
// auth.service.ts
constructor() {
  this.userRepo = new UserRepository();    // tight coupling
  this.tokenRepo = new TokenRepository();  // can't inject mocks cleanly
}
```

**Why it matters:**
1. Tests have to access private properties to get mock instances (fragile)
2. You can't swap implementations without changing service source code
3. Multiple services create multiple repository instances — no sharing

**Fix:** Accept repositories as constructor parameters (Dependency Injection):
```typescript
export class AuthService {
  constructor(
    private readonly userRepo: UserRepository = new UserRepository(),
    private readonly tokenRepo: TokenRepository = new TokenRepository(),
  ) {}
}

// In tests:
const mockUserRepo = createMock<UserRepository>();
const service = new AuthService(mockUserRepo, mockTokenRepo);
// Clean — no reaching into private properties
```

The default parameter `= new UserRepository()` means production code works without change. Only tests need to pass mocks.

---

## RF-003 — `as never` Type Casts are Code Smells

**Severity:** Low | **Effort:** 30 min

**What's wrong:**
```typescript
// admin-dashboard.service.ts
this.userRepo.count({ isActive: true } as never)
this.userRepo.count({ role: 'admin' } as never)
```

`as never` is a TypeScript escape hatch that disables all type checking. It's used here because `BaseRepository.count()` takes `Filter<T>` which requires `Partial<T>` — but these filters use known fields.

**Why it matters:** `as never` tells TypeScript "trust me, I know better". This defeats the purpose of TypeScript. A typo in `isActivee` would not be caught.

**Fix:** Fix the `BaseRepository` type to properly accept MongoDB filter objects:
```typescript
// base.repository.ts — change Filter type to accept any MongoDB query
type Filter<T> = Partial<T> & Record<string, unknown>;
// This allows { isActive: true } without casting
```

---

## RF-004 — Access Tokens in localStorage

**Severity:** High | **Effort:** 2 hours

**What's wrong:**
```typescript
// frontend/src/app/core/services/auth.service.ts
localStorage.setItem('accessToken', res.data.tokens.accessToken);
localStorage.setItem('refreshToken', res.data.tokens.refreshToken);
```

**Why it matters:** `localStorage` is accessible by JavaScript. If the app ever has an XSS vulnerability, an attacker can read `localStorage.getItem('accessToken')` and steal the token.

The refresh token is correctly set as `httpOnly` cookie by the backend — JavaScript can't read it. But it's also redundantly stored in `localStorage`.

**Fix:**
1. Access token: Keep in memory only (`signal<string | null>`). On page refresh, use the refresh token to get a new access token automatically.
2. Refresh token: Remove from `localStorage`. The httpOnly cookie is already the correct storage.

```typescript
// Better pattern:
private _accessToken = signal<string | null>(null); // memory only

// On app startup, if no access token in memory, auto-refresh:
ngOnInit() {
  if (!this._accessToken()) {
    this.refreshToken().subscribe();
  }
}
```

This is a breaking change that requires careful implementation and testing.

---

## RF-005 — `console.log` in Production Code

**Severity:** Low | **Effort:** 15 min

**What's wrong:**
```typescript
// frontend/src/app/core/services/firebase.service.ts
console.log('[Firebase] Sending OTP to', fullNumber);   // leaks phone number
console.error('[Firebase] Send OTP error:', err);
console.warn('[Firebase] reCAPTCHA expired...');
```

**Why it matters:** `console.log` in production:
1. Shows user data (phone numbers) in the browser console — privacy concern
2. Pollutes the console for users who open DevTools
3. No way to turn it off per environment

**Fix:** Replace with a proper Angular logger service that respects `environment.production`:
```typescript
// Simple approach:
if (!environment.production) {
  console.log('[Firebase] reCAPTCHA solved');
}
```

---

## RF-006 — Metrics Endpoint Unauthenticated

**Severity:** Medium | **Effort:** 30 min (Nginx config)

**What's wrong:**
```typescript
// backend/src/api/v1/routes/metrics.routes.ts
router.get('/metrics', async (_req, res) => {
  res.end(await client.register.metrics());
});
// No authentication. Anyone can access this.
```

**Why it matters:** Prometheus metrics expose internal system information:
- Memory usage, heap size
- Request rates per route
- Error rates
This is useful for attackers mapping your attack surface.

**Fix:** Restrict `/metrics` to internal network in Nginx:
```nginx
location /metrics {
    allow 10.0.0.0/8;   # internal network only
    allow 172.16.0.0/12;
    deny all;
    proxy_pass http://backend;
}
```
Or add a shared secret check in the route.

---

## RF-007 — Auth Interceptor Uses String Matching

**Severity:** Low | **Effort:** 20 min

**What's wrong:**
```typescript
// auth.interceptor.ts
const isAuthEndpoint = req.url.includes('/auth/') &&
  !req.url.includes('/auth/me') &&
  !req.url.includes('/auth/logout-all');
```

**Why it matters:** This is fragile. If a future route is `/auth/verify-email` and it needs a token, someone might forget to update this list.

**Fix:** Instead of a blacklist (exclude specific routes), use a whitelist (only exclude unauthenticated routes):
```typescript
const PUBLIC_ROUTES = ['/auth/verify-token', '/auth/refresh-token', '/auth/logout'];
const isPublic = PUBLIC_ROUTES.some(route => req.url.endsWith(route));

if (token && !isPublic) {
  req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}
```

---

## RF-008 — Seed Script Has Hardcoded Phone Number

**Severity:** Medium | **Effort:** 15 min

**What's wrong:**
```javascript
// infrastructure/seeds/seed-admin.js
db.users.updateOne(
  { phone: '6266303713' },  // hardcoded! committed to git
  ...
```

**Why it matters:** The admin's phone number is now in the public git history. Anyone with repo access knows which phone number has admin privileges.

**Fix:** Read the phone number from a command line argument or environment variable:
```javascript
// Usage: ADMIN_PHONE=9876543210 mongosh ... seed-admin.js
const adminPhone = process.env.ADMIN_PHONE;
if (!adminPhone) { print('Error: ADMIN_PHONE env var required'); quit(1); }
db.users.updateOne({ phone: adminPhone }, ...);
```
