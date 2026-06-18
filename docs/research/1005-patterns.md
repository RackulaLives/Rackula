# Issue #1005 — Pattern Analysis: Design Options

## Summary

Synthesised codebase analysis and external UX research into four UX options and three schema approaches. Evaluated each against Rackula's constraints: ADHD-friendliness, mobile support, persistence modes, and existing patterns.

---

## UX Options

### Option 1: Add Layout Name Field to NewRackWizard Step 1

Add a "Layout Name" text input to the first step of the wizard, visible only when `rackCount === 0` (creating the first rack in a new layout).

| Criterion | Rating | Notes |
| --- | --- | --- |
| Alignment with existing patterns | Good | Wizard already exists, just adds a field |
| Mobile UX | Neutral | Works in bottom sheet |
| Cognitive load (ADHD) | **Poor** | Adds decision point before user has context |
| Skip/quick-start | Needs "Skip" or default | Must allow empty → auto-name |
| Persistence handling | N/A | Same either way |
| Default name strategy | Pre-filled "My Layout" | Editable but not empty |

**Verdict:** Couples layout naming to rack creation. Users creating a rack shouldn't need to think about layout names. Conflates two distinct concerns.

### Option 2: Separate "Name Your Layout" Dialog Before Wizard

A modal dialog that appears before the NewRackWizard when creating a new layout. Contains a text input with suggestions.

| Criterion | Rating | Notes |
| --- | --- | --- |
| Alignment with existing patterns | Poor | No other tool prompts for name before canvas |
| Mobile UX | Poor | Extra dialog = extra tap = friction |
| Cognitive load (ADHD) | **Poor** | Forces decision before user has context |
| Skip/quick-start | Needs prominent "Skip" | Must not block the flow |
| Persistence handling | N/A | Same either way |
| Default name strategy | Suggestions chips | Adds complexity |

**Verdict:** Against industry norms. Every surveyed tool (Figma, Excalidraw, Miro, draw.io) avoids upfront naming prompts. Adds friction without proportional value.

### Option 3: Add "Step 0" to Wizard (3-Step Wizard for First Rack)

Extend the wizard to 3 steps when creating the first rack: Name Layout → Rack Type → Rack Details.

| Criterion | Rating | Notes |
| --- | --- | --- |
| Alignment with existing patterns | Neutral | Wizard pattern exists, but 3 steps is longer |
| Mobile UX | Poor | More steps = more swipes = more friction |
| Cognitive load (ADHD) | **Poor** | Same issue as Option 1+2: forced decision |
| Skip/quick-start | Must allow skipping Step 0 | Complicates wizard logic |
| Persistence handling | N/A | Same either way |
| Default name strategy | Pre-filled default | Same as Option 1 |

**Verdict:** Increases wizard complexity for a naming decision that most users don't care about at creation time. Over-engineered.

### Option 4: Auto-Name with Inline Rename (Recommended)

Remove the name-sync from `addRack()`. Auto-name layouts with "My Layout". Make the layout name in the header clickable/editable.

| Criterion | Rating | Notes |
| --- | --- | --- |
| Alignment with existing patterns | **Excellent** | Matches Figma, Miro, Google Docs |
| Mobile UX | **Excellent** | Tap-to-edit in header, no extra dialogs |
| Cognitive load (ADHD) | **Excellent** | Zero new decision points; rename when ready |
| Skip/quick-start | **Excellent** | Nothing to skip — it just works |
| Persistence handling | Good | Default name works in both modes |
| Default name strategy | "My Layout" (domain-contextual) | Better than "Untitled" |

**Verdict:** Simplest option with the best UX alignment. Fixes the core issue (name conflation) without adding any friction.

---

## Trade-Off Matrix

| Criterion | Opt 1: Wizard Field | Opt 2: Dialog | Opt 3: Step 0 | Opt 4: Auto+Rename |
| --- | :-: | :-: | :-: | :-: |
| Industry alignment | ~ | - | ~ | ++ |
| Mobile UX | ~ | - | - | ++ |
| ADHD-friendly | - | - | - | ++ |
| Implementation simplicity | + | ~ | - | ++ |
| Zero-friction start | ~ | - | - | ++ |
| Naming discoverability | + | ++ | ++ | + |

**Legend:** `++` excellent, `+` good, `~` neutral, `-` poor

---

## Schema Considerations

### Q1: Should we keep the first-rack name sync or remove it entirely?

**Remove entirely.** The sync creates the exact problem Issue #1005 reports. No user expects "rename my rack" to also rename the layout. The sync exists because there was no separate layout-naming mechanism — once we provide one (inline editing), the sync is unnecessary and harmful.

**Impact of removal:**

- `addRack()`: Remove 3 lines (the `isFirstRack` name sync)
- `addBayedRackGroup()`: Remove the ternary name logic
- `updateRackRaw()`: Remove 3 lines (first-rack name sync)
- `replaceRackRaw()`: Remove 3 lines (first-rack name sync)
- Total: ~12 lines of code removed

### Q2: Should `metadata.name` auto-sync with `layout.name` on every save?

**Yes, sync on serialization.** The `metadata.name` field should always reflect the current `layout.name` when writing to YAML/archive. This eliminates the stale-name problem.

The simplest approach: In `serializeLayoutToYamlWithMetadata()`, always set `metadata.name = layout.name` before writing. This makes `metadata.name` a derived value, not an independent field.

**Alternative:** Remove `metadata.name` entirely (see Q3).

### Q3: Should we remove `metadata.name` from the type?

**Not yet.** While `metadata.name` is redundant with `layout.name`, removing it would:

- Change the YAML schema (breaking existing saved layouts on load)
- Require migration logic in `deserializeYaml()`
- Add risk for a cosmetic cleanup

**Better approach:** Keep the field but always sync it from `layout.name` on serialization. This maintains backward compatibility while eliminating divergence. A future cleanup can remove it if desired.

### Q4: Impact on existing saved layouts

**None with the sync approach.** Existing layouts that have divergent `metadata.name` and `layout.name` will:

- Load normally (both fields preserved)
- Re-save with synced names (next save fixes divergence)
- No migration needed

---

## Recommended Approach: Option 4 with Schema Sync

### Changes Required

1. **Remove name-sync** from `addRack()`, `addBayedRackGroup()`, `updateRackRaw()`, `replaceRackRaw()` (~12 lines deleted)

2. **Set default layout name** in `createLayout()` to `"My Layout"` (already done per prior session #52519)

3. **Sync metadata.name** from `layout.name` in `serializeLayoutToYamlWithMetadata()` (1 line)

4. **Add `setLayoutName()`** method to LayoutState (already done per prior session #52519)

5. **Add inline editing** to the layout name in the header:
   - Click layout name → editable text input
   - Enter to save, Escape to cancel
   - Edit icon appears on hover
   - Calls `layoutStore.setLayoutName(newName)`

### What's Already Done

From prior session (#52519, #52522):

- `createLayout()` signature changed to require explicit name
- `setLayoutName()` method added to LayoutState
- Default name changed to "My Layout"
- LayoutNameDialog.svelte created (but per this analysis, **not recommended** — inline editing is better)

### What Remains

- Remove name-sync from `addRack()` and related methods
- Add metadata.name sync on serialization
- Implement inline editing in header (may already exist from #52522)
- Remove or repurpose LayoutNameDialog.svelte (if Option 4 is chosen over the dialog approach)
