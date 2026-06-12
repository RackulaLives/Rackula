#!/usr/bin/env bash
# Cloud setup script for Rackula on claude.ai/code.
#
# This is NOT a Claude Code hook. Paste its contents into the environment's
# "Setup script" field in the claude.ai/code web UI (Environment settings).
# It runs as root BEFORE Claude Code launches, which is the only point at which
# plugins can be installed so their SessionStart hooks fire on the first session.
#
# Why this exists: in cloud sessions, plugins declared in committed
# .claude/settings.json are silently ignored (no interactive trust dialog, and
# the marketplace clone races session start). See anthropics/claude-code#63028.
# Installing here, before launch, is the validated workaround.
#
# After the first session in an environment the filesystem is cached, so this
# runs once and persists to later sessions.
#
# Assumes `claude` is on PATH and authenticated in the environment.

set -u

# Add a marketplace only if not already known.
add_marketplace() {
  claude plugin marketplace list 2>/dev/null | grep -qF "$1" ||
    claude plugin marketplace add "$2"
}

# Install a plugin only if it is not already installed.
install_plugin() {
  claude plugin list --installed 2>/dev/null | grep -qF "${1%@*}" ||
    claude plugin install "$1"
}

# Superpowers: skills library plus the using-superpowers SessionStart bootstrap.
add_marketplace "superpowers-marketplace" "obra/superpowers-marketplace"
install_plugin "superpowers@superpowers-marketplace"

# code-review: Anthropic's official plugin marketplace. Stateless, useful in cloud.
add_marketplace "claude-code-plugins" "https://github.com/anthropics/claude-code.git"
install_plugin "code-review@claude-code-plugins"

# Note: claude-mem is deliberately NOT installed here. Its memory store is local
# (~/.claude-mem, a localhost worker + SQLite/vector DB) with no sync, so a cloud
# session would start with an empty database and any new observations would be
# lost when the ephemeral container is torn down. Run it locally only.

echo "Rackula cloud plugins ready."
