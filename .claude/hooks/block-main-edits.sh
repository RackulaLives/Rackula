#!/usr/bin/env bash
# PreToolUse hook: Block Edit/Write on the main/master branch, but ONLY for files
# inside this project. Edits to files outside CLAUDE_PROJECT_DIR (e.g. global
# ~/.claude config or other repos) are always allowed - the branch of this
# project says nothing about them.
set -euo pipefail

# Capture the hook payload (JSON with tool_input.file_path, session_id, cwd).
INPUT=$(cat)

# Only the project's main/master branch is guarded.
BRANCH=$(git -C "${CLAUDE_PROJECT_DIR:-.}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
if [ "$BRANCH" != "main" ] && [ "$BRANCH" != "master" ]; then
  exit 0
fi

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

# Block only when the edit targets a file inside the project.
case "$FILE_PATH" in
  "$PROJECT_DIR"/*)
    cat <<BLOCK
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "You are on the '${BRANCH}' branch. Create a feature branch or worktree before editing project files. Use: git checkout -b <branch-name>"
  }
}
BLOCK
    ;;
  *)
    exit 0
    ;;
esac
