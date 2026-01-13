# Memory-Assisted Debugging Workflow v1

Debug issues using systematic debugging enhanced with episodic memory search.

**Arguments:** `$ARGUMENTS` (required: brief description of the issue)

---

## When to Use

- Bug reports or test failures
- Unexpected behavior
- Error messages
- "This worked before" situations

**Triggers for Claude to invoke proactively:**

- Error message in conversation
- User says "bug", "broken", "not working", "regression"
- Test failure output shown

---

## Workflow

### Phase 1: Memory Check (BEFORE investigating)

**CRITICAL:** Search memory BEFORE looking at code.

Use mem-search skill:

```
Query: "<error keywords> OR <component name>"
Type: bugfix, decision
Limit: 10
```

**Purpose:** Recover past solutions, avoid repeating failed approaches.

**If memory has relevant results:**

- Review what was tried before
- Note what worked and what didn't
- Skip approaches that already failed

### Phase 2: Systematic Debugging

**Invoke:** `superpowers:systematic-debugging`

Follow that skill exactly - it handles:

- Hypothesis formation
- Evidence gathering
- Root cause tracing
- Defense in depth

Do NOT skip this step even if memory gave hints. Verify hypotheses.

### Phase 3: Record Solution

After fix verified, ensure solution is captured:

**Commit message should include:**

- Root cause (what was actually wrong)
- Fix approach (what change resolved it)
- What was tried and failed (if applicable)

**Example commit message:**

```
fix: prevent race condition in device placement

Root cause: placeDevice was called before rack ID was set
Fix: Add guard clause checking rack.id before placement
Tried: Adding setTimeout (didn't work - timing dependent)
```

---

## Key Principle

**Memory BEFORE investigation.**

Don't spend 30 minutes debugging something you solved last week.

---

## Integration

**Orchestrates:** `superpowers:systematic-debugging`
**Uses:** `episodic-memory:search-conversations` or `claude-mem:mem-search`
**Called by:** Proactively when debugging triggers detected

---

## Red Flags

- Starting to read code before searching memory
- "I'll just check this one thing first"
- Skipping memory search because "this looks simple"
- Not invoking systematic-debugging after memory check

All of these mean: STOP. Search memory first, then follow the workflow.
