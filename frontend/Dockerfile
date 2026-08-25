# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ .
RUN NODE_OPTIONS=--max-old-space-size=6144 npx ng build --configuration=production

# Stage 2: Run the Angular SSR Node server (hybrid: prerendered static routes +
# on-demand SSR for dynamic routes). server.mjs is fully self-bundled (express and
# deps inlined), so no node_modules are needed at runtime — just Node + dist.
FROM node:22-alpine AS production

WORKDIR /app
COPY --from=builder /app/dist/frontend ./dist/frontend

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

CMD ["node", "dist/frontend/server/server.mjs"]
