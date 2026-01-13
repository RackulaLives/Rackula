# Create-Issue AskUserQuestion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert text-based prompts in `/create-issue` skill to use AskUserQuestion tool for better UX.

**Architecture:** The skill file is a markdown document that Claude interprets. We'll replace text prompt instructions with AskUserQuestion tool call specifications. We'll also add semantic milestone selection with dynamic version calculation.

**Tech Stack:** Markdown skill file, AskUserQuestion tool, GitHub CLI (`gh`)

---

## Task 1: Update Permissions Section

**Files:**

- Modify: `.claude/commands/create-issue.md:13-20`

**Step 1: Add milestone creation permission**

Update the Permissions table to include milestone creation:

```markdown
## Permissions

| Action        | Scope                                        |
| ------------- | -------------------------------------------- |
| GitHub Issues | Read, create, edit (labels, body, milestone) |
| GitHub API    | Read milestones, create milestones           |

**Commands allowed:** `gh issue list`, `gh issue view`, `gh issue create`, `gh issue edit`, `gh api`
```

**Step 2: Commit**

```bash
git add .claude/commands/create-issue.md
git commit -m "chore(create-issue): add milestone creation permission"
```

---

## Task 2: Replace Type Selection with AskUserQuestion

**Files:**

- Modify: `.claude/commands/create-issue.md:45-55`

**Step 1: Replace Step 1 content**

Replace the text-based type selection:

````markdown
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
````

Map response to type: Bug→`bug`, Feature→`feature`, Chore→`chore`, Spike→`spike`

````

**Step 2: Commit**

```bash
git add .claude/commands/create-issue.md
git commit -m "chore(create-issue): convert type selection to AskUserQuestion"
````

---

## Task 3: Replace Duplicate Check with AskUserQuestion

**Files:**

- Modify: `.claude/commands/create-issue.md:65-81`

**Step 1: Replace Step 3 content**

````markdown
### Step 3: Duplicate Check

Search for similar issues:

```bash
gh issue list --search "<summary keywords>" --limit 5 --json number,title,state
```
````

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

````

**Step 2: Commit**

```bash
git add .claude/commands/create-issue.md
git commit -m "chore(create-issue): convert duplicate check to AskUserQuestion"
````

---

## Task 4: Replace Label Suggestions with AskUserQuestion

**Files:**

- Modify: `.claude/commands/create-issue.md:124-135`

**Step 1: Replace Step 7 content**

````markdown
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
````

- Build options dynamically from keyword inference
- Include detected labels with detection reason in description
- Include default size label for the issue type
- Include other potentially relevant area labels
- Pre-select detected labels (user can deselect)

````

**Step 2: Commit**

```bash
git add .claude/commands/create-issue.md
git commit -m "chore(create-issue): convert label selection to AskUserQuestion multi-select"
````

---

## Task 5: Replace Priority with AskUserQuestion

**Files:**

- Modify: `.claude/commands/create-issue.md:137-142`

**Step 1: Replace Step 8 content**

````markdown
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
````

Map response to label: Urgent→`priority:urgent`, High→`priority:high`, Low→`priority:low`, Normal→no priority label

````

**Step 2: Commit**

```bash
git add .claude/commands/create-issue.md
git commit -m "chore(create-issue): convert priority to AskUserQuestion"
````

---

## Task 6: Replace Milestone with Semantic AskUserQuestion

**Files:**

- Modify: `.claude/commands/create-issue.md:144-158`

**Step 1: Replace Step 9 with semantic milestone selection**

````markdown
### Step 9: Milestone

**Pre-fetch version info:**

```bash
# Get current version from package.json
current_version=$(node -p "require('./package.json').version")

# Get open milestones
gh api repos/:owner/:repo/milestones --jq '.[] | select(.state=="open") | .title'
```
````

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

````

**Step 2: Commit**

```bash
git add .claude/commands/create-issue.md
git commit -m "chore(create-issue): add semantic milestone selection with auto-creation"
````

---

## Task 7: Replace Preview Confirm with AskUserQuestion

**Files:**

- Modify: `.claude/commands/create-issue.md:160-188`

**Step 1: Replace Step 10 content**

```markdown
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

````

Then use AskUserQuestion tool:

```json
{
  "questions": [{
    "header": "Create?",
    "question": "Issue preview looks good?",
    "multiSelect": false,
    "options": [
      {"label": "Create issue", "description": "Submit to GitHub now"},
      {"label": "Edit details", "description": "Go back and modify something"},
      {"label": "Cancel", "description": "Discard and exit"}
    ]
  }]
}
````

- "Create issue": Proceed to Step 11
- "Edit details": Ask which section to edit, loop back
- "Cancel": Output "Issue creation cancelled." and stop

````

**Step 2: Commit**

```bash
git add .claude/commands/create-issue.md
git commit -m "chore(create-issue): convert preview confirm to AskUserQuestion"
````

---

## Task 8: Replace Handoff Offer with AskUserQuestion

**Files:**

- Modify: `.claude/commands/create-issue.md:200-208`

**Step 1: Replace Step 12 content**

````markdown
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
````

- "Start implementation": Output `Invoking /dev-issue <issue-number>`
- "Done for now": End skill

````

**Step 2: Commit**

```bash
git add .claude/commands/create-issue.md
git commit -m "chore(create-issue): convert handoff offer to AskUserQuestion"
````

---

## Task 9: Update Triage Mode

**Files:**

- Modify: `.claude/commands/create-issue.md:212-277`

**Step 1: Update Triage Mode to use AskUserQuestion**

Update Step 2 (Completeness Check) to use AskUserQuestion for "Fill in missing sections?":

```markdown
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

````

Use AskUserQuestion:

```json
{
  "questions": [{
    "header": "Triage",
    "question": "Fill in missing sections?",
    "multiSelect": false,
    "options": [
      {"label": "Yes, fill them in", "description": "Guide me through adding missing info"},
      {"label": "Skip to labels only", "description": "Just update labels and milestone"},
      {"label": "Cancel", "description": "Exit without changes"}
    ]
  }]
}
````

````

Update Step 3 to reference that it uses same AskUserQuestion prompts as Interactive mode (labels, priority, milestone).

Update Step 6 (Handoff Offer) to use same AskUserQuestion as Interactive Step 12.

**Step 2: Commit**

```bash
git add .claude/commands/create-issue.md
git commit -m "chore(create-issue): update triage mode with AskUserQuestion"
````

---

## Task 10: Update Quick Capture Mode

**Files:**

- Modify: `.claude/commands/create-issue.md:281-341`

**Step 1: Update Quick Capture duplicate check and confirm**

Update Step 3 (Duplicate Check):

````markdown
### Step 3: Duplicate Check

```bash
gh issue list --search "<keywords>" --limit 3 --json number,title,state
```
````

If matches found, use AskUserQuestion:

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

- Build options from search results + "None of these" option
- If existing issue selected, link to it and stop
- If "None of these", continue

````

Update Step 4 (Brief Confirmation):

```markdown
### Step 4: Brief Confirmation

Display inferred details:
````

Title: bug: Fix toast z-index bug
Labels: bug, triage, area:ui

````

Use AskUserQuestion:

```json
{
  "questions": [{
    "header": "Create?",
    "question": "Create this quick capture issue?",
    "multiSelect": false,
    "options": [
      {"label": "Create", "description": "Submit to GitHub with triage label"},
      {"label": "Cancel", "description": "Discard"}
    ]
  }]
}
````

````

Note: Quick Capture does NOT use milestone question - fast logging only.

**Step 2: Commit**

```bash
git add .claude/commands/create-issue.md
git commit -m "chore(create-issue): update quick capture mode with AskUserQuestion"
````

---

## Task 11: Bump Version and Final Review

**Files:**

- Modify: `.claude/commands/create-issue.md:1`

**Step 1: Update version in header**

Change:

```markdown
# Issue Creation Workflow v1
```

To:

```markdown
# Issue Creation Workflow v2
```

**Step 2: Review entire file for consistency**

- Verify all text-based prompts are replaced
- Verify JSON examples are valid
- Verify mode-specific behavior is correctly documented

**Step 3: Final commit**

```bash
git add .claude/commands/create-issue.md
git commit -m "chore(create-issue): bump to v2 with AskUserQuestion improvements"
```

---

## Task 12: Push and Create PR

**Step 1: Push branch**

```bash
git push -u origin chore/create-issue-askuserquestion
```

**Step 2: Create PR**

```bash
gh pr create --title "chore: improve /create-issue skill with AskUserQuestion" --body "$(cat <<'EOF'
## Summary
- Convert 7 text-based prompts to AskUserQuestion tool calls
- Add semantic milestone selection (Next/Minor/Major/None)
- Auto-create milestones if they don't exist
- Improve UX with structured options and descriptions

## Changes
- Interactive Mode: All 7 prompts now use AskUserQuestion
- Triage Mode: Uses AskUserQuestion for completeness check and labels
- Quick Capture Mode: Uses AskUserQuestion for duplicate check and confirm
- Milestone logic: Dynamic version calculation from package.json

## Test Plan
- [ ] Test `/create-issue` (interactive mode)
- [ ] Test `/create-issue 123` (triage mode)
- [ ] Test `/create-issue "Fix something"` (quick capture mode)
- [ ] Verify milestone creation works when milestone doesn't exist

---
Design doc: docs/plans/2026-01-13-create-issue-askuserquestion-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**Step 3: Report completion**

Output PR URL and summary.
