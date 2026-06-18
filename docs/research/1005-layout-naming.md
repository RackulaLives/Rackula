# Research Spike: Issue #1005 — Layout Name Separation

**Issue:** [#1005](https://github.com/RackulaLives/Rackula/issues/1005) — New layouts auto-named "Racky McRackface" (the default rack name) **Reporter:** @timothystewart6 via PR #1001 comment **Date:** 2026-03-13 **Status:** Research complete, pending design approval

---

## 1. Executive Summary

New layouts inherit the first rack's name due to an implicit name-sync in `addRack()`. Users never explicitly set a layout name — it's a side-effect of naming their first rack.

**Root cause:** Four name-sync points in `layout.svelte.ts` overwrite `layout.name` whenever the first rack is created or renamed.

**Recommendation:** Remove the name-sync, auto-name layouts "My Layout", and add inline editing to the header. This matches the industry standard (Figma, Miro, Google Docs) and is the most ADHD-friendly option — zero new decision points.

**Schema impact:** No schema changes needed. Sync `metadata.name` from `layout.name` on serialization to prevent stale names.

---

## 2. Schema Analysis

### Confirmed: No Schema Changes Needed

The data model already supports separate layout and rack names:

- `layout.name` — mutable, live layout name
- `layout.metadata.name` — set once at creation, written to YAML
- Rack names are independent (`rack.name` in each rack object)

The problem is purely behavioural: `addRack()`, `addBayedRackGroup()`, `updateRackRaw()`, and `replaceRackRaw()` all sync the first rack's name to `layout.name`.

### Name Authority Map

| Context                   | Source                          | Stale Risk   |
| ------------------------- | ------------------------------- | ------------ |
| In-memory display         | `layout.name`                   | No           |
| YAML top-level            | `layout.name` at serialize time | No           |
| YAML metadata             | `metadata.name` (from creation) | **Yes**      |
| Archive folder/filename   | `metadata.name` or rebuilt      | **Possible** |
| Export filename (PNG/SVG) | `layout.name` (live)            | No           |
| Persistence API           | UUID only                       | N/A          |
| Session storage           | `layout.name` (stored)          | No           |

### Fix for Metadata Divergence

Sync `metadata.name = layout.name` in `serializeLayoutToYamlWithMetadata()` before writing. This makes metadata.name always reflect the current layout name without removing the field (backward compatible).

---

## 3. UX Research Findings

### Industry Survey

| Tool | Pattern | Naming Flow |
| --- | --- | --- |
| Figma | Auto-name + inline rename | "Untitled" → click title to rename |
| Excalidraw | Auto-name | No naming step; timestamp on export |
| draw.io | Name on save | Prompt only at save/export time |
| Miro | Auto-name + inline rename | "Untitled board" → click to rename |
| Lucidchart | Auto-name + inline rename | "Untitled Document" → click to rename |
| Google Docs | Auto-name + inline rename | "Untitled document" → click to rename |

**Pattern:** No major creative tool prompts for a name before showing the canvas. The universal pattern is auto-name with easy, optional rename.

### ADHD-Friendly Design Principles

1. **Don't add decision points** before the user has context
2. **Hick's Law amplified** — ADHD users are more affected by too many choices
3. **Decision paralysis** — forced naming before creating content causes anxiety
4. **Flexibility over prescription** — make rename available, never required
5. **Predictable behaviour** — renaming a rack should NOT rename the layout

---

## 4. Design Options

### Option A: Layout Name Field in NewRackWizard

Add a "Layout Name" input to Step 1, visible only for the first rack. **Rejected:** Couples layout naming to rack creation; adds cognitive load.

### Option B: Separate "Name Your Layout" Dialog

Modal dialog before the wizard with naming suggestions. **Rejected:** Against industry norms; forces decision before context; adds friction.

### Option C: "Step 0" in Wizard (3-Step First-Rack Flow)

Extend wizard to Name Layout → Rack Type → Rack Details. **Rejected:** Over-engineered; more steps = more friction, especially on mobile.

### Option D: Auto-Name + Inline Rename (Recommended)

Remove name-sync, auto-name "My Layout", click-to-edit in header. **Selected:** Matches industry standard; zero friction; ADHD-friendly.

### Trade-Off Matrix

| Criterion | A: Wizard | B: Dialog | C: Step 0 | **D: Auto+Rename** |
| --- | :-: | :-: | :-: | :-: |
| Industry alignment | ~ | - | ~ | **++** |
| Mobile UX | ~ | - | - | **++** |
| ADHD-friendly | - | - | - | **++** |
| Implementation simplicity | + | ~ | - | **++** |
| Zero-friction start | ~ | - | - | **++** |
| Naming discoverability | + | ++ | ++ | **+** |

---

## 5. Recommendation: Option D — Auto-Name + Inline Rename

### What Changes

1. **Remove name-sync** (~12 lines deleted across 4 methods in `layout.svelte.ts`)
2. **Default layout name** → "My Layout" (already done in prior session)
3. **Metadata sync** → Always set `metadata.name = layout.name` on serialization
4. **`setLayoutName()` method** → Already added to LayoutState in prior session
5. **Inline editing in header** → Click layout name to edit; Enter to save, Escape to cancel

### What Stays the Same

- Layout type definitions (no schema changes)
- YAML format (metadata.name field preserved, just always synced)
- Persistence API (UUID-based, name is display-only)
- Archive structure (folder naming uses current layout.name)
- Existing saved layouts load without migration

### Backward Compatibility

- Old layouts with divergent `metadata.name` load normally
- Next save syncs metadata.name to layout.name (self-healing)
- No migration code needed

---

## 6. Implementation Sketch

### Prior Work (Sessions #52519, #52522)

Some foundation work was completed in a prior session:

- `createLayout()` updated to require explicit name parameter
- `setLayoutName()` added to LayoutState with change tracking
- LayoutNameDialog.svelte created (may be repurposed or removed)
- Inline editing added to header

### Remaining Work

1. **Remove name-sync from store** (core fix):
   - `addRack()` lines 450-454 — remove `if (isFirstRack)` name sync
   - `addBayedRackGroup()` lines 541-547 — remove ternary name logic
   - `updateRackRaw()` lines 2316-2318 — remove first-rack name sync
   - `replaceRackRaw()` lines 2333-2335 — remove first-rack name sync

2. **Sync metadata on serialization**:
   - `yaml.ts:serializeLayoutToYamlWithMetadata()` — set `metadata.name = layout.name`

3. **Verify inline editing** works correctly (from prior session)

4. **Decide on LayoutNameDialog** — if Option D is approved, the dialog created in the prior session should be removed (or kept for a future "rename layout" context menu)

5. **Update tests** — any tests asserting layout name matches rack name need updating

### Files to Modify

| File                              | Change                          |
| --------------------------------- | ------------------------------- |
| `src/lib/stores/layout.svelte.ts` | Remove 4 name-sync blocks       |
| `src/lib/utils/yaml.ts`           | Sync metadata.name on serialize |
| Tests referencing name-sync       | Update assertions               |

---

## 7. Open Questions for Design Review

1. **Default name:** "My Layout" vs "Untitled Layout" vs "New Layout"?
2. **LayoutNameDialog from prior session:** Keep, repurpose, or remove?
3. **Naming suggestions:** Worth adding clickable chips ("Home Lab", "Datacenter") to the inline editor, or save for a future enhancement?
4. **Multiple layouts:** When persistence supports multiple layouts, should auto-naming use sequential defaults ("My Layout 2")?

---

## Supporting Research Files

- [`1005-codebase.md`](1005-codebase.md) — Full schema and code analysis
- [`1005-external.md`](1005-external.md) — External UX research and industry survey
- [`1005-patterns.md`](1005-patterns.md) — Design options with trade-off analysis
