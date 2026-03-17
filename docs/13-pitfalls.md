# 13 — Common Pitfalls

Mistakes that are easy to make in this codebase and how to avoid them.

---

## Backend Pitfalls

### 1. Forgetting `await` on async service calls

**The mistake:**
```typescript
// controller
const user = userService.findById(id);  // ← missing await!
res.json({ user });
// user is a Promise object, not the actual user data
```

**Why it happens:** TypeScript doesn't always catch this. The function returns `Promise<User>`, and you can pass a Promise to `res.json()` — it just won't have `.firstName`, `.phone`, etc.

**The fix:** Always `await` service calls in controllers:
```typescript
const user = await userService.findById(id);
```

**How to catch it:** If you see `[object Promise]` in API responses, you forgot `await`.

---

### 2. Throwing errors outside try/catch in Express 5

**The mistake:**
```typescript
router.get('/users', async (req, res) => {
  // Express 5 will catch this automatically ✓
  const users = await userService.findAll();
  res.json(users);
});
```

Actually this is fine in Express 5 — it catches async errors automatically.

**The real pitfall:** Using Express 4 patterns that won't work:
```typescript
// Express 4 pattern — DO NOT USE in this codebase:
router.get('/users', (req, res, next) => {
  userService.findAll()
    .then(users => res.json(users))
    .catch(next);  // ← redundant in Express 5
});
```

This project uses Express 5. Just use `async/await` directly — no `.catch(next)` needed.

---

### 3. Returning inside `res.json()` but continuing execution

**The mistake:**
```typescript
if (!user) {
  res.status(404).json({ message: 'Not found' });
  // MISSING: return!
}
// This still executes even after sending the 404!
const data = await doMoreWork(user.id);
res.json(data);  // Error: Cannot set headers after they are sent
```

**The fix:**
```typescript
if (!user) {
  res.status(404).json({ message: 'Not found' });
  return;  // ← stop execution
}
```

---

### 4. Modifying `req.body` directly

**The mistake:**
```typescript
req.body.phone = req.body.phone.replace('+91', '');  // mutating req.body
```

**Why it's risky:** Other middleware might expect the original `req.body`. It also makes code harder to reason about.

**The fix:** Create a new variable:
```typescript
const phone = req.body.phone.replace('+91', '');
```

---

### 5. Not stripping `+91` from Firebase phone numbers

Firebase always returns phone numbers in E.164 format: `+919876543210`.

Your DB stores them without the country code: `9876543210`.

If you forget to strip `+91` when looking up a user:
```typescript
// Wrong — will never find the user:
const user = await userRepo.findOne({ phone: firebaseUser.phoneNumber });
// firebaseUser.phoneNumber = "+919876543210"
// DB has: "9876543210"

// Correct:
const phone = firebaseUser.phoneNumber.replace(/^\+91/, '');
const user = await userRepo.findOne({ phone });
```

---

### 6. Using `console.log` instead of the logger

**The mistake:**
```typescript
console.log('User created:', user);
```

**Why it's bad:**
1. `console.log` doesn't have log levels — you can't filter by severity
2. In production, logs go to stdout but without structured JSON format
3. No `requestId` in the output — can't trace the log to a specific request

**The fix:**
```typescript
logger.info({ userId: user._id }, 'User created');
// Output: {"level":30,"requestId":"abc123","userId":"...","msg":"User created"}
```

---

### 7. Hardcoding secrets in code

**Never do this:**
```typescript
const JWT_SECRET = 'my-secret-key-123';  // committed to git forever!
```

**Always use:**
```typescript
const JWT_SECRET = config.jwt.accessSecret;  // reads from env var
```

Even if you delete the line later, it's in git history. Use `git log` and you'll find it. Treat any secret that touches git as compromised.

---

## Frontend Pitfalls

### 8. Calling a signal without `()`

**The mistake:**
```typescript
@if (auth.isLoggedIn) {   // ← missing ()! Always evaluates to true (it's a function)
  <app-admin-nav />
}
```

**The fix:**
```typescript
@if (auth.isLoggedIn()) {  // ← call it as a function
  <app-admin-nav />
}
```

Angular Signals are functions. `isLoggedIn` is the function itself (truthy). `isLoggedIn()` is the value.

---

### 9. Subscribing to Observables and never unsubscribing

**The mistake:**
```typescript
// In a component:
ngOnInit() {
  this.httpClient.get('/api/users').subscribe(users => {
    this.users = users;
  });
  // No unsubscribe — memory leak if component is destroyed and recreated
}
```

**The fix (preferred — Angular 16+):**
```typescript
users = toSignal(this.httpClient.get('/api/users'));
// toSignal automatically manages the subscription lifecycle
```

Or use `takeUntilDestroyed()`:
```typescript
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

this.httpClient.get('/api/users')
  .pipe(takeUntilDestroyed(this.destroyRef))
  .subscribe(users => { this.users = users; });
```

---

### 10. Importing a component but forgetting to add it to `imports: []`

**The mistake:**
```typescript
@Component({
  standalone: true,
  imports: [CommonModule],  // ← NzButtonModule missing!
  template: `<button nz-button>Click</button>`  // ← won't work
})
```

**The fix:**
```typescript
imports: [CommonModule, NzButtonModule]
```

In Angular 21 standalone, every component you use in a template must be in the `imports` array of that component. There's no shared NgModule to handle it.

---

### 11. Using environment variables that don't exist at build time

Angular environments (`environment.ts` / `environment.prod.ts`) are baked in at build time. You cannot change them after the app is deployed.

**The mistake:**
```typescript
// environment.ts
export const environment = {
  apiUrl: process.env['API_URL'] || 'http://localhost:3100'
  // process.env doesn't exist in the browser!
};
```

**The reality:** Angular replaces `environment.ts` at build time. The `apiUrl` value is hardcoded into the bundle. To change it after deploy, you must rebuild.

For dynamic config (like API URLs that change per deployment), use a `config.json` file fetched at runtime.

---

## Docker / Environment Pitfalls

### 12. Editing `.env` but not restarting the container

Environment variables are loaded when the container starts. If you change `.env`:

```bash
# This is NOT enough:
# (just editing the .env file)

# You must restart the container:
docker compose up -d --force-recreate backend
```

`docker compose restart backend` also works but is slightly different (doesn't reload env vars from compose file).

---

### 13. Running `docker compose down -v` and losing all data

```bash
docker compose down        # stops containers, keeps volumes (data safe)
docker compose down -v     # stops containers AND deletes volumes (ALL DATA GONE)
```

The `-v` flag deletes MongoDB data, Redis data, everything. Only use it intentionally.

---

### 14. Forgetting replica set for transactions

MongoDB transactions require a replica set. This project uses a single-node replica set (`rs0`).

If you run MongoDB without replica set initialization:
```bash
# Symptom: transaction calls will throw:
# "Transaction numbers are only allowed on a replica set member or mongos"

# Fix: initialize the replica set:
docker exec rajhans-ecom-mongo mongosh --eval "rs.initiate()"
```

The `docker-compose.yml` uses `--replSet rs0` flag. The init container handles `rs.initiate()`. If you use a fresh MongoDB without this, transactions will fail.

---

## Testing Pitfalls

### 15. Tests passing but integration with DB broken

Unit tests mock everything — they don't catch schema mismatches, index missing, or query logic bugs.

**Example:**
```typescript
// Unit test — always passes:
mockUserRepo.findOne.mockResolvedValue({ phone: '9876543210' });
// Real MongoDB query — might fail if index doesn't exist, or field name is wrong
```

This is why integration tests are planned. Until then, test manually after every schema change.

---

### 16. `jest.clearAllMocks()` vs `jest.resetAllMocks()` vs `jest.restoreAllMocks()`

These are different:

| Call | What it does |
|------|-------------|
| `clearAllMocks()` | Clears call history, resets return values |
| `resetAllMocks()` | Clears + removes all implementations |
| `restoreAllMocks()` | Clears + restores original implementations (only for `jest.spyOn`) |

In `jest.config.ts`, `clearMocks: true` is set — so call history is cleared between each test automatically. You don't need to call it manually.

---

### 17. Testing implementation details instead of behavior

**Wrong:**
```typescript
// Tests HOW the code works internally:
expect(service['userRepo'].findOne).toHaveBeenCalledWith({ phone: '9876543210' });
```

**Right:**
```typescript
// Tests WHAT the code returns (behavior):
const result = await service.verifyFirebaseToken(idToken);
expect(result.tokens.accessToken).toBeDefined();
expect(result.user.phone).toBe('9876543210');
```

If you refactor the internal implementation, behavior tests still pass. Implementation tests break even when the feature works correctly.
