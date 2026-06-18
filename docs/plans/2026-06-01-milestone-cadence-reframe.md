# Milestone Cadence Reframe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reframe milestones from time-boxed monthly sprints to thematic groups with sequential ordering, decoupling CalVer from milestone planning.

**Architecture:** Documentation-only change. Rename 3 GitHub milestones to remove version suffixes, update ROADMAP.md to replace calendar months with status markers, update CLAUDE.md to remove milestone-to-month mapping, commit the design spec.

**Tech Stack:** GitHub API (`gh`), markdown editing

---

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `docs/planning/ROADMAP.md` | Modify | Replace sprint cadence with thematic plan, strip months/version ranges, add status markers |
| `CLAUDE.md` | Modify | Update versioning policy section and current milestones list |
| `docs/superpowers/specs/2026-06-01-milestone-cadence-reframe-design.md` | Already created | Design spec (commit in this plan) |
| GitHub milestones M01, M02, M03 | Rename | Remove version suffixes from titles |

---

### Task 1: Rename GitHub milestones to remove version suffixes

**Files:**

- Modify: GitHub milestone M01 (current: "M01 -- LXC Build & Hardening, v26.5.x")
- Modify: GitHub milestone M02 (current: "M02 -- LXC Release & Stability, v26.6.x")
- Modify: GitHub milestone M03 (current: "M03 -- Data Format & Interop, v26.7.x")

- [ ] **Step 1: Get milestone numbers**

Run: `gh api "repos/RackulaLives/Rackula/milestones?state=all&per_page=30" --jq '.[] | select(.title | test("M0[1-3]")) | "\(.number) \(.title)"'`

Expected: Three lines with milestone numbers and current titles

- [ ] **Step 2: Rename M01**

Run: `gh api repos/RackulaLives/Rackula/milestones/{M01_NUMBER} -X PATCH -f title="M01 -- LXC Build & Hardening" --jq '.title'`

Expected: `M01 -- LXC Build & Hardening`

- [ ] **Step 3: Rename M02**

Run: `gh api repos/RackulaLives/Rackula/milestones/{M02_NUMBER} -X PATCH -f title="M02 -- LXC Release & Stability" --jq '.title'`

Expected: `M02 -- LXC Release & Stability`

- [ ] **Step 4: Rename M03**

Run: `gh api repos/RackulaLives/Rackula/milestones/{M03_NUMBER} -X PATCH -f title="M03 -- Data Format & Interop" --jq '.title'`

Expected: `M03 -- Data Format & Interop`

- [ ] **Step 5: Verify all milestone titles**

Run: `gh api "repos/RackulaLives/Rackula/milestones?state=all&per_page=30" --jq '.[] | select(.title | test("M0[1-4]|Backlog")) | "\(.number) \(.title)"'`

Expected: Four milestone titles with no version suffixes, plus Backlog

---

### Task 2: Update ROADMAP.md

**Files:**

- Modify: `docs/planning/ROADMAP.md`

- [ ] **Step 1: Update Version Philosophy section**

Replace the bullet point about milestones with the decoupled version:

Old (line 40-41):

```text
- Milestones are **theme-led with a target month**, not semver-named. The CalVer migration
  lands at the **LXC release** boundary (the first CalVer release).
```

New:

```text
- Milestones are **theme-led and sequentially ordered**, not time-boxed. CalVer reflects
  the ship date, not the plan date. Multiple milestones may ship in one month.
```

- [ ] **Step 2: Replace section heading and intro**

Old (lines 45-48):

```text
## Current Plan -- Next 4 Sprints

Consistent, small (~10–15 issue) sprints. Each maps to a GitHub milestone.
```

New:

```text
## Active Plan

Milestones are thematic groups with sequential ordering. Each maps to a GitHub milestone.
Status markers show current state: complete, in progress, next, planned.
```

- [ ] **Step 3: Replace M01 heading and content**

Old (line 49):

```text
### M01 -- LXC Build & Hardening · ~June (`v26.6.x`)
```

New:

```text
### M01 -- LXC Build & Hardening (complete)
```

- [ ] **Step 4: Replace M02 heading**

Old (line 60):

```text
### M02 -- LXC Release & Stability · ~July (`v26.7.x`)
```

New:

```text
### M02 -- LXC Release & Stability (in progress)
```

- [ ] **Step 5: Replace M03 heading**

Old (line 70):

```text
### M03 -- Data Format & Interop · ~Aug (`v26.8.x`)
```

New:

```text
### M03 -- Data Format & Interop (next)
```

- [ ] **Step 6: Replace M04 heading**

Old (line 79):

```text
### M04 -- Type Safety, Decomposition & Stability · ~September (`v26.9.x`)
```

New:

```text
### M04 -- Type Safety, Decomposition & Stability (planned)
```

- [ ] **Step 7: Update Backlog intro**

Old (line 98):

```text
Everything not in the next 3 sprints lives in the **Backlog** milestone (replaces the
retired semver milestone buckets). Notable clusters parked there:
```

New:

```text
Everything not in the active plan lives in the **Backlog** milestone. Notable clusters:
```

- [ ] **Step 8: Update footer**

Old (lines 132-133):

```text
_This document defines product vision and the active sprint plan. For live work items, see
[GitHub Milestones](https://github.com/RackulaLives/Rackula/milestones)._
```

New:

```text
_This document defines product vision and the active plan. For live work items, see
[GitHub Milestones](https://github.com/RackulaLives/Rackula/milestones)._
```

- [ ] **Step 9: Verify ROADMAP.md renders correctly**

Run: `cat docs/planning/ROADMAP.md`

Expected: No calendar months, no version ranges in milestone headings. Status markers present.

---

### Task 3: Update CLAUDE.md

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Replace current milestones list**

Old (lines 51-55):

```text
**Current milestones:**

- `M01 -- LXC Build & Hardening` -- Sprint 1 (~June 2026, v26.6.x)
- `M02 -- LXC Release & Stability` -- Sprint 2 (~July 2026, v26.7.x)
- `M03 -- Data Format & Interop` -- Sprint 3 (~Aug 2026, v26.8.x)
```

New:

```text
**Current milestones:**

- `M01 -- LXC Build & Hardening` -- complete
- `M02 -- LXC Release & Stability` -- in progress
- `M03 -- Data Format & Interop` -- next
- `M04 -- Type Safety, Decomposition & Stability` -- planned
```

- [ ] **Step 2: Add CalVer decoupling note after MICRO rule**

After the MICRO rule block (line 23), add:

```text
**CalVer and milestones are decoupled:** the version reflects the ship date, not the plan
date. Multiple milestones may ship in the same month. See the milestone cadence design:
[`docs/superpowers/specs/2026-06-01-milestone-cadence-reframe-design.md`](docs/superpowers/specs/2026-06-01-milestone-cadence-reframe-design.md).
```

- [ ] **Step 3: Verify CLAUDE.md**

Run: `head -60 CLAUDE.md`

Expected: No calendar months in milestones list, CalVer decoupling note present

---

### Task 4: Commit design spec and all changes

**Files:**

- Already created: `docs/superpowers/specs/2026-06-01-milestone-cadence-reframe-design.md`
- Modified: `docs/planning/ROADMAP.md`
- Modified: `CLAUDE.md`

- [ ] **Step 1: Stage and commit all changes**

```bash
git add docs/superpowers/specs/2026-06-01-milestone-cadence-reframe-design.md
git add docs/planning/ROADMAP.md
git add CLAUDE.md
git commit -m "docs: reframe milestone cadence from monthly sprints to thematic groups

Decouple CalVer from milestones: version reflects ship date, not plan date.
Strip calendar months and version ranges from roadmap milestone headings.
Add status markers (complete/in progress/next/planned) to communicate real state.

Design spec: docs/superpowers/specs/2026-06-01-milestone-cadence-reframe-design.md"
```

- [ ] **Step 2: Verify clean working tree**

Run: `git status`

Expected: clean working tree

---

## Self-Review

**Spec coverage:**

- Strip calendar months -> Task 2 (ROADMAP.md) and Task 3 (CLAUDE.md)
- Decouple CalVer from milestones -> Task 2 (Version Philosophy bullet) and Task 3 (CalVer note)
- Remove version suffixes from milestone titles -> Task 1 (GitHub API renames)
- Status markers -> Task 2 (ROADMAP.md headings) and Task 3 (CLAUDE.md list)
- Reframe section title -> Task 2 ("Active Plan" replaces "Next 4 Sprints")

**Placeholder scan:** No TBDs, TODOs, or placeholders. All steps contain exact content.

**Type consistency:** Milestone titles are consistent across GitHub API, ROADMAP.md, and CLAUDE.md.
