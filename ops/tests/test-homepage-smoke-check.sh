#!/usr/bin/env bash
# Tests for ops/lib/homepage-smoke-check.sh's bounded nginx-recovery retry.
#
# Fakes `curl` and `docker` as small scripts on PATH so no real network or
# containers are touched. A counter file drives curl's sequential behaviour
# (1st call, 2nd call, ...); a marker file records how many times "docker
# restart" was invoked, to prove the recovery is bounded to exactly one
# extra attempt. Run directly:
#   bash ops/tests/test-homepage-smoke-check.sh
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/homepage-smoke-check.sh"

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

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

# Sets up fake `curl` and `docker` on PATH for one scenario.
#   $1: comma-separated list of http codes curl returns on successive calls
#       ("000" simulates a connection failure, matching the real helper's
#       own fallback).
setup_fakes() {
  local codes="$1"
  local bindir="$TMP_ROOT/bin"
  rm -rf "$bindir"
  mkdir -p "$bindir"

  echo "$codes" > "$TMP_ROOT/codes.txt"
  echo "0" > "$TMP_ROOT/call_index.txt"
  : > "$TMP_ROOT/docker_restart_calls.log"

  cat > "$bindir/curl" <<'EOF'
#!/usr/bin/env bash
idx=$(cat "$TMP_ROOT/call_index.txt")
IFS=',' read -ra CODES <<< "$(cat "$TMP_ROOT/codes.txt")"
code="${CODES[$idx]:-200}"
echo $((idx + 1)) > "$TMP_ROOT/call_index.txt"
if [[ "$code" == "000" ]]; then
  exit 7
fi
printf '%s' "$code"
exit 0
EOF
  chmod +x "$bindir/curl"

  cat > "$bindir/docker" <<'EOF'
#!/usr/bin/env bash
if [[ "$1" == "restart" ]]; then
  echo "$2" >> "$TMP_ROOT/docker_restart_calls.log"
fi
exit 0
EOF
  chmod +x "$bindir/docker"

  export TMP_ROOT
  export PATH="$bindir:$PATH"
}

restart_call_count() {
  wc -l < "$TMP_ROOT/docker_restart_calls.log" | tr -d ' '
}

# --- I: first check succeeds -> no second nginx recovery -------------------
setup_fakes "200"
HTTP_CODE="$(check_homepage_with_nginx_recovery 'https://example.test/' fake-nginx 0)" && RC=0 || RC=$?
expect_eq "I: returns 200 on first success" "$HTTP_CODE" "200"
expect_eq "I: function reports success (exit 0)" "$RC" "0"
expect_eq "I: no nginx restart when first check already succeeds" "$(restart_call_count)" "0"

# --- J: first fails, second (after nginx restart) succeeds -----------------
setup_fakes "000,200"
HTTP_CODE="$(check_homepage_with_nginx_recovery 'https://example.test/' fake-nginx 0)" && RC=0 || RC=$?
expect_eq "J: returns 200 after the bounded recovery attempt" "$HTTP_CODE" "200"
expect_eq "J: function reports success (exit 0)" "$RC" "0"
expect_eq "J: nginx restarted exactly once" "$(restart_call_count)" "1"

# --- K: both attempts fail -> still fails, still bounded to one restart ----
setup_fakes "000,503"
HTTP_CODE="$(check_homepage_with_nginx_recovery 'https://example.test/' fake-nginx 0)" && RC=0 || RC=$?
expect_eq "K: returns the final (non-200) code, not the first one" "$HTTP_CODE" "503"
expect_eq "K: function reports failure (non-zero exit)" "$RC" "1"
expect_eq "K: nginx restart is still bounded to exactly one attempt" "$(restart_call_count)" "1"

echo ""
echo "Results: $PASS_COUNT passed, $FAIL_COUNT failed"
[[ "$FAIL_COUNT" -eq 0 ]]
