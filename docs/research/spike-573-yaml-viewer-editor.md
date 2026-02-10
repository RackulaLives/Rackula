# Spike #573: In-App YAML Viewer/Editor

**Date:** 2026-02-10
**Parent Epic:** #570 (Developer-Friendly Data Format)

---

## Executive Summary

This spike evaluated editor options and UX patterns for exposing Rackula layout YAML in-app.

**Recommendation:**

1. Use **CodeMirror 6** (not Monaco, not Ace) for edit mode.
2. Ship in **two phases**: view-only first, then edit/apply mode.
3. Use a **full-screen modal/sheet workflow** (desktop modal, mobile full sheet), not a sidebar tab.
4. **Lazy-load editor code** so startup bundle stays unchanged.

This gives a strong power-user workflow without turning YAML editing into a default-path UX burden.

---

## Codebase Constraints (Current State)

From current implementation:

- YAML parse/serialize already exists (`src/lib/utils/yaml.ts`) with Zod validation via `LayoutSchema`.
- Save/load still flows through ZIP archive utilities (`src/lib/utils/archive.ts`) while preserving YAML as canonical data.
- Desktop main layout has a narrow left sidebar and active right edit drawer (`src/App.svelte`), which is too constrained for practical code editing.
- Mobile currently exposes File/View/Devices via bottom nav (`src/lib/components/mobile/MobileBottomNav.svelte`), so editor UX should be a sheet/modal action, not a fourth persistent nav mode.
- Project already relies on **dynamic import** for heavy utilities (YAML, ZIP), so editor lazy-loading matches existing patterns.

---

## 1) Editor Library Recommendation

### Options Evaluated

| Option | Editing Quality | Estimated Min+Gzip (local prototype) | Maintenance Signal | Verdict |
| --- | --- | --- | --- | --- |
| Monaco | Excellent | ~1,104 KB | Very active | Too heavy for Rackula |
| CodeMirror 6 (`basicSetup`) | Excellent | ~137 KB | Active | Strong candidate |
| CodeMirror 6 (lean extension set) | Very good | ~99 KB | Active | **Recommended baseline** |
| Ace | Good | ~133 KB | Active but older architecture | Acceptable, not preferred |
| highlight.js (+ YAML lang) | View-only | ~9 KB | Active | Good for read-only only |

**How sizing was measured:** local esbuild bundle prototypes on 2026-02-10.

### Why CodeMirror 6

- Much smaller runtime than Monaco while still supporting robust editing and linting.
- Modular architecture lets us load only YAML-related features.
- Works well with lazy-loading and incremental enhancement.
- Better long-term fit than Ace for modern extension/lint workflows.

### Why not Monaco

- Import-size overhead is disproportionate for Rackula’s startup budget.
- Measured monaco prototype bundle (~1.1 MB gzip) is too large relative to current startup JS (~300.40 KB gzip).

---

## 2) Proposed UX Approach

### Recommended Scope

**Phase 1: View-only YAML panel**

- Entry point: File menu action (`View YAML`).
- Open in large modal/sheet.
- Features: syntax highlighting, copy button, download YAML.
- No apply path yet.

**Phase 2: Edit + Apply**

- Same modal/sheet, editable buffer.
- Explicit `Apply` action (no auto-apply).
- Validation status bar + error panel.
- Confirm before applying destructive changes.

### Placement Decision

Use **modal/sheet** (not sidebar tab, not split view):

- Desktop: centered large modal (~80vw x 80vh).
- Mobile: full-height sheet.

This keeps YAML work focused, avoids sidebar crowding, and avoids complex split-view synchronization.

### Validation Timing

- Syntax validation: debounced during typing (fast feedback).
- Schema validation: on `Apply` (authoritative gate).
- Disable `Apply` when invalid.

### Conflict Handling

Use snapshot semantics:

1. Capture layout revision when editor opens.
2. On apply, verify revision still matches.
3. If changed, prompt user to reopen with latest state or force overwrite.

### Partial vs Full Editing

Start with **full-layout editing only**. Partial-object editing adds path mapping/conflict complexity and should be deferred.

---

## 3) Implementation Complexity Estimate

| Scope | Files touched (expected) | Effort | Risk |
| --- | --- | --- | --- |
| View-only modal + copy/download | 3-6 files | 0.5-1.5 days | Low |
| Edit/apply with syntax + schema validation | 6-12 files | 2-4 days | Medium |
| Inline line-level schema diagnostics and advanced conflict UX | 10+ files | 4-7 days | Medium-High |

Most complexity is integration work (state lifecycle, validation UX, and safe apply behavior), not raw editor rendering.

---

## 4) Bundle Size Impact and Mitigation

### Baseline (current project)

Measured from current production build via `scripts/measure-startup-payload.ts`:

- `TOTAL_STARTUP_JS`: **1054.97 KB raw / 300.40 KB gzip**

### Impact if eagerly bundled (not recommended)

- Monaco import would add roughly **+1.1 MB gzip** (startup would more than triple).
- CodeMirror lean would add roughly **+99 KB gzip** (~33% startup increase).
- Ace would add roughly **+133 KB gzip** (~44% startup increase).
- highlight.js view-only path adds roughly **+9 KB gzip** (~3% increase).

### Mitigation Strategy (recommended)

1. **Lazy-load editor module** only when opening YAML panel.
2. Keep initial launch path unchanged (zero startup regression).
3. For CodeMirror, avoid `basicSetup` and use a lean extension list.
4. Gate edit-only extras (lint gutter, advanced diagnostics) behind second-stage lazy imports.

---

## 5) Proposed Follow-up Implementation Issues (If Approved)

1. **feat: Add in-app YAML viewer (read-only modal + copy/download)**
   - Includes desktop + mobile UX parity.
2. **feat: Add YAML edit/apply flow with schema-gated validation**
   - Includes explicit apply, invalid-state blocking, and conflict prompt.
3. **chore: Add editor lazy-load performance budget checks**
   - Verifies no startup bundle regression from YAML tooling.
4. **feat: Add inline diagnostics mapping (schema path -> line hints)**
   - Optional enhancement after apply workflow is stable.

---

## Deliverables Checklist

- [x] Recommend editor library with rationale
- [x] Propose UX approach (view-only vs edit, placement)
- [x] Estimate implementation complexity
- [x] Identify bundle size impact and mitigation
- [x] Propose follow-up implementation issues

