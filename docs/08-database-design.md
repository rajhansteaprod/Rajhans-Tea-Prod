# 08 — Database Design

## MongoDB Setup

- **Version:** MongoDB 7
- **Mode:** Replica Set (`rs0`) — single-node replica set
- **Why replica set?** Required for MongoDB transactions and change streams. Even one node needs replica set mode to use these features.
- **ORM:** Mongoose 9

---

## Collections

### users

Represents every person who has used the app.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `_id` | ObjectId | auto | MongoDB primary key |
| `phone` | String | Yes | 10-digit Indian mobile number (no +91). Unique. Indexed. |
| `firstName` | String | No | Added when user updates profile |
| `lastName` | String | No | Added when user updates profile |
| `email` | String | No | Sparse unique index (multiple null allowed, one per email) |
| `role` | String | Yes | `"customer"` or `"admin"`. Default: `"customer"` |
| `isPhoneVerified` | Boolean | Yes | True after first Firebase OTP login. Default: `false` |
| `addresses` | Array | No | Embedded address documents |
| `avatar` | String | No | URL to profile image |
| `isActive` | Boolean | Yes | `false` = banned user. Default: `true` |
| `lastLogin` | Date | No | Updated on every login |
| `createdAt` | Date | auto | Set by Mongoose timestamps |
| `updatedAt` | Date | auto | Set by Mongoose timestamps |

**Indexes:**
- `phone`: unique index (fast login lookup)
- `email`: sparse unique index (allows multiple null, prevents duplicate emails)

**Embedded addresses:**
```
addresses: [{
  label:      String (e.g. "Home", "Office")
  street:     String
  city:       String
  state:      String
  postalCode: String
  country:    String (default: "India")
  isDefault:  Boolean
}]
```

**Mongoose validation:**
- `phone` must match `/^[6-9]\d{9}$/` (valid Indian mobile: starts with 6-9, 10 digits)
- `role` must be `"customer"` or `"admin"` (enum)

---

### tokens

Stores hashed refresh tokens. One document per active session.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `_id` | ObjectId | auto | MongoDB primary key |
| `user` | ObjectId | Yes | Reference to `users._id`. Indexed. |
| `token` | String | Yes | SHA-256 hash of the refresh token. Never stored raw. |
| `type` | String | Yes | Always `"refresh"` (enum, for future expansion) |
| `expiresAt` | Date | Yes | 7 days from creation. Has MongoDB TTL index. |
| `createdAt` | Date | auto | Set by timestamps |

**Indexes:**
- `user`: regular index (fast lookup of all tokens for a user — used in logoutAll)
- `expiresAt`: TTL index with `expires: 0` — MongoDB auto-deletes documents when `expiresAt` is in the past

**Security design:**
- The raw refresh token is never stored
- We store `SHA256(rawToken)` — if the DB is leaked, tokens can't be used
- On each use, we delete the old token and create a new one (rotation)

---

## Entity Relationships

```
users (1) ──────────── (many) tokens
  _id              │         user (ref)
  phone            │         token (hashed)
  role             │         expiresAt
  isActive         │
  addresses[]      └── One user can have many sessions
                       (one token per device/browser)
```

Currently no other collections. Future collections will include:
- `products`, `categories`, `orders`, `order_items`, `cart_items`, `payments`

---

## Query Patterns

### Login lookup
```javascript
// Fast — uses unique phone index
db.users.findOne({ phone: "9876543210" })
```

### Ban check on refresh
```javascript
// Fast — uses _id index
db.users.findById(userId)
// Then check: if (!user.isActive) throw error
```

### Token validation
```javascript
// Uses token value, filters expired tokens too
db.tokens.findOne({
  token: sha256Hash,
  expiresAt: { $gt: new Date() }
})
```

### Admin user list with search
```javascript
db.users.find({
  $or: [
    { phone: { $regex: "search", $options: "i" } },
    { firstName: { $regex: "search", $options: "i" } },
    { lastName: { $regex: "search", $options: "i" } },
    { email: { $regex: "search", $options: "i" } }
  ]
}).sort({ createdAt: -1 }).skip(0).limit(20)
```

### Dashboard aggregate
```javascript
// All run in parallel with Promise.all
db.users.countDocuments({})
db.users.countDocuments({ isActive: true })
db.users.countDocuments({ role: "admin" })
db.users.find({}).sort({ createdAt: -1 }).limit(5)
db.users.countDocuments({ createdAt: { $gte: todayStart } })
db.users.countDocuments({ createdAt: { $gte: weekStart } })
```

---

## MongoDB Replica Set

The app runs MongoDB in replica set mode even for a single node. This is configured in:
- `docker-compose.yml`: `command: ["mongod", "--replSet", "rs0", "--bind_ip_all"]`
- `infrastructure/docker/mongo/mongo-init.js`: initializes `rs.initiate()`

**Why?** Mongoose 9 uses sessions for certain operations, and sessions require a replica set. It also future-proofs for scaling to multiple nodes.

---

## Creating an Admin User

There is no admin registration via the app. To make a user an admin:

```bash
# Connect to the running MongoDB container
docker exec rajhans-tea-mongo mongosh \
  "mongodb://localhost:27017/rajhans-tea?replicaSet=rs0" \
  /seeds/seed-admin.js
```

The seed script does an `upsert` — creates the user if they don't exist, or updates their role to `admin` if they do.
