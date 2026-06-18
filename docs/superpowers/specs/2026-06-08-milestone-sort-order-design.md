# Milestone Sort Order Fix: Zero-Pad Numbers

**Date:** 2026-06-08 **Status:** Approved

## Problem

GitHub Projects sorts milestones by title lexicographically. With unpadded numbers (M1, M2, ... M10), double-digit milestones sort before single-digit ones:

```
M1, M10, M11, M12, M13, M2, M3, M4, M5, M6, M7, M8, M9
```

This will worsen as more milestones are added. GitHub Projects v2 supports sorting items by milestone, but the sort is lexicographic on title and there is no way to control milestone column/group order independently when milestones are used for slicing or grouping.

## Decision

Zero-pad all milestone numbers to 2 digits: `M01`, `M02`, ... `M99`.

This is the only approach that fixes lexicographic sort. Alternatives evaluated:

- **Custom sort by field**: Only sorts items within the board, not milestone column/group order. Does not solve the problem.
- **Different prefix** (`[01]`, `Phase 01`): Breaks established `M` convention for no functional gain over zero-padding.
- **Sort hack characters** (`M_10`): Lexicographically impossible. Any character between `M` and the digit either sorts incorrectly or creates worse inconsistency.

## Naming Convention

All milestone titles use 2-digit zero-padded numbers:

```
M01 -- LXC Build & Hardening
M02 -- LXC Release & Stability
M03 -- Data Format & Interop
M04 -- Type Safety, Decomposition & Stability
M05 -- Connectivity Core
M06 -- Connectivity Advanced
M07 -- Device Library & Image System
M08 -- Export & Share Architecture
M09 -- Connectivity & Power Extensions
M10 -- Isometric, Advanced Export & GIS
M11 -- Internationalization
M12 -- Mobile & Touch UX
M13 -- UX Polish & Accessibility
```

Width: 2 digits (M01-M99). Project will not reach 100 milestones.

## Migration

### Step 1: Rename GitHub milestones

Use the GitHub API to rename all 14 milestones. Order: M01 (closed, number 20) first, then M02-M13 (open, numbers 21-35).

```bash
gh api repos/RackulaLives/Rackula/milestones/{NUMBER} -X PATCH -f title="M{NN} -- {TITLE}"
```

GitHub milestone renames do NOT create redirects. Any saved filters or bookmarks referencing old titles will break silently.

### Step 2: Find-and-replace across repo

Target patterns: `M1 --`, `M2 --`, `M3 --`, `M4 --`, `M5 --`, `M6 --`, `M7 --`, `M8 --`, `M9 --` in `.md`, `.ts`, `.svelte` files (excluding `node_modules`, `dist`, `.git`).

Replace: `M{n} --` with `M0{n} --` for n in 1-9.

Estimated references: ~714 across docs, CLAUDE.md, CHANGELOG.md, plans, memory files.

### Step 3: Update Claude memory files

Manual audit and update of all memory entries in `~/.claude/projects/-Users-gvns-code-projects-Rackula-Rackula/memory/` that reference milestone numbers.

### Step 4: Update CLAUDE.md

CLAUDE.md references M01-M04 in the Versioning Policy section. Update to M01-M04.

### Step 5: Verify

Grep for remaining unpadded `M[1-9] --` references in all project files (excluding `node_modules`, `dist`, `.git`). Zero results expected.

## Guard Rails

- **CI grep guard**: Add a lint rule that rejects `M[1-9] --` (unpadded milestone number) in tracked files. Prevents regression.
- **Memory file audit**: Explicitly verify all memory entries updated before closing this issue.
- **Git history note**: Commit messages and PR titles in git history will permanently reference old names. This is acceptable; git history is immutable and context is preserved.

## Out of Scope

- No prefix change (staying with `M`)
- No 3-digit padding (project will not reach 100 milestones)
- No custom GitHub Project fields as workaround
- No external reference audit (ProxmoxVED/community-scripts do not reference our internal milestone numbers)
