# 11 — Testing Strategy

---

## Testing Pyramid

```
         /\
        /  \
       / E2E \       ← Not implemented yet (Cypress/Playwright)
      /────────\
     / Sanity   \    ← Smoke tests against live prod
    /────────────\
   / Integration  \  ← Real MongoDB + Redis, no mocks
  /────────────────\
 /   Unit Tests     \ ← Fast, all deps mocked, 70% coverage gate
/────────────────────\
```

The more tests at the bottom (unit), the better. Unit tests are fast, cheap, and catch most bugs.

---

## Unit Tests

**Location:** `backend/tests/unit/`
**Run:** `npm run test:unit`
**Coverage gate:** 70% branches, functions, lines, statements

### What They Test
- Business logic in services
- Correct error handling (does service throw 401 when Firebase fails?)
- Token rotation logic
- Pagination math

### How They Work
All external dependencies are **mocked**:
```typescript
jest.mock('../../../src/repositories/user.repository');  // fake DB
jest.mock('../../../src/repositories/token.repository'); // fake DB
jest.mock('../../../src/loaders', () => ({
  getFirebaseAuth: jest.fn()  // fake Firebase
}));
```

The test controls what the mocked functions return per test:
```typescript
mockUserRepo.findByPhone.mockResolvedValue(null); // simulate new user
mockFirebaseAuth.verifyIdToken.mockRejectedValue(new Error()); // simulate Firebase failure
```

### Current Unit Tests
| File | Tests | What It Covers |
|------|-------|---------------|
| `auth.service.test.ts` | 10 | verifyFirebaseToken (4), refreshToken (3), logout (1), logoutAll (1), token rotation |

---

## Integration Tests

**Location:** `backend/tests/integration/`
**Run:** `npm run test:integration`
**Database:** Real MongoDB (test DB) + Real Redis

### What They Test
- Repository methods work correctly with real MongoDB
- Mongoose schema validation
- Database indexes work as expected
- Token TTL expiry

### Infrastructure (per test run)
```
docker run mongo:7 (replica set) → :27017
docker run redis:7-alpine        → :6379
run tests with MONGO_TEST_URI=mongodb://localhost:27017/rajhans-ecommerce-test
cleanup DB after each test
```

### Current Status
Integration test infrastructure is set up (`global-setup.ts`, `global-teardown.ts`). Test files need to be written as features are built.

### How to Write Integration Tests
```typescript
// tests/integration/repositories/user.repository.test.ts
describe('UserRepository', () => {
  beforeEach(async () => {
    await User.deleteMany({}); // clean slate before each test
  });

  it('should create and find user by phone', async () => {
    const repo = new UserRepository();
    await repo.create({ phone: '9876543210', isPhoneVerified: true });
    const found = await repo.findByPhone('9876543210');
    expect(found?.phone).toBe('9876543210');
  });
});
```

---

## Sanity Tests (Post-Deploy Smoke Tests)

**Location:** `backend/tests/sanity/`
**Run:** `npm run test:sanity`
**Target:** Live deployed environment

### What They Test (Read-Only, Non-Destructive)
- `GET /health` returns 200
- `GET /health/ready` shows all services connected
- `GET /api/v1/admin/users` returns 401 without auth (security check)
- Response shape matches expected schema

### How to Run Against Production
```bash
SANITY_BASE_URL=https://api.yourdomain.com npm run test:sanity
```

---

## Load Testing (k6)

Not yet implemented. Run manually, not in CI.

### Plan
```javascript
// load-tests/auth.js
import http from 'k6/http';
import { check } from 'k6';

export let options = {
  stages: [
    { duration: '30s', target: 20 },  // ramp up
    { duration: '1m',  target: 50 },  // steady state
    { duration: '30s', target: 0 },   // ramp down
  ],
};

export default function () {
  const res = http.post('http://api/auth/verify-token', JSON.stringify({
    idToken: 'test-token'
  }));
  check(res, { 'status is 401': (r) => r.status === 401 });
}
```

**Key metrics to watch:**
- p95 response time < 200ms
- Error rate < 1%
- Requests per second the server can handle

---

## Jest Configuration

`jest.config.ts` defines 3 independent projects:

```typescript
projects: [
  { displayName: 'unit',        testMatch: ['tests/unit/**/*.test.ts'] },
  { displayName: 'integration', testMatch: ['tests/integration/**/*.test.ts'] },
  { displayName: 'sanity',      testMatch: ['tests/sanity/**/*.test.ts'] },
]
```

This means:
- `jest --selectProjects unit` runs ONLY unit tests
- `jest --selectProjects integration` runs ONLY integration tests
- `jest` (no flag) runs ALL projects

Coverage is collected from `src/**/*.ts`, excluding `server.ts` and `config/index.ts`.

---

## Test File Naming Conventions

```
tests/
├── unit/
│   └── services/
│       └── auth.service.test.ts    ← mirrors src/services/auth.service.ts
├── integration/
│   └── repositories/
│       └── user.repository.test.ts ← mirrors src/repositories/user.repository.ts
└── sanity/
    └── health.test.ts              ← smoke tests by feature
```
