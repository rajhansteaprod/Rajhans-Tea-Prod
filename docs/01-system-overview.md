# 01 — System Overview

## What Is RnD Ecommerce?

A full-stack ecommerce platform built for Indian users. It is:
- **Mobile-first** — login with phone number only (no passwords)
- **Admin-capable** — separate admin panel with role-based access
- **Production-grade** — monitoring, logging, CI/CD, security baked in from day one

---

## Tech Stack

### Backend
| Technology | Version | Why |
|---|---|---|
| Node.js | 22 | LTS, fast, JavaScript ecosystem |
| Express | 5.x | Minimal, flexible HTTP framework |
| TypeScript | 5.6 | Type safety, catches bugs before runtime |
| MongoDB | 7 | Flexible document DB — good for evolving ecommerce schemas |
| Mongoose | 9 | MongoDB ODM — schemas, validation, relationships |
| Redis | 7 | Fast in-memory store — used for future caching |
| Firebase Admin | 13 | Verify phone OTPs sent by the frontend |
| JWT (jsonwebtoken) | 9 | Stateless authentication tokens |
| Pino | 9 | Fastest Node.js logger, structured JSON output |
| Prometheus (prom-client) | 15 | Metrics collection |
| Zod | 3 | Runtime validation of request data |
| Helmet | 7 | Automatic secure HTTP headers |

### Frontend
| Technology | Version | Why |
|---|---|---|
| Angular | 21 | Strongly typed, enterprise-grade SPA framework |
| TypeScript | 5.6 | Same language as backend — shared mental model |
| Angular Signals | built-in | Modern reactive state (no NgRx needed yet) |
| NG-Zorro | latest | Rich UI component library (Ant Design for Angular) |
| Firebase Client SDK | 11 | Phone OTP — triggers SMS via Firebase |
| SCSS + Design Tokens | — | Consistent, scalable styling system |

### Infrastructure
| Technology | Purpose |
|---|---|
| Docker + Docker Compose | Containerize every service for consistent environments |
| Nginx | Reverse proxy — one entry point for both frontend and backend |
| Prometheus | Collect metrics from backend every 15 seconds |
| Grafana | Visualize metrics — dashboards and alerts |
| GitHub Actions | CI/CD pipeline — automated quality gates |
| SonarCloud | SAST — static security and quality analysis |

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Browser                            │
│              Angular 21 SPA (port 4201)                 │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP
                       ▼
┌─────────────────────────────────────────────────────────┐
│                    Nginx (port 80)                      │
│         Reverse Proxy — routes /api → backend           │
│                        / → frontend                     │
└──────────┬──────────────────────────┬───────────────────┘
           │ /api/v1                  │ /
           ▼                          ▼
┌──────────────────┐        ┌──────────────────┐
│ Express Backend  │        │ Angular Frontend │
│   (port 3000)    │        │   (port 4200)    │
└────────┬─────────┘        └──────────────────┘
         │
    ┌────┴──────┐
    │           │
    ▼           ▼
MongoDB 7    Redis 7
(port 27017) (port 6379)

         │ Firebase Admin SDK
         ▼
┌──────────────────┐
│  Firebase Auth   │
│  (Google Cloud)  │
└──────────────────┘

Monitoring Stack (optional):
Prometheus (9090) → Grafana (3001)
MongoDB Exporter (9216)
Redis Exporter (9121)
```

---

## Authentication Flow (the most important thing to understand)

RnD uses **phone-number-only authentication**. There are no passwords. Here is the complete flow:

```
User enters phone number
        │
        ▼
Firebase SDK sends SMS OTP
(Firebase handles OTP generation + SMS delivery)
        │
        ▼
User enters OTP
        │
        ▼
Firebase SDK verifies OTP on Firebase servers
Returns a signed "ID Token" (a short-lived JWT from Firebase)
        │
        ▼
Frontend sends Firebase ID Token to our backend
POST /api/v1/auth/verify-token
        │
        ▼
Backend verifies token with Firebase Admin SDK
Extracts phone number from token
        │
        ▼
Backend creates or finds user in MongoDB
        │
        ▼
Backend issues TWO tokens:
  ├── Access Token  (JWT, 15 min, stored in localStorage)
  └── Refresh Token (random 80 hex chars, 7 days, httpOnly cookie + localStorage)
        │
        ▼
Frontend stores access token, uses it on every API call
When access token expires → auto-refresh using refresh token
```

**Why two tokens?**
- Access token is short-lived (15 min) — if stolen, attacker only has 15 minutes
- Refresh token is long-lived (7 days) but stored as httpOnly cookie — JavaScript can't read it, so XSS attacks can't steal it
- Every refresh rotates both tokens — old refresh token is deleted from DB

---

## Current Feature Status

| Feature | Status | Notes |
|---|---|---|
| Phone Auth | ✅ Complete | Firebase OTP → JWT |
| User Registration | ✅ Complete | Auto-created on first login |
| Admin Panel | ✅ Complete | Dashboard stats + user list |
| RBAC | ✅ Complete | `customer` and `admin` roles |
| Rate Limiting | ✅ Complete | 10 req/min auth, 100 req/min global |
| Monitoring | ✅ Complete | Prometheus + Grafana |
| CI/CD | ✅ Complete | 5-job GitHub Actions pipeline |
| SAST | ✅ Complete | SonarCloud |
| Products | 🚧 Planned | Next phase |
| Cart | 🚧 Planned | Next phase |
| Orders | 🚧 Planned | Next phase |
| Payment | 🚧 Planned | Razorpay integration planned |
| Notifications | 🚧 Planned | Push + SMS |
