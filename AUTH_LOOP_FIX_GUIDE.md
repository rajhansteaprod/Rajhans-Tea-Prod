# 🔐 INFINITE AUTH LOOP - COMPLETE FIX GUIDE

**Status:** ✅ Fixed (Frontend Interceptor Updated)

---

## 📋 PROBLEM ANALYSIS

### The Broken Flow
```
User opens app (no localStorage token)
  ↓ API: GET /products
  ↓
Backend: 401 Unauthorized (no token)
  ↓
Frontend Interceptor: "Let me refresh"
  ↓ API: POST /refresh-token
  ↓
Backend: 401 (invalid refresh token)
  ↓
Frontend: "Give up, logout"
  ↓ MULTIPLE requests at once
  ↓ EACH tries to refresh simultaneously ❌
  ↓ EACH gets 401
  ↓ EACH clears state
  ↓ INFINITE LOOP 🔄
```

### Root Causes
1. ❌ No request queueing while refresh is in progress
2. ❌ Multiple concurrent 401s all trigger independent refresh attempts
3. ❌ No `isRefreshing` flag to prevent duplicate refresh calls
4. ❌ No distinction between "need to refresh" vs "completely logged out"

---

## ✅ SOLUTION IMPLEMENTED

### Frontend Fix (Interceptor)
**File:** `frontend/src/app/core/interceptors/auth.interceptor.ts`

**What Changed:**
```typescript
✅ Added global isRefreshing flag
✅ Added refreshTokenSubject (BehaviorSubject) for request queueing
✅ Request queueing logic:
   - First 401 → start refresh
   - Subsequent 401s → wait for refresh to complete
   - Retry all waiting requests with new token
✅ Clear distinction:
   - 401 on protected endpoint → try refresh
   - 401 on refresh endpoint → token is invalid, logout
   - 401 on public endpoint → skip refresh
✅ No recursive refresh attempts (prevent loops)
```

### How It Works Now

```typescript
// Multiple requests hit 401 simultaneously:

Request 1: GET /products → 401
  ↓ isRefreshing = false
  ↓ Start refresh
  ↓ isRefreshing = true

Request 2: GET /categories → 401
  ↓ isRefreshing = true
  ↓ Wait for refreshTokenSubject to emit

Request 3: GET /cart → 401
  ↓ isRefreshing = true
  ↓ Wait for refreshTokenSubject to emit

Refresh completes: newToken = "xyz"
  ↓ refreshTokenSubject.next("xyz")
  ↓ isRefreshing = false

Request 1, 2, 3: All retry with new token ✅
```

**Result:** Only ONE refresh attempt, all requests queue and retry together.

---

## 🎯 TOKEN HANDLING STRATEGY

### Access Token
- **Storage:** Memory (lost on page refresh)
- **Duration:** 15 minutes
- **When to use:** Attach to every API request as `Authorization: Bearer {token}`
- **On expiry:** Interceptor automatically refreshes

### Refresh Token
- **Storage:** httpOnly Cookie (secure from XSS)
- **Duration:** 7 days
- **When to use:** Only for refresh token endpoint
- **On invalid:** User must login again

### Why This Works
```
❌ Storing refresh token in localStorage:
   - XSS attack can steal both tokens
   - Both tokens exposed to JS

✅ Storing refresh token in httpOnly cookie:
   - JS cannot read it (XSS safe)
   - Automatically sent with requests (server sets secure, sameSite)
   - Lost when browser closes (session-based) or explicit logout
```

---

## 🔄 TOKEN FLOW DIAGRAM

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     ANGULAR SSR APP (http://localhost:4000)             │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
                        ┌─────────────────────┐
                        │  Auth Service       │
                        │ - getAccessToken()  │
                        │ - setAccessToken()  │
                        │ - refreshToken()    │
                        │ - logout()          │
                        └─────────────────────┘
                                    ↓
                        ┌─────────────────────┐
                        │ Auth Interceptor    │
                        │ - Attach token      │
                        │ - Handle 401s       │
                        │ - Queue requests    │
                        └─────────────────────┘
                                    ↓
                        ┌─────────────────────┐
                        │ API Calls (HttpClient)
                        └─────────────────────┘
                                    ↓
                ┌───────────────────┴───────────────────┐
                ↓                                       ↓
     ┌──────────────────────┐            ┌──────────────────────┐
     │  PROTECTED ENDPOINT  │            │   REFRESH ENDPOINT   │
     │  GET /api/products   │            │ POST /auth/refresh   │
     │  + Authorization     │            │ + Refresh Token      │
     └──────────────────────┘            └──────────────────────┘
                ↓                                       ↓
     Need access token              Only needs refresh token
                ↓                                       ↓
     Backend validates                Backend validates
     JWT signature                    Refresh token in DB
                ↓                                       ↓
     ✅ 200 (valid)                  ✅ 200 (valid)
     ❌ 401 (expired)                ❌ 401 (invalid/expired)
     ❌ 403 (suspended)              ❌ 400 (malformed)


FLOW 1: First Request (No Token)
═════════════════════════════════
GET /products (no Authorization header)
  ↓ 401 Unauthorized
  ↓ Interceptor: "Try refresh"
  ↓ POST /auth/refresh-token (from httpOnly cookie)
  ↓ 401 (no valid refresh token)
  ↓ Interceptor: "Can't refresh, logout"
  ↓ Clear state, redirect to /login
  → User sees login page ✅


FLOW 2: Refresh Token Valid (Normal Case)
══════════════════════════════════════════
GET /products (Authorization: Bearer {expired_token})
  ↓ 401 Unauthorized
  ↓ Interceptor: "Try refresh"
  ↓ POST /auth/refresh-token (from httpOnly cookie)
  ↓ 200 OK { accessToken: "new_token" }
  ↓ Auth Service: setAccessToken("new_token")
  ↓ Interceptor: Retry GET /products (Authorization: Bearer {new_token})
  ↓ 200 OK { products: [...] }
  → User sees products ✅


FLOW 3: Multiple Requests at Same Time (Request Queueing)
════════════════════════════════════════════════════════
GET /products → 401
GET /categories → 401
GET /cart → 401 (all at same time!)
  ↓
Interceptor (Request 1): isRefreshing = false → Start refresh
Interceptor (Request 2): isRefreshing = true → Wait
Interceptor (Request 3): isRefreshing = true → Wait
  ↓
POST /auth/refresh-token → 200 { accessToken: "new_token" }
  ↓
refreshTokenSubject.next("new_token")
  ↓
Requests 1, 2, 3: All retry with new token ✅
  ↓
200 OK, 200 OK, 200 OK → All pass ✅
```

---

## ⚠️ EDGE CASES HANDLED

### Case 1: Network Failure During Refresh
```typescript
POST /auth/refresh-token → Network Error
  ↓
Interceptor catchError: "Can't reach backend"
  ↓
authService.logout() → clear state
  ↓
Reject pending requests
  → User sees: "Network error, please login again"
```

### Case 2: Refresh Token Expired
```typescript
POST /auth/refresh-token → 401 (refresh token is expired)
  ↓
Interceptor: "Can't refresh, user must login"
  ↓
authService.logout()
  ↓
Redirect to /login
```

### Case 3: Banned User (403 Suspended)
```typescript
GET /products → 403 { message: "User suspended" }
  ↓
Interceptor: "Don't try to refresh, user is banned"
  ↓
authService.logoutBanned()
  ↓
Redirect to /suspended page
```

### Case 4: 10 Concurrent Requests on 401
```typescript
Request 1: 401 → isRefreshing = false → Start refresh
Request 2: 401 → isRefreshing = true → Queue
Request 3: 401 → isRefreshing = true → Queue
...
Request 10: 401 → isRefreshing = true → Queue
  ↓
POST /auth/refresh-token (only ONCE) → 200
  ↓
All 10 requests retry with new token ✅
```

---

## 🛡️ SSR HANDLING (Angular Universal)

### Server-Side Rendering Challenge
On the server (Node.js):
- ❌ No localStorage (doesn't exist)
- ❌ No cookies in the request context initially
- ⚠️ Interceptor still runs during SSR

### Solution: Platform Detection
```typescript
// In your components:
import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';

export class MyComponent {
  private platformId = inject(PLATFORM_ID);

  ngOnInit() {
    // ONLY run in browser
    if (isPlatformBrowser(this.platformId)) {
      // Make API calls, access localStorage, etc.
      this.loadData();
    }
  }
}
```

### Auth Service (SSR-Safe)
```typescript
export class AuthService {
  getAccessToken(): string | null {
    // In browser: read from localStorage
    // On server: return null (no token available)
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      return localStorage.getItem('accessToken');
    }
    return null;
  }

  setAccessToken(token: string): void {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      localStorage.setItem('accessToken', token);
    }
  }
}
```

---

## 🎯 DEV UX: AUTO-LOGIN FOR DEVELOPMENT

### Option 1: Auto-Login Test User
Edit `frontend/src/app/core/services/auth.service.ts`:

```typescript
export class AuthService {
  constructor() {
    // Auto-login in development
    if (!environment.production) {
      this.autoLoginTestUser();
    }
  }

  private autoLoginTestUser() {
    const hasToken = localStorage.getItem('accessToken');
    if (!hasToken) {
      // Automatically call login with test credentials
      this.login({ phone: '9876543210', password: 'test' }).subscribe({
        next: () => console.log('Auto-login successful'),
        error: (err) => console.warn('Auto-login failed (expected if test user not found)'),
      });
    }
  }
}
```

### Option 2: Seed Test User in MongoDB
Run this in Mongo-Express or mongosh:

```javascript
db.users.insertOne({
  _id: ObjectId(),
  phone: '9876543210',
  passwordHash: '$2b$10$...', // bcrypt hash of "test"
  firstName: 'Test',
  lastName: 'User',
  role: 'admin',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  refreshTokens: []
});
```

### Option 3: Use Dev Mock Interceptor
Create a separate interceptor that mocks auth in development:

```typescript
export const devAuthMockInterceptor: HttpInterceptorFn = (req, next) => {
  if (!environment.production && req.url.includes('/auth/login')) {
    // Mock login response
    return of(new HttpResponse({
      status: 201,
      body: {
        data: {
          tokens: {
            accessToken: 'mock-token-dev',
            refreshToken: 'mock-refresh-dev',
          },
        },
      },
    }));
  }
  return next(req);
};
```

---

## ✅ VERIFICATION CHECKLIST

After implementing the fix:

- [ ] **No infinite loop:** Open app → See login page (not redirecting continuously)
- [ ] **Single refresh:** Edit Network tab → Make request → See ONLY ONE `/auth/refresh-token` call
- [ ] **Successful login:** Login with credentials → See authenticated content
- [ ] **Token stored:** Open DevTools → Application → Local Storage → See `accessToken`
- [ ] **Refresh works:** Wait for token to expire → Make request → Auto-refreshes → Works
- [ ] **Logout works:** Click logout → Redirected to /login → localStorage cleared
- [ ] **Multiple requests:** 10 simultaneous requests → Only ONE refresh call
- [ ] **Network error:** Disconnect network → Try request → Shows error (no infinite loop)
- [ ] **SSR safe:** No console errors on initial page load

---

## 🚀 DEPLOYMENT NOTES

### Production Checklist
- ✅ `secure: true` in cookie config (HTTPS only)
- ✅ `sameSite: 'none'` for cross-origin requests
- ✅ `httpOnly: true` (prevents JS access to refresh token)
- ✅ Token refresh happens before access token expires (optional: proactive refresh at 80% TTL)
- ✅ No tokens in URL parameters (use headers only)
- ✅ CORS configured to allow credentials

### Environment-Specific Config
```typescript
// backend/src/modules/auth/auth.controller.ts

res.cookie('refreshToken', result.tokens.refreshToken, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production', // HTTPS in prod
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000,
});
```

---

## 📞 TESTING THE FIX

### Test 1: Verify No Infinite Loop
```bash
# Terminal
docker-compose up -d
cd frontend && npm run dev:ssr

# Browser
Open http://localhost:4000
Expected: Login page (no continuous redirects) ✅
```

### Test 2: Verify Single Refresh
```bash
# Browser
F12 → Network tab
Login with credentials
Make a request
Expected: Exactly ONE POST /auth/refresh-token call ✅
```

### Test 3: Verify Request Queueing
```bash
# Browser Console
fetch('/api/v1/products');
fetch('/api/v1/categories');
fetch('/api/v1/cart');

# Network tab
Expected: Only ONE /auth/refresh-token, all 3 requests retry ✅
```

---

## 🎓 SUMMARY OF CHANGES

| Component | Change | Impact |
|-----------|--------|--------|
| **Auth Interceptor** | Added `isRefreshing` flag + request queueing | No infinite loops, proper retry logic |
| **Refresh Logic** | Only refresh ONCE, queue other requests | No duplicate refresh calls |
| **Error Handling** | Distinct handling for 401 vs 403 vs network errors | Correct error recovery |
| **Token Storage** | Refresh token in httpOnly cookie | XSS protection, auto-sent with requests |
| **SSR Support** | Platform detection, no localStorage on server | Works with Angular Universal |

---

## 🔗 RELATED FILES

- `frontend/src/app/core/interceptors/auth.interceptor.ts` ← **UPDATED**
- `frontend/src/app/core/services/auth.service.ts` (no changes needed, already correct)
- `backend/src/modules/auth/auth.controller.ts` (already correct, no changes)
- `frontend/src/environments/environment.ts` (already pointing to localhost:3100)

---

**Status:** ✅ Complete Fix Applied  
**Branch:** v2  
**Ready to:** Test and verify

