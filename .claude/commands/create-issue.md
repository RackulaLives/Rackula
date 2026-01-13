# Issue Creation Workflow v2

Create well-formed GitHub Issues or triage existing ones for the ready queue.
Designed for quick capture during development and structured issue planning.

**Arguments:** `$ARGUMENTS` (optional)

- No args: Interactive mode (guided prompts)
- Number only (e.g., `42`): Triage existing issue
- Quoted string (e.g., `"Fix toast bug"`): Quick capture

---

## Permissions

| Action        | Scope                                        |
| ------------- | -------------------------------------------- |
| GitHub Issues | Read, create, edit (labels, body, milestone) |
| GitHub API    | Read milestones, create milestones           |

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

Use the AskUserQuestion tool:

```json
{
  "questions": [
    {
      "header": "Issue type",
      "question": "What type of issue are you creating?",
      "multiSelect": false,
      "options": [
        {
          "label": "Bug",
          "description": "Something is broken or not working as expected"
        },
        {
          "label": "Feature",
          "description": "New capability or functionality"
        },
        {
          "label": "Chore",
          "description": "Refactoring, docs, tooling, maintenance"
        },
        {
          "label": "Spike",
          "description": "Research or investigation before implementation"
        }
      ]
    }
  ]
}
```

Map response to type: Bug→`bug`, Feature→`feature`, Chore→`chore`, Spike→`spike`

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

If matches found, use AskUserQuestion tool with dynamic options:

```json
{
  "questions": [
    {
      "header": "Duplicates?",
      "question": "Are any of these existing issues duplicates?",
      "multiSelect": false,
      "options": [
        { "label": "#42: Toast z-index issue", "description": "open" },
        { "label": "#38: Modal layering bug", "description": "closed" },
        {
          "label": "None of these",
          "description": "Continue creating new issue"
        }
      ]
    }
  ]
}
```

- Build options dynamically from search results
- Always include "None of these" as final option
- If user selects an existing issue, comment on it and stop
- If "None of these" selected, continue to next step

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

### Step 7: Label Selection

Use keyword inference (see Label Inference section) to suggest labels, then use AskUserQuestion with multi-select:

```json
{
  "questions": [
    {
      "header": "Labels",
      "question": "Which labels should be applied?",
      "multiSelect": true,
      "options": [
        {
          "label": "area:ui",
          "description": "Detected from: 'toast', 'modal'"
        },
        { "label": "size:small", "description": "Default for bug type" },
        { "label": "area:canvas", "description": "Other relevant area" },
        { "label": "priority:high", "description": "Add high priority" }
      ]
    }
  ]
}
```

- Build options dynamically from keyword inference
- Include detected labels with detection reason in description
- Include default size label for the issue type
- Include other potentially relevant area labels
- Pre-select detected labels (user can deselect)

### Step 8: Priority

Use AskUserQuestion tool:

```json
{
  "questions": [
    {
      "header": "Priority",
      "question": "What priority level?",
      "multiSelect": false,
      "options": [
        { "label": "Normal", "description": "Standard priority (Recommended)" },
        {
          "label": "Urgent",
          "description": "Blocking other work, needs immediate attention"
        },
        {
          "label": "High",
          "description": "Important, should be addressed soon"
        },
        {
          "label": "Low",
          "description": "Nice to have, address when convenient"
        }
      ]
    }
  ]
}
```

Map response to label: Urgent→`priority:urgent`, High→`priority:high`, Low→`priority:low`, Normal→no priority label

### Step 9: Milestone

**Pre-fetch version info:**

```bash
# Get current version from package.json
current_version=$(node -p "require('./package.json').version")

# Get open milestones
gh api repos/:owner/:repo/milestones --jq '.[] | select(.state=="open") | .title'
```

**Calculate semantic versions** from current version (e.g., `0.6.16`):

- Next (patch): `v0.6.17`
- Next Minor: `v0.7.0`
- Next Major: `v1.0.0`

**Find matching milestones:**

- For each semantic option, check if a milestone exists
- "Next" uses the nearest open milestone if any exist, otherwise calculates patch version

Use AskUserQuestion with dynamic labels showing actual versions:

```json
{
  "questions": [
    {
      "header": "Milestone",
      "question": "Which milestone should this issue target?",
      "multiSelect": false,
      "options": [
        { "label": "Next (v0.7.0)", "description": "Nearest open milestone" },
        {
          "label": "Next Minor (v0.8.0)",
          "description": "Will create if needed"
        },
        {
          "label": "Next Major (v1.0.0)",
          "description": "Will create if needed"
        },
        { "label": "None", "description": "No milestone assignment" }
      ]
    }
  ]
}
```

**Post-selection:**

- If selected milestone doesn't exist, create it:
  ```bash
  gh api repos/:owner/:repo/milestones -f title="vX.Y.Z"
  ```
- Assign issue to the milestone (or skip if "None")

### Step 10: Preview & Confirm

Show complete issue preview (unchanged format):

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
```

Then use AskUserQuestion tool:

```json
{
  "questions": [
    {
      "header": "Create?",
      "question": "Issue preview looks good?",
      "multiSelect": false,
      "options": [
        { "label": "Create issue", "description": "Submit to GitHub now" },
        {
          "label": "Edit details",
          "description": "Go back and modify something"
        },
        { "label": "Cancel", "description": "Discard and exit" }
      ]
    }
  ]
}
```

- "Create issue": Proceed to Step 11
- "Edit details": Ask which section to edit, loop back
- "Cancel": Output "Issue creation cancelled." and stop

### Step 11: Create Issue

```bash
gh issue create \
  --title "<type>: <summary>" \
  --body "<generated body>" \
  --label "<labels>" \
  --milestone "<milestone>"
```

### Step 12: Handoff Offer

After issue creation, use AskUserQuestion tool:

```json
{
  "questions": [
    {
      "header": "Next step",
      "question": "Issue created! What now?",
      "multiSelect": false,
      "options": [
        {
          "label": "Start implementation",
          "description": "Invoke /dev-issue to begin work"
        },
        {
          "label": "Done for now",
          "description": "Return to normal conversation"
        }
      ]
    }
  ]
}
```

- "Start implementation": Output `Invoking /dev-issue <issue-number>`
- "Done for now": End skill

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

| Section             | Check For                                 |
| ------------------- | ----------------------------------------- |
| Acceptance Criteria | `## Acceptance Criteria` or `- [ ]` items |
| Test Requirements   | `## Test Requirements` or `## Tests`      |
| Size label          | `size:small`, `size:medium`, `size:large` |
| Area label          | Any `area:*` label                        |
| Type label          | `bug`, `feature`, `chore`, `spike`        |

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
```

Then use AskUserQuestion tool:

```json
{
  "questions": [
    {
      "header": "Triage",
      "question": "Fill in missing sections?",
      "multiSelect": false,
      "options": [
        {
          "label": "Yes, fill them in",
          "description": "Guide me through adding missing info"
        },
        {
          "label": "Skip to labels only",
          "description": "Just update labels and milestone"
        },
        { "label": "Cancel", "description": "Exit without changes" }
      ]
    }
  ]
}
```

- "Yes, fill them in": Proceed to Step 3
- "Skip to labels only": Skip to Step 5 (Update Labels)
- "Cancel": Output "Triage cancelled." and stop

### Step 3: Fill Missing Sections

For each missing element, prompt user with same flow as Interactive mode:

- **Acceptance Criteria**: Same as Interactive Step 5
- **Test Requirements**: Same as Interactive Step 6
- **Labels**: Use same AskUserQuestion as Interactive Step 7 (multi-select with keyword inference)
- **Priority**: Use same AskUserQuestion as Interactive Step 8
- **Milestone**: Use same AskUserQuestion as Interactive Step 9

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

Output triage summary, then use same AskUserQuestion as Interactive Step 12:

```
Issue #42 triaged and moved to ready queue.
Labels added: area:ui, size:small
Labels removed: triage
```

```json
{
  "questions": [
    {
      "header": "Next step",
      "question": "Issue triaged! What now?",
      "multiSelect": false,
      "options": [
        {
          "label": "Start implementation",
          "description": "Invoke /dev-issue to begin work"
        },
        {
          "label": "Done for now",
          "description": "Return to normal conversation"
        }
      ]
    }
  ]
}
```

- "Start implementation": Output `Invoking /dev-issue <issue-number>`
- "Done for now": End skill

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

If matches found, use AskUserQuestion tool with dynamic options:

```json
{
  "questions": [
    {
      "header": "Duplicates?",
      "question": "Possible duplicates found. Continue creating?",
      "multiSelect": false,
      "options": [
        {
          "label": "#42: Toast z-index issue",
          "description": "open - potential match"
        },
        {
          "label": "None of these, create new",
          "description": "Continue with new issue"
        }
      ]
    }
  ]
}
```

- Build options dynamically from search results + "None of these" option
- If existing issue selected, link to it and stop
- If "None of these", continue

### Step 4: Brief Confirmation

Show issue preview:

```
Title: bug: Fix toast z-index bug
Labels: bug, triage, area:ui
```

Then use AskUserQuestion tool:

```json
{
  "questions": [
    {
      "header": "Create?",
      "question": "Create this quick capture issue?",
      "multiSelect": false,
      "options": [
        {
          "label": "Create",
          "description": "Submit to GitHub with triage label"
        },
        { "label": "Cancel", "description": "Discard" }
      ]
    }
  ]
}
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

| Keywords                                              | Label     |
| ----------------------------------------------------- | --------- |
| fix, bug, broken, error, crash, fails, wrong, issue   | `bug`     |
| add, implement, new, support, enable, allow, feature  | `feature` |
| refactor, clean, update, docs, rename, move, remove   | `chore`   |
| research, investigate, explore, spike, POC, prototype | `spike`   |

**Default:** If no keywords match, ask user in interactive/triage, use `chore` in quick capture.

### Area Labels (from keywords)

| Keywords                                            | Label              |
| --------------------------------------------------- | ------------------ |
| rack, canvas, SVG, render, zoom, pan, placement     | `area:canvas`      |
| toolbar, button, modal, toast, menu, panel, dialog  | `area:ui`          |
| device, library, category, 0.5U, manufacturer       | `area:devices`     |
| save, load, export, import, PDF, PNG, zip, YAML     | `area:export`      |
| accessibility, keyboard, screen reader, focus, ARIA | `area:a11y`        |
| docs, documentation, README, CLAUDE.md              | `area:docs`        |
| schema, validation, Zod, format, migration          | `area:data-schema` |
| test, vitest, playwright, e2e, coverage             | `area:testing`     |

### Size Labels (defaults)

| Type    | Default Size  |
| ------- | ------------- |
| bug     | `size:small`  |
| feature | `size:medium` |
| chore   | `size:small`  |
| spike   | `size:medium` |

**Override:** User can change in interactive/triage modes.

### Priority Labels (only if explicit)

| Keywords                                  | Label             |
| ----------------------------------------- | ----------------- |
| urgent, critical, blocking, ASAP          | `priority:urgent` |
| important, soon, high priority            | `priority:high`   |
| when possible, nice to have, low priority | `priority:low`    |

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

_Logged via /create-issue quick capture_
```

---

## Error Handling

| Scenario                 | Response                                                    |
| ------------------------ | ----------------------------------------------------------- |
| `gh` not authenticated   | "Error: GitHub CLI not authenticated. Run `gh auth login`." |
| Issue not found (triage) | "Error: Issue #N not found."                                |
| Network error            | "Error: Could not reach GitHub. Check connection."          |
| User cancels             | "Issue creation cancelled."                                 |
| Duplicate confirmed      | "Linked to existing issue #X. No new issue created."        |

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

### Handoff

After creating or triaging an issue, offer implementation via AskUserQuestion (see Interactive Step 12 and Triage Step 6).

If user selects "Start implementation": `Invoking /dev-issue <N>`
