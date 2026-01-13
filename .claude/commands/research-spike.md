# Research Spike Workflow v1

Execute research spikes with context-optimized patterns.
Designed for autonomous research with checkpointing and file-based output.

**Arguments:** `$ARGUMENTS` (required: spike issue number)

---

## Permissions

You have **explicit permission** to perform WITHOUT asking:

| Action        | Scope                                   |
| ------------- | --------------------------------------- |
| Git branches  | `spike/<number>-*`                      |
| Worktrees     | Sibling directories `Rackula-issue-<N>` |
| Edit files    | `docs/research/`, `.claude/spike-*`     |
| Commands      | `gh` CLI, `git worktree`, read-only npm |
| Create issues | Batch from YAML definition file         |
| PRs           | `gh pr create` for research docs        |

**STOP and ask for:** Force push, direct main operations, deleting unrelated files.

---

## Decision Flow

```
START
  │
  └─ $ARGUMENTS provided? ──no──▶ "Usage: /research-spike <issue#>" STOP
  │
  ├─ Issue is spike type? ──no──▶ "Issue #N is not a spike" STOP
  │
  └─ Checkpoint exists?
      ├─ yes ──▶ Resume from checkpoint
      │
      └─ no ──▶ PHASE 1: Setup
                    │
                PHASE 2: Sequential Research
                    │ (checkpoint after EACH agent)
                    │
                PHASE 3: Synthesis
                    │ (checkpoint)
                    │
                PHASE 4: Issue Decomposition
                    │ (checkpoint)
                    │
                PHASE 5: Wrap-up
                    │
                  DONE
```

---

## Context Optimization Rules

**CRITICAL:** These rules prevent context exhaustion.

### Rule 1: Sequential Agents

Run research agents ONE AT A TIME. Never parallel.

```
Agent 1 completes → write file → checkpoint → clear context
Agent 2 starts fresh with minimal context
```

### Rule 2: File-Based Output

Agents write directly to files. Don't accumulate results in context.

```
Research output → docs/research/<N>-<type>.md
Issue definitions → .claude/spike-<N>-issues.yaml
```

### Rule 3: Incremental Synthesis

Build documents using Edit tool (append sections), not full in-memory synthesis.

### Rule 4: Checkpoint Everything

Save progress after each phase. Resume is always possible.

---

## Quick Reference

### File Structure

```
docs/research/
├── <N>-codebase.md     # Codebase exploration results
├── <N>-external.md     # External/web research results
├── <N>-patterns.md     # Pattern analysis results
└── spike-<N>-<slug>.md # Final synthesized findings

.claude/
├── spike-<N>-checkpoint.yaml  # Progress checkpoint
└── spike-<N>-issues.yaml      # Issue definitions for batch creation
```

### Checkpoint Format

```yaml
spike_number: 237
spike_title: "Network Interface Visualization"
phase: research # setup | research | synthesis | issues | complete
completed_agents:
  - codebase
  - external
research_files:
  - docs/research/237-codebase.md
  - docs/research/237-external.md
created_issues: []
blockers: []
```

### Memory Search (mem-search skill)

| Purpose          | Query                                                     |
| ---------------- | --------------------------------------------------------- |
| Prior spike work | `search` with query="#<N> OR <keywords>", type="decision" |
| Related features | `search` with concepts="<area>"                           |
| Past patterns    | `search` with type="discovery"                            |

---

## Phase 1: Setup

### 1a. Validate Input

```bash
gh issue view $ARGUMENTS --json number,title,body,labels
```

Check for `spike` label. If not present, STOP.

### 1b. Create Worktree (if not already in one)

**See also:** `superpowers:using-git-worktrees` for worktree patterns.

```bash
git worktree add .worktree/Rackula-issue-$ARGUMENTS -b spike/$ARGUMENTS-research
WORKTREE_DIR="$(pwd)/.worktree/Rackula-issue-$ARGUMENTS"
(cd "$WORKTREE_DIR" && npm install)
```

### 1c. Create Research Directory

```bash
mkdir -p docs/research
```

### 1d. Initialize Checkpoint

Write `.claude/spike-$ARGUMENTS-checkpoint.yaml`:

```yaml
spike_number: $ARGUMENTS
spike_title: "<from issue>"
phase: setup
completed_agents: []
research_files: []
created_issues: []
blockers: []
```

### 1e. Memory Context

**Use:** `episodic-memory:search-conversations` or `claude-mem:mem-search`

Query: "#$ARGUMENTS OR <spike keywords>"
Type: decision, discovery

Load any prior work on this spike or related topics. Check for:
- Previous research on similar topics
- Architectural decisions that may constrain approach
- Past patterns that worked well

<!-- CHECKPOINT: Phase 1 Complete -->

---

## Phase 2: Sequential Research

Execute research agents ONE AT A TIME. After each:

1. Verify output file created
2. Update checkpoint
3. Proceed to next agent

### 2a. Codebase Exploration

**Launch Explore agent with prompt:**

```
Research spike #<N>: <title>

Context from issue:
<issue body>

Your task:
1. Find all files related to this feature area
2. Document existing patterns and architecture
3. Identify integration points
4. Note any constraints or dependencies

Write your findings directly to: docs/research/<N>-codebase.md

Format:
## Files Examined
- path/to/file.ts: <purpose>

## Existing Patterns
...

## Integration Points
...

## Constraints
...
```

**After agent completes:**

```yaml
# Update checkpoint
completed_agents:
  - codebase
research_files:
  - docs/research/<N>-codebase.md
```

### 2b. External Research

**Launch research agent (with WebSearch/WebFetch if applicable):**

```
Research spike #<N>: <title>

Research question from issue:
<research question>

Your task:
1. Research industry best practices
2. Find similar implementations in other tools
3. Document relevant standards or specifications
4. Note any external libraries or approaches

Write your findings directly to: docs/research/<N>-external.md

Format:
## Industry Practices
...

## Similar Implementations
...

## Relevant Standards
...

## External Resources
...
```

**After agent completes:**

```yaml
# Update checkpoint
completed_agents:
  - codebase
  - external
research_files:
  - docs/research/<N>-codebase.md
  - docs/research/<N>-external.md
```

### 2c. Pattern Analysis

**Launch analysis agent:**

```
Research spike #<N>: <title>

Read these research files:
- docs/research/<N>-codebase.md
- docs/research/<N>-external.md

Your task:
1. Synthesize findings into actionable patterns
2. Identify implementation approaches
3. Note trade-offs between approaches
4. Recommend preferred approach with rationale

Write your findings directly to: docs/research/<N>-patterns.md

Format:
## Key Insights
...

## Implementation Approaches
### Option A: ...
### Option B: ...

## Trade-offs
...

## Recommendation
...
```

**After agent completes:**

```yaml
# Update checkpoint
phase: research
completed_agents:
  - codebase
  - external
  - patterns
research_files:
  - docs/research/<N>-codebase.md
  - docs/research/<N>-external.md
  - docs/research/<N>-patterns.md
```

<!-- CHECKPOINT: Phase 2 Complete -->

---

## Phase 3: Synthesis

**Pattern:** Follow `superpowers:brainstorming` approach for synthesizing findings into recommendations.

### 3a. Create Main Findings Document

Create `docs/research/spike-<N>-<slug>.md` with initial structure:

```markdown
# Spike #<N>: <Title>

**Date:** <today>
**Parent Epic:** <if applicable>

---

## Executive Summary

<to be filled>

---
```

### 3b. Incremental Synthesis

For each section, READ the relevant research file, then EDIT to append:

1. Read `docs/research/<N>-patterns.md` → Write Executive Summary
2. Read `docs/research/<N>-codebase.md` → Write Technical Findings
3. Read `docs/research/<N>-external.md` → Write External Research
4. Synthesize → Write Recommendations

**Use Edit tool to append each section. Do NOT hold full document in context.**

### 3c. Create Prototypes (if applicable)

If the spike calls for prototypes:

- Create in `docs/research/prototype-<name>.svelte` (or appropriate extension)
- Keep prototypes minimal and focused

### 3d. Update Checkpoint

```yaml
phase: synthesis
# ... rest of checkpoint
```

<!-- CHECKPOINT: Phase 3 Complete -->

---

## Phase 4: Issue Decomposition

### 4a. Analyze for Implementation Tasks

Read the synthesized findings and identify:

- Implementation phases
- Individual tasks per phase
- Dependencies between tasks
- Size estimates

### 4b. Write Issue Definitions

Create `.claude/spike-<N>-issues.yaml`:

```yaml
# Generated from spike #<N>: <title>
# Review before batch creation

parent_epic: <number or null>
milestone: <suggested milestone>

issues:
  - title: "feat: <description>"
    type: feature
    labels:
      - feature
      - area:ui
      - size:medium
    body: |
      ## Summary
      <description>

      ## Acceptance Criteria
      - [ ] <criterion 1>
      - [ ] <criterion 2>

      ## Technical Notes
      <from spike findings>

      ## Related
      - Spike: #<N>

  - title: "feat: <next feature>"
    # ... more issues
```

### 4c. Review with User (if not autonomous)

If not in autonomous mode, display issue count and ask for confirmation:

```
Generated <N> issues from spike findings.
Review .claude/spike-<N>-issues.yaml before creation? [y/n]
```

### 4d. Batch Create Issues

For each issue in YAML file:

```bash
gh issue create \
  --title "<title>" \
  --body "<body>" \
  --label "<labels>" \
  --milestone "<milestone>"
```

Track created issue numbers in checkpoint.

### 4e. Update Parent Epic

If parent epic specified:

```bash
gh issue edit <epic> --body "<add child issue links>"
```

### 4f. Update Checkpoint

```yaml
phase: issues
created_issues:
  - 247
  - 248
  - 249
  # ...
```

<!-- CHECKPOINT: Phase 4 Complete -->

---

## Phase 5: Wrap-up

**Use:** `superpowers:finishing-a-development-branch` for PR/merge decisions.

### 5a. Create PR for Research Docs

```bash
git add docs/research/
git commit -m "docs: spike #<N> research findings

Research deliverables for: <title>

Files:
- docs/research/spike-<N>-<slug>.md (main findings)
- docs/research/<N>-codebase.md
- docs/research/<N>-external.md
- docs/research/<N>-patterns.md

Created <X> implementation issues.

Closes #<N>"

git push -u origin spike/<N>-research
gh pr create --title "docs: spike #<N> research" --body "..."
```

### 5b. Close Spike Issue

```bash
gh issue close <N> --comment "Spike complete.

## Deliverables
- Research docs: PR #<pr-number>
- Implementation issues: #247, #248, ...

## Summary
<brief summary of findings and recommendations>"
```

### 5c. Cleanup

Delete checkpoint file:

```bash
rm .claude/spike-<N>-checkpoint.yaml
rm .claude/spike-<N>-issues.yaml
```

If using worktree, remove it:

```bash
git worktree remove .worktree/Rackula-issue-<N>
git worktree prune
```

**Optional:** Run `/worktree-cleanup list` to check for other stale worktrees.

---

## Resume Logic

When checkpoint exists:

```
Read checkpoint
│
├─ phase: setup ──▶ Continue from Phase 1e
│
├─ phase: research
│   ├─ codebase missing ──▶ Run 2a
│   ├─ external missing ──▶ Run 2b
│   └─ patterns missing ──▶ Run 2c
│
├─ phase: synthesis ──▶ Continue Phase 3
│
├─ phase: issues ──▶ Continue Phase 4
│
└─ phase: complete ──▶ Run Phase 5
```

**Key:** Don't re-run completed agents. Read their output files instead.

---

## Error Recovery

### Context Exhausting

Checkpoint is preserved. Start new session with same command:

```
/research-spike <N>
```

Will resume from last checkpoint.

### Agent Failure

**Use:** `superpowers:systematic-debugging` if agent failures persist.

**Success:** Output file exists and size > 0 bytes
**Failure:** After one retry, file is still missing or below minimum size (< 1KB)

1. Verify output file exists and size > 0 bytes
2. If missing or empty, retry once with a refined prompt (one additional attempt)
3. If still failing after retry, use systematic debugging to diagnose
4. Mark as checkpoint blocker if unresolved
5. Continue with remaining agents
6. Report blockers at end

### GitHub API Failure

**Success:** Any HTTP 2xx response
**Failure:** No 2xx after maximum 3 retries with exponential backoff (1s, 2s, 4s)

1. Attempt API call
2. On non-2xx response, retry with exponential backoff intervals: 1s, 2s, 4s
3. Maximum 3 retries total (4 attempts including original)
4. If still failing after 3 retries, persist issue definitions to `.claude/spike-<N>-issues.yaml`
5. Log for manual creation and continue with remaining work

---

## Output Format

### Session Summary

```
## Spike #<N>: <title>

**Status:** Complete
**Branch:** `spike/<N>-research`
**PR:** <url>

**Deliverables:**
- Main findings: docs/research/spike-<N>-<slug>.md
- Implementation issues: <count> created

**Issues Created:**
1. #247: feat: <title>
2. #248: feat: <title>
...

**Context Usage:** ~<X>k tokens (optimized from ~<Y>k)
```

### Blocked Summary

```
## Spike #<N>: <title>

**Status:** Blocked
**Checkpoint:** .claude/spike-<N>-checkpoint.yaml

**Completed:**
- Phase 1: Setup
- Phase 2a: Codebase exploration
- Phase 2b: External research

**Blockers:**
- <description>

**To Resume:** `/research-spike <N>`
```
