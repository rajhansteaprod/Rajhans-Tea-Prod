# 04 — Data Flow

How a request travels from the browser through every layer and back. Two complete examples.

---

## Example 1: User Logs In (Phone + OTP)

### Step 1 — User enters phone number (Frontend)

```
LoginComponent (login.ts)
  → user types "9876543210"
  → clicks "Continue"
  → onSendOtp() called
```

### Step 2 — Firebase sends SMS

```
LoginComponent.onSendOtp()
  → calls FirebaseService.sendOtp("9876543210")
    → adds +91 prefix → "+919876543210"
    → calls Firebase signInWithPhoneNumber()
    → Firebase sends SMS to user
    → Firebase returns ConfirmationResult (stored in memory)
```

### Step 3 — User enters OTP

```
LoginComponent
  → user types 6-digit OTP
  → auto-verify triggers when 6th digit entered
  → onVerifyOtp() called
```

### Step 4 — Firebase verifies OTP

```
LoginComponent.onVerifyOtp()
  → calls FirebaseService.verifyOtp("123456")
    → calls confirmationResult.confirm("123456")
    → Firebase verifies OTP on their servers
    → Returns credential
    → credential.user.getIdToken() → Firebase ID Token (JWT)
```

### Step 5 — Backend exchange (Frontend → Backend)

```
LoginComponent
  → calls AuthService.verifyFirebaseToken(idToken)
    → HTTP POST /api/v1/auth/verify-token
      Body: { idToken: "eyJhbG..." }
```

### Step 6 — Middleware chain processes the request

```
app.ts middleware chain:
  1. Helmet        → sets secure headers on response
  2. CORS          → checks Origin: header is allowed
  3. authRateLimiter → checks IP hasn't exceeded 10 req/min
  4. express.json() → parses body JSON into req.body
  5. requestIdMiddleware → req.requestId = uuid()
  6. requestLoggerMiddleware → logs "POST /api/v1/auth/verify-token"
  7. metricsMiddleware → starts timer

  → Router matches POST /api/v1/auth/verify-token

  8. validate(firebaseTokenSchema)
     → Zod checks req.body.idToken exists and is a string
     → If invalid: throws ZodError → errorHandler sends 400
     → If valid: calls next()

  9. authController.verifyFirebaseToken (NO auth middleware — this is the login endpoint)
```

### Step 7 — Controller delegates to Service

```
authController.verifyFirebaseToken(req, res)
  → const { idToken } = req.body
  → calls authService.verifyFirebaseToken(idToken)
```

### Step 8 — Service does the work

```
AuthService.verifyFirebaseToken(idToken)

  ① Call Firebase Admin SDK
     → firebaseAuth.verifyIdToken(idToken)
     → Firebase returns decoded token: { phone_number: "+919876543210", uid: "..." }
     → If invalid: throw UnauthorizedError("Invalid or expired Firebase token")

  ② Extract phone number
     → "+919876543210".replace(/^\+91/, '') → "9876543210"

  ③ Find or create user
     → userRepo.findByPhone("9876543210")
     → If not found: userRepo.create({ phone, isPhoneVerified: true }) → new user
     → If found: userRepo.updateLastLogin(userId)

  ④ Generate JWT tokens
     → accessToken = jwt.sign({ userId, role }, JWT_ACCESS_SECRET, { expiresIn: "15m" })
     → refreshToken = crypto.randomBytes(40).toString('hex') — random, NOT a JWT
     → hashedRefreshToken = SHA256(refreshToken)
     → tokenRepo.create({ user: userId, token: hashedRefreshToken, expiresAt: +7days })

  ⑤ Return { user, tokens: { accessToken, refreshToken }, isNewUser }
```

### Step 9 — Controller sends response

```
authController.verifyFirebaseToken
  → res.cookie('refreshToken', refreshToken, { httpOnly: true, secure, sameSite: 'strict' })
  → sendCreated(res, result, "Login successful")

HTTP Response 201:
{
  "success": true,
  "statusCode": 201,
  "message": "Login successful",
  "data": {
    "user": { "_id": "...", "phone": "9876543210", "role": "customer" },
    "tokens": { "accessToken": "eyJhbG...", "refreshToken": "a3f9..." },
    "isNewUser": false
  }
}
```

### Step 10 — Frontend stores tokens

```
AuthService.verifyFirebaseToken() pipe(tap(...))
  → _user.set(res.data.user)           — update signal
  → _accessToken.set(accessToken)      — update signal
  → localStorage.setItem('user', ...)
  → localStorage.setItem('accessToken', ...)
  → localStorage.setItem('refreshToken', ...)

LoginComponent
  → router.navigate(['/'])  or ['/dashboard']
```

---

## Example 2: Admin Fetches User List

### The Request

```
Angular AdminUserList component
  → calls adminService.getUsers({ page: 1, limit: 20, search: "john" })
    → HTTP GET /api/v1/admin/users?page=1&limit=20&search=john
      Headers: Authorization: Bearer eyJhbG...
```

### Middleware Chain

```
1. Helmet, CORS, globalRateLimiter, body parser, requestId, logger, metrics
   → pass through

2. Router matches GET /api/v1/admin/users

3. admin.routes.ts:
   router.use(authenticate)     ← RUNS FIRST
   router.use(authorize('admin')) ← RUNS SECOND
   validate(listUsersSchema)    ← RUNS THIRD
   adminUserController.listUsers ← RUNS LAST
```

### authenticate Middleware

```
auth.middleware.ts
  → reads req.headers.authorization → "Bearer eyJhbG..."
  → splits to get token "eyJhbG..."
  → jwt.verify(token, JWT_ACCESS_SECRET)
  → If expired/invalid: throw UnauthorizedError → 401 response
  → If valid: decoded = { userId: "abc123", role: "admin" }
  → req.user = decoded
  → calls next()
```

### authorize Middleware

```
rbac.middleware.ts
  → reads req.user.role → "admin"
  → roles.includes("admin") → true
  → calls next()

  (if role was "customer": throw ForbiddenError → 403 response)
```

### validate Middleware

```
validate.middleware.ts + admin-user.validator.ts
  → Zod parses req.query:
    { page: "1", limit: "20", search: "john" }

    page:   z.coerce.number() → converts "1" string to 1 number
    limit:  z.coerce.number().max(100) → converts "20" to 20
    search: z.string().max(100) → "john"

  → If invalid: ZodError thrown → errorHandler sends 400 with field errors
  → If valid: calls next()
```

### Controller → Service → Repository

```
adminUserController.listUsers(req, res)
  → adminUserService.getUsers(req.query)

AdminUserService.getUsers({ page: 1, limit: 20, search: "john" })
  → parsePagination() → { page: 1, limit: 20, skip: 0, sortBy: "createdAt", sortOrder: -1 }

  → Build filter:
    search "john" → $or: [
      { phone: { $regex: "john", $options: "i" } },
      { firstName: { $regex: "john", $options: "i" } },
      { lastName: { $regex: "john", $options: "i" } },
      { email: { $regex: "john", $options: "i" } }
    ]

  → Promise.all([
      userRepo.findMany(filter, { skip: 0, limit: 20, sortBy: "createdAt", sortOrder: -1 })
      userRepo.count(filter)
    ])

  → MongoDB queries:
    db.users.find({ $or: [...] }).sort({ createdAt: -1 }).skip(0).limit(20)
    db.users.countDocuments({ $or: [...] })

  → Sanitize: strip heavy fields, map to plain objects
  → buildPaginationMeta(1, 20, total) → { page, limit, total, totalPages }

  → Return { users: [...], meta: {...} }
```

### Response

```
adminUserController
  → sendPaginated(res, result.users, result.meta, "Users retrieved successfully")

HTTP Response 200:
{
  "success": true,
  "statusCode": 200,
  "message": "Users retrieved successfully",
  "data": [
    { "_id": "...", "phone": "9876543210", "firstName": "John", "role": "customer", ... }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 143,
    "totalPages": 8
  }
}
```

---

## Error Flow

If anything throws an error at any point:

```
throw new UnauthorizedError("Invalid token")
         │
         ▼
Express catches it (Express 5 auto-catches async errors)
         │
         ▼
errorHandler middleware (last in chain)
  → err instanceof ApiError? → send err.statusCode + err.message
  → err instanceof ZodError? → send 400 + field-level errors
  → else? → send 500 "Internal server error" (hide details in prod)

  → In development: include stack trace in response
  → In production: stack trace is only logged, never sent to client
```
