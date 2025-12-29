# Issue Creation Workflow v1

Create well-formed GitHub Issues or triage existing ones for the ready queue.
Designed for quick capture during development and structured issue planning.

**Arguments:** `$ARGUMENTS` (optional)
- No args: Interactive mode (guided prompts)
- Number only (e.g., `42`): Triage existing issue
- Quoted string (e.g., `"Fix toast bug"`): Quick capture

---

## Permissions

| Action | Scope |
|--------|-------|
| GitHub Issues | Read, create, edit (labels, body, milestone) |
| GitHub API | Read milestones |

**Commands allowed:** `gh issue list`, `gh issue view`, `gh issue create`, `gh issue edit`, `gh api`

---

## Decision Flow

```
START
  │
  ├─ $ARGUMENTS empty? ──yes──▶ INTERACTIVE MODE
  │                              (guided prompts)
  │
  ├─ $ARGUMENTS is number? ──yes──▶ TRIAGE MODE
  │   (e.g., "42")                   (prepare issue for ready queue)
  │
  └─ $ARGUMENTS is text? ──yes──▶ QUICK CAPTURE MODE
      (e.g., "Fix bug")              (minimal friction)
```

---

## Mode 1: Interactive

Full guided workflow for creating well-formed issues.

### Step 1: Type Selection

Ask the user:
```
What type of issue are you creating?

1. bug      - Something is broken
2. feature  - New capability
3. chore    - Refactoring, docs, tooling
4. spike    - Research before implementation
```

### Step 2: Summary

Ask for a one-line summary:
```
Enter a one-line summary:
> _____
```

### Step 3: Duplicate Check

Search for similar issues:
```bash
gh issue list --search "<summary keywords>" --limit 5 --json number,title,state
```

If matches found, display them and ask:
```
Possible duplicates:
1. #42: Toast z-index issue (open)
2. #38: Modal layering bug (closed)

Are any of these duplicates? (enter number to link, 'n' to continue):
```

If user selects a duplicate, comment on existing issue and stop.

### Step 4: Type-Specific Details

**For bug:**
- What is the expected behavior?
- What is the actual behavior?
- Steps to reproduce (optional)

**For feature:**
- What problem does this solve?
- Proposed solution (optional)

**For chore:**
- What needs to be done?
- Why is this needed?

**For spike:**
- Research question
- Expected deliverables
- Time box (default: "2-4 hours")

### Step 5: Acceptance Criteria

Prompt for testable criteria:
```
Enter acceptance criteria (one per line, empty line to finish):
> Toast z-index exceeds modal z-index
> Toast remains visible when modal is open
>
```

Format as `- [ ] <criterion>` in issue body.

### Step 6: Test Requirements

For bug/feature/chore (skip for spike):
```
Enter test requirements (one per line, empty line to finish):
> Unit test: toast z-index is higher than modal
>
```

### Step 7: Label Suggestions

Use keyword inference (see Label Inference section) and present:
```
Suggested labels based on content:
- area:ui (detected: "toast", "modal")
- size:small (default for bugs)

Confirm labels? [y/n/edit]:
```

If 'edit', allow adding/removing labels.

### Step 8: Priority

```
Priority? (u=urgent, h=high, m=medium, l=low, enter=skip):
> _
```

### Step 9: Milestone

Fetch available milestones:
```bash
gh api repos/:owner/:repo/milestones --jq '.[] | "\(.number). \(.title)"'
```

Present:
```
Assign to milestone?
1. v0.7.0
2. v0.8.0
3. Skip
> _
```

### Step 10: Preview & Confirm

Show complete issue preview:
```
=== PREVIEW ===
Title: bug: Toast appears behind modal
Labels: bug, area:ui, size:small
Milestone: v0.7.0

## Summary
Toast notifications appear behind modal dialogs when both are visible.

## Expected Behavior
Toast should appear above all other UI elements.

## Actual Behavior
Toast renders behind modal overlay.

## Acceptance Criteria
- [ ] Toast z-index exceeds modal z-index
- [ ] Toast remains visible when modal is open

## Test Requirements
- [ ] Unit test: toast z-index is higher than modal

---

Create this issue? [y/n]:
```

### Step 11: Create Issue

```bash
gh issue create \
  --title "<type>: <summary>" \
  --body "<generated body>" \
  --label "<labels>" \
  --milestone "<milestone>"
```

### Step 12: Handoff Offer

```
Issue #194 created: https://github.com/RackulaLives/Rackula/issues/194

Start implementation now? [y/n]:
```

If yes, output: `Invoking /dev-issue 194`

---

## Mode 2: Triage

Prepare community-submitted issues for the ready queue.

### Step 1: Fetch Issue

```bash
gh issue view $ARGUMENTS --json number,title,body,labels,comments,milestone
```

Display issue summary.

### Step 2: Completeness Check

Parse issue body and check for required sections:

| Section | Check For |
|---------|-----------|
| Acceptance Criteria | `## Acceptance Criteria` or `- [ ]` items |
| Test Requirements | `## Test Requirements` or `## Tests` |
| Size label | `size:small`, `size:medium`, `size:large` |
| Area label | Any `area:*` label |
| Type label | `bug`, `feature`, `chore`, `spike` |

Display status:
```
Issue #42: Toast appears behind modal

PRESENT:
- [x] Description
- [x] bug label

MISSING:
- [ ] Acceptance Criteria
- [ ] Test Requirements
- [ ] Size estimate
- [ ] Area label

Fill in missing sections? [y/n]:
```

### Step 3: Fill Missing Sections

For each missing element, prompt user with same flow as Interactive mode steps 5-8.

### Step 4: Update Issue

Append new sections to issue body:
```bash
gh issue edit $ARGUMENTS --body "<original + new sections>"
```

### Step 5: Update Labels

```bash
gh issue edit $ARGUMENTS \
  --remove-label triage \
  --add-label ready,<area>,<size>
```

### Step 6: Handoff Offer

```
Issue #42 triaged and moved to ready queue.
Start implementation now? [y/n]:
```

---

## Mode 3: Quick Capture

Minimal friction for logging during development.

### Step 1: Parse Input

Extract text from `$ARGUMENTS` (the quoted string).

### Step 2: Infer Type and Labels

Use keyword inference tables (see Label Inference section).

Example: `"Fix toast z-index bug"` → type: `bug`, area: `area:ui`

### Step 3: Duplicate Check

```bash
gh issue list --search "<keywords>" --limit 3 --json number,title,state
```

If matches found:
```
Possible duplicates:
1. #42: Toast z-index issue (open)

Continue creating? [y/n]:
```

### Step 4: Brief Confirmation

```
Title: bug: Fix toast z-index bug
Labels: bug, triage, area:ui

Create? [y/n]:
```

### Step 5: Create Minimal Issue

```bash
gh issue create \
  --title "<type>: <captured text>" \
  --body "Quick capture during development. Needs triage for full details.

## Captured Note
<user's input>

---
*Logged via /create-issue quick capture*" \
  --label "<type>,triage,<area if detected>"
```

### Step 6: Output

```
Created #195: bug: Fix toast z-index bug
https://github.com/RackulaLives/Rackula/issues/195

Labels: bug, triage, area:ui (inferred)
[Note: Issue needs triage before implementation]
```

---

## Label Inference

### Type Labels (from keywords)

| Keywords | Label |
|----------|-------|
| fix, bug, broken, error, crash, fails, wrong, issue | `bug` |
| add, implement, new, support, enable, allow, feature | `feature` |
| refactor, clean, update, docs, rename, move, remove | `chore` |
| research, investigate, explore, spike, POC, prototype | `spike` |

**Default:** If no keywords match, ask user in interactive/triage, use `chore` in quick capture.

### Area Labels (from keywords)

| Keywords | Label |
|----------|-------|
| rack, canvas, SVG, render, zoom, pan, placement | `area:canvas` |
| toolbar, button, modal, toast, menu, panel, dialog | `area:ui` |
| device, library, category, 0.5U, manufacturer | `area:devices` |
| save, load, export, import, PDF, PNG, zip, YAML | `area:export` |
| accessibility, keyboard, screen reader, focus, ARIA | `area:a11y` |
| docs, documentation, README, CLAUDE.md | `area:docs` |
| schema, validation, Zod, format, migration | `area:data-schema` |
| test, vitest, playwright, e2e, coverage | `area:testing` |

### Size Labels (defaults)

| Type | Default Size |
|------|--------------|
| bug | `size:small` |
| feature | `size:medium` |
| chore | `size:small` |
| spike | `size:medium` |

**Override:** User can change in interactive/triage modes.

### Priority Labels (only if explicit)

| Keywords | Label |
|----------|-------|
| urgent, critical, blocking, ASAP | `priority:urgent` |
| important, soon, high priority | `priority:high` |
| when possible, nice to have, low priority | `priority:low` |

**Default:** No priority label unless explicitly set.

---

## Issue Body Templates

### Bug Template

```markdown
## Summary
<one-line description>

## Expected Behavior
<what should happen>

## Actual Behavior
<what's broken>

## Steps to Reproduce
<if provided>

## Acceptance Criteria
- [ ] <criterion 1>
- [ ] <criterion 2>

## Test Requirements
- [ ] <test 1>
- [ ] <test 2>

## Technical Notes
<if provided>
```

### Feature Template

```markdown
## Summary
<one-line description>

## Problem
<what problem this solves>

## Proposed Solution
<if provided>

## Acceptance Criteria
- [ ] <criterion 1>
- [ ] <criterion 2>

## Test Requirements
- [ ] <test 1>
- [ ] <test 2>

## Technical Notes
<if provided>
```

### Chore Template

```markdown
## Summary
<one-line description>

## Motivation
<why this is needed>

## Acceptance Criteria
- [ ] <criterion 1>
- [ ] <criterion 2>

## Test Requirements
- [ ] <test 1>

## Technical Notes
<if provided>
```

### Spike Template

```markdown
## Research Question
<the question to answer>

## Context
<why this research is needed>

## Expected Deliverables
- [ ] <deliverable 1>
- [ ] <deliverable 2>

## Time Box
<estimate, default "2-4 hours">
```

### Quick Capture Template

```markdown
Quick capture during development. Needs triage for full details.

## Captured Note
<user's input>

---
*Logged via /create-issue quick capture*
```

---

## Error Handling

| Scenario | Response |
|----------|----------|
| `gh` not authenticated | "Error: GitHub CLI not authenticated. Run `gh auth login`." |
| Issue not found (triage) | "Error: Issue #N not found." |
| Network error | "Error: Could not reach GitHub. Check connection." |
| User cancels | "Issue creation cancelled." |
| Duplicate confirmed | "Linked to existing issue #X. No new issue created." |

---

## Output Format

### After Issue Creation

```
Issue #<N> created: <url>
Type: <type>
Labels: <labels>
Milestone: <milestone or "none">
```

### After Triage

```
Issue #<N> triaged and moved to ready queue.
Labels added: <new labels>
Labels removed: triage
```

### Handoff Prompt

```
Start implementation now? [y/n]:
```

If yes: `Invoking /dev-issue <N>`
