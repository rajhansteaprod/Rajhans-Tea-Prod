#!/usr/bin/env bash
# Bounded homepage smoke-check with a single nginx recovery attempt.
#
# This VPS has a known pattern: nginx can briefly keep pointing at the
# previous frontend container's now-dead IP right after
# `docker compose ... --force-recreate`, even though nginx was just
# restarted. This performs ONE bounded recovery attempt — restart nginx
# once more, wait briefly, recheck — before giving up. It never loops
# unboundedly, and a genuine non-200 (application/4xx/5xx failure, not a
# connection race) still fails after exactly that one extra attempt.
#
# Usage:
#   source "$(dirname "${BASH_SOURCE[0]}")/lib/homepage-smoke-check.sh"
#   HTTP_CODE="$(check_homepage_with_nginx_recovery "$URL" "$NGINX_CONTAINER" [wait_seconds])" || true
#   if [[ "$HTTP_CODE" != "200" ]]; then ...fail/rollback... ; fi
#
# Prints the FINAL http code to stdout (e.g. "200", "503", or "000" for a
# connection failure — never empty, so callers can always compare it).
# Returns 0 if that final code is 200, 1 otherwise. Callers should append
# `|| true` when capturing via command substitution under `set -e`, then
# branch on the printed code explicitly — matching how curl failures are
# already handled elsewhere in this script.

check_homepage_with_nginx_recovery() {
  local url="$1"
  local nginx_container="$2"
  local wait_seconds="${3:-3}"

  local http_code
  http_code="$(curl -sSIL -o /dev/null -w '%{http_code}' --max-time 10 "$url" 2>/dev/null || echo "000")"

  if [[ "$http_code" != "200" ]]; then
    echo "[homepage-smoke-check] got HTTP $http_code — restarting $nginx_container once more and retrying (bounded: exactly one extra attempt)" >&2
    docker restart "$nginx_container" >/dev/null
    sleep "$wait_seconds"
    http_code="$(curl -sSIL -o /dev/null -w '%{http_code}' --max-time 10 "$url" 2>/dev/null || echo "000")"
  fi

  echo "$http_code"
  [[ "$http_code" == "200" ]]
}
