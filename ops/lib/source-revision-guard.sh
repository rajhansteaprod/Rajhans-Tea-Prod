#!/usr/bin/env bash
# Source-revision safety guard for the SEO publication publisher.
#
# Validates that a worktree's tracked source exactly matches an
# operator-approved commit SHA before the publisher is allowed to build,
# deploy, or mark a publication as published. This prevents a stale or
# unapproved worktree (e.g. one that predates newer production app code)
# from silently overwriting production with an older frontend.
#
# Usage:
#   source "$(dirname "${BASH_SOURCE[0]}")/lib/source-revision-guard.sh"
#   assert_source_revision_guard "$WORKTREE" "$APPROVED_REVISION"
#
# On success: prints a single confirmation line to stdout and returns 0.
# On failure: prints a non-secret diagnostic to stderr and returns 1.
# Never prints or reads anything from the environment beyond the two
# arguments, so it cannot leak secrets.

assert_source_revision_guard() {
  local worktree="$1"
  local approved_sha="${2:-}"

  # 1. An approved revision must be configured. There is no default: a
  #    missing value must fail closed, never silently trust HEAD.
  if [[ -z "$approved_sha" ]]; then
    echo "[source-revision-guard] REJECTED: SEO_PUBLICATION_SOURCE_REVISION is not set" >&2
    echo "[source-revision-guard]   worktree: ${worktree:-<unset>}" >&2
    echo "[source-revision-guard]   expected: <unset>" >&2
    echo "[source-revision-guard]   actual:   <not checked>" >&2
    echo "[source-revision-guard]   reason:   no approved revision configured" >&2
    return 1
  fi

  # 2. The worktree must exist and be a valid git worktree.
  if [[ -z "$worktree" || ! -d "$worktree" ]]; then
    echo "[source-revision-guard] REJECTED: worktree path does not exist" >&2
    echo "[source-revision-guard]   worktree: ${worktree:-<unset>}" >&2
    echo "[source-revision-guard]   expected: $approved_sha" >&2
    echo "[source-revision-guard]   actual:   <not checked>" >&2
    echo "[source-revision-guard]   reason:   worktree path missing" >&2
    return 1
  fi

  if ! git -C "$worktree" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "[source-revision-guard] REJECTED: path is not a git worktree" >&2
    echo "[source-revision-guard]   worktree: $worktree" >&2
    echo "[source-revision-guard]   expected: $approved_sha" >&2
    echo "[source-revision-guard]   actual:   <not checked>" >&2
    echo "[source-revision-guard]   reason:   not a valid git worktree" >&2
    return 1
  fi

  # 3. Resolve actual HEAD.
  local actual_sha
  if ! actual_sha="$(git -C "$worktree" rev-parse HEAD 2>/dev/null)"; then
    echo "[source-revision-guard] REJECTED: could not resolve worktree HEAD" >&2
    echo "[source-revision-guard]   worktree: $worktree" >&2
    echo "[source-revision-guard]   expected: $approved_sha" >&2
    echo "[source-revision-guard]   actual:   <unresolvable>" >&2
    echo "[source-revision-guard]   reason:   git rev-parse HEAD failed" >&2
    return 1
  fi

  # 4. Full-SHA comparison only (never branch names / short refs).
  if [[ "$actual_sha" != "$approved_sha" ]]; then
    echo "[source-revision-guard] REJECTED: worktree HEAD does not match approved revision" >&2
    echo "[source-revision-guard]   worktree: $worktree" >&2
    echo "[source-revision-guard]   expected: $approved_sha" >&2
    echo "[source-revision-guard]   actual:   $actual_sha" >&2
    echo "[source-revision-guard]   reason:   SHA mismatch" >&2
    return 1
  fi

  # 5a. Tracked source must be clean: no staged/unstaged tracked changes.
  #     Untracked files are explicitly allowed (--untracked-files=no).
  if [[ -n "$(git -C "$worktree" status --porcelain --untracked-files=no 2>/dev/null)" ]]; then
    echo "[source-revision-guard] REJECTED: tracked source is not clean" >&2
    echo "[source-revision-guard]   worktree: $worktree" >&2
    echo "[source-revision-guard]   expected: $approved_sha" >&2
    echo "[source-revision-guard]   actual:   $actual_sha" >&2
    echo "[source-revision-guard]   reason:   tracked modifications or staged changes present" >&2
    return 1
  fi

  # 5b. No unresolved merge/rebase/cherry-pick state, even if it happens to
  #     leave the index clean.
  local git_dir
  git_dir="$(git -C "$worktree" rev-parse --git-dir 2>/dev/null)" || git_dir=""
  if [[ -n "$git_dir" ]]; then
    if [[ "$git_dir" != /* ]]; then
      git_dir="$worktree/$git_dir"
    fi
    if [[ -e "$git_dir/MERGE_HEAD" || -e "$git_dir/rebase-merge" || -e "$git_dir/rebase-apply" || -e "$git_dir/CHERRY_PICK_HEAD" ]]; then
      echo "[source-revision-guard] REJECTED: worktree has in-progress merge/rebase/cherry-pick state" >&2
      echo "[source-revision-guard]   worktree: $worktree" >&2
      echo "[source-revision-guard]   expected: $approved_sha" >&2
      echo "[source-revision-guard]   actual:   $actual_sha" >&2
      echo "[source-revision-guard]   reason:   unresolved merge/rebase/cherry-pick state" >&2
      return 1
    fi
  fi

  echo "[source-revision-guard] OK: worktree HEAD matches approved revision ($actual_sha)"
  return 0
}
