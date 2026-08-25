# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install

COPY frontend/ .
RUN npx ng build --configuration=production

# SEO gate: fail the image build if representative dynamic routes were not
# prerendered with real content (e.g. API unreachable at build). Prevents
# shipping the homepage shell for /product, /catalog, /blog URLs.
RUN node scripts/verify-prerender.mjs

# Stage 2: Serve with nginx
FROM nginx:alpine AS production

COPY --from=builder /app/dist/frontend/browser /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
