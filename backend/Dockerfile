# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json* ./
COPY backend/package.json ./backend/

RUN npm install --workspace=backend --ignore-scripts

COPY backend/ ./backend/
COPY tsconfig.base.json ./

RUN npm run build --workspace=backend

# Stage 2: Production
FROM node:22-alpine AS production

WORKDIR /app

COPY package.json package-lock.json* ./
COPY backend/package.json ./backend/

RUN npm install --workspace=backend --ignore-scripts

COPY --from=builder /app/backend/dist ./backend/dist

EXPOSE 3000

CMD ["node", "backend/dist/server.js"]
