#!/usr/bin/env bash
# Tests for ops/lib/source-revision-guard.sh.
#
# Plain-bash assertions against a set of throwaway git repos created under
# a temp directory — no external test framework required. Run directly:
#   bash ops/tests/test-source-revision-guard.sh
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/source-revision-guard.sh"

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

PASS_COUNT=0
FAIL_COUNT=0

expect_success() {
  local name="$1" worktree="$2" revision="$3"
  if assert_source_revision_guard "$worktree" "$revision" >/tmp/guard-out.$$ 2>/tmp/guard-err.$$; then
    echo "PASS: $name"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "FAIL: $name (expected guard to succeed, it rejected)"
    cat /tmp/guard-err.$$
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
  rm -f /tmp/guard-out.$$ /tmp/guard-err.$$
}

expect_failure() {
  local name="$1" worktree="$2" revision="$3"
  if assert_source_revision_guard "$worktree" "$revision" >/tmp/guard-out.$$ 2>/tmp/guard-err.$$; then
    echo "FAIL: $name (expected guard to reject, it succeeded)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  else
    echo "PASS: $name"
    PASS_COUNT=$((PASS_COUNT + 1))
  fi
  rm -f /tmp/guard-out.$$ /tmp/guard-err.$$
}

make_repo() {
  local dir="$1"
  mkdir -p "$dir"
  git -C "$dir" init -q
  git -C "$dir" config user.email "test@example.com"
  git -C "$dir" config user.name "Test"
  echo "hello" > "$dir/file.txt"
  git -C "$dir" add file.txt
  git -C "$dir" commit -q -m "initial"
}

# --- A. matching approved revision -> publisher may proceed ----------------
REPO_A="$TMP_ROOT/repo-a"
make_repo "$REPO_A"
SHA_A="$(git -C "$REPO_A" rev-parse HEAD)"
expect_success "A: matching revision on clean worktree" "$REPO_A" "$SHA_A"

# --- B. mismatched revision -> publisher stops ------------------------------
REPO_B="$TMP_ROOT/repo-b"
make_repo "$REPO_B"
FAKE_SHA="0000000000000000000000000000000000dead"
expect_failure "B: mismatched revision" "$REPO_B" "$FAKE_SHA"

# --- C. missing approved revision -> fail closed ----------------------------
REPO_C="$TMP_ROOT/repo-c"
make_repo "$REPO_C"
expect_failure "C: approved revision unset" "$REPO_C" ""

# --- D. invalid/unresolvable worktree or revision -> fail closed -----------
expect_failure "D1: worktree path does not exist" "$TMP_ROOT/does-not-exist" "$SHA_A"

NOT_A_REPO="$TMP_ROOT/not-a-repo"
mkdir -p "$NOT_A_REPO"
expect_failure "D2: path exists but is not a git worktree" "$NOT_A_REPO" "$SHA_A"

# --- E. dirty tracked source -> fail closed ---------------------------------
REPO_E="$TMP_ROOT/repo-e"
make_repo "$REPO_E"
SHA_E="$(git -C "$REPO_E" rev-parse HEAD)"
echo "modified" >> "$REPO_E/file.txt"
expect_failure "E1: modified tracked file (unstaged)" "$REPO_E" "$SHA_E"

REPO_E2="$TMP_ROOT/repo-e2"
make_repo "$REPO_E2"
SHA_E2="$(git -C "$REPO_E2" rev-parse HEAD)"
echo "staged change" >> "$REPO_E2/file.txt"
git -C "$REPO_E2" add file.txt
expect_failure "E2: staged tracked change" "$REPO_E2" "$SHA_E2"

# --- Bonus: untracked files must NOT be rejected ----------------------------
REPO_F="$TMP_ROOT/repo-f"
make_repo "$REPO_F"
SHA_F="$(git -C "$REPO_F" rev-parse HEAD)"
echo "scratch" > "$REPO_F/untracked.txt"
expect_success "F: untracked file does not block a clean worktree" "$REPO_F" "$SHA_F"

echo ""
echo "Results: $PASS_COUNT passed, $FAIL_COUNT failed"
[[ "$FAIL_COUNT" -eq 0 ]]
