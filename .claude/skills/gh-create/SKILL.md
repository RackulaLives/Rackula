---
name: gh-create
description: Create GitHub issues or triage existing ones. Works with any repo - auto-detects from current directory.
---

# GitHub Issue Creation

Create well-formed GitHub Issues or triage existing ones for the ready queue. Works with any GitHub repository.

**Arguments:** `$ARGUMENTS` (optional)

- No args: Interactive mode (guided prompts)
- Number only (e.g., `42`): Triage existing issue
- Quoted string (e.g., `"Fix toast bug"`): Quick capture

---

## Repository Detection

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null)
if [ -z "$REPO" ]; then
  echo "Not in a GitHub repository. Please specify repo or navigate to one."
  exit 1
fi
```

---

## Decision Flow

```
START
  │
  ├─ $ARGUMENTS empty? ──yes──▶ INTERACTIVE MODE
  │
  ├─ $ARGUMENTS is number? ──yes──▶ TRIAGE MODE
  │
  └─ $ARGUMENTS is text? ──yes──▶ QUICK CAPTURE MODE
```

---

## Mode 1: Interactive

### Step 1: Type Selection

Use AskUserQuestion:

```json
{
  "questions": [
    {
      "header": "Issue type",
      "question": "What type of issue are you creating?",
      "multiSelect": false,
      "options": [
        { "label": "Bug", "description": "Something is broken" },
        { "label": "Feature", "description": "New capability" },
        { "label": "Chore", "description": "Refactoring, docs, maintenance" },
        { "label": "Spike", "description": "Research or investigation" }
      ]
    }
  ]
}
```

### Step 2: Summary

Ask for one-line summary.

### Step 3: Duplicate Check

```bash
gh issue list --search "<summary keywords>" --limit 5 --json number,title,state
```

If matches, use AskUserQuestion with dynamic options from results + "None of these".

### Step 4: Type-Specific Details

**Bug:** Expected behavior, actual behavior, steps to reproduce (optional) **Feature:** Problem it solves, proposed solution (optional) **Chore:** What needs doing, why **Spike:** Research question, deliverables, time box

### Step 5: Acceptance Criteria

Prompt for testable criteria, format as `- [ ] <criterion>`.

### Step 6: Test Requirements

For bug/feature/chore (skip for spike).

### Step 7: Label Selection

Fetch repo labels dynamically:

```bash
gh label list --json name,description
```

Filter to `area:*`, `size:*`, `priority:*` patterns. Use keyword inference to suggest, present via AskUserQuestion with multi-select.

**If repo has no matching labels:** Skip label selection, create issue without labels.

### Step 8: Priority

Use AskUserQuestion: Normal (default), Urgent, High, Low.

### Step 9: Milestone

```bash
gh api repos/:owner/:repo/milestones --jq '[.[] | select(.state=="open")] | sort_by(.title)'
```

Present available milestones via AskUserQuestion, or "None" if no milestones exist.

### Step 10: Preview & Confirm

Show complete preview, then AskUserQuestion: Create / Edit / Cancel.

### Step 11: Create Issue

```bash
gh issue create \
  --title "<type>: <summary>" \
  --body "<generated body>" \
  --label "<labels>" \
  --milestone "<milestone>"
```

### Step 12: Handoff

AskUserQuestion: "Start implementation?" → invoke `/gh-dev <number>` or end.

---

## Mode 2: Triage

### Step 1: Fetch Issue

```bash
gh issue view $ARGUMENTS --json number,title,body,labels,comments,milestone
```

### Step 2: Completeness Check

Check for: Acceptance Criteria, Test Requirements, size label, area label, type label.

Display status, then AskUserQuestion: Fill missing / Skip to labels / Cancel.

### Step 3-5: Fill Missing, Update Issue, Update Labels

Same flow as Interactive mode for missing sections.

### Step 6: Handoff

Same as Interactive Step 12.

---

## Mode 3: Quick Capture

### Step 1: Parse Input

Extract text from `$ARGUMENTS`.

### Step 2: Infer Type and Labels

Use keyword inference (see tables below).

### Step 3: Duplicate Check

Same as Interactive, but only 3 results.

### Step 4: Confirm

Brief preview, AskUserQuestion: Create / Cancel.

### Step 5: Create Minimal Issue

```bash
gh issue create \
  --title "<type>: <captured text>" \
  --body "Quick capture. Needs triage.

## Captured Note
<user's input>

---
*Logged via /gh-create quick capture*" \
  --label "<type>,triage,<area if detected>"
```

---

## Label Inference

### Type Keywords

| Keywords                                      | Label     |
| --------------------------------------------- | --------- |
| fix, bug, broken, error, crash, fails, wrong  | `bug`     |
| add, implement, new, support, enable, feature | `feature` |
| refactor, clean, update, docs, rename, move   | `chore`   |
| research, investigate, explore, spike, POC    | `spike`   |

### Area Keywords (common patterns)

| Keywords                               | Label          |
| -------------------------------------- | -------------- |
| ui, button, modal, toast, menu, dialog | `area:ui`      |
| api, endpoint, request, response       | `area:api`     |
| db, database, query, migration         | `area:db`      |
| test, spec, coverage                   | `area:testing` |
| docs, readme, documentation            | `area:docs`    |

**Note:** Only suggest area labels that actually exist in the repo.

### Size Defaults

| Type    | Default       |
| ------- | ------------- |
| bug     | `size:small`  |
| feature | `size:medium` |
| chore   | `size:small`  |
| spike   | `size:medium` |

---

## Issue Templates

### Bug

```markdown
## Summary

<description>

## Expected Behavior

<what should happen>

## Actual Behavior

<what's broken>

## Steps to Reproduce

<if provided>

## Acceptance Criteria

- [ ] <criterion>

## Test Requirements

- [ ] <test>
```

### Feature

```markdown
## Summary

<description>

## Problem

<what problem this solves>

## Proposed Solution

<if provided>

## Acceptance Criteria

- [ ] <criterion>

## Test Requirements

- [ ] <test>
```

### Chore

```markdown
## Summary

<description>

## Motivation

<why needed>

## Acceptance Criteria

- [ ] <criterion>
```

### Spike

```markdown
## Research Question

<question>

## Context

<why needed>

## Expected Deliverables

- [ ] <deliverable>

## Time Box

<estimate>
```

---

## CLAUDE.md Overrides

If the project has a `## GitHub Workflow` section in CLAUDE.md, read it for:

- Custom label patterns
- Issue template additions
- Milestone naming conventions

---

## Error Handling

| Scenario | Response |
| --- | --- |
| Not in git repo | "Not in a GitHub repository." |
| `gh` not authenticated | "GitHub CLI not authenticated. Run `gh auth login`." |
| Issue not found | "Issue #N not found." |
| User cancels | "Issue creation cancelled." |
