# Custom Claude Code Statusline

**Date:** 2026-06-05
**Status:** Approved

## Problem

The existing statusline (`~/.claude/statusline-command.sh`) is a 440-line monolithic bash script that:

- Parses JSON with grep/sed chains (brittle, error-prone)
- Lacks worktree awareness (user frequently loses track of worktree context)
- Missing useful API fields (session name, agent name, thinking mode, PR state)
- Hard to modify or add new segments

## Architecture

### Modular Directory Structure

```
~/.claude/statusline/
├── statusline.sh          # Entry point: reads stdin, pre-processes, calls segments, assembles output
├── segments/              # One function per segment
│   ├── directory.sh
│   ├── branch.sh
│   ├── worktree.sh        # Worktree name, original branch (merged into directory+branch display)
│   ├── model.sh
│   ├── context.sh
│   ├── usage.sh
│   ├── session.sh         # Session name, agent name, thinking mode
│   └── pr.sh              # PR number + review state
└── lib/
    ├── colors.sh          # Colour definitions + 10-step gradient + 6-tier pace colours
    └── swift-cache.sh     # Rate-limit cache reader (reads Swift helper output)
```

### Pre-Processing Pattern

One `jq` invocation extracts all fields into shell variables. Segments are pure string formatting with zero subprocess calls.

```bash
eval "$(echo "$INPUT" | jq -r '
  @sh "CWD=\(.cwd//\".\") ",
  @sh "MODEL=\(.model.display_name//\"\") ",
  @sh "WORKTREE_NAME=\(.worktree.name//\"\") ",
  @sh "WORKTREE_BRANCH=\(.worktree.branch//\"\") ",
  @sh "WORKTREE_ORIGINAL=\(.worktree.original_branch//\"\") ",
  @sh "CONTEXT_PCT=\(.context_window.used_percentage//0) ",
  @sh "CONTEXT_SIZE=\(.context_window.context_window_size//0) ",
  @sh "SESSION_NAME=\(.session_name//\"\") ",
  @sh "AGENT_NAME=\(.agent.name//\"\") ",
  @sh "THINKING=\(.thinking.enabled//false) ",
  @sh "PR_NUMBER=\(.pr.number//\"\") ",
  @sh "PR_STATE=\(.pr.review_state//\"\") ",
  @sh "BRANCH=\(.workspace.git_worktree//\"\") ",
  @sh "REPO_NAME=\(.workspace.repo.name//\"\") "
')"
```

### Segment Contract

Each segment function:

- Reads pre-set shell variables (no arguments)
- Sets a `segment_<name>` variable
- Sets empty string if data is unavailable (segment is skipped in assembly)

## Segments

| Segment   | Data Source                              | Display                                 | Colour Rules                                                                                |
| --------- | ---------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------- |
| directory | `CWD`                                    | `basename` of current dir               | Blue. In worktree mode: `⑂ worktree-name (original-dir)` dimmed                             |
| branch    | `BRANCH` or git CLI fallback             | `⎇ main`                                | Green for main/default, yellow for feature, red for detached. Worktree: `⎇ fix-1332 ← main` |
| model     | `MODEL`                                  | Display name (e.g. `Opus`)              | Yellow                                                                                      |
| context   | `CONTEXT_PCT`, `CONTEXT_SIZE`            | `Ctx: 34%` or `Ctx: 68K`                | Cyan under 50%, yellow 50-75%, red above 75%                                                |
| usage     | Swift cache                              | `42% ▓▓▓▓░░░░░░ → 7:00 PM`              | 10-step green-to-red gradient. Pace marker `┃` with 6-tier colour                           |
| session   | `SESSION_NAME`, `AGENT_NAME`, `THINKING` | `my-session` or `🤖 agent-name` or `🧠` | Magenta for session/agent, cyan for thinking                                                |
| pr        | `PR_NUMBER`, `PR_STATE`                  | `PR #1234 ✓` or `PR #1234 ⏳`           | Green for approved/merged, yellow for pending, red for changes_requested                    |

### Segment Skip Rules

- **directory**: always shown
- **branch**: skip if not in a git repo
- **model**: skip if no model data
- **context**: skip if `used_percentage` is null
- **usage**: show `~` fallback if cache stale or Swift fails
- **session**: skip if no session name, no agent, no thinking mode
- **pr**: skip if no open PR for branch

### Default Display Order

```
directory │ branch │ model │ session │ pr │ context │ usage
```

## Config

File: `~/.claude/statusline-config.txt`

```bash
# Segment visibility (1=show, 0=hide)
SHOW_DIRECTORY=1
SHOW_BRANCH=1
SHOW_MODEL=1
SHOW_CONTEXT=1
SHOW_USAGE=1
SHOW_SESSION=1
SHOW_PR=1

# Context display
CONTEXT_AS_TOKENS=0        # 1=show "68K", 0=show "34%"
SHOW_CONTEXT_LABEL=1      # 1="Ctx: 34%", 0="34%"

# Usage bar
SHOW_PROGRESS_BAR=1        # 1=show ▓▓▓▓░░░░░░, 0=just percentage
SHOW_PACE_MARKER=1         # 1=show ┃ in bar, 0=hide
PACE_MARKER_STEP_COLORS=1  # 1=6-tier pace colours, 0=match bar colour
SHOW_RESET_TIME=1          # 1="→ 7:00 PM", 0=hide
SHOW_USAGE_LABEL=1         # 1="Usage: 42%", 0="42%"

# Time format
USE_24_HOUR_TIME=0         # 1=14:30, 0=2:30 PM

# Colour mode: colored | monochrome | singleColor
COLOR_MODE=colored
SINGLE_COLOR=#00BFFF       # Only used when COLOR_MODE=singleColor

# Profile (optional, shown if set)
SHOW_PROFILE=0
PROFILE_NAME=
```

If config file missing, defaults to everything enabled with coloured mode.

### settings.json Entry

```json
{
  "statusLine": {
    "type": "command",
    "command": "bash ~/.claude/statusline/statusline.sh",
    "refreshInterval": 30
  }
}
```

## Assembly & Layout

**Separator:** `│` (gray pipe) between segments on a single line.

**Normal session:**

```
Rackula │ ⎇ main │ Opus │ Ctx: 34% │ 42% ▓▓▓▓░░░░░░ → 7:00 PM
```

**Worktree active:**

```
⑂ fix-1332 (Rackula) │ ⎇ fix-1332 ← main │ Opus │ Ctx: 34% │ 42% ▓▓▓▓░░░░░░ → 7:00 PM
```

**With session name:**

```
Rackula │ ⎇ main │ Opus │ my-session │ Ctx: 34% │ 42% ▓▓▓▓░░░░░░ → 7:00 PM
```

**With PR:**

```
Rackula │ ⎇ fix-1332 │ Opus │ PR #1234 ⏳ │ Ctx: 34% │ 42% ▓▓▓▓░░░░░░ → 7:00 PM
```

### Narrow Terminal Handling

Script reads `$COLUMNS` (default 120 if unset). If assembled output would exceed `$COLUMNS - 20`, segments drop from right to left in this priority order: usage bar details, reset time, pr, session, model. Core trio (directory, branch, context %) always stays.

### No Multi-Line

Single row avoids fighting with system notifications.

## Error Handling

| Scenario                                             | Behaviour                                                                    |
| ---------------------------------------------------- | ---------------------------------------------------------------------------- |
| `jq` not installed                                   | Print nothing, exit 0                                                        |
| `INPUT` empty or not JSON                            | Exit 0, blank statusline                                                     |
| `context_window` fields null (before first API call) | Skip context segment                                                         |
| Swift cache stale or missing                         | Show `~` for usage                                                           |
| Worktree data absent                                 | Directory shows plain basename, branch shows `⎇ branch` without `← original` |
| PR data absent                                       | PR segment skipped                                                           |
| Session name not set                                 | Session segment only shows agent/thinking if present, or skipped             |
| `$COLUMNS` not set                                   | Default to 120                                                               |

**No tmp files, no state files, no side effects.** Only external dependency is the Swift usage cache (read-only). The script is a pure function: JSON in, ANSI string out.

## Migration

1. Create `~/.claude/statusline/` directory structure
2. Write all segment scripts and lib files
3. Update `~/.claude/statusline-config.txt` (add new keys, keep existing)
4. Update `settings.json` `statusLine` command to point to new entry point
5. Delete old `~/.claude/statusline-command.sh` after confirming new one works
