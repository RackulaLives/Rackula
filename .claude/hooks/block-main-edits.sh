#!/usr/bin/env bash
# PreToolUse hook: Block Edit/Write on the main/master branch, but ONLY for files
# inside this project. Edits to files outside CLAUDE_PROJECT_DIR (e.g. global
# ~/.claude config or other repos) are always allowed - the branch of this
# project says nothing about them.
#
# Worktree-aware: the branch that matters is the one checked out in the worktree
# that actually CONTAINS the target file, not the main checkout. A linked
# worktree (e.g. under .worktree/) sits on a feature branch even while the
# primary checkout is on main, so edits there must be allowed.
set -euo pipefail

# Capture the hook payload (JSON with tool_input.file_path, session_id, cwd).
INPUT=$(cat)

# Project root as provided by the harness (same path namespace as file_path).
# Do NOT resolve symlinks here: file_path and CLAUDE_PROJECT_DIR share the
# harness namespace, so /var vs /private/var style resolution would break the
# prefix match. Just strip any trailing slash.
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
PROJECT_DIR="${PROJECT_DIR%/}"
FILE_PATH=$(printf '%s' "$INPUT" \
  | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' \
  | head -1 \
  | sed 's/.*"file_path"[[:space:]]*:[[:space:]]*"//; s/"$//' \
  || true)

# If we can't determine the target or the project root, do not block.
if [ -z "$FILE_PATH" ] || [ -z "$PROJECT_DIR" ]; then
  exit 0
fi

# Only files inside the project are guarded. Anything outside (global config,
# other repos) is always allowed.
case "$FILE_PATH" in
  "$PROJECT_DIR"/*) ;;
  *) exit 0 ;;
esac

# Resolve the branch of the worktree that OWNS the target file. Walk up to the
# nearest existing ancestor directory first, because the file (or its parent
# dir) may not exist yet on a new Write. A linked worktree reports its own
# feature branch here, which is the whole point of this check.
DIR=$(dirname "$FILE_PATH")
while [ "$DIR" != "/" ] && [ ! -d "$DIR" ]; do
  DIR=$(dirname "$DIR")
done
BRANCH=$(git -C "$DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")

# Only the project's main/master branch is guarded.
if [ "$BRANCH" != "main" ] && [ "$BRANCH" != "master" ]; then
  exit 0
fi

cat <<BLOCK
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "You are on the '${BRANCH}' branch. Create a feature branch or worktree before editing project files. Use: git checkout -b <branch-name>"
  }
}
BLOCK
