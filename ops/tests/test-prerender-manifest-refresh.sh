#!/usr/bin/env bash
# Tests for ops/lib/prerender-manifest-refresh.sh.
#
# Plain-bash assertions against throwaway git repos + a synthetic
# `npm run prerender:manifest` fixture (controlled entirely via env vars, no
# live API/DB dependency) under a temp directory. Run directly:
#   bash ops/tests/test-prerender-manifest-refresh.sh
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/prerender-manifest-refresh.sh"

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT" /tmp/seo-build-ctx-test-*' EXIT

PASS_COUNT=0
FAIL_COUNT=0

expect_success() {
  local name="$1"; shift
  if "$@" >/tmp/prm-out.$$ 2>/tmp/prm-err.$$; then
    echo "PASS: $name"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "FAIL: $name (expected success, it failed)"
    cat /tmp/prm-err.$$
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
  rm -f /tmp/prm-out.$$ /tmp/prm-err.$$
}

expect_failure() {
  local name="$1"; shift
  if "$@" >/tmp/prm-out.$$ 2>/tmp/prm-err.$$; then
    echo "FAIL: $name (expected failure, it succeeded)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  else
    echo "PASS: $name"
    PASS_COUNT=$((PASS_COUNT + 1))
  fi
  rm -f /tmp/prm-out.$$ /tmp/prm-err.$$
}

expect_eq() {
  local name="$1" actual="$2" expected="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo "PASS: $name"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "FAIL: $name (expected \"$expected\", got \"$actual\")"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

# Builds a throwaway git repo at $1 with:
#   - a committed frontend/src/prerender-routes.json (the baseline manifest)
#   - a synthetic "npm run prerender:manifest" (frontend/package.json ->
#     frontend/fake-generate-manifest.sh) that writes a manifest controlled
#     entirely by the FAKE_MANIFEST_BLOG env var (space-separated blog slugs)
#     — or, if FAKE_MANIFEST_FAIL=1, fails without writing anything, mirroring
#     the real generator's fail-closed contract on an unreachable API.
make_repo() {
  local dir="$1"
  mkdir -p "$dir/frontend/src"
  git -C "$dir" init -q
  git -C "$dir" config user.email "test@example.com"
  git -C "$dir" config user.name "Test"

  cat > "$dir/frontend/src/prerender-routes.json" <<'JSON'
{
  "generatedAt": "2026-01-01T00:00:00.000Z",
  "source": "https://example.test/api/v1",
  "product": ["product-a", "product-b"],
  "catalog": ["catalog-a"],
  "blog": ["existing-post-a", "existing-post-b"]
}
JSON

  cat > "$dir/frontend/package.json" <<'JSON'
{
  "name": "fake-frontend",
  "scripts": { "prerender:manifest": "sh fake-generate-manifest.sh" }
}
JSON

  cat > "$dir/frontend/fake-generate-manifest.sh" <<'SH'
#!/bin/sh
set -e
if [ "${FAKE_MANIFEST_FAIL:-0}" = "1" ]; then
  echo "[fake-manifest] simulated API failure — not writing" >&2
  exit 1
fi
BLOG_JSON=$(printf '%s\n' "${FAKE_MANIFEST_BLOG:-}" | python3 -c "import json,sys; print(json.dumps(sys.stdin.read().split()))")
cat > src/prerender-routes.json <<JSON
{
  "generatedAt": "2026-06-01T00:00:00.000Z",
  "source": "https://example.test/api/v1",
  "product": ["product-a", "product-b"],
  "catalog": ["catalog-a"],
  "blog": $BLOG_JSON
}
JSON
SH

  git -C "$dir" add -A
  git -C "$dir" commit -q -m "initial"
}

# --- A. new blog_create slug gets added before build (success path) --------
REPO_A="$TMP_ROOT/repo-a"
make_repo "$REPO_A"
CTX_A="$(prepare_ephemeral_build_context "$REPO_A" "test-a")"
FAKE_MANIFEST_BLOG="existing-post-a existing-post-b new-nilgiri-guide" \
  expect_success "A: new slug present exactly once -> refresh succeeds" \
  refresh_and_validate_prerender_manifest "$CTX_A" "new-nilgiri-guide" "$REPO_A/frontend/src/prerender-routes.json"

NEW_BLOG_COUNT_A="$(python3 -c "import json; print(json.load(open('$CTX_A/frontend/src/prerender-routes.json'))['blog'].count('new-nilgiri-guide'))")"
expect_eq "A: regenerated manifest contains the new slug exactly once" "$NEW_BLOG_COUNT_A" "1"

# --- B. expected slug missing => fails before deploy ------------------------
REPO_B="$TMP_ROOT/repo-b"
make_repo "$REPO_B"
CTX_B="$(prepare_ephemeral_build_context "$REPO_B" "test-b")"
FAKE_MANIFEST_BLOG="existing-post-a existing-post-b" \
  expect_failure "B: expected slug missing from regenerated manifest -> rejected" \
  refresh_and_validate_prerender_manifest "$CTX_B" "new-nilgiri-guide" "$REPO_B/frontend/src/prerender-routes.json"

# --- C. duplicate expected slug => fails ------------------------------------
REPO_C="$TMP_ROOT/repo-c"
make_repo "$REPO_C"
CTX_C="$(prepare_ephemeral_build_context "$REPO_C" "test-c")"
FAKE_MANIFEST_BLOG="existing-post-a existing-post-b new-nilgiri-guide new-nilgiri-guide" \
  expect_failure "C: expected slug duplicated in regenerated manifest -> rejected" \
  refresh_and_validate_prerender_manifest "$CTX_C" "new-nilgiri-guide" "$REPO_C/frontend/src/prerender-routes.json"

# --- D. existing routes are preserved (none dropped vs baseline) -----------
REPO_D="$TMP_ROOT/repo-d"
make_repo "$REPO_D"
CTX_D="$(prepare_ephemeral_build_context "$REPO_D" "test-d")"
FAKE_MANIFEST_BLOG="existing-post-a" \
  expect_failure "D: regenerated manifest silently dropped an existing route -> rejected" \
  refresh_and_validate_prerender_manifest "$CTX_D" "" "$REPO_D/frontend/src/prerender-routes.json"

REPO_D2="$TMP_ROOT/repo-d2"
make_repo "$REPO_D2"
CTX_D2="$(prepare_ephemeral_build_context "$REPO_D2" "test-d2")"
FAKE_MANIFEST_BLOG="existing-post-a existing-post-b" \
  expect_success "D2: regenerated manifest preserving every existing route succeeds (no expected slug required)" \
  refresh_and_validate_prerender_manifest "$CTX_D2" "" "$REPO_D2/frontend/src/prerender-routes.json"

# --- E. manifest generation itself failing (e.g. unreachable API) fails closed ---
REPO_E="$TMP_ROOT/repo-e"
make_repo "$REPO_E"
CTX_E="$(prepare_ephemeral_build_context "$REPO_E" "test-e")"
FAKE_MANIFEST_FAIL=1 \
  expect_failure "E: manifest regeneration command failing is rejected, not silently accepted" \
  refresh_and_validate_prerender_manifest "$CTX_E" "new-nilgiri-guide" "$REPO_E/frontend/src/prerender-routes.json"

# --- F. approved source worktree remains clean throughout ------------------
REPO_F="$TMP_ROOT/repo-f"
make_repo "$REPO_F"
STATUS_BEFORE="$(git -C "$REPO_F" status --porcelain)"
CTX_F="$(prepare_ephemeral_build_context "$REPO_F" "test-f")"
FAKE_MANIFEST_BLOG="existing-post-a existing-post-b brand-new-slug" \
  refresh_and_validate_prerender_manifest "$CTX_F" "brand-new-slug" "$REPO_F/frontend/src/prerender-routes.json" >/dev/null
STATUS_AFTER="$(git -C "$REPO_F" status --porcelain)"
expect_eq "F: approved worktree has no tracked/untracked changes after an ephemeral-context refresh" "$STATUS_AFTER" "$STATUS_BEFORE"
expect_eq "F: approved worktree's own manifest file is untouched (still the baseline content)" \
  "$(python3 -c "import json; print(json.load(open('$REPO_F/frontend/src/prerender-routes.json'))['blog'])")" \
  "['existing-post-a', 'existing-post-b']"

# --- G. the ephemeral build context is an independent copy, not a symlink --
REPO_G="$TMP_ROOT/repo-g"
make_repo "$REPO_G"
CTX_G="$(prepare_ephemeral_build_context "$REPO_G" "test-g")"
if [[ "$CTX_G" == "$REPO_G" ]]; then
  echo "FAIL: G: ephemeral build context must not be the same path as the approved worktree"
  FAIL_COUNT=$((FAIL_COUNT + 1))
else
  echo "PASS: G: ephemeral build context is a distinct path from the approved worktree"
  PASS_COUNT=$((PASS_COUNT + 1))
fi
expect_eq "G: ephemeral copy starts out identical to the committed baseline manifest" \
  "$(python3 -c "import json; print(json.load(open('$CTX_G/frontend/src/prerender-routes.json'))['blog'])")" \
  "['existing-post-a', 'existing-post-b']"

echo ""
echo "Results: $PASS_COUNT passed, $FAIL_COUNT failed"
[[ "$FAIL_COUNT" -eq 0 ]]
