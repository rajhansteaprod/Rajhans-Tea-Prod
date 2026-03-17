# Rajhans Ecommerce — Living Engineering Knowledge Book

> **This is a living document.** Every time new code is added, the relevant section below is updated.
> Last updated: 2026-03-17 | Version: v1

---

## What Is This?

This knowledge book turns the entire Rajhans Ecommerce codebase into a self-explanatory system.
A beginner can read it and understand everything. An experienced engineer can trust it.

---

## Table of Contents

| # | Section | What It Covers |
|---|---------|---------------|
| 01 | [System Overview](./01-system-overview.md) | What this app is, what it does, tech stack summary |
| 02 | [Architecture](./02-architecture.md) | Layered architecture, module boundaries, design patterns |
| 03 | [Folder & File Guide](./03-folder-structure.md) | Every folder and file explained |
| 04 | [Data Flow](./04-data-flow.md) | How a request travels from browser → DB → back |
| 05 | [Core Modules](./05-core-modules.md) | Auth, Admin, Monitoring — deep dives |
| 06 | [API Documentation](./06-api-documentation.md) | All endpoints with request/response examples |
| 07 | [Frontend Architecture](./07-frontend-architecture.md) | Angular structure, signals, routing, interceptors |
| 08 | [Database Design](./08-database-design.md) | MongoDB schemas, indexes, relationships |
| 09 | [Local Setup Guide](./09-local-setup.md) | Step-by-step beginner-friendly setup |
| 10 | [Deployment Guide](./10-deployment.md) | Docker, CI/CD, environment variables |
| 11 | [Testing Strategy](./11-testing-strategy.md) | Unit, integration, sanity, load testing |
| 12 | [Debugging Guide](./12-debugging.md) | How to diagnose common issues |
| 13 | [Common Pitfalls](./13-pitfalls.md) | Mistakes to avoid — learned the hard way |
| 14 | [Scaling Considerations](./14-scaling.md) | How to grow this system |
| 15 | [Refactoring Opportunities](./15-refactoring.md) | What to improve and how |
| 16 | [Tech Debt Tracker](./16-tech-debt.md) | Prioritized cleanup roadmap |

---

## Current System State (v1)

```
✅ Authentication    Firebase OTP → JWT (access + refresh tokens)
✅ Admin Panel       User management, dashboard stats
✅ Monitoring        Prometheus + Grafana
✅ CI/CD             GitHub Actions (5 jobs) + SonarCloud SAST
✅ Infrastructure    Docker, Nginx, MongoDB replica set, Redis

🚧 Products          Not yet built
🚧 Cart              Not yet built
🚧 Orders            Not yet built
🚧 Payment           Not yet built
```

---

## Quick Start (30 seconds)

```bash
# 1. Clone and install
git clone https://github.com/saransh-bairagi/RAJHANS-ECOMMERCE-PROD.git
cd RAJHANS-ECOMMERCE-PROD

# 2. Set up environment
cp backend/.env.example backend/.env
# Edit backend/.env with your values

# 3. Start everything
docker compose up -d

# App running at:
# Frontend  → http://localhost:4201
# Backend   → http://localhost:3100
# API Docs  → see docs/06-api-documentation.md
```

Full setup: [docs/09-local-setup.md](./09-local-setup.md)
