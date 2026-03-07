#!/usr/bin/env bash
# PreToolUse hook: Block Edit/Write on main branch.
# Forces all work onto feature branches.
set -euo pipefail

# Drain stdin to satisfy the hook contract (JSON with tool_input, session_id, cwd).
# The payload is not needed — we only check the current branch name.
cat > /dev/null

# Get current branch
BRANCH=$(git -C "${CLAUDE_PROJECT_DIR:-.}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")

if [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ]; then
  cat <<BLOCK
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "block",
    "permissionDecisionReason": "You are on the '${BRANCH}' branch. Create a feature branch or worktree before editing files. Use: git checkout -b <branch-name>"
  }
}
BLOCK
fi
