# 🚀 Option A: Local Frontend + Docker Backend Setup

## Current Architecture

```
Your Local Machine (Windows):
├── Frontend (Angular SSR) → http://localhost:4000
│   ├── Hot-reload on file changes
│   └── Calls API at http://localhost:3100/api/v1
│
DOCKER CONTAINERS:
├── Backend API → http://localhost:3100 (exposed)
├── MongoDB → localhost:27019
├── Redis → localhost:6381
├── Mongo-Express → localhost:8082
└── (NO Frontend container, NO Nginx)
```

---

## ✅ WHAT WAS DONE

1. **docker-compose.yml** - Removed frontend & nginx services
2. **Backend CORS** - Updated to allow `http://localhost:4000`
3. **environment.ts** - Set `apiUrl: 'http://localhost:3100/api/v1'`
4. **Nodemon config** - Polling enabled for Windows dev
5. **Committed** - All changes saved to git branch `v2`

---

## 🎯 DEVELOPMENT WORKFLOW

### Terminal 1: Start Backend Services

```bash
cd c:\Users\91626\Desktop\DEVELOPMENT APPLICATIONS\Rajhans Tea
docker-compose up -d
```

**Expected Output:**
```
✅ rajhans-tea-mongo (healthy)
✅ rajhans-tea-redis (healthy)
✅ rajhans-tea-backend (running on port 3100)
✅ rajhans-tea-mongo-express (port 8082)
```

### Terminal 2: Start Frontend with Hot-Reload

```bash
cd c:\Users\91626\Desktop\DEVELOPMENT APPLICATIONS\Rajhans Tea\frontend
npm run dev:ssr
```

**Expected Output:**
```
> nodemon --poll 1000
[nodemon] 3.1.14
[nodemon] watching path(s): src/**/* tsconfig.server.json
[nodemon] watching extensions: ts,html,scss
[nodemon] starting `npm run build:ssr && npm run serve:ssr`

... (build output)

Node Express server listening on http://localhost:4000
```

### Terminal 3: Access Application

Open browser: **http://localhost:4000**

---

## 🔥 HOT-RELOAD VERIFICATION

### Test 1: Edit HTML
1. Edit: `frontend/src/app/layouts/main-layout/header/header.html`
2. Change any text (e.g., "RAJHANS TEA" → "RAJHANS TEA STORE")
3. Save file
4. Watch Terminal 2 for:
   ```
   [nodemon] files changed: src/app/layouts/main-layout/header/header.html
   [nodemon] restarting due to changes...
   [nodemon] restarted
   ```
5. Refresh browser (F5) → See updated text

### Test 2: Edit CSS
1. Edit: `frontend/src/app/layouts/main-layout/header/header.scss`
2. Change a color: `.logo { color: red; }`
3. Save file
4. Terminal 2 shows rebuild
5. Refresh browser → Style applied

### Test 3: Edit TypeScript
1. Edit: `frontend/src/app/core/services/auth.service.ts`
2. Add console.log or change logic
3. Save file
4. Terminal 2 shows rebuild
5. Refresh browser → New behavior

---

## ✅ VALIDATION CHECKLIST

- [ ] Backend running: `curl http://localhost:3100/api/v1/health`
- [ ] MongoDB accessible: `mongo mongodb://localhost:27019`
- [ ] Redis accessible: `redis-cli -p 6381 ping`
- [ ] Frontend loads: Browser → http://localhost:4000
- [ ] No CORS errors in browser console
- [ ] Products/Categories load from API
- [ ] Authentication works
- [ ] File changes trigger rebuild

---

## 🔧 TROUBLESHOOTING

### "Cannot connect to localhost:3100"
```bash
# Check backend is running
docker-compose ps

# Restart backend
docker-compose restart backend

# View logs
docker logs rajhans-tea-backend -f
```

### "Frontend not hot-reloading"
```bash
# Check file is saved (editor might not auto-save)
# Terminal 2 should show: [nodemon] files changed

# If nothing appears:
# 1. Restart frontend: Ctrl+C, then npm run dev:ssr
# 2. Check nodemon.json has: "usePolling": true
```

### "Port 4000 already in use"
```bash
# Kill any process on port 4000
netstat -ano | findstr :4000

# Or just restart npm run dev:ssr
```

### "CORS error in browser console"
```bash
# Backend CORS not updated
docker-compose restart backend
```

---

## 📊 COMPARING TO DOCKER VERSION

| Aspect | Local Dev | Docker Version |
|--------|-----------|---------|
| Frontend reload | **<1 sec** | 5-10 sec |
| Debugging | Full local tools | Limited |
| Environment | Identical APIs | Same backend |
| Data | Same (Docker DB) | Same |
| Port 4000 | Local | Docker container |

---

## 🎓 HOW IT WORKS

```
Browser makes request:
  GET http://localhost:3100/api/v1/products
  ↓ (direct HTTP to Docker backend)
  ↓
Docker Backend (port 3100):
  receives request
  queries MongoDB
  returns JSON
  ↓ (back to browser)

Browser renders Angular component
  ↓
You edit .ts/.html/.scss file
  ↓
Nodemon detects change (polling)
  ↓
npm run build:ssr (rebuilds)
  ↓
npm run serve:ssr (restarts server)
  ↓
You refresh browser (F5)
  ↓
New code running! ✅
```

---

## 📝 QUICK COMMANDS

```bash
# Start everything
docker-compose up -d && cd frontend && npm run dev:ssr

# Stop everything
docker-compose down

# Restart backend
docker-compose restart backend

# View backend logs
docker logs rajhans-tea-backend -f

# Clean Docker
docker-compose down -v

# View all running containers
docker-compose ps

# Access MongoDB
mongo mongodb://localhost:27019

# Access Mongo-Express GUI
# Browser: http://localhost:8082
```

---

## 🚀 NEXT STEPS

1. ✅ Backend running in Docker
2. ✅ Frontend running locally
3. ✅ Hot-reload configured
4. **→ Start coding!**
5. Make changes → Rebuild auto-triggers → Refresh browser
6. All APIs work identically to Docker version

---

## 📞 WHEN READY FOR PRODUCTION

To deploy to Docker again:

```bash
# Build production image
docker-compose -f docker-compose.prod.yml build

# Or re-add frontend service to docker-compose.yml
# with Dockerfile.ssr
```

Environment will automatically switch to `/api/v1` (relative path) for Docker deployments.

---

**Status:** ✅ Ready for development!  
**Last Updated:** 2026-04-11  
**Branch:** v2
