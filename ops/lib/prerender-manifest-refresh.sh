#!/usr/bin/env bash
# Shared prerender-route-manifest refresh/validation logic for the SEO
# publication pipeline.
#
# A newly created Blog document exists in Mongo immediately, but the
# frontend only statically prerenders the dynamic blog/:slug routes listed
# in the COMMITTED frontend/src/prerender-routes.json (see
# frontend/scripts/generate-route-manifest.mjs and
# frontend/src/app/app.routes.server.ts). A publication for a brand-new
# slug must regenerate that manifest from the live DB/API state and prove
# the new slug is actually in it BEFORE the frontend is built — otherwise
# the build succeeds, the swap succeeds, and the live page silently serves
# the generic homepage shell for that one route (the exact Darjeeling
# incident this library exists to prevent from recurring).
#
# Two functions, used together by both the normal first-time publication
# path (ops/seo-publication-publisher.sh) and the redeploy recovery path
# (ops/seo-publication-redeploy.sh) — one implementation, not two:
#
#   prepare_ephemeral_build_context <approved_worktree> <label>
#     Prints the path to a throwaway directory containing EXACTLY the
#     approved worktree's committed tree (via `git archive HEAD`) — no
#     untracked files leak in, and the worktree itself is never written to.
#     Caller is responsible for `rm -rf` once the build using it is done.
#
#   refresh_and_validate_prerender_manifest <build_dir> <expected_blog_slug|""> <baseline_manifest_path>
#     Regenerates build_dir/frontend/src/prerender-routes.json from the live
#     API (the existing `npm run prerender:manifest`, unmodified) and
#     validates it before returning:
#       - if expected_blog_slug is non-empty, it must appear in the "blog"
#         list EXACTLY once (catches both "missing" and "duplicated")
#       - every product/catalog/blog route present in baseline_manifest_path
#         (normally the APPROVED worktree's own committed manifest) must
#         still be present in the regenerated one — no accidental drops
#     Never touches anything outside build_dir. Non-zero return means the
#     caller must fail the publication before any frontend build/swap.
#
# Both functions are read-only with respect to the approved worktree passed
# in: prepare_ephemeral_build_context only reads it (git archive), and the
# baseline_manifest_path argument to refresh_and_validate_prerender_manifest
# is only ever read, never written. The regenerated manifest itself is
# build/publication input, never a source-code edit — it is never committed
# by this library, and the approved worktree's source-revision guard
# guarantee is therefore untouched by any of this.

prepare_ephemeral_build_context() {
  local worktree="$1" label="$2"
  local target="/tmp/seo-build-ctx-${label}"
  rm -rf "$target"
  mkdir -p "$target"
  git -C "$worktree" archive HEAD | tar -x -C "$target"
  echo "$target"
}

refresh_and_validate_prerender_manifest() {
  local build_dir="$1" expected_slug="$2" baseline_manifest="${3:-}"

  if ! ( cd "$build_dir/frontend" && npm run prerender:manifest ); then
    echo "[manifest-refresh] REJECTED: manifest regeneration failed" >&2
    return 1
  fi

  local new_manifest="$build_dir/frontend/src/prerender-routes.json"

  if [[ -n "$expected_slug" ]]; then
    local count
    count="$(
      python3 - "$new_manifest" "$expected_slug" <<'PY'
import json, sys
manifest = json.load(open(sys.argv[1]))
print(manifest.get("blog", []).count(sys.argv[2]))
PY
    )"
    if [[ "$count" != "1" ]]; then
      echo "[manifest-refresh] REJECTED: expected blog slug \"$expected_slug\" appears $count time(s) in the regenerated manifest, expected exactly 1" >&2
      return 1
    fi
  fi

  if [[ -n "$baseline_manifest" && -f "$baseline_manifest" ]]; then
    if ! python3 - "$baseline_manifest" "$new_manifest" <<'PY'
import json, sys
old = json.load(open(sys.argv[1]))
new = json.load(open(sys.argv[2]))
dropped = {}
for key in ("product", "catalog", "blog"):
    missing = sorted(set(old.get(key, [])) - set(new.get(key, [])))
    if missing:
        dropped[key] = missing
if dropped:
    print(f"[manifest-refresh] REJECTED: route(s) present in the baseline manifest are missing from the regenerated one: {dropped}", file=sys.stderr)
    sys.exit(1)
PY
    then
      return 1
    fi
  fi

  echo "[manifest-refresh] OK: regenerated manifest validated (expected_slug=\"${expected_slug:-<none>}\")"
  return 0
}
