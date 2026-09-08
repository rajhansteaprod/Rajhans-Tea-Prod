#!/usr/bin/env bash
# Regression test for the SEO_CONTENT_BUILD_REVISION cache-busting mechanism
# in frontend/Dockerfile: a publication that changes only DB content (no
# frontend source file) must still force the Angular build + prerender
# layers to rerun, while the dependency-install layer stays cached.
#
# Builds a tiny synthetic image that mirrors the real Dockerfile's structure
# (dependency-install RUN, then ARG/ENV, then a content-sensitive RUN) using
# real `docker build` — the same mechanism the real Dockerfile relies on —
# rather than asserting anything about Dockerfile text. Run directly:
#   bash ops/tests/test-prerender-cache-busting.sh
set -Eeuo pipefail

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"; docker image rm -f cache-bust-test:img >/dev/null 2>&1 || true' EXIT

PASS_COUNT=0
FAIL_COUNT=0

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

expect_ne() {
  local name="$1" actual="$2" not_expected="$3"
  if [[ "$actual" != "$not_expected" ]]; then
    echo "PASS: $name"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "FAIL: $name (expected a value different from \"$not_expected\", got the same)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

cat > "$TMP_ROOT/Dockerfile" <<'EOF'
FROM alpine:3.20
WORKDIR /app
RUN date +%s%N > /dep-marker.txt
ARG SEO_CONTENT_BUILD_REVISION=""
ENV SEO_CONTENT_BUILD_REVISION=${SEO_CONTENT_BUILD_REVISION}
RUN date +%s%N > /build-marker.txt
EOF

build_and_read() {
  local revision="$1"
  docker build --quiet \
    --build-arg "SEO_CONTENT_BUILD_REVISION=$revision" \
    -t cache-bust-test:img \
    "$TMP_ROOT" >/dev/null
  docker run --rm cache-bust-test:img sh -c 'cat /dep-marker.txt /build-marker.txt'
}

# --- Different revisions must invalidate the content-sensitive layer -------
OUT_REV1="$(build_and_read "publication-rev-1")"
DEP_MARKER_1="$(echo "$OUT_REV1" | sed -n 1p)"
BUILD_MARKER_1="$(echo "$OUT_REV1" | sed -n 2p)"

OUT_REV2="$(build_and_read "publication-rev-2")"
DEP_MARKER_2="$(echo "$OUT_REV2" | sed -n 1p)"
BUILD_MARKER_2="$(echo "$OUT_REV2" | sed -n 2p)"

expect_ne "different SEO_CONTENT_BUILD_REVISION reruns the content-sensitive layer" "$BUILD_MARKER_2" "$BUILD_MARKER_1"
expect_eq "dependency-install layer stays cached across different revisions" "$DEP_MARKER_2" "$DEP_MARKER_1"

# --- Same revision + unchanged context must reuse cache (no needless rebuild) ---
OUT_REV1_AGAIN="$(build_and_read "publication-rev-1")"
BUILD_MARKER_1_AGAIN="$(echo "$OUT_REV1_AGAIN" | sed -n 2p)"

expect_eq "same SEO_CONTENT_BUILD_REVISION reuses the cached content-sensitive layer" "$BUILD_MARKER_1_AGAIN" "$BUILD_MARKER_1"

echo ""
echo "Results: $PASS_COUNT passed, $FAIL_COUNT failed"
[[ "$FAIL_COUNT" -eq 0 ]]
