#!/usr/bin/env bash
# Narrowest safe recovery path for a publication that reached `published`
# (the build/swap itself succeeded) but whose post-publish content
# verification came back mismatch/fetch_failed — e.g. a stale prerender
# manifest that didn't list a just-created blog slug.
#
# This is deliberately a SEPARATE script from seo-publication-publisher.sh
# rather than a new branch inside it: the main publisher's claim/build/swap
# sequence is already tested and load-bearing for the normal pending->
# published path, and this recovery path has a different starting state
# (published, not pending), a different eligibility check (beginPublicationRedeploy,
# not claimNextPendingPublication), and one extra step (regenerate + validate
# the prerender manifest for a blog_create target) that the normal path does
# not need. Keeping them separate means neither can regress the other.
#
# Usage:
#   SEO_WORKTREE=... SEO_PUBLICATION_SOURCE_REVISION=<full sha> \
#     ops/seo-publication-redeploy.sh <publicationId>
#
# Same safety guarantees as the main publisher:
#   - source-revision guard before any build
#   - never falls back to `latest`
#   - bounded: beginPublicationRedeploy itself rejects a 4th attempt
#     (MAX_REDEPLOY_ATTEMPTS) — this script makes exactly ONE attempt per run
#   - on a build/swap/homepage-smoke failure, restores the frontend image that
#     was running immediately before THIS attempt and leaves the publication
#     in a recoverable `failed` state (never silently reports success)
#   - reuses the SAME execution/Blog document and the SAME publication row —
#     beginPublicationRedeploy only ever transitions published -> building on
#     that one row; it cannot create a second publication/execution/Blog.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/source-revision-guard.sh
source "$SCRIPT_DIR/lib/source-revision-guard.sh"
# shellcheck source=lib/homepage-smoke-check.sh
source "$SCRIPT_DIR/lib/homepage-smoke-check.sh"

PUBLICATION_ID="${1:-}"
if [[ -z "$PUBLICATION_ID" ]]; then
  echo "Usage: seo-publication-redeploy.sh <publicationId>" >&2
  exit 1
fi

WORKTREE="${SEO_WORKTREE:-/tmp/seo-phase-4b-deploy}"
PROD_ROOT="${SEO_PROD_ROOT:-/root/Rajhans-Tea-Prod}"
ENV_FILE="${SEO_ENV_FILE:-/root/Rajhans-Tea-Prod/.env}"
APPROVED_SOURCE_REVISION="${SEO_PUBLICATION_SOURCE_REVISION:-}"
HELPER_IMAGE_OVERRIDE="${SEO_PUBLICATION_HELPER_IMAGE:-}"
LOCK_FILE="${SEO_PUBLICATION_LOCK:-/tmp/rajhans-seo-publication.lock}"

run_worker() {
  docker run --rm \
    --env-file "$ENV_FILE" \
    -v "$WORKTREE/backend:/app/backend" \
    -v "$WORKTREE/tsconfig.base.json:/app/tsconfig.base.json:ro" \
    -w /app/backend \
    "$HELPER_IMAGE" \
    /app/node_modules/.bin/ts-node \
    --project tsconfig.scripts.json \
    scripts/seo-publication-worker.ts "$@"
}

# Same one-publisher-per-VPS lock as the main publisher — a redeploy attempt
# and a normal publish must never race on the frontend container/nginx.
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "[seo-redeploy] another publisher/redeploy is already running"
  exit 0
fi

if ! assert_source_revision_guard "$WORKTREE" "$APPROVED_SOURCE_REVISION"; then
  echo "[seo-redeploy] refusing to build or deploy: source-revision guard failed" >&2
  exit 1
fi

SOURCE_REF="$(git -C "$WORKTREE" rev-parse --short HEAD)"
HELPER_IMAGE="${HELPER_IMAGE_OVERRIDE:-rajhansteaprod/rajhans-tea-backend:$SOURCE_REF}"

if ! docker image inspect "$HELPER_IMAGE" >/dev/null 2>&1; then
  if ! docker pull "$HELPER_IMAGE" >/dev/null 2>&1; then
    echo "[seo-redeploy] REJECTED: helper image not available: $HELPER_IMAGE" >&2
    echo "[seo-redeploy]   Build it from the approved worktree, e.g.:" >&2
    echo "[seo-redeploy]     docker build --target production -f \"$WORKTREE/backend/Dockerfile\" -t $HELPER_IMAGE \"$WORKTREE\"" >&2
    exit 1
  fi
fi

BEGIN_RAW="$(run_worker redeploy-begin --id "$PUBLICATION_ID" --source-revision "$APPROVED_SOURCE_REVISION" | tail -n 1)"
echo "[seo-redeploy] begin=$BEGIN_RAW"

readarray -t BEGIN_FIELDS < <(
  python3 - "$BEGIN_RAW" <<'PY'
import json, sys
payload = json.loads(sys.argv[1])
if not payload.get("ok"):
    print("")
    print("")
    print("")
    sys.exit(0)
print(payload["executionId"])
print(payload["targetType"])
print(payload.get("expectedBlogSlug") or "")
PY
)

EXECUTION_ID="${BEGIN_FIELDS[0]:-}"
TARGET_TYPE="${BEGIN_FIELDS[1]:-}"
EXPECTED_BLOG_SLUG="${BEGIN_FIELDS[2]:-}"

if [[ -z "$EXECUTION_ID" ]]; then
  echo "[seo-redeploy] not eligible for redeploy — see begin result above" >&2
  exit 1
fi

IMAGE="rajhansteaprod/rajhans-tea-frontend:seo-redeploy-${PUBLICATION_ID:0:8}-${SOURCE_REF}"
OVERRIDE="/tmp/seo-redeploy-${PUBLICATION_ID}.override.yml"
ROLLBACK_OVERRIDE="/tmp/seo-redeploy-${PUBLICATION_ID}.rollback.yml"

PREVIOUS_IMAGE="$(docker inspect tea-frontend --format '{{.Config.Image}}')"

CURRENT_STEP="redeploy_begun"
SWAP_ATTEMPTED=0
MARKED_PUBLISHED=0

fail_handler() {
  rc=$?
  trap - ERR

  message="redeploy failed during ${CURRENT_STEP} (exit ${rc})"
  echo "[seo-redeploy] ERROR: $message" >&2

  if [[ "$SWAP_ATTEMPTED" == "1" && "$MARKED_PUBLISHED" == "0" ]]; then
    echo "[seo-redeploy] restoring previous frontend: $PREVIOUS_IMAGE"
    cat > "$ROLLBACK_OVERRIDE" <<EOF
services:
  frontend:
    image: $PREVIOUS_IMAGE
    pull_policy: never
EOF
    docker compose \
      -f "$PROD_ROOT/docker-compose.prod.yml" \
      -f "$ROLLBACK_OVERRIDE" \
      up -d --no-deps --force-recreate frontend || true
    docker restart tea-nginx >/dev/null 2>&1 || true
  fi

  if [[ "$MARKED_PUBLISHED" == "0" ]]; then
    run_worker failed --id "$PUBLICATION_ID" --message "$message" >/dev/null 2>&1 || true
  fi

  exit "$rc"
}

trap fail_handler ERR

echo "[seo-redeploy] publication=$PUBLICATION_ID execution=$EXECUTION_ID targetType=$TARGET_TYPE"
echo "[seo-redeploy] previous frontend=$PREVIOUS_IMAGE"
echo "[seo-redeploy] candidate frontend=$IMAGE"

# ---------------------------------------------------------------------
# For a blog_create recovery: regenerate the prerender manifest from the
# live API and validate it actually contains the expected slug BEFORE
# spending a build on a manifest that would just repeat the same mismatch.
# This refreshes the manifest file in the worktree without committing —
# the source-revision guard above already validated the committed source;
# this is the documented "regenerate at build time" mode the manifest
# generator itself anticipates (see generate-route-manifest.mjs).
# ---------------------------------------------------------------------
if [[ "$TARGET_TYPE" == "blog_create" ]]; then
  if [[ -z "$EXPECTED_BLOG_SLUG" ]]; then
    echo "[seo-redeploy] REJECTED: blog_create redeploy but no expected slug was reported" >&2
    false
  fi

  CURRENT_STEP="manifest_regenerate"
  ( cd "$WORKTREE/frontend" && npm run prerender:manifest )

  CURRENT_STEP="manifest_validate"
  if ! grep -q "\"$EXPECTED_BLOG_SLUG\"" "$WORKTREE/frontend/src/prerender-routes.json"; then
    echo "[seo-redeploy] REJECTED: regenerated manifest still does not contain \"$EXPECTED_BLOG_SLUG\"" >&2
    false
  fi
  echo "[seo-redeploy] manifest validated: contains \"$EXPECTED_BLOG_SLUG\""
fi

CURRENT_STEP="frontend_build"
docker build \
  --build-arg SEO_CONTENT_BUILD_REVISION="redeploy-$PUBLICATION_ID" \
  -f "$WORKTREE/frontend/Dockerfile" \
  -t "$IMAGE" \
  "$WORKTREE"

CURRENT_STEP="frontend_swap"
cat > "$OVERRIDE" <<EOF
services:
  frontend:
    image: $IMAGE
    pull_policy: never
EOF

SWAP_ATTEMPTED=1

docker compose \
  -f "$PROD_ROOT/docker-compose.prod.yml" \
  -f "$OVERRIDE" \
  up -d --no-deps --force-recreate frontend

CURRENT_STEP="nginx_refresh"
docker restart tea-nginx >/dev/null

CURRENT_STEP="homepage_smoke"
HTTP_CODE="$(check_homepage_with_nginx_recovery 'https://rajhanstea.com/' tea-nginx)" || true

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "homepage returned HTTP $HTTP_CODE (after nginx recovery retry)" >&2
  false
fi

CURRENT_STEP="mark_published"
PUBLISHED_RAW="$(
  run_worker published \
    --id "$PUBLICATION_ID" \
    --image "$IMAGE" \
    --source-ref "$SOURCE_REF" \
  | tail -n 1
)"

python3 - "$PUBLISHED_RAW" <<'PY'
import json, sys
payload = json.loads(sys.argv[1])
if not payload.get("ok"):
    raise SystemExit("redeploy could not mark publication as published")
PY

MARKED_PUBLISHED=1
trap - ERR

echo "[seo-redeploy] published=$IMAGE"

CURRENT_STEP="live_reverification"
set +e
VERIFY_RAW="$(run_worker verify --id "$PUBLICATION_ID" | tail -n 1)"
VERIFY_RC=$?
set -e

echo "[seo-redeploy] verification=$VERIFY_RAW"

if [[ "$VERIFY_RC" != "0" ]]; then
  echo "[seo-redeploy] frontend redeployed, but verification command reported an error" >&2
  exit "$VERIFY_RC"
fi

# "Only complete after verification succeeds" — this script's own exit code
# reflects the verification OUTCOME, not just the deploy mechanics, so a
# repeat mismatch is never silently reported as success.
VERIFY_STATUS="$(
  python3 - "$VERIFY_RAW" <<'PY'
import json, sys
payload = json.loads(sys.argv[1])
print(payload.get("verification", {}).get("status", "unknown"))
PY
)"

if [[ "$VERIFY_STATUS" != "verified" ]]; then
  echo "[seo-redeploy] redeploy succeeded but re-verification status is \"$VERIFY_STATUS\", not \"verified\" — NOT marking complete" >&2
  exit 1
fi

echo "[seo-redeploy] DONE publication=$PUBLICATION_ID verification=verified"
