# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# Forces every layer from here down (the Angular build + prerender) to
# rerun whenever content changed even though no frontend SOURCE file did —
# e.g. an SEO publication that only changed Product.description in Mongo.
# Docker's build cache is keyed on file content, so without this a rebuild
# with unchanged frontend/ would silently reuse a stale `ng build` output
# baked against old data. The publisher passes a fresh value (the
# publication id) on every run. `npm ci` above is unaffected and stays
# cached across publications with the same package-lock.json.
ARG SEO_CONTENT_BUILD_REVISION=""
ENV SEO_CONTENT_BUILD_REVISION=${SEO_CONTENT_BUILD_REVISION}

COPY frontend/ .
RUN NODE_OPTIONS=--max-old-space-size=6144 npx ng build --configuration=production

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
