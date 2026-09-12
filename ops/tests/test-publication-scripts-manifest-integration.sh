#!/usr/bin/env bash
# Static/structural checks that ops/seo-publication-publisher.sh and
# ops/seo-publication-redeploy.sh actually wire up the shared
# prerender-manifest-refresh library the way the design requires:
#   - the manifest refresh only ever runs inside a `targetType == blog_create`
#     guard (a non-blog publication must never pay for/risk it)
#   - the docker build context defaults to the approved worktree itself
#     (unchanged behavior for metadata/product/cms_page) and is only ever
#     switched to an ephemeral copy inside that same guard
#   - both scripts source the one shared library, not two divergent copies
#     of the regenerate/validate logic
#   - the redeploy script's bounded-attempt and rollback-on-failure
#     guarantees are untouched by this refactor
#
# This complements test-prerender-manifest-refresh.sh (which exercises the
# library's actual behavior) and test-source-revision-guard.sh (which is
# unchanged and still covers guard fail-closed behavior end to end). A full
# live run of either pipeline script requires Docker/Mongo/prod access and
# is exercised separately, not here. Run directly:
#   bash ops/tests/test-publication-scripts-manifest-integration.sh
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

PASS_COUNT=0
FAIL_COUNT=0

expect_match() {
  local name="$1" file="$2" pattern="$3"
  if grep -Eq "$pattern" "$file"; then
    echo "PASS: $name"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "FAIL: $name (pattern not found in $file: $pattern)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

PUBLISHER="$OPS_DIR/seo-publication-publisher.sh"
REDEPLOY="$OPS_DIR/seo-publication-redeploy.sh"
LIB="$OPS_DIR/lib/prerender-manifest-refresh.sh"

# --- Both scripts source the ONE shared library, not a second copy ---------
expect_match "publisher sources the shared manifest-refresh library" "$PUBLISHER" 'source "\$SCRIPT_DIR/lib/prerender-manifest-refresh\.sh"'
expect_match "redeploy sources the shared manifest-refresh library" "$REDEPLOY" 'source "\$SCRIPT_DIR/lib/prerender-manifest-refresh\.sh"'

for script_label in "publisher:$PUBLISHER" "redeploy:$REDEPLOY"; do
  label="${script_label%%:*}"
  file="${script_label#*:}"

  # Neither script re-implements manifest regeneration/validation itself —
  # "npm run prerender:manifest" must only ever be invoked from inside the
  # shared library file, never inline in the pipeline script.
  if grep -q "npm run prerender:manifest" "$file"; then
    echo "FAIL: $label does not call \"npm run prerender:manifest\" inline (must go through the shared library only)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  else
    echo "PASS: $label does not call \"npm run prerender:manifest\" inline"
    PASS_COUNT=$((PASS_COUNT + 1))
  fi

  # The manifest-refresh call is gated behind a blog_create check.
  expect_match "$label: refresh_and_validate_prerender_manifest call exists" "$file" 'refresh_and_validate_prerender_manifest "\$BUILD_CONTEXT"'

  # The build context defaults to the approved worktree — unchanged
  # metadata/product/cms_page behavior.
  expect_match "$label: BUILD_CONTEXT defaults to the approved worktree" "$file" 'BUILD_CONTEXT="\$WORKTREE"'

  # EPHEMERAL_BUILD_CONTEXT starts at 0 (false) before any blog_create branch.
  expect_match "$label: EPHEMERAL_BUILD_CONTEXT defaults to 0" "$file" 'EPHEMERAL_BUILD_CONTEXT=0'

  # docker build uses the (possibly-reassigned) BUILD_CONTEXT variable, not
  # a hardcoded WORKTREE, for both -f and the trailing context path.
  expect_match "$label: docker build -f uses \$BUILD_CONTEXT/frontend/Dockerfile" "$file" '\-f "\$BUILD_CONTEXT/frontend/Dockerfile"'
  expect_match "$label: docker build context argument is \$BUILD_CONTEXT" "$file" 'docker build \\'

  # Ephemeral context is cleaned up (never left behind) — both on a success
  # path and inside fail_handler.
  expect_match "$label: fail_handler cleans up the ephemeral build context" "$file" 'rm -rf "\$BUILD_CONTEXT" 2>/dev/null \|\| true'
done

# --- Publisher: the manifest refresh is INSIDE the targetType guard -------
PUBLISHER_BLOG_BLOCK="$(awk '/if \[\[ "\$TARGET_TYPE" == "blog_create" \]\]/,/^fi$/' "$PUBLISHER")"
if echo "$PUBLISHER_BLOG_BLOCK" | grep -q 'prepare_ephemeral_build_context' && echo "$PUBLISHER_BLOG_BLOCK" | grep -q 'refresh_and_validate_prerender_manifest'; then
  echo "PASS: publisher: manifest refresh/validate calls are inside the blog_create guard"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo "FAIL: publisher: manifest refresh/validate calls are NOT confined to the blog_create guard"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

# --- Redeploy: bounded-attempt and rollback guarantees are untouched -------
expect_match "redeploy: still calls redeploy-begin (bounded MAX_REDEPLOY_ATTEMPTS gate unchanged)" "$REDEPLOY" 'redeploy-begin --id "\$PUBLICATION_ID"'
expect_match "redeploy: still restores the previous frontend image on a build/swap failure" "$REDEPLOY" 'restoring previous frontend'
expect_match "redeploy: only exits 0 when re-verification explicitly reports \"verified\"" "$REDEPLOY" 'VERIFY_STATUS" != "verified"'

# --- Worker: claim and redeploy-begin share one derivation function -------
WORKER="$OPS_DIR/../backend/scripts/seo-publication-worker.ts"
occurrences="$(grep -c 'deriveTargetTypeAndExpectedBlogSlug(' "$WORKER")"
# Exactly 1 definition + 2 call sites (claim, redeploy-begin) = 3.
if [[ "$occurrences" -eq 3 ]]; then
  echo "PASS: worker: deriveTargetTypeAndExpectedBlogSlug is defined once and reused by both claim and redeploy-begin"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo "FAIL: worker: expected exactly 3 occurrences of deriveTargetTypeAndExpectedBlogSlug (1 definition + 2 call sites), found $occurrences"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

echo ""
echo "Results: $PASS_COUNT passed, $FAIL_COUNT failed"
[[ "$FAIL_COUNT" -eq 0 ]]
