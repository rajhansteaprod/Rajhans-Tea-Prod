# Manual Test Cases — Device Tracking & Session Management

**Feature branch:** `v1`
**Prerequisites:** Docker running (`docker compose up -d`), backend on `localhost:3100`, frontend on `localhost:4200`

---

## Setup — Get a valid token

Before running any test below you need to be logged in.

```bash
# Login and capture the access token
curl -s -c cookies.txt -X POST http://localhost:3100/api/v1/auth/verify-token \
  -H "Content-Type: application/json" \
  -d '{"idToken": "<your-firebase-id-token>"}' | jq .

# Save the accessToken from the response into a variable
ACCESS_TOKEN="<paste accessToken here>"
ADMIN_TOKEN="<paste admin accessToken here>"
```

---

## TC-001 — Device info is captured on login

**Goal:** Verify that when a user logs in, their device info (browser, OS, IP) is stored in MongoDB.

**Steps:**
1. Login via `POST /api/v1/auth/verify-token`
2. Connect to MongoDB:
   ```bash
   docker exec -it rajhans-ecom-mongo mongosh "mongodb://localhost:27017/rajhans-ecommerce?replicaSet=rs0"
   ```
3. Run:
   ```js
   db.tokens.find({}, { token: 0 }).sort({ createdAt: -1 }).limit(1).pretty()
   ```

**Expected result:**
```json
{
  "user": ObjectId("..."),
  "type": "refresh",
  "deviceInfo": {
    "userAgent": "Mozilla/5.0 (Windows NT 10.0; ...) Chrome/...",
    "ip": "127.0.0.1",
    "browser": "Chrome 120",
    "os": "Windows",
    "deviceType": "desktop",
    "deviceName": "Chrome 120 on Windows"
  },
  "lastUsedAt": ISODate("..."),
  "expiresAt": ISODate("...")
}
```

**Pass criteria:** `deviceInfo` object is populated — NOT empty `{}`.

---

## TC-002 — List own sessions (user)

**Goal:** Authenticated user can see their own active sessions.

**Steps:**
```bash
curl -s http://localhost:3100/api/v1/auth/sessions \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -b cookies.txt | jq .
```

**Expected result:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "deviceName": "Chrome 120 on Windows",
      "browser": "Chrome 120",
      "os": "Windows",
      "deviceType": "desktop",
      "ip": "127.0.0.xxx",
      "isCurrent": true,
      "createdAt": "...",
      "lastUsedAt": "..."
    }
  ]
}
```

**Pass criteria:**
- ✅ `ip` ends in `.xxx` — last octet is masked
- ✅ `isCurrent: true` for the session this request came from
- ✅ No `fullIp` or `userAgent` fields visible (those are admin-only)

---

## TC-003 — isCurrent flag is correct

**Goal:** Verify only the active session is marked `isCurrent: true`.

**Steps:**
1. Login on **Browser A** (Chrome) → save `ACCESS_TOKEN_A` and cookie `A`
2. Login on **Browser B** (or Incognito / different browser) → save `ACCESS_TOKEN_B` and cookie `B`
3. Call `GET /auth/sessions` from **Browser A**

**Expected result:**
- Session from Browser A → `isCurrent: true`
- Session from Browser B → `isCurrent: false`

**Pass criteria:** Exactly one session has `isCurrent: true`.

---

## TC-004 — Revoke a specific session (user)

**Goal:** User can delete one of their own sessions without affecting others.

**Setup:** Must be logged in on at least 2 devices (see TC-003).

**Steps:**
1. List sessions, note the `_id` of the session you want to revoke:
   ```bash
   curl -s http://localhost:3100/api/v1/auth/sessions \
     -H "Authorization: Bearer $ACCESS_TOKEN_A" \
     -b cookies_A.txt | jq '.data[].{"_id", "deviceName", "isCurrent"}'
   ```
2. Pick the NON-current session's `_id`. Call:
   ```bash
   SESSION_ID="<_id of the non-current session>"
   curl -s -X DELETE \
     "http://localhost:3100/api/v1/auth/sessions/$SESSION_ID" \
     -H "Authorization: Bearer $ACCESS_TOKEN_A" \
     -b cookies_A.txt
   ```
3. List sessions again.

**Expected result:**
- `DELETE` returns HTTP `204 No Content`
- Session list now has one fewer entry
- The revoked session is gone; current session is still present

**Pass criteria:** HTTP 204. List length decremented by 1.

---

## TC-005 — Cannot revoke another user's session

**Goal:** User A cannot revoke User B's session (ownership check).

**Setup:** Two separate users logged in.

**Steps:**
1. User B logs in → note a session `_id` from User B's session list (ask admin).
2. User A attempts to delete that session:
   ```bash
   curl -s -X DELETE \
     "http://localhost:3100/api/v1/auth/sessions/<USER_B_SESSION_ID>" \
     -H "Authorization: Bearer $ACCESS_TOKEN_A" \
     -b cookies_A.txt | jq .
   ```

**Expected result:**
```json
{
  "success": false,
  "statusCode": 403,
  "message": "You can only revoke your own sessions"
}
```

**Pass criteria:** HTTP 403. User B's session untouched.

---

## TC-006 — Invalid sessionId format is rejected

**Goal:** Zod validator rejects a malformed session ID.

**Steps:**
```bash
curl -s -X DELETE \
  "http://localhost:3100/api/v1/auth/sessions/not-a-valid-id" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq .
```

**Expected result:**
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed"
}
```

**Pass criteria:** HTTP 400. No 500 error.

---

## TC-007 — Admin: list sessions for any user

**Goal:** Admin can see all active sessions for any user, including full IP and raw UA.

**Steps:**
```bash
USER_ID="<any user's MongoDB _id>"

curl -s \
  "http://localhost:3100/api/v1/admin/users/$USER_ID/sessions" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq .
```

**Expected result:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "deviceName": "Chrome 120 on Windows",
      "ip": "127.0.0.xxx",
      "fullIp": "127.0.0.1",
      "userAgent": "Mozilla/5.0 (Windows NT 10.0...) Chrome/120...",
      "userId": "...",
      "isCurrent": false,
      ...
    }
  ]
}
```

**Pass criteria:**
- ✅ `fullIp` present (unmasked)
- ✅ `userAgent` raw string present
- ✅ `userId` field present

---

## TC-008 — Admin: revoke a specific session

**Goal:** Admin can kill any single session across any user.

**Steps:**
1. Get a session `_id` from TC-007 output.
2. Call:
   ```bash
   SESSION_ID="<session _id>"
   curl -s -X DELETE \
     "http://localhost:3100/api/v1/admin/sessions/$SESSION_ID" \
     -H "Authorization: Bearer $ADMIN_TOKEN" | jq .
   ```
3. Verify the session is gone:
   ```bash
   curl -s \
     "http://localhost:3100/api/v1/admin/users/$USER_ID/sessions" \
     -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.data | length'
   ```

**Expected result:**
```json
{
  "success": true,
  "data": { "userId": "...", "deviceName": "Chrome 120 on Windows" },
  "message": "Session revoked for user ..."
}
```

**Pass criteria:** HTTP 200. Session list length decreased by 1. User's other sessions intact.

---

## TC-009 — Admin: force-logout all sessions for a user

**Goal:** Admin can nuke all sessions for a user in one call (ban scenario).

**Setup:** Target user must be logged in on 2+ devices.

**Steps:**
```bash
USER_ID="<target user's _id>"

curl -s -X DELETE \
  "http://localhost:3100/api/v1/admin/users/$USER_ID/sessions" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq .
```

Verify:
```bash
# Should return empty array
curl -s \
  "http://localhost:3100/api/v1/admin/users/$USER_ID/sessions" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.data | length'
```

**Expected result:**
- `DELETE` returns HTTP `204 No Content`
- Follow-up `GET` returns `data: []` and length `0`
- Target user's next API call with their old access token will work until it expires (JWT is stateless), but their refresh token will fail → they cannot renew

**Pass criteria:** HTTP 204. Zero sessions remain.

---

## TC-010 — Token refresh updates device info

**Goal:** When user refreshes their access token, the session's device info is updated.

**Steps:**
1. Note the `lastUsedAt` of a session from `GET /auth/sessions`
2. Trigger a token refresh:
   ```bash
   curl -s -X POST http://localhost:3100/api/v1/auth/refresh-token \
     -H "Content-Type: application/json" \
     -b cookies.txt -c cookies.txt \
     -d '{}' | jq .
   ```
3. Call `GET /auth/sessions` again. Note the new `createdAt` on the session.

**Expected result:**
- The old session's token is replaced with a new one (token rotation)
- The new session has a fresh `createdAt` and `lastUsedAt`
- `deviceName`, `browser`, `os` are preserved (same device, same UA)

**Pass criteria:** Session `_id` changed (new document). `createdAt` is newer than before.

---

## TC-011 — Non-admin cannot access admin session endpoints

**Goal:** Customer-role JWT is rejected by admin session endpoints.

**Steps:**
```bash
curl -s \
  "http://localhost:3100/api/v1/admin/users/any-id/sessions" \
  -H "Authorization: Bearer $CUSTOMER_ACCESS_TOKEN" | jq .
```

**Expected result:**
```json
{
  "success": false,
  "statusCode": 403,
  "message": "Forbidden"
}
```

**Pass criteria:** HTTP 403. No session data exposed.

---

## TC-012 — Unauthenticated request is rejected

**Goal:** `/auth/sessions` requires a valid JWT.

**Steps:**
```bash
curl -s http://localhost:3100/api/v1/auth/sessions | jq .
```

**Expected result:**
```json
{
  "success": false,
  "statusCode": 401,
  "message": "Access token required"
}
```

**Pass criteria:** HTTP 401.

---

## TC-013 — Admin panel UI: Sessions panel opens and shows correct device

**Goal:** Sessions button in the Users table opens the correct user's sessions.

**Steps:**
1. Open `http://localhost:4200/admin/users`
2. Find a user who has recently logged in
3. Click the **Sessions** button on their row
4. Verify the panel slides open below that row

**Expected result:**
- Sessions panel appears below the correct row
- Shows device icon (desktop/mobile/tablet) matching the device type
- Shows browser name, OS, masked IP, last active time
- Shows raw UA string in smaller text
- **Current** badge is NOT shown (admin is viewing from their own session, not the user's)

**Pass criteria:** Panel renders with at least one session entry, no JS errors in console.

---

## TC-014 — Admin panel UI: Revoke one session

**Steps:**
1. Open Sessions panel for a user with 2+ sessions
2. Click the ✕ button on one session row
3. Observe the row disappears with no page reload

**Expected result:**
- Row animates out (or disappears)
- `DELETE /admin/sessions/:id` is called (check Network tab)
- HTTP 200 returned
- Remaining sessions still visible

**Pass criteria:** Session removed from panel without full page reload.

---

## TC-015 — Admin panel UI: Revoke all sessions

**Steps:**
1. Open Sessions panel for a user with 2+ sessions
2. Click **Revoke All** button
3. Confirm all rows disappear

**Expected result:**
- All session rows removed
- Panel shows "No active sessions" empty state
- `DELETE /admin/users/:userId/sessions` called (Network tab)
- HTTP 204 returned

**Pass criteria:** Panel shows empty state. No network errors.

---

## TC-016 — Sessions panel closes on X button

**Steps:**
1. Open Sessions panel for any user
2. Click the **X** (close) button in the panel header

**Expected result:** Panel collapses. Clicking Sessions on the same row re-opens it.

---

## Summary table

| TC | Area | Checks |
|----|------|--------|
| 001 | DB | Device info stored in token document |
| 002 | API | User sees own sessions, IP masked |
| 003 | API | isCurrent flag is accurate |
| 004 | API | User revokes own non-current session |
| 005 | API | User cannot revoke other user's session (403) |
| 006 | API | Invalid session ID rejected (400) |
| 007 | API | Admin sees full IP + UA |
| 008 | API | Admin revokes single session |
| 009 | API | Admin force-logouts all sessions |
| 010 | API | Token refresh updates lastUsedAt |
| 011 | API | Customer blocked from admin endpoints (403) |
| 012 | API | Unauthenticated blocked (401) |
| 013 | UI | Sessions panel opens on correct user |
| 014 | UI | Revoke one session removes row |
| 015 | UI | Revoke all shows empty state |
| 016 | UI | Close button collapses panel |
