#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/source-revision-guard.sh
source "$SCRIPT_DIR/lib/source-revision-guard.sh"
# shellcheck source=lib/homepage-smoke-check.sh
source "$SCRIPT_DIR/lib/homepage-smoke-check.sh"
# shellcheck source=lib/prerender-manifest-refresh.sh
source "$SCRIPT_DIR/lib/prerender-manifest-refresh.sh"

WORKTREE="${SEO_WORKTREE:-/tmp/seo-phase-4b-deploy}"
PROD_ROOT="${SEO_PROD_ROOT:-/root/Rajhans-Tea-Prod}"
ENV_FILE="${SEO_ENV_FILE:-/root/Rajhans-Tea-Prod/.env}"

# The commit the operator has approved for this worktree to build/deploy
# from. No default: an unset value must fail closed, never implicitly
# trust whatever happens to be checked out in $WORKTREE.
APPROVED_SOURCE_REVISION="${SEO_PUBLICATION_SOURCE_REVISION:-}"

# Source is mounted into the helper container; this image supplies Node,
# node_modules and ts-node. It does NOT receive Docker socket access.
#
# No hardcoded fallback tag. An operator MAY pin an explicit image via
# SEO_PUBLICATION_HELPER_IMAGE; when unset, the default is derived from the
# SAME approved source revision the guard below validates (a short SHA tag),
# so the helper can never silently run against stale/unrelated source. Either
# way, the image's actual presence is verified (assert_helper_image_available,
# below) before use — never a silent fallback to `latest` or a build attempt
# with an image that doesn't exist.
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

# One publisher per VPS at a time.
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "[seo-publication] another publisher is already running"
  exit 0
fi

# ---------------------------------------------------------------------
# SOURCE-REVISION SAFETY GUARD.
# Refuses to build, deploy, or publish unless $WORKTREE is a clean git
# worktree whose HEAD exactly equals $SEO_PUBLICATION_SOURCE_REVISION.
# This runs before any docker build (including the self-test path below)
# so a stale or unapproved worktree can never produce or ship an image.
# ---------------------------------------------------------------------
if ! assert_source_revision_guard "$WORKTREE" "$APPROVED_SOURCE_REVISION"; then
  echo "[seo-publication] refusing to build or deploy: source-revision guard failed" >&2
  exit 1
fi

SOURCE_REF="$(git -C "$WORKTREE" rev-parse --short HEAD)"

# ---------------------------------------------------------------------
# Safe infrastructure self-test:
# build + prerender gate ONLY.
# Does not claim DB work, swap frontend, restart nginx, or verify.
# ---------------------------------------------------------------------
if [[ "${SEO_PUBLICATION_SELF_TEST:-0}" == "1" ]]; then
  IMAGE="rajhansteaprod/rajhans-tea-frontend:seo-pub-selftest-${SOURCE_REF}"

  echo "[seo-publication] SELF TEST: building $IMAGE"

  docker build \
    --build-arg SEO_CONTENT_BUILD_REVISION="selftest-$(date +%s)" \
    -f "$WORKTREE/frontend/Dockerfile" \
    -t "$IMAGE" \
    "$WORKTREE"

  echo "[seo-publication] SELF TEST PASSED"
  docker image rm "$IMAGE" >/dev/null 2>&1 || true
  exit 0
fi

# Resolve the helper image now that SOURCE_REF is known: an explicit pin
# always wins; otherwise default to the versioned tag matching this exact
# approved source revision.
HELPER_IMAGE="${HELPER_IMAGE_OVERRIDE:-rajhansteaprod/rajhans-tea-backend:$SOURCE_REF}"

# ---------------------------------------------------------------------
# HELPER-IMAGE AVAILABILITY GUARD.
# Fails closed (never falls back to `latest` or any other tag) if the
# resolved helper image cannot be found locally or pulled. This is what
# replaces the previous hardcoded, eventually-obsolete default tag.
# ---------------------------------------------------------------------
if ! docker image inspect "$HELPER_IMAGE" >/dev/null 2>&1; then
  if ! docker pull "$HELPER_IMAGE" >/dev/null 2>&1; then
    echo "[seo-publication] REJECTED: helper image not available: $HELPER_IMAGE" >&2
    echo "[seo-publication]   Build it from the approved worktree, e.g.:" >&2
    echo "[seo-publication]     docker build --target production -f \"$WORKTREE/backend/Dockerfile\" -t $HELPER_IMAGE \"$WORKTREE\"" >&2
    echo "[seo-publication]   or set SEO_PUBLICATION_HELPER_IMAGE to an existing, approved image." >&2
    exit 1
  fi
fi


CLAIM_RAW="$(run_worker claim | tail -n 1)"

readarray -t CLAIM_FIELDS < <(
  python3 - "$CLAIM_RAW" <<'PY'
import json, sys

payload = json.loads(sys.argv[1])
publication = payload.get("publication")

if not publication:
    print("")
    print("")
    print("")
    print("")
    print("")
else:
    print(publication["id"])
    print(publication["executionId"])
    print(publication["requestedByUserId"])
    print(payload.get("targetType") or "")
    print(payload.get("expectedBlogSlug") or "")
PY
)

PUBLICATION_ID="${CLAIM_FIELDS[0]:-}"
EXECUTION_ID="${CLAIM_FIELDS[1]:-}"
REQUESTED_BY="${CLAIM_FIELDS[2]:-}"
TARGET_TYPE="${CLAIM_FIELDS[3]:-}"
EXPECTED_BLOG_SLUG="${CLAIM_FIELDS[4]:-}"

if [[ -z "$PUBLICATION_ID" ]]; then
  echo "[seo-publication] no pending publication"
  exit 0
fi

IMAGE="rajhansteaprod/rajhans-tea-frontend:seo-pub-${PUBLICATION_ID:0:8}-${SOURCE_REF}"
OVERRIDE="/tmp/seo-publication-${PUBLICATION_ID}.override.yml"
ROLLBACK_OVERRIDE="/tmp/seo-publication-${PUBLICATION_ID}.rollback.yml"

PREVIOUS_IMAGE="$(docker inspect tea-frontend --format '{{.Config.Image}}')"

# Default build context is the approved worktree itself, exactly as before —
# unchanged for metadata/product/cms_page publications. A blog_create
# publication switches this to an ephemeral copy further below so the
# regenerated prerender manifest never touches the approved worktree.
BUILD_CONTEXT="$WORKTREE"
EPHEMERAL_BUILD_CONTEXT=0

CURRENT_STEP="claimed"
SWAP_ATTEMPTED=0
MARKED_PUBLISHED=0

fail_handler() {
  rc=$?
  trap - ERR

  message="publisher failed during ${CURRENT_STEP} (exit ${rc})"

  echo "[seo-publication] ERROR: $message" >&2

  # If we already replaced the frontend but failed before recording
  # publication=published, restore the previously running image.
  if [[ "$SWAP_ATTEMPTED" == "1" && "$MARKED_PUBLISHED" == "0" ]]; then
    echo "[seo-publication] restoring previous frontend: $PREVIOUS_IMAGE"

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
    run_worker failed \
      --id "$PUBLICATION_ID" \
      --message "$message" >/dev/null 2>&1 || true
  fi

  if [[ "$EPHEMERAL_BUILD_CONTEXT" == "1" ]]; then
    rm -rf "$BUILD_CONTEXT" 2>/dev/null || true
  fi

  exit "$rc"
}

trap fail_handler ERR

echo "[seo-publication] publication=$PUBLICATION_ID execution=$EXECUTION_ID targetType=${TARGET_TYPE:-<unknown>}"
echo "[seo-publication] previous frontend=$PREVIOUS_IMAGE"
echo "[seo-publication] candidate frontend=$IMAGE"

# ---------------------------------------------------------------------
# For a first-time blog_create publication: the committed prerender manifest
# predates this brand-new Blog, so it must be regenerated from the live
# DB/API state and proven to contain the new slug BEFORE any build — done in
# an ephemeral copy of the approved worktree's tree so the worktree itself
# (and its source-revision guard guarantee) is never touched.
# ---------------------------------------------------------------------
if [[ "$TARGET_TYPE" == "blog_create" ]]; then
  if [[ -z "$EXPECTED_BLOG_SLUG" ]]; then
    echo "[seo-publication] REJECTED: blog_create publication but no expected slug was reported" >&2
    false
  fi

  CURRENT_STEP="manifest_refresh"
  BUILD_CONTEXT="$(prepare_ephemeral_build_context "$WORKTREE" "pub-${PUBLICATION_ID}")"
  EPHEMERAL_BUILD_CONTEXT=1

  refresh_and_validate_prerender_manifest "$BUILD_CONTEXT" "$EXPECTED_BLOG_SLUG" "$WORKTREE/frontend/src/prerender-routes.json"
fi

# ---------------------------------------------------------------------
# BUILD.
# Existing frontend Dockerfile itself runs verify-prerender.mjs.
# A failed/incomplete prerender therefore never reaches deployment.
# ---------------------------------------------------------------------
CURRENT_STEP="frontend_build"

docker build \
  --build-arg SEO_CONTENT_BUILD_REVISION="$PUBLICATION_ID" \
  -f "$BUILD_CONTEXT/frontend/Dockerfile" \
  -t "$IMAGE" \
  "$BUILD_CONTEXT"

# ---------------------------------------------------------------------
# DEPLOY ONLY THE FRONTEND.
# Base production :latest/pull policy is overridden explicitly.
# ---------------------------------------------------------------------
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

# Basic availability gate before publication is recorded. Bounded recovery
# for the known post-swap nginx-stale-upstream race lives in
# lib/homepage-smoke-check.sh (exactly one extra nginx restart + retry).
CURRENT_STEP="homepage_smoke"

HTTP_CODE="$(check_homepage_with_nginx_recovery 'https://rajhanstea.com/' tea-nginx)" || true

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "homepage returned HTTP $HTTP_CODE (after nginx recovery retry)" >&2
  false
fi

# ---------------------------------------------------------------------
# Publication is now materially live.
# Only now unblock Phase 5.4 verification.
# ---------------------------------------------------------------------
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
    raise SystemExit("publisher could not mark publication as published")
PY

MARKED_PUBLISHED=1

# From here onward publishing itself succeeded, so verification problems do
# NOT roll back the frontend. They remain forensic verification outcomes.
trap - ERR

echo "[seo-publication] published=$IMAGE"

CURRENT_STEP="live_verification"

set +e
VERIFY_RAW="$(run_worker verify --id "$PUBLICATION_ID" | tail -n 1)"
VERIFY_RC=$?
set -e

echo "[seo-publication] verification=$VERIFY_RAW"

if [[ "$EPHEMERAL_BUILD_CONTEXT" == "1" ]]; then
  rm -rf "$BUILD_CONTEXT"
fi

if [[ "$VERIFY_RC" != "0" ]]; then
  echo "[seo-publication] frontend published, but verification command reported an error" >&2
  exit "$VERIFY_RC"
fi

echo "[seo-publication] DONE publication=$PUBLICATION_ID"
