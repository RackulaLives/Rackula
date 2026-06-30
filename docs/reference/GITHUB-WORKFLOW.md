---
created: 2025-12-16
---

# GitHub Issues Workflow

How we use GitHub Issues for Rackula development.

---

## Issue Lifecycle

```
EXTERNAL INPUT:
  Community files issue
    → Lands with `triage` label
    → Maintainer reviews
    → Accept: Add details, change to `ready`
    → Reject: Close with explanation
    → Clarify: Request more information

INTERNAL INPUT:
  Maintainer creates issue
    → Full structure from start
    → `ready` label immediately

EXECUTION:
  Claude Code queries: label:ready milestone:"M002 -- LXC Release & Stability"
    → Picks next issue
    → Implements with TDD
    → Closes issue on completion
```

---

## Label Reference

### State (Workflow Position)

- `triage` — Needs review (external issues start here)
- `ready` — Implementation-ready (work queue)
- `in-progress` — Actively being worked
- `blocked` — Waiting on dependency

### Type

- `bug` — Something broken
- `feature` — New capability
- `chore` — Refactoring, docs, tooling
- `epic` — Multi-issue parent

### Size

- `size:small` — <1 hour, single commit
- `size:medium` — 1-4 hours
- `size:large` — Needs breakdown

### Priority

- `priority:urgent` — Fix immediately
- `priority:high` — Do soon
- `priority:low` — When time permits

### Area

- `area:canvas` — Rack rendering, interactions
- `area:devices` — Device library
- `area:export` — Save/load/export
- `area:ui` — Interface components
- `area:a11y` — Accessibility
- `area:docs` — Documentation

---

## Querying Issues

### For Claude Code

Find next work item:

```
label:ready milestone:"M002 -- LXC Release & Stability" sort:created-asc
```

Find blocked items:

```
label:blocked
```

### For Maintainers

Triage queue:

```
label:triage
```

Current milestone:

```
milestone:"M002 -- LXC Release & Stability" is:open
```

All bugs:

```
label:bug is:open
```

---

## Triage Process

When a community member files an issue:

1. **Read the issue** — Understand the request
2. **Decide disposition:**
   - **Accept:** Remove `triage`, add `ready`, add implementation details
   - **Reject:** Close with clear, kind explanation
   - **Duplicate:** Link to existing issue, close
   - **Needs info:** Ask clarifying questions, keep `triage`
3. **If accepting:**
   - Add Acceptance Criteria (checkboxes)
   - Add Technical Notes (if non-obvious)
   - Add Test Requirements
   - Add Size estimate label
   - Add Area label
   - Assign to Milestone (if known)

---

## Creating Implementation-Ready Issues

Use the "Implementation Task" template. Ensure:

- [ ] Summary is one clear sentence
- [ ] Acceptance Criteria are specific and testable
- [ ] Test Requirements list specific test cases
- [ ] Size label is accurate
- [ ] Area label is set
- [ ] Milestone is assigned

### Good Acceptance Criteria

```markdown
- [ ] Pressing `L` key toggles device label visibility
- [ ] Toggle state saves to .Rackula.zip file
- [ ] Keyboard shortcut appears in help modal (? key)
- [ ] Works when canvas is focused
```

### Bad Acceptance Criteria

```markdown
- [ ] Add keyboard shortcut
- [ ] Make it work
- [ ] Test it
```

---

## Claude Code Integration

Claude Code has GitHub MCP access. It can:

- Query open issues
- Read issue details
- Close issues when complete
- Add comments

### Handoff Protocol

1. Query `label:ready` issues for current milestone
2. Select appropriate issue based on size/priority
3. Read full issue details
4. Implement following TDD protocol
5. Close issue with commit reference
6. Move to next issue

### Issue Body as Spec

The issue body IS the prompt. Claude Code should:

- Treat Acceptance Criteria as requirements
- Treat Test Requirements as mandatory test cases
- Reference Technical Notes for implementation guidance

---

## Milestones

Milestones are thematic, named work tracks of the form `Mxxx -- Name`, tracked on the [project board](https://github.com/orgs/RackulaLives/projects/2). They group related issues by theme, not by release. Examples:

- `M002 -- LXC Release & Stability`
- `M003 -- Data Format & Interop`

Milestones are decoupled from version numbers. A milestone does not map to a single release, and multiple milestones may ship in the same release window. Releases use CalVer (`YY.M.MICRO`, for example `v26.6.0`) per the versioning policy in CLAUDE.md, not semver.

Every implementation-ready issue should have a milestone assigned.

---

_This document governs the GitHub Issues workflow for Rackula._
