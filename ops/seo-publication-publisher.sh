#!/usr/bin/env bash
set -Eeuo pipefail

WORKTREE="${SEO_WORKTREE:-/tmp/seo-phase-4b-deploy}"
PROD_ROOT="${SEO_PROD_ROOT:-/root/Rajhans-Tea-Prod}"
ENV_FILE="${SEO_ENV_FILE:-/root/Rajhans-Tea-Prod/.env}"

# Source is mounted into the helper container; this image supplies Node,
# node_modules and ts-node. It does NOT receive Docker socket access.
HELPER_IMAGE="${SEO_PUBLICATION_HELPER_IMAGE:-rajhansteaprod/rajhans-tea-backend:829f71f}"

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
    -f "$WORKTREE/frontend/Dockerfile" \
    -t "$IMAGE" \
    "$WORKTREE"

  echo "[seo-publication] SELF TEST PASSED"
  docker image rm "$IMAGE" >/dev/null 2>&1 || true
  exit 0
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
else:
    print(publication["id"])
    print(publication["executionId"])
    print(publication["requestedByUserId"])
PY
)

PUBLICATION_ID="${CLAIM_FIELDS[0]:-}"
EXECUTION_ID="${CLAIM_FIELDS[1]:-}"
REQUESTED_BY="${CLAIM_FIELDS[2]:-}"

if [[ -z "$PUBLICATION_ID" ]]; then
  echo "[seo-publication] no pending publication"
  exit 0
fi

IMAGE="rajhansteaprod/rajhans-tea-frontend:seo-pub-${PUBLICATION_ID:0:8}-${SOURCE_REF}"
OVERRIDE="/tmp/seo-publication-${PUBLICATION_ID}.override.yml"
ROLLBACK_OVERRIDE="/tmp/seo-publication-${PUBLICATION_ID}.rollback.yml"

PREVIOUS_IMAGE="$(docker inspect tea-frontend --format '{{.Config.Image}}')"

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

  exit "$rc"
}

trap fail_handler ERR

echo "[seo-publication] publication=$PUBLICATION_ID execution=$EXECUTION_ID"
echo "[seo-publication] previous frontend=$PREVIOUS_IMAGE"
echo "[seo-publication] candidate frontend=$IMAGE"

# ---------------------------------------------------------------------
# BUILD.
# Existing frontend Dockerfile itself runs verify-prerender.mjs.
# A failed/incomplete prerender therefore never reaches deployment.
# ---------------------------------------------------------------------
CURRENT_STEP="frontend_build"

docker build \
  -f "$WORKTREE/frontend/Dockerfile" \
  -t "$IMAGE" \
  "$WORKTREE"

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

# Basic availability gate before publication is recorded.
CURRENT_STEP="homepage_smoke"

HTTP_CODE="$(
  curl -sSIL \
    -o /dev/null \
    -w '%{http_code}' \
    'https://rajhanstea.com/'
)"

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "homepage returned HTTP $HTTP_CODE" >&2
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

if [[ "$VERIFY_RC" != "0" ]]; then
  echo "[seo-publication] frontend published, but verification command reported an error" >&2
  exit "$VERIFY_RC"
fi

echo "[seo-publication] DONE publication=$PUBLICATION_ID"
