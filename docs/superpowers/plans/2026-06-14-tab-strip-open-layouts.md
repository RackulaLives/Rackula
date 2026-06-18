# Tab Strip for Open Layouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tab strip showing open layouts with switch, close, and drag-reorder, backed by a workspace store that holds one layout-store instance per open tab and exposes the active tab's store as the live store, with per-instance undo history.

**Architecture:** A new `workspace` store owns an ordered list of open tabs, each tab holding its own `LayoutStore` instance (its own history). The existing `getLayoutStore()` singleton becomes the workspace's first/active tab. To repoint the 388 existing `getLayoutStore()` call sites at the active tab without a sweeping edit, `getLayoutStore()` returns a stable proxy whose getters/methods delegate to the workspace's current active instance. Switching a tab is a pure focus change (no history mutation). Content swaps into a tab go through one clear-then-load primitive that clears that tab's history first, which also fixes the latent `loadLayout` history bug.

**Tech Stack:** Svelte 5 runes, TypeScript strict, bits-ui Tabs, Vitest, Playwright.

**Scope boundary (read first):** The spike #2179 storage module (`Rackula:workspace` index + `Rackula:layout:<id>` bodies, `setOpenSet`, `getDurability`, lazy restore) is design-only; it is NOT in the codebase. This slice keeps tabs as in-memory session state and does NOT build that persistence layer. It establishes the workspace-store seam and tab UI so #2080 (lazy restore) and #2082 (sidebar) can layer persistence on top. Deferred and flagged: persisted open-set, the #2018 overflow/chevron/orphan/rename interaction model, and cross-tab device-id/image-key namespacing (C6).

**C6 deferral (device-id uniqueness across tabs):** Placement images live in the global singleton image store keyed `placement-<placedDeviceId>` (see `src/lib/stores/commands/device.ts`, `EditPanelImage.svelte`, export/archive paths). Two open tabs whose layouts contain a placed device with the same UUID (for example, the same file opened in two tabs) collide on that key, so a placement photo set in one tab can surface in the other. Full enforcement means namespacing every `placement-<id>` key by layout id across ~15 call sites (editor, export, archive, undo commands) and is entangled with the #2179 persistence schema and #2080 lazy restore. Regenerating ids on open is not a safe minimum here: it would break the undo image-remap commands and the round-trip identity #2080 relies on. So C6 is deferred to the persistence slice where image keying is reworked; it does not affect the common one-file-per-tab case.

---

## File Structure

- Create `src/lib/stores/workspace.svelte.ts` - the workspace store: ordered open tabs, each an `{ id, store }`; `activeId`; `activeStore` derived getter; `openTab`, `closeTab`, `switchTo`, `reorderTabs`, `clearThenLoad` (the shared primitive).
- Modify `src/lib/stores/layout.svelte.ts` - `getLayoutStore()` returns a stable proxy that delegates to the workspace active store; add `clearHistoryThenLoad` usage; keep `createLayoutStore`/`resetLayoutStore` semantics intact.
- Modify `src/lib/stores/layout/layout-lifecycle.ts` - `loadLayout` clears history (the latent-bug fix) via the state-access history handle.
- Modify `src/lib/stores/layout/types.ts` - expose `getHistory()` already present; no change expected, verify.
- Create `src/lib/components/LayoutTabs.svelte` - the tab strip UI (ARIA tablist, roving tabindex, 44px targets, reduced motion, close affordance, unbacked-changes dot, drag-reorder).
- Modify `src/App.svelte` - mount `LayoutTabs` above the canvas; wire Alt+1-9 nav.
- Modify `src/lib/components/KeyboardHandler.svelte` - Alt+1-9 jump to tab N.
- Create `src/tests/workspace-store.test.ts` - behaviour tests for the workspace store.
- Modify `src/tests/layout-undo-redo.test.ts` (or new) - assert `loadLayout` clears history.

---

## Task 1: Fix latent `loadLayout` history bug (clear-then-load)

**Files:**

- Modify: `src/lib/stores/layout/layout-lifecycle.ts`
- Test: `src/tests/layout-undo-redo.test.ts`

- [ ] Step 1: Write failing test asserting history is cleared after `loadLayout`.
- [ ] Step 2: Run it, expect FAIL (history survives load today).
- [ ] Step 3: In `loadLayout`, after `ctx.setLayout(...)`, call `ctx.getHistory().clear()`.
- [ ] Step 4: Run test, expect PASS. Run full suite, expect green.
- [ ] Step 5: Commit.

## Task 2: Workspace store (per-instance history, focus-only switch)

**Files:**

- Create: `src/lib/stores/workspace.svelte.ts`
- Test: `src/tests/workspace-store.test.ts`

Behaviour to test (high-value):

- `openTab(layout)` creates a new tab with its own store + history; becomes active.
- `switchTo(id)` changes active without mutating any tab's undo/redo stacks (inactive tab's redo stack survives a round trip).
- `closeTab(id)` removes the tab; active falls back to a neighbour; closing the last tab is handled.
- `reorderTabs(from, to)` reorders the open list.
- `clearThenLoad(id, layout)` clears that tab's history then loads (no cross-tab leak).
- `activeStore` reflects the active tab's store.

- [ ] Steps: TDD each behaviour, commit per green group.

## Task 3: Repoint `getLayoutStore()` at the active tab via stable proxy

**Files:**

- Modify: `src/lib/stores/layout.svelte.ts`

- [ ] Make the workspace's first tab wrap the existing `activeInstance`.
- [ ] `getLayoutStore()` returns a stable proxy delegating reads/methods to `workspace.activeStore`. Preserve `resetLayoutStore()` semantics (resets active tab).
- [ ] Run full suite (388 call sites, 30+ tests). Expect green.
- [ ] Commit.

## Task 4: Tab strip UI

**Files:**

- Create: `src/lib/components/LayoutTabs.svelte`
- Modify: `src/App.svelte`

- [ ] ARIA tablist with roving tabindex, `aria-selected`, 44px targets, reduced-motion, hover/focus close (x) with accessible label, unbacked-changes dot with accessible text from durability, drag-reorder via existing dragdrop precedent.
- [ ] Validate with svelte-autofixer.
- [ ] Mount above canvas in App.svelte.
- [ ] Commit.

## Task 5: Alt+1-9 tab navigation

**Files:**

- Modify: `src/lib/components/KeyboardHandler.svelte`

- [ ] Add Alt+1..9 shortcuts to switch to tab N (interceptability noted; bare digits unaffected).
- [ ] Commit.

## Task 6: Verify, code-review, PR

- [ ] `npm run lint`, `npm run test:run`, `npm run build`, a11y e2e if feasible.
- [ ] Local `/code-review`, fix findings.
- [ ] PR `Closes #2079`.
