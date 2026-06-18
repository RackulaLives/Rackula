# Milestone Cadence Reframe

**Date:** 2026-06-01 **Status:** Approved **Context:** The monthly cadence was designed for human-paced development. With LLM codegen, a 12-issue sprint ships in days, not weeks. The calendar-month mapping creates false expectations and doesn't reflect actual velocity.

## Decision

Milestones are **thematic groups with sequential ordering**, not time-boxed sprints. Calendar months are removed from the roadmap. CalVer is decoupled from milestones: the version number reflects when you shipped, not when you planned.

## What Changes

### 1. Strip calendar months from roadmap

Milestones no longer carry "~June", "~July", "~September" or version-range suffixes (`v26.6.x`). Status markers replace dates:

| Marker | Meaning                                   |
| ------ | ----------------------------------------- |
| ✅     | Complete (all issues closed)              |
| 🟡     | In progress (actively worked)             |
| 🔵     | Next (will start after current milestone) |
| 🔴     | Planned (in the plan, not yet next)       |

### 2. Decouple CalVer from milestones

CalVer `YY.M.MICRO` stays as the versioning scheme. The month in the version reflects the ship date, not the milestone plan. Multiple milestones can ship in the same month (producing v26.8.0 and v26.8.1). A milestone that slips to the next month gets that month's version.

The /release skill already computes version from the current date and latest tag. No code changes needed.

### 3. Remove version suffixes from milestone titles

Milestone titles become `M{N} -- {Theme}` with no version suffix. Version is determined at release time.

### 4. Reframe roadmap section title

"Current Plan -- Next N Sprints" becomes "Active Plan". No implication of monthly sprints.

## What Stays

- M-numbering for sequence (M01, M02, M03, M04)
- CalVer for releases (v26.6.0, v26.8.1, etc.)
- Thematic naming (descriptive part of milestone titles)
- Milestone scope (~10-15 issues per milestone)
- Backlog milestone for unscheduled work
- /release skill for computing next version at ship time

## Milestone Title Migration

| Current | Proposed |
| --- | --- |
| M01 -- LXC Build & Hardening, v26.5.x | M01 -- LXC Build & Hardening |
| M02 -- LXC Release & Stability, v26.6.x | M02 -- LXC Release & Stability |
| M03 -- Data Format & Interop, v26.7.x | M03 -- Data Format & Interop |
| M04 -- Type Safety, Decomposition & Stability | M04 -- Type Safety, Decomposition & Stability |

## Roadmap Diff (Conceptual)

**Before:**

```markdown
## Current Plan -- Next 4 Sprints

### 🟢 M01 -- LXC Build & Hardening · ~June (`v26.6.x`)

### 🟡 M02 -- LXC Release & Stability · ~July (`v26.7.x`)

### 🔵 M03 -- Data Format & Interop · ~Aug (`v26.8.x`)

### 🔴 M04 -- Type Safety, Decomposition & Stability · ~September (`v26.9.x`)
```

**After:**

```markdown
## Active Plan

### ✅ M01 -- LXC Build & Hardening (complete)

### 🟡 M02 -- LXC Release & Stability (in progress)

### 🔵 M03 -- Data Format & Interop (next)

### 🔴 M04 -- Type Safety, Decomposition & Stability (planned)
```

## CLAUDE.md Impact

The Version Philosophy section and Milestones section need updates:

1. Remove the claim that milestones map to calendar months
2. Clarify that CalVer reflects ship date, not plan date
3. Update the Current Milestones table to drop version suffixes
4. Add a note that multiple milestones may ship in one month

## CalVer Workflow (No Code Changes)

The existing /release skill and `scripts/next-version.sh` already compute version from the current date and latest tag. The key mental shift is documented: **the version number tells you when it shipped, not when it was planned.**
