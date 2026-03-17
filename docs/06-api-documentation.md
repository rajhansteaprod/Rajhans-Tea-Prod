# 06 — API Documentation

Base URL: `http://localhost:3100/api/v1` (development)

All responses follow this shape:
```json
{
  "success": true | false,
  "statusCode": 200,
  "message": "Human readable message",
  "data": { ... }
}
```

---

## Authentication Endpoints

### POST /auth/verify-token
Exchange Firebase ID token for our JWT tokens. This is the login endpoint.

**Rate limit:** 10 requests per minute per IP

**Request:**
```json
{
  "idToken": "eyJhbGciOiJSUzI1NiJ9..."
}
```

**Response 201 (new user):**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Account created successfully",
  "data": {
    "user": {
      "_id": "6642f1a2b3c4d5e6f7890abc",
      "phone": "9876543210",
      "firstName": null,
      "lastName": null,
      "role": "customer"
    },
    "tokens": {
      "accessToken": "eyJhbGci...",
      "refreshToken": "a3f9c2e1b8d7..."
    },
    "isNewUser": true
  }
}
```

**Response 200 (existing user):** Same shape, `isNewUser: false`, message: "Login successful"

**Also sets:** `Set-Cookie: refreshToken=...; HttpOnly; SameSite=Strict`

**Errors:**
| Status | When |
|--------|------|
| 400 | Firebase token missing or malformed body |
| 401 | Firebase token is invalid or expired |
| 429 | Rate limit exceeded |

---

### POST /auth/refresh-token
Get a new access token using a refresh token. Old refresh token is deleted (rotation).

**Rate limit:** 10 requests per minute per IP

**Request (either body or cookie):**
```json
{
  "refreshToken": "a3f9c2e1b8d7..."
}
```
Or send nothing if the `refreshToken` cookie is present.

**Response 200:**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Token refreshed successfully",
  "data": {
    "tokens": {
      "accessToken": "eyJhbGci...new...",
      "refreshToken": "b5e8d3f2..."
    }
  }
}
```

**Errors:**
| Status | When |
|--------|------|
| 401 | Refresh token not found, expired, or user banned |

---

### POST /auth/logout
Invalidate the current refresh token (current device logout).

**Request:** Body with `refreshToken`, or cookie. No auth header required.

**Response 200:**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Logged out successfully",
  "data": null
}
```
Also clears the `refreshToken` cookie.

---

### POST /auth/logout-all
Invalidate ALL refresh tokens for the user (logout from all devices).

**Requires:** `Authorization: Bearer <accessToken>`

**Response 200:**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Logged out from all devices",
  "data": null
}
```

---

### GET /auth/me
Get the current user's info from the JWT payload.

**Requires:** `Authorization: Bearer <accessToken>`

**Response 200:**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "User profile",
  "data": {
    "userId": "6642f1a2b3c4d5e6f7890abc",
    "role": "customer"
  }
}
```
Note: This returns the JWT payload, not a DB lookup. Use this for a lightweight "am I still logged in?" check.

---

## Admin Endpoints

All admin endpoints require:
- `Authorization: Bearer <accessToken>` with `role: "admin"`

---

### GET /admin/dashboard/stats
Get aggregate statistics for the admin dashboard.

**Response 200:**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Dashboard stats retrieved",
  "data": {
    "stats": {
      "totalUsers": 1453,
      "activeUsers": 1421,
      "adminUsers": 3,
      "customerUsers": 1450,
      "todaySignups": 12,
      "weekSignups": 87
    },
    "recentUsers": [
      {
        "_id": "...",
        "phone": "9876543210",
        "firstName": "Priya",
        "lastName": "Sharma",
        "role": "customer",
        "isActive": true,
        "createdAt": "2026-03-17T10:30:00.000Z"
      }
    ]
  }
}
```

---

### GET /admin/users
List users with filtering, search, sorting, and pagination.

**Query Parameters:**
| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | number | 1 | Page number (min: 1) |
| `limit` | number | 20 | Items per page (max: 100) |
| `sortBy` | string | `createdAt` | Field to sort: `createdAt`, `lastLogin`, `firstName`, `phone` |
| `sortOrder` | string | `desc` | `asc` or `desc` |
| `search` | string | — | Search phone, firstName, lastName, email (case-insensitive) |
| `role` | string | — | Filter by `admin` or `customer` |
| `isActive` | boolean | — | Filter by `true` or `false` |

**Example:** `GET /admin/users?page=2&limit=10&search=priya&role=customer&isActive=true`

**Response 200:**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Users retrieved successfully",
  "data": [
    {
      "_id": "6642f1a2b3c4d5e6f7890abc",
      "phone": "9876543210",
      "firstName": "Priya",
      "lastName": "Sharma",
      "email": "priya@example.com",
      "role": "customer",
      "isActive": true,
      "isPhoneVerified": true,
      "lastLogin": "2026-03-16T14:22:00.000Z",
      "createdAt": "2025-11-05T09:15:00.000Z"
    }
  ],
  "meta": {
    "page": 2,
    "limit": 10,
    "total": 1453,
    "totalPages": 146
  }
}
```

---

## Health Endpoints

### GET /health
Liveness check. Is the process running?

**Response 200:**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "OK",
  "data": {
    "status": "healthy",
    "uptime": "3600s",
    "timestamp": "2026-03-17T10:00:00.000Z",
    "memory": {
      "heapUsed": "45MB",
      "heapTotal": "70MB",
      "rss": "95MB"
    }
  }
}
```

### GET /health/ready
Readiness check. Are MongoDB and Redis connected?

**Response 200 (ready):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Ready",
  "data": {
    "checks": {
      "mongodb": "connected",
      "redis": "connected"
    }
  }
}
```

**Response 503 (not ready):**
```json
{
  "success": false,
  "statusCode": 503,
  "message": "Not ready",
  "data": {
    "checks": {
      "mongodb": "connected",
      "redis": "error"
    }
  }
}
```

---

## Metrics

### GET /metrics
Prometheus metrics endpoint. Returns plaintext in Prometheus exposition format.

**Response:** `Content-Type: text/plain`
```
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",route="/health",status_code="200"} 42
http_request_duration_seconds_bucket{method="POST",route="/api/v1/auth/verify-token",le="0.1"} 38
...
```

> **Security Note:** This endpoint is currently unauthenticated. In production, restrict it to internal networks in the Nginx config. See [15-refactoring.md](./15-refactoring.md).

---

## Common Error Responses

### 400 Bad Request (Validation)
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    { "field": "body.idToken", "message": "Required" }
  ]
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "statusCode": 401,
  "message": "Invalid or expired access token"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "statusCode": 403,
  "message": "Insufficient permissions"
}
```

### 404 Not Found
```json
{
  "success": false,
  "statusCode": 404,
  "message": "Route GET /api/v1/unknown not found"
}
```

### 429 Too Many Requests
```json
{
  "success": false,
  "statusCode": 429,
  "message": "Too many authentication attempts, please try again later."
}
```
