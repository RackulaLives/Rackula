# Command Palette Shell (Ctrl/Cmd+K) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a command palette accelerator (Ctrl/Cmd+K, plus a discoverable top-bar pill) that runs any registered action from one searchable list, projected from the existing actions registry so it can never drift from the keyboard handler, app menu, or help overlay. This is the shell only: command-mode list, fuzzy filter (bits-ui built-in), grouped results, footer key hints, ARIA, mobile bottom-sheet. Recents and the rich selection-aware empty state are #2213 and are explicitly out of scope.

**Architecture:** Compose bits-ui `Command.*` primitives inside bits-ui `Dialog.*` primitives in a new `CommandPalette.svelte`, mounted from `DialogOrchestrator.svelte` and gated by a new scalar `DialogId` `"commandPalette"` (so opening it closes any other dialog with zero extra code). A new registry action `command-palette` (bindings Ctrl+K and Cmd+K, helpGroup "General") makes it resolvable via `findActionForEvent` and auto-listed in the `?` overlay. The single dispatch spine moves out of `KeyboardHandler.svelte` into a new pure module `src/lib/actions/dispatch.ts` (`createActionDispatch`), consumed by both `KeyboardHandler` and `CommandPalette`. A pure projection module `src/lib/actions/palette-commands.ts` turns the registry into the grouped, scope-gated command list the palette renders.

**Tech Stack:** Svelte 5 runes only (`$state`/`$derived`/`$effect`, `getContext`/`setContext`); TypeScript strict; bits-ui v2.18.1 (`Command`, `Dialog` already installed, no new deps); Vitest + @testing-library/svelte for unit; Playwright for E2E. All colours via design tokens in `src/lib/styles/tokens.css`. Worktree root: `/Users/gvns/code/projects/Rackula/Rackula/.worktree/Rackula-issue-2212`.

## Verified facts that shape this plan (read before deviating)

- **Stores are module-level singletons, NOT Svelte context.** `getLayoutStore()`, `getSelectionStore()`, `getUIStore()`, `getToastStore()`, `getPlacementStore()`, `getWorkspaceStore()` each return a process-wide singleton (e.g. `getLayoutStore` returns `layoutStoreFacade`). `selection-actions.ts` and `dialog-actions.ts` already resolve their stores internally this way. **Consequence:** the dispatch map does NOT need stores injected as `deps`. It imports the already-singleton-resolving action functions directly. The only values that vary by render and must reach the dispatch are the App-level callbacks (`maybeSave`, `handleFitAll`, etc.) - but those are ALSO module singletons in `$lib/utils/app-actions` and `$lib/utils/dialog-actions`. This significantly simplifies decision #5: `createActionDispatch` takes no `deps` and the Svelte-context plumbing in decision #5 is unnecessary. See Risks for the deviation rationale; the plan implements the simpler verified design.
- bits-ui `Command.Root` does its own fuzzy filtering and sorting by the input value (props `shouldFilter` default true, `filter` defaults to the package's `computeCommandScore`, `Item` accepts `value` + `keywords`). We render every projected item and let `Command.Root` filter. **We do NOT import `compute-command-score` ourselves.** (`CommandRootProps`: `label?`, `shouldFilter?`, `filter?`, `value?`/`onValueChange?`, `loop?`. `CommandInputProps`: `value?` bindable. `CommandItemProps`: `value?`, `onSelect?: () => void`, `keywords?: string[]`, `disabled?`, `forceMount?`. `CommandGroupProps`: `value?` (no `heading` prop - heading is a child `Command.GroupHeading`). `CommandEmptyProps`: `forceMount?`.)
- bits-ui command barrel exports: `Root, Empty, Group, GroupHeading, GroupItems, Input, Item, LinkItem, List, Viewport, Loading, Separator` (from `bits-ui` `Command`).
- bits-ui dialog barrel exports: `Root, Title, Close, Portal, Content, Overlay, Trigger, Description`.
- `dialogStore.open(id)` sets the single scalar `openDialog`; `close()` clears it; `isOpen(id)` compares. Adding `"commandPalette"` to the `DialogId` union gives the "opening it closes any other dialog" behaviour for free.
- `shouldIgnoreKeyboard(event)` returns true for input/textarea/select/contenteditable. It does NOT special-case Escape (confirmed). Ctrl/Cmd+K will be the FIRST special-case that runs before this early-return.
- `formatShortcut('mod', 'K')` -> "Cmd + K" (mac) / "Ctrl + K" (other). `getStorageMode()` and `StorageMode` come from `$lib/storage`. `getViewportStore().isMobile` drives bottom-sheet (mirrors `Dialog.svelte`'s `isSheet = $derived(viewportStore.isMobile)`).
- No search/magnifier icon exists in `src/lib/components/icons/`. **A new `IconSearch.svelte` must be created** and exported from `icons/index.ts` (visual-only; no test per TDD policy).
- Tokens: `--colour-focus-ring`, `--dracula-cyan`, `--touch-target-min: 48px`, `--space-*`, `--radius-md`, `--colour-surface`, `--colour-border`, `--colour-text`, `--colour-text-muted`, `--colour-surface-hover` all exist. (Decision says "44px"; the project's touch token is 48px - use the token, see Risks.)
- ActionEnabledContext fields: `hasSelection`, `isDeviceSelected`, `isRackSelected`, `canUndo`, `canRedo`, `hasRacks`, `mode`. Live values from: `selectionStore.hasSelection/isDeviceSelected/isRackSelected`, `layoutStore.canUndo/canRedo/hasRack`, `getStorageMode()`.
- E2E: import `{ test, expect }` from `./helpers/base-test`; helpers via `./helpers` (`gotoWithRack`, `SMALL_RACK_SHARE`, `PLATFORM_MODIFIER`, `locators`, `clickNewRack`). `PLATFORM_MODIFIER` is `"Meta"` on darwin else `"Control"`. Run all e2e: `npm run test:e2e`; a single spec: `npm run test:e2e -- e2e/command-palette.spec.ts`. Dialog accessible name pattern: `page.getByRole("dialog", { name: "..." })`.

---

## File Structure

**Create**

- `src/lib/actions/dispatch.ts` - `ActionDispatch` type + `createActionDispatch()`: the single id->runnable map, moved out of `KeyboardHandler.svelte`; imports the singleton-resolving action functions.
- `src/lib/actions/palette-commands.ts` - pure projection: registry -> grouped, scope-gated `PaletteCommand[]` for the palette (global + layout always; selection gated by `enabledWhen`).
- `src/lib/components/CommandPalette.svelte` - the palette UI: bits-ui `Dialog.*` wrapping `Command.*`, footer key-hints, mobile sheet.
- `src/lib/components/icons/IconSearch.svelte` - magnifier icon for the pill (visual-only, no test).
- `src/tests/dispatch.test.ts` - unit: dispatch covers every keyboard-bound action id; `command-palette` opens the palette.
- `src/tests/palette-commands.test.ts` - unit: projection gates selection by `enabledWhen`, always includes global+layout.
- `e2e/command-palette.spec.ts` - E2E: shortcut opens, typing filters, Enter runs, Esc closes + focus returns, pill click opens.

**Modify**

- `src/lib/actions/registry.ts` - add `"command-palette"` to `ActionId` union and to `ACTION_REGISTRY` (bindings Ctrl+K/Cmd+K, helpGroup "General", keywords).
- `src/lib/components/icons/index.ts` - export `IconSearch`.
- `src/lib/components/KeyboardHandler.svelte` - delete inline dispatch + helper closures (now in `dispatch.ts`); intercept Ctrl/Cmd+K before `shouldIgnoreKeyboard`; go inert while palette open; remove now-unused props.
- `src/lib/components/Toolbar.svelte` - add the "Search or jump to..." pill after `<AppMenu/>` in the left section; collapse to icon-only under `viewportStore.isMobile`.
- `src/lib/components/AppMenu.svelte` - render the logo mark only (pass `showText={false}` to `LogoLockup`), keep `aria-label="App menu"`.
- `src/lib/components/LogoLockup.svelte` - add `showText` prop (default true); hide the wordmark `<svg class="logo-title">` when false; keep DRackula prefix logic intact (it only affects the wordmark, which is now hidden in the toolbar).
- `src/lib/components/DialogOrchestrator.svelte` - mount `<CommandPalette/>` gated by `dialogStore.isOpen("commandPalette")`.
- `src/App.svelte` - remove the now-unused props passed to `<KeyboardHandler/>` (only those the new handler no longer needs).
- `src/tests/actions-registry.test.ts` - add assertions: Ctrl+K and Cmd+K resolve to `command-palette`; the help overlay includes the palette row.

---

### Task 1: Add the `command-palette` registry action

**Files**

- Modify: `src/lib/actions/registry.ts` (add to `ActionId` union ~line 28-56; add to `ACTION_REGISTRY` General group, after the `show-help` entry ~line 209)
- Modify: `src/tests/actions-registry.test.ts` (add cases inside the existing `describe("findActionForEvent ...")` and `describe("getHelpGroups ...")` blocks)

**Steps**

- [ ] Write failing tests in `src/tests/actions-registry.test.ts`. Add inside the `findActionForEvent` describe:

  ```ts
  it("resolves Ctrl+K to the command palette", () => {
    const event = new KeyboardEvent("keydown", { key: "k", ctrlKey: true });
    expect(findActionForEvent(event)?.id).toBe("command-palette");
  });

  it("resolves Cmd+K to the command palette (cross-platform)", () => {
    const event = new KeyboardEvent("keydown", { key: "k", metaKey: true });
    expect(findActionForEvent(event)?.id).toBe("command-palette");
  });
  ```

  Add inside the `getHelpGroups` describe:

  ```ts
  it("includes the command palette in the help overlay", () => {
    const labels = new Set(
      getHelpGroups().flatMap((g) => g.rows.map((r) => r.action)),
    );
    expect(labels.has("Command palette")).toBe(true);
  });
  ```

- [ ] Run it - fails. `cd .worktree/Rackula-issue-2212 && npx vitest run src/tests/actions-registry.test.ts`
      Expected: 3 failing assertions; `findActionForEvent` returns `undefined` for Ctrl/Cmd+K, label not present. The existing `registry integrity` test ("every binding's key shape is reproducible") will also start failing until the action exists - that is expected and confirms the binding is wired.
- [ ] Add `"command-palette"` to the `ActionId` union (alongside the other ids, e.g. after `"show-help"`).
- [ ] Add the action to `ACTION_REGISTRY` in the General group, immediately after the `show-help` entry (so it sits with the other general commands and the help projection picks it up):
  ```ts
  {
    id: "command-palette",
    label: "Command palette",
    scope: "global",
    bindings: [
      { key: "k", ctrl: true },
      { key: "k", meta: true },
    ],
    helpGroup: "General",
    keywords: ["palette", "commands", "search", "jump to"],
  },
  ```
- [ ] Run it - passes. `cd .worktree/Rackula-issue-2212 && npx vitest run src/tests/actions-registry.test.ts`
      Expected: all green, including `registry integrity` (Ctrl+K resolves back to `command-palette`; both bindings reproduce).
- [ ] Commit. `git add -A && git commit -m "feat: register command-palette action (Ctrl/Cmd+K)"`

---

### Task 2: Add `"commandPalette"` to the dialog store

**Files**

- Modify: `src/lib/stores/dialogs.svelte.ts` (the `DialogId` union, lines 13-26)

No unit test: this is a one-line union extension that TypeScript validates, and the open/close/isOpen behaviour is unchanged singleton logic (TDD policy: do not test pass-through). The behaviour is covered by Task 8's E2E.

**Steps**

- [ ] Add `"commandPalette"` to the `DialogId` union (e.g. after `"load"`):
  ```ts
  export type DialogId =
    | "newRack"
    // ... existing ids ...
    | "load"
    | "commandPalette";
  ```
- [ ] Verify it type-checks. `cd .worktree/Rackula-issue-2212 && npm run check`
      Expected: no new errors from this file.
- [ ] Commit. `git add -A && git commit -m "feat: add commandPalette dialog id"`

---

### Task 3: Extract the dispatch spine into `src/lib/actions/dispatch.ts`

This moves the `dispatch` map and its helper closures (`performUndo`, `performRedo`, `handleEscape`, `cycleActiveRack`) out of `KeyboardHandler.svelte`. Because stores and App-level callbacks are module singletons, the closures resolve them internally - `createActionDispatch` takes NO arguments. It adds the `command-palette` entry (opens the palette). It returns a `Record<ActionId, () => void>` covering every action id (entries that have no runtime behaviour in this app, e.g. selection verbs without a keyboard binding like `flip-device-face`/`focus-rack`/`export-rack`, map to the shared selection-action where one exists, else a no-op so the type is total).

**Files**

- Create: `src/lib/actions/dispatch.ts`
- Create: `src/tests/dispatch.test.ts`

**Steps**

- [ ] Write failing test `src/tests/dispatch.test.ts`:

  ```ts
  import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
  import { ACTION_REGISTRY, type ActionId } from "$lib/actions/registry";
  import { createActionDispatch } from "$lib/actions/dispatch";
  import { dialogStore } from "$lib/stores/dialogs.svelte";

  describe("createActionDispatch", () => {
    afterEach(() => dialogStore.close());

    it("provides a runnable entry for every registered action id", () => {
      const dispatch = createActionDispatch();
      for (const action of ACTION_REGISTRY) {
        expect(
          typeof dispatch[action.id],
          `missing dispatch entry for "${action.id}"`,
        ).toBe("function");
      }
    });

    it("opens the command palette dialog when command-palette runs", () => {
      const dispatch = createActionDispatch();
      expect(dialogStore.isOpen("commandPalette")).toBe(false);
      dispatch["command-palette"]();
      expect(dialogStore.isOpen("commandPalette")).toBe(true);
    });
  });
  ```

- [ ] Run it - fails (module does not exist). `cd .worktree/Rackula-issue-2212 && npx vitest run src/tests/dispatch.test.ts`
      Expected: import error / `createActionDispatch is not a function`.
- [ ] Create `src/lib/actions/dispatch.ts`. Move the helper closures from `KeyboardHandler.svelte` verbatim (resolving stores internally), wire the App-level callbacks via the existing singleton functions, and add `command-palette`:

  ```ts
  /**
   * The single dispatch spine: maps every registry ActionId to the closure that
   * runs it in this app. Both the keyboard handler and the command palette consume
   * this one map so a command runs identically however it is invoked.
   *
   * Stores and app-level action functions are module singletons (getLayoutStore,
   * maybeSave, handleHelp, ...), so this module resolves them internally and takes
   * no arguments - mirroring selection-actions.ts and dialog-actions.ts.
   */
  import type { ActionId } from "$lib/actions/registry";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getSelectionStore } from "$lib/stores/selection.svelte";
  import { getUIStore } from "$lib/stores/ui.svelte";
  import { getToastStore } from "$lib/stores/toast.svelte";
  import { getPlacementStore } from "$lib/stores/placement.svelte";
  import { dialogStore } from "$lib/stores/dialogs.svelte";
  import {
    moveSelectedDeviceUp,
    moveSelectedDeviceDown,
    duplicateSelection,
    flipSelectedDeviceFace,
  } from "$lib/actions/selection-actions";
  import {
    maybeSave,
    maybeSaveAs,
    maybeExport,
    handleShare,
    handleFitAll,
    resetAndOpenNewRack,
  } from "$lib/utils/app-actions";
  import {
    handleDelete,
    handleHelp,
    handleAddDevice,
    handleImportFromNetBox,
    handleOpenYamlEditor,
  } from "$lib/utils/dialog-actions";
  import {
    handleRackContextFocus,
    handleRackContextExport,
  } from "$lib/utils/rack-actions";

  export type ActionDispatch = Record<ActionId, () => void>;

  function performUndo(): void {
    const layoutStore = getLayoutStore();
    const toastStore = getToastStore();
    if (!layoutStore.canUndo) return;
    const desc = layoutStore.undoDescription?.replace("Undo: ", "") ?? "action";
    layoutStore.undo();
    toastStore.showToast(`Undid: ${desc}`, "info");
  }

  function performRedo(): void {
    const layoutStore = getLayoutStore();
    const toastStore = getToastStore();
    if (!layoutStore.canRedo) return;
    const desc = layoutStore.redoDescription?.replace("Redo: ", "") ?? "action";
    layoutStore.redo();
    toastStore.showToast(`Redid: ${desc}`, "info");
  }

  function handleEscape(): void {
    const layoutStore = getLayoutStore();
    const selectionStore = getSelectionStore();
    const uiStore = getUIStore();
    const placementStore = getPlacementStore();
    if (placementStore.isPlacing) {
      placementStore.cancelPlacement();
      handleFitAll();
      return;
    }
    selectionStore.clearSelection();
    layoutStore.setActiveRack(null);
    uiStore.closeLeftDrawer();
    uiStore.closeRightDrawer();
  }

  function cycleActiveRack(direction: -1 | 1): void {
    const layoutStore = getLayoutStore();
    const selectionStore = getSelectionStore();
    const toastStore = getToastStore();
    const racks = layoutStore.racks;
    if (racks.length === 0) return;
    const currentId = layoutStore.activeRackId;
    const currentIndex = currentId
      ? racks.findIndex((r) => r.id === currentId)
      : -1;
    let newIndex: number;
    if (currentIndex === -1) {
      newIndex = direction === 1 ? 0 : racks.length - 1;
    } else {
      newIndex = (currentIndex + direction + racks.length) % racks.length;
    }
    const newRack = racks[newIndex];
    if (!newRack) return;
    if (newRack.id === currentId) return;
    layoutStore.setActiveRack(newRack.id);
    selectionStore.selectRack(newRack.id);
    toastStore.showToast(`Active: ${newRack.name}`, "info");
  }

  /**
   * Build the dispatch map. Every ActionId has an entry so the map is total;
   * selection verbs with no app behaviour fall back to a no-op.
   */
  export function createActionDispatch(): ActionDispatch {
    const noop = () => {};
    return {
      // global
      escape: handleEscape,
      "show-help": handleHelp,
      "toggle-sidebar": () => getUIStore().toggleLeftDrawer(),
      undo: performUndo,
      redo: performRedo,
      save: maybeSave,
      "save-as": maybeSaveAs,
      "export-backup": maybeSaveAs,
      export: maybeExport,
      share: handleShare,
      load: noop, // load is owned by the storage/load dialog, not a parameterless verb here
      "view-yaml": handleOpenYamlEditor,
      "new-layout": resetAndOpenNewRack,
      "import-devices": noop, // device library import is a hidden file input owned by DialogOrchestrator
      "import-netbox": handleImportFromNetBox,
      "new-custom-device": handleAddDevice,
      "command-palette": () => dialogStore.open("commandPalette"),
      // layout
      "fit-all": handleFitAll,
      "toggle-display-mode": noop, // display-mode toggle lives in App; see note in Task 6
      "toggle-annotations": () => getUIStore().toggleAnnotations(),
      "cycle-rack-prev": () => cycleActiveRack(-1),
      "cycle-rack-next": () => cycleActiveRack(1),
      // selection
      "delete-selection": handleDelete,
      "move-device-up": moveSelectedDeviceUp,
      "move-device-down": moveSelectedDeviceDown,
      "duplicate-selection": duplicateSelection,
      "flip-device-face": flipSelectedDeviceFace,
      "focus-rack": () => {
        const id = getSelectionStore().selectedRackId;
        if (id) handleRackContextFocus(id);
      },
      "export-rack": () => {
        const id = getSelectionStore().selectedRackId;
        if (id) handleRackContextExport(id);
      },
    };
  }
  ```

  Before finalising, the implementer MUST verify each imported symbol exists and the no-op rationale holds:
  - Confirm `flipSelectedDeviceFace`, `moveSelectedDeviceUp/Down`, `duplicateSelection` exist in `src/lib/actions/selection-actions.ts` (verified: they do).
  - Confirm `handleRackContextFocus`/`handleRackContextExport` signatures in `src/lib/utils/rack-actions.ts` accept a `rackId: string` (App imports `handleRackContextFocus`, `handleRackContextExport` from there; confirm arity before wiring - if they take an event/object, adapt or fall back to `noop` and note it).
  - `toggle-display-mode`: App's `handleToggleDisplayMode` reads `uiStore` then calls `layoutStore.updateDisplayMode(...)`. There is no singleton in `app-actions`/`dialog-actions` for it. The minimal correct behaviour is to replicate it: `() => { const ui = getUIStore(); const layout = getLayoutStore(); ui.toggleDisplayMode(); layout.updateDisplayMode(ui.displayMode); layout.updateShowLabelsOnImages(ui.showLabelsOnImages); }`. Replace the `noop` above with this implementation and verify `uiStore.toggleDisplayMode`, `uiStore.displayMode`, `uiStore.showLabelsOnImages`, `layoutStore.updateDisplayMode`, `layoutStore.updateShowLabelsOnImages` all exist (they are used in `App.handleToggleDisplayMode`, so they do).
  - `load` and `import-devices`: these were App-callback props in the old handler but neither had a _keyboard binding_ in the old `KeyboardHandler` dispatch except `load` (Ctrl+O). `load` DID have a binding and DID map to `onload` (= `handleLoad` from `$lib/storage`). Import `handleLoad` from `$lib/storage` and wire `load: handleLoad` (verify it is a parameterless function - App passes it directly as `onload={handleLoad}`, so it is callable with no args). Replace the `load: noop` line accordingly.

- [ ] Run it - passes. `cd .worktree/Rackula-issue-2212 && npx vitest run src/tests/dispatch.test.ts`
      Expected: both tests green; the totality test confirms an entry for all ids including `command-palette`, `flip-device-face`, `focus-rack`, `export-rack`.
- [ ] Commit. `git add -A && git commit -m "refactor: extract action dispatch into dispatch.ts"`

---

### Task 4: Rewire `KeyboardHandler.svelte` onto the shared dispatch + palette interception

**Files**

- Modify: `src/lib/components/KeyboardHandler.svelte` (delete inline `dispatch` + helper closures + `Props`; consume `createActionDispatch`; intercept Ctrl/Cmd+K; inert while palette open)
- Modify: `src/App.svelte` (drop the now-unused props passed to `<KeyboardHandler/>`, lines 696-707)

The existing `src/tests/keyboard.test.ts` renders `KeyboardHandler` and exercises shortcuts; it must keep passing (regression guard). We add one focused behaviour test for the palette interception. Use a small exported helper `isCommandPaletteShortcut(event)` so the precedence logic is unit-testable without rendering.

**Steps**

- [ ] Write failing test. Add a new describe to `src/tests/dispatch.test.ts` (keeps palette logic tests together) OR a new `src/tests/keyboard-palette.test.ts`. Use the latter to avoid touching the large existing keyboard suite:

  ```ts
  import { describe, it, expect } from "vitest";
  import { isCommandPaletteShortcut } from "$lib/actions/dispatch";

  describe("isCommandPaletteShortcut", () => {
    it("matches Ctrl+K", () => {
      expect(
        isCommandPaletteShortcut(
          new KeyboardEvent("keydown", { key: "k", ctrlKey: true }),
        ),
      ).toBe(true);
    });
    it("matches Cmd+K", () => {
      expect(
        isCommandPaletteShortcut(
          new KeyboardEvent("keydown", { key: "k", metaKey: true }),
        ),
      ).toBe(true);
    });
    it("does not match a bare k", () => {
      expect(
        isCommandPaletteShortcut(new KeyboardEvent("keydown", { key: "k" })),
      ).toBe(false);
    });
  });
  ```

- [ ] Run it - fails (`isCommandPaletteShortcut` not exported). `cd .worktree/Rackula-issue-2212 && npx vitest run src/tests/keyboard-palette.test.ts`
- [ ] Add `isCommandPaletteShortcut` to `src/lib/actions/dispatch.ts`, resolving against the registry bindings so it cannot drift:

  ```ts
  import { getActionById } from "$lib/actions/registry";
  import { matchesShortcut } from "$lib/utils/keyboard";

  /** True when the event matches any command-palette binding (Ctrl/Cmd+K). */
  export function isCommandPaletteShortcut(event: KeyboardEvent): boolean {
    const action = getActionById("command-palette");
    if (!action) return false;
    return action.bindings.some((b) =>
      matchesShortcut(event, {
        key: b.key,
        ctrl: b.ctrl,
        meta: b.meta,
        shift: b.shift,
        action: () => {},
      }),
    );
  }
  ```

- [ ] Run it - passes. `cd .worktree/Rackula-issue-2212 && npx vitest run src/tests/keyboard-palette.test.ts`
- [ ] Rewrite `KeyboardHandler.svelte`. Replace the entire `<script>` body's dispatch/helpers/props with consumption of the shared dispatch, keep `handleTabJump` (workspace tab jumps are dynamic, not registry actions), and add palette interception + inert-while-open:

  ```svelte
  <script lang="ts">
    import { shouldIgnoreKeyboard } from "$lib/utils/keyboard";
    import { findActionForEvent } from "$lib/actions/registry";
    import {
      createActionDispatch,
      isCommandPaletteShortcut,
    } from "$lib/actions/dispatch";
    import { getWorkspaceStore } from "$lib/stores/workspace.svelte";
    import { dialogStore } from "$lib/stores/dialogs.svelte";

    const workspace = getWorkspaceStore();
    const dispatch = createActionDispatch();

    function handleTabJump(event: KeyboardEvent): boolean {
      if (
        event.altKey === false ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      ) {
        return false;
      }
      const match = /^Digit([1-9])$/.exec(event.code);
      if (!match) return false;
      event.preventDefault();
      const index = Number(match[1]) - 1;
      const tab = workspace.tabs[index];
      if (tab) workspace.switchTo(tab.id);
      return true;
    }

    function handleKeyDown(event: KeyboardEvent) {
      // Palette shortcut fires even from a text field, and before any other
      // handling. It is the first special-case to run before shouldIgnoreKeyboard.
      if (isCommandPaletteShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();
        dialogStore.open("commandPalette");
        return;
      }

      // While the palette is open the global handler is inert: the Dialog owns
      // Escape and the Command input owns typing.
      if (dialogStore.isOpen("commandPalette")) return;

      if (shouldIgnoreKeyboard(event)) return;
      if (handleTabJump(event)) return;

      const action = findActionForEvent(event);
      if (!action) return;
      event.preventDefault();
      dispatch[action.id]?.();
    }
  </script>

  <svelte:window onkeydown={handleKeyDown} />
  ```

  Note: preserve the original `handleTabJump` guard exactly (`if (!event.altKey || ...)`); the snippet above rewrote it as `event.altKey === false` for clarity - use whichever matches the original semantics (`!event.altKey`). Keep the existing comment about Alt+digit/macOS.

- [ ] Update `src/App.svelte`: the `<KeyboardHandler ... />` element (lines 696-707) now needs NO props. Replace it with `<KeyboardHandler />`. Then check whether any of `handleToggleAnnotations` / `handleToggleDisplayMode` (the local App functions) become unused. They are still passed to other components (`CanvasViewControls`, `DevicePalette`, mobile sheets) - verify with grep before deleting; do NOT delete functions still referenced. Only remove the props on the `<KeyboardHandler/>` tag.
- [ ] Run the full keyboard regression + check. `cd .worktree/Rackula-issue-2212 && npx vitest run src/tests/keyboard.test.ts src/tests/keyboard-viewport.test.ts && npm run check`
      Expected: existing keyboard tests still green (dispatch behaviour unchanged); no type errors; no unused-prop lint failures.
- [ ] Commit. `git add -A && git commit -m "refactor: keyboard handler uses shared dispatch; intercept Ctrl/Cmd+K"`

---

### Task 5: The palette-commands projection (`palette-commands.ts`)

Pure module: turns `ACTION_REGISTRY` into a grouped list for the palette. Global + layout actions always included; selection actions included only when their `enabledWhen(ctx)` passes. Excludes the `command-palette` action itself (running it from inside the palette is meaningless) and actions with no dispatchable purpose for the palette (`escape` is excluded - it is not a "command" a user picks from a list). Groups by a small palette-grouping (reuse `helpGroup` where present, else a fallback bucket). This module is the seam #2213 extends for recents.

**Files**

- Create: `src/lib/actions/palette-commands.ts`
- Create: `src/tests/palette-commands.test.ts`

**Steps**

- [ ] Write failing test `src/tests/palette-commands.test.ts`:

  ```ts
  import { describe, it, expect } from "vitest";
  import { getPaletteCommands } from "$lib/actions/palette-commands";
  import type { ActionEnabledContext } from "$lib/actions/registry";

  const baseCtx: ActionEnabledContext = {
    hasSelection: false,
    isDeviceSelected: false,
    isRackSelected: false,
    canUndo: false,
    canRedo: false,
    hasRacks: true,
    mode: "browser",
  };

  function ids(ctx: ActionEnabledContext): string[] {
    return getPaletteCommands(ctx).flatMap((g) => g.commands.map((c) => c.id));
  }

  describe("getPaletteCommands", () => {
    it("always includes global and layout commands", () => {
      const list = ids(baseCtx);
      expect(list).toContain("fit-all"); // layout
      expect(list).toContain("share"); // global (hasRacks satisfies its predicate)
    });

    it("excludes the command-palette command itself", () => {
      expect(ids(baseCtx)).not.toContain("command-palette");
    });

    it("hides selection commands when nothing is selected", () => {
      expect(ids(baseCtx)).not.toContain("duplicate-selection");
      expect(ids(baseCtx)).not.toContain("delete-selection");
    });

    it("shows device selection commands when a device is selected", () => {
      const ctx = {
        ...baseCtx,
        hasSelection: true,
        isDeviceSelected: true,
      };
      const list = ids(ctx);
      expect(list).toContain("duplicate-selection");
      expect(list).toContain("move-device-up");
    });

    it("gates global commands by their own enabledWhen too", () => {
      // share needs a rack; with no racks it is hidden from the palette.
      expect(ids({ ...baseCtx, hasRacks: false })).not.toContain("share");
    });
  });
  ```

- [ ] Run it - fails (module missing). `cd .worktree/Rackula-issue-2212 && npx vitest run src/tests/palette-commands.test.ts`
- [ ] Create `src/lib/actions/palette-commands.ts`:

  ```ts
  /**
   * Projects the actions registry into the grouped command list the command
   * palette renders. #2212 shows command mode only: global + layout commands
   * always (gated by their own enabledWhen if present), selection commands only
   * when their enabledWhen passes against the live context. The palette itself
   * and the escape "command" are excluded - they are not list-pickable.
   *
   * #2213 extends this seam with recents and a selection-aware empty state.
   */
  import {
    ACTION_REGISTRY,
    type ActionDefinition,
    type ActionEnabledContext,
    type ActionId,
  } from "$lib/actions/registry";
  import { formatShortcut } from "$lib/utils/platform";

  export interface PaletteCommand {
    id: ActionId;
    label: string;
    /** Platform-formatted primary shortcut, if any (for the row badge). */
    shortcut?: string;
    /** Registry keywords, fed to Command.Item for fuzzy matching. */
    keywords: string[];
  }

  export interface PaletteCommandGroup {
    /** Display heading for the group. */
    heading: string;
    commands: PaletteCommand[];
  }

  /** Actions that are never offered as palette rows. */
  const EXCLUDED: ReadonlySet<ActionId> = new Set<ActionId>([
    "command-palette",
    "escape",
  ]);

  /** Group heading order in the palette. */
  const GROUP_ORDER = [
    "General",
    "Navigation",
    "Editing",
    "File",
    "Other",
  ] as const;
  type GroupName = (typeof GROUP_ORDER)[number];

  function groupOf(action: ActionDefinition): GroupName {
    return (action.helpGroup as GroupName | undefined) ?? "Other";
  }

  function shortcutOf(action: ActionDefinition): string | undefined {
    const binding = action.bindings[0];
    if (!binding) return undefined;
    const parts: string[] = [];
    if (binding.ctrl || binding.meta) parts.push("mod");
    if (binding.shift) parts.push("shift");
    parts.push(
      binding.key.length === 1 ? binding.key.toUpperCase() : binding.key,
    );
    return formatShortcut(...parts);
  }

  function isIncluded(
    action: ActionDefinition,
    ctx: ActionEnabledContext,
  ): boolean {
    if (EXCLUDED.has(action.id)) return false;
    // selection commands appear only when enabled; global/layout always appear,
    // but still respect their own enabledWhen when they declare one.
    if (action.enabledWhen) return action.enabledWhen(ctx);
    return true;
  }

  /** Build the grouped, context-gated palette command list. */
  export function getPaletteCommands(
    ctx: ActionEnabledContext,
  ): PaletteCommandGroup[] {
    const buckets = new Map<GroupName, PaletteCommand[]>();
    for (const action of ACTION_REGISTRY) {
      if (!isIncluded(action, ctx)) continue;
      const group = groupOf(action);
      const command: PaletteCommand = {
        id: action.id,
        label: action.label,
        shortcut: shortcutOf(action),
        keywords: action.keywords ?? [],
      };
      const existing = buckets.get(group);
      if (existing) existing.push(command);
      else buckets.set(group, [command]);
    }
    const groups: PaletteCommandGroup[] = [];
    for (const heading of GROUP_ORDER) {
      const commands = buckets.get(heading);
      if (commands && commands.length > 0) groups.push({ heading, commands });
    }
    return groups;
  }
  ```

  Note on the test expectation `expect(list).toContain("fit-all")`: `fit-all` is layout-scoped with no `enabledWhen`, so it is always included - good. `share` has `enabledWhen: (ctx) => ctx.hasRacks`, so it is included only when `hasRacks` is true - the tests assert exactly that. `move-device-up`/`duplicate-selection` are selection-scoped with `enabledWhen` on `isDeviceSelected`/(`isDeviceSelected||isRackSelected`) - gated correctly. This matches decision #8 ("global + layout always shown; selection-scoped shown only when enabledWhen passes") with the refinement that global/layout commands that DO declare `enabledWhen` (share, view-yaml, undo, redo) are also gated - which is the correct behaviour (a disabled command should not be runnable from the palette). Flag in Risks that this slightly tightens decision #8's wording.

- [ ] Run it - passes. `cd .worktree/Rackula-issue-2212 && npx vitest run src/tests/palette-commands.test.ts`
- [ ] Commit. `git add -A && git commit -m "feat: palette command projection from registry"`

---

### Task 6: The search icon

**Files**

- Create: `src/lib/components/icons/IconSearch.svelte`
- Modify: `src/lib/components/icons/index.ts` (add export)

Visual-only: no test (TDD policy - icons are explicitly in the skip list).

**Steps**

- [ ] Create `src/lib/components/icons/IconSearch.svelte` matching the existing icon shape (Phosphor-style, `size` prop, `currentColor`, `aria-hidden`). Use a standard magnifier path:

  ```svelte
  <!--
    Search icon (magnifier, Phosphor-style)
  -->
  <script lang="ts">
    interface Props {
      size?: number;
    }
    let { size = 20 }: Props = $props();
  </script>

  <svg
    width={size}
    height={size}
    viewBox="0 0 256 256"
    fill="currentColor"
    aria-hidden="true"
  >
    <path
      d="M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z"
    />
  </svg>
  ```

- [ ] Add to `src/lib/components/icons/index.ts` under the Iconoir/Phosphor section:
  ```ts
  export { default as IconSearch } from "./IconSearch.svelte";
  ```
- [ ] Verify it type-checks. `cd .worktree/Rackula-issue-2212 && npm run check`
      Expected: no errors.
- [ ] Commit. `git add -A && git commit -m "feat: add IconSearch"`

---

### Task 7: The `CommandPalette.svelte` component

Compose bits-ui `Dialog.*` (focus trap, Escape, backdrop, visually-hidden `Dialog.Title` "Command palette") wrapping bits-ui `Command.*`. Render groups/items from `getPaletteCommands(ctx)`; let `Command.Root` filter (default `shouldFilter`). Selecting an item runs `dispatch[id]()` then `dialogStore.close()`. Footer key-hint bar (up/down navigate, enter run, esc close). Mobile bottom-sheet mirroring `Dialog.svelte`'s `isSheet` approach. Open state bound to `dialogStore.isOpen("commandPalette")`; closing via `onOpenChange(false)` calls `dialogStore.close()`.

This is a UI composition component. Per TDD policy ("components where the only possible test is 'renders without throwing'" / DOM-query bans), the component itself is NOT unit-tested; its behaviour is covered by the pure modules (Tasks 3, 5) and the E2E (Task 8).

**Files**

- Create: `src/lib/components/CommandPalette.svelte`

**Steps**

- [ ] Create `src/lib/components/CommandPalette.svelte`:

  ```svelte
  <!--
    CommandPalette - the Ctrl/Cmd+K command accelerator (#2212, shell only)
  
    Composes bits-ui Command.* inside bits-ui Dialog.* so the palette gets the
    Dialog's focus trap, Escape handling, and inert backdrop, and the Command's
    ARIA combobox/listbox model plus built-in fuzzy filtering. Command rows are
    projected from the actions registry (getPaletteCommands), so the palette is a
    projection of the one registry and cannot drift from the menu, keyboard
    handler, or help overlay. Recents and the rich selection-aware empty state
    are #2213. Bottom-sheet presentation below the mobile breakpoint mirrors
    Dialog.svelte. All colours via design tokens.
  -->
  <script lang="ts">
    import { Dialog, Command } from "bits-ui";
    import { IconSearch } from "./icons";
    import { dialogStore } from "$lib/stores/dialogs.svelte";
    import { getViewportStore } from "$lib/utils/viewport.svelte";
    import { getSelectionStore } from "$lib/stores/selection.svelte";
    import { getLayoutStore } from "$lib/stores/layout.svelte";
    import { getStorageMode } from "$lib/storage";
    import { getPaletteCommands } from "$lib/actions/palette-commands";
    import {
      createActionDispatch,
      type ActionDispatch,
    } from "$lib/actions/dispatch";
    import type { ActionId, ActionEnabledContext } from "$lib/actions/registry";

    const viewportStore = getViewportStore();
    const selectionStore = getSelectionStore();
    const layoutStore = getLayoutStore();
    const isSheet = $derived(viewportStore.isMobile);

    const open = $derived(dialogStore.isOpen("commandPalette"));
    const dispatch: ActionDispatch = createActionDispatch();

    let search = $state("");

    // Live enable context for gating selection (and rack-dependent) commands.
    const ctx = $derived<ActionEnabledContext>({
      hasSelection: selectionStore.hasSelection,
      isDeviceSelected: selectionStore.isDeviceSelected,
      isRackSelected: selectionStore.isRackSelected,
      canUndo: layoutStore.canUndo,
      canRedo: layoutStore.canRedo,
      hasRacks: layoutStore.hasRack,
      mode: getStorageMode(),
    });

    const groups = $derived(getPaletteCommands(ctx));

    function handleOpenChange(next: boolean) {
      if (!next) {
        dialogStore.close();
        search = "";
      }
    }

    function run(id: ActionId) {
      dispatch[id]?.();
      dialogStore.close();
      search = "";
    }
  </script>

  <Dialog.Root {open} onOpenChange={handleOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay class="dialog-backdrop" data-testid="dialog-backdrop" />
      <Dialog.Content
        class="command-palette {isSheet
          ? 'command-palette--sheet'
          : 'command-palette--centred'}"
        data-testid="command-palette"
      >
        <!-- Visually-hidden accessible name for the dialog. -->
        <Dialog.Title class="sr-only">Command palette</Dialog.Title>

        <Command.Root label="Command palette" loop class="command-root">
          <div class="command-input-row">
            <span class="command-input-icon" aria-hidden="true">
              <IconSearch />
            </span>
            <Command.Input
              bind:value={search}
              class="command-input"
              placeholder="Search or jump to..."
              data-testid="command-palette-input"
            />
          </div>

          <Command.List class="command-list">
            <Command.Empty class="command-empty">
              No matching commands
            </Command.Empty>

            {#each groups as group, groupIndex (group.heading)}
              {#if groupIndex > 0}
                <Command.Separator class="command-separator" />
              {/if}
              <Command.Group class="command-group">
                <Command.GroupHeading class="command-group-heading">
                  {group.heading}
                </Command.GroupHeading>
                <Command.GroupItems>
                  {#each group.commands as command (command.id)}
                    <Command.Item
                      value={command.label}
                      keywords={command.keywords}
                      onSelect={() => run(command.id)}
                      class="command-item"
                      data-testid={`command-palette-item-${command.id}`}
                    >
                      <span class="command-item-label">{command.label}</span>
                      {#if command.shortcut}
                        <span class="command-item-shortcut"
                          >{command.shortcut}</span
                        >
                      {/if}
                    </Command.Item>
                  {/each}
                </Command.GroupItems>
              </Command.Group>
            {/each}
          </Command.List>

          <div class="command-footer" aria-hidden="true">
            <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
            <span><kbd>↵</kbd> run</span>
            <span><kbd>esc</kbd> close</span>
          </div>
        </Command.Root>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>

  <style>
    /* Reuses .dialog-backdrop from src/lib/styles/dialogs.css (imported globally,
       same as Dialog.svelte). All colours via tokens. */

    .command-palette {
      position: fixed;
      left: 50%;
      top: 12vh;
      transform: translateX(-50%);
      width: min(90vw, 640px);
      max-height: 70vh;
      display: flex;
      flex-direction: column;
      background: var(--colour-surface);
      border: 1px solid var(--colour-border);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-lg, 0 16px 48px rgba(0, 0, 0, 0.4));
      overflow: hidden;
      z-index: var(--z-dialog, 1000);
    }

    .command-palette--sheet {
      left: 0;
      right: 0;
      bottom: 0;
      top: auto;
      transform: none;
      width: 100%;
      max-height: 85vh;
      border-radius: var(--radius-md) var(--radius-md) 0 0;
    }

    .command-input-row {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-3) var(--space-4);
      border-bottom: 1px solid var(--colour-border);
    }

    .command-input-icon {
      display: inline-flex;
      color: var(--colour-text-muted);
    }

    .command-input-icon :global(svg) {
      width: var(--icon-size-md);
      height: var(--icon-size-md);
    }

    .command-input {
      flex: 1;
      min-height: var(--touch-target-min);
      border: none;
      background: transparent;
      color: var(--colour-text);
      font-size: var(--font-size-md, 1rem);
      font-family: inherit;
      outline: none;
    }

    .command-input::placeholder {
      color: var(--colour-text-muted);
    }

    .command-list {
      overflow-y: auto;
      padding: var(--space-2);
    }

    .command-group-heading {
      padding: var(--space-2) var(--space-2) var(--space-1);
      font-size: var(--font-size-xs);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--colour-text-muted);
    }

    .command-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      min-height: var(--touch-target-min);
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-md);
      color: var(--colour-text);
      cursor: pointer;
    }

    .command-item[data-selected] {
      background: var(--colour-surface-hover);
    }

    .command-item[data-disabled] {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .command-item-shortcut {
      font-family: var(--font-mono, monospace);
      font-size: var(--font-size-xs);
      color: var(--colour-text-muted);
    }

    .command-separator {
      height: 1px;
      margin: var(--space-1) 0;
      background: var(--colour-border);
    }

    .command-empty {
      padding: var(--space-4);
      text-align: center;
      color: var(--colour-text-muted);
    }

    .command-footer {
      display: flex;
      gap: var(--space-4);
      padding: var(--space-2) var(--space-4);
      border-top: 1px solid var(--colour-border);
      font-size: var(--font-size-xs);
      color: var(--colour-text-muted);
    }

    .command-footer kbd {
      font-family: var(--font-mono, monospace);
      background: var(--colour-surface-hover);
      border: 1px solid var(--colour-border);
      border-radius: var(--radius-sm);
      padding: 0 var(--space-1);
      margin-right: 2px;
    }

    .command-input:focus-visible,
    .command-item:focus-visible {
      outline: 2px solid var(--colour-focus-ring);
      outline-offset: -2px;
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    @media (prefers-reduced-motion: reduce) {
      .command-palette {
        transition: none;
      }
    }
  </style>
  ```

  Implementer MUST verify before finishing:
  - `Command` is a valid named export of `bits-ui` (the AppMenu imports `DropdownMenu` from `bits-ui`; the Dialog wrapper imports `Dialog` from `bits-ui`; confirm `import { Command } from "bits-ui"` resolves - it should, command barrel is part of bits-ui's public exports).
  - Run `mcp__svelte__svelte-autofixer` on this component (CLAUDE.md mandates validating bits-ui components with the Svelte MCP) and fix anything it flags, then re-run it to confirm clean.
  - Confirm `Command.GroupItems` is required as a wrapper for items inside a `Command.Group` (the barrel exports it and the types include `CommandGroupItemsProps`; the spike lists it in the anatomy). If autofixer or runtime indicates items can sit directly in `Command.Group`, keep the structure that bits-ui v2.18.1 actually requires - verify against `node_modules/bits-ui/dist/bits/command/components/command-group.svelte` if unsure.
  - `--shadow-lg`, `--z-dialog`, `--font-size-md`, `--font-mono`, `--radius-sm` are used with fallbacks; verify the token names against `tokens.css` and drop the fallback if the token exists, or keep the fallback if not. Do NOT introduce a hardcoded hex without a token.

- [ ] Type-check + lint. `cd .worktree/Rackula-issue-2212 && npm run check && npm run lint`
      Expected: clean.
- [ ] Commit. `git add -A && git commit -m "feat: CommandPalette component (bits-ui Command in Dialog)"`

---

### Task 8: Mount the palette + wire the top-bar pill + drop the wordmark

**Files**

- Modify: `src/lib/components/DialogOrchestrator.svelte` (mount `<CommandPalette/>`)
- Modify: `src/lib/components/LogoLockup.svelte` (add `showText` prop, hide wordmark when false)
- Modify: `src/lib/components/AppMenu.svelte` (pass `showText={false}`)
- Modify: `src/lib/components/Toolbar.svelte` (add pill after `<AppMenu/>`)

No new unit tests (UI wiring; covered by E2E in Task 9). The existing `src/tests/Toolbar.mobile-actions.test.ts` must keep passing.

**Steps**

- [ ] Mount the palette. In `src/lib/components/DialogOrchestrator.svelte`, add the import alongside the others (`import CommandPalette from "$lib/components/CommandPalette.svelte";`) and render it near the other dialogs (e.g. after `<LoadDialog />`). The component reads `dialogStore.isOpen("commandPalette")` internally, so it is unconditional:
  ```svelte
  <CommandPalette />
  ```
- [ ] Add `showText` to `LogoLockup.svelte`. Extend `Props` and destructure with default true:
  ```ts
  interface Props {
    size?: number;
    celebrate?: boolean;
    partyMode?: boolean;
    showcase?: boolean;
    showText?: boolean;
  }
  let {
    size = 36,
    celebrate = false,
    partyMode = false,
    showcase = false,
    showText = true,
  }: Props = $props();
  ```
  Wrap the title `<svg class="logo-title">...</svg>` block in `{#if showText}...{/if}`. Leave the DRackula prefix logic untouched - it only renders inside the title SVG, so hiding the title hides the prefix too; the dev "D" simply no longer shows in the toolbar trigger, which is acceptable for an icon-only menu button. The existing global rule `:global(.app-menu-trigger) .logo-title { display: block !important; }` (lines 399-402) would override our `{#if}` only if the title still rendered - since we remove it from the DOM with `{#if showText}`, that rule has nothing to act on. Leave that CSS rule as-is (harmless) or remove it; removing it is cleaner - the implementer may delete lines 399-402 since the toolbar no longer wants forced title display. Verify no other consumer relies on it (grep `app-menu-trigger`).
- [ ] In `AppMenu.svelte`, pass `showText={false}` to the lockup (line 71):
  ```svelte
  <LogoLockup size={32} {partyMode} showText={false} />
  ```
  Keep `aria-label="App menu"` and `data-testid="btn-app-menu"` on the trigger button unchanged.
- [ ] Add the pill to `Toolbar.svelte`. Imports: add `IconSearch` to the existing `./icons` import; add `formatShortcut` from `$lib/utils/platform`; add `dialogStore` from `$lib/stores/dialogs.svelte`. Add a derived badge:
  ```ts
  const paletteShortcut = formatShortcut("mod", "K");
  ```
  In the left section, after `<AppMenu .../>` (line 142), add the pill button. Desktop shows icon + text + badge; under `viewportStore.isMobile` collapse to icon-only:
  ```svelte
  <button
    class="command-pill"
    class:command-pill--icon={viewportStore.isMobile}
    type="button"
    aria-label="Search or jump to a command"
    onclick={() => dialogStore.open("commandPalette")}
    data-testid="btn-command-palette"
  >
    <span class="command-pill-icon" aria-hidden="true"
      ><IconSearch size={ICON_SIZE.sm} /></span
    >
    {#if !viewportStore.isMobile}
      <span class="command-pill-text">Search or jump to...</span>
      <span class="command-pill-badge">{paletteShortcut}</span>
    {/if}
  </button>
  ```
  Add styles using tokens only (44/48: use `--touch-target-min` for the icon-only min size, see Risks). Example:
  ```css
  .command-pill {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    height: 32px;
    padding: 0 var(--space-3);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-md);
    background: var(--colour-surface);
    color: var(--colour-text-muted);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition:
      border-color var(--duration-fast) var(--ease-out),
      color var(--duration-fast) var(--ease-out);
  }
  .command-pill:hover {
    border-color: var(--colour-selection);
    color: var(--colour-text);
  }
  .command-pill:focus-visible {
    outline: none;
    box-shadow:
      0 0 0 2px var(--colour-bg),
      0 0 0 4px var(--colour-focus-ring);
  }
  .command-pill--icon {
    width: var(--touch-target-min);
    height: var(--touch-target-min);
    min-width: var(--touch-target-min);
    padding: 0;
    justify-content: center;
  }
  .command-pill-badge {
    font-family: var(--font-mono, monospace);
    font-size: var(--font-size-xs);
    padding: 1px var(--space-1);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
  }
  .command-pill-icon :global(svg) {
    width: var(--icon-size-sm);
    height: var(--icon-size-sm);
  }
  @media (prefers-reduced-motion: reduce) {
    .command-pill {
      transition: none;
    }
  }
  ```
  Do NOT touch the centre (`toolbar-name`) or right (`toolbar-right`) sections.
- [ ] Type-check, lint, run Toolbar regression. `cd .worktree/Rackula-issue-2212 && npm run check && npm run lint && npx vitest run src/tests/Toolbar.mobile-actions.test.ts`
      Expected: clean; Toolbar mobile-actions test still green.
- [ ] Commit. `git add -A && git commit -m "feat: mount palette, add top-bar pill, drop logo wordmark"`

---

### Task 9: E2E coverage

**Files**

- Create: `e2e/command-palette.spec.ts`

Covers the high-value journeys from the constraints: shortcut opens; typing filters; Enter runs a command; Esc closes and focus returns; pill click opens. Reuse `base-test`, `gotoWithRack`, `SMALL_RACK_SHARE`, `PLATFORM_MODIFIER`, `locators`, `clickNewRack`.

**Steps**

- [ ] Write the spec `e2e/command-palette.spec.ts`:

  ```ts
  import { test, expect } from "./helpers/base-test";
  import { gotoWithRack, SMALL_RACK_SHARE, PLATFORM_MODIFIER } from "./helpers";

  test.describe("Command palette", () => {
    test.beforeEach(async ({ page }) => {
      await gotoWithRack(page, SMALL_RACK_SHARE);
    });

    test("Ctrl/Cmd+K opens the palette", async ({ page }) => {
      await page.keyboard.press(`${PLATFORM_MODIFIER}+k`);
      await expect(
        page.getByRole("dialog", { name: "Command palette" }),
      ).toBeVisible({ timeout: 2000 });
      await expect(page.getByTestId("command-palette-input")).toBeFocused();
    });

    test("clicking the top-bar pill opens the palette", async ({ page }) => {
      await page.getByTestId("btn-command-palette").click();
      await expect(
        page.getByRole("dialog", { name: "Command palette" }),
      ).toBeVisible();
    });

    test("typing filters the command list", async ({ page }) => {
      await page.keyboard.press(`${PLATFORM_MODIFIER}+k`);
      const input = page.getByTestId("command-palette-input");
      await input.fill("fit");
      // The fit-all command stays; an unrelated one (share) is filtered out.
      await expect(
        page.getByTestId("command-palette-item-fit-all"),
      ).toBeVisible();
      await expect(page.getByTestId("command-palette-item-share")).toHaveCount(
        0,
      );
    });

    test("Enter runs the highlighted command then closes", async ({ page }) => {
      await page.keyboard.press(`${PLATFORM_MODIFIER}+k`);
      const input = page.getByTestId("command-palette-input");
      // Filter to a single deterministic command, then run it.
      await input.fill("new layout");
      await expect(
        page.getByTestId("command-palette-item-new-layout"),
      ).toBeVisible();
      await page.keyboard.press("Enter");
      // Palette closes; new-layout opens the new-rack wizard dialog.
      await expect(
        page.getByRole("dialog", { name: "Command palette" }),
      ).not.toBeVisible();
    });

    test("Escape closes the palette and returns focus to the page", async ({
      page,
    }) => {
      await page.keyboard.press(`${PLATFORM_MODIFIER}+k`);
      await expect(
        page.getByRole("dialog", { name: "Command palette" }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("dialog", { name: "Command palette" }),
      ).not.toBeVisible();
      // Focus left the (now removed) input; the dialog's focus trap restores it
      // to the document body or the previously focused element, not the input.
      await expect(page.getByTestId("command-palette-input")).toHaveCount(0);
    });

    test("opening the palette closes another open dialog", async ({ page }) => {
      // Open the help dialog first (? shortcut), then Ctrl/Cmd+K must replace it.
      await page.keyboard.press("Shift+Slash");
      await expect(
        page.getByRole("dialog", { name: "About Rackula" }),
      ).toBeVisible();
      await page.keyboard.press(`${PLATFORM_MODIFIER}+k`);
      await expect(
        page.getByRole("dialog", { name: "Command palette" }),
      ).toBeVisible();
      await expect(
        page.getByRole("dialog", { name: "About Rackula" }),
      ).not.toBeVisible();
    });
  });
  ```

  Implementer MUST verify before relying on assertions:
  - `getByTestId` is available (Playwright's built-in `page.getByTestId` uses `data-testid` by default - confirmed the project uses `data-testid` everywhere). If the project configured a different `testIdAttribute`, fall back to `page.locator('[data-testid="..."]')`.
  - The `new-layout` run path: `createActionDispatch()["new-layout"]` = `resetAndOpenNewRack`, which opens the new-rack wizard. Confirm the wizard's dialog title / testid so the "closes" assertion is robust; if `resetAndOpenNewRack` shows a confirm-replace dialog when the layout is dirty (it may, per `app-actions`), pick a command with a side-effect-free, deterministic close instead (e.g. filter to `toggle-display-mode` and assert the palette closed, since that command does not open another dialog). Choose whichever is deterministic against `SMALL_RACK_SHARE`'s loaded (clean) state - a freshly shared layout loads `markClean`, so `resetAndOpenNewRack` should go straight to the wizard, but verify.
  - The `?`-then-Ctrl+K precedence test depends on Task 4's interception running before `shouldIgnoreKeyboard` - it should, since `?` help is a dialog without a focused text field.

- [ ] Run the spec (chromium + webkit). `cd .worktree/Rackula-issue-2212 && npm run test:e2e -- e2e/command-palette.spec.ts`
      Expected: all scenarios pass on both projects. (First run builds + previews per `playwright.config.ts` webServer.)
- [ ] Commit. `git add -A && git commit -m "test: e2e for command palette shell"`

---

### Task 10: Full-suite verification

**Steps**

- [ ] Run the full unit suite. `cd .worktree/Rackula-issue-2212 && npm run test:run`
      Expected: green, including `actions-registry`, `dispatch`, `palette-commands`, `keyboard`, `keyboard-viewport`, `keyboard-palette`, `Toolbar.mobile-actions`, `selection-actions`.
- [ ] Type-check + lint. `cd .worktree/Rackula-issue-2212 && npm run check && npm run lint`
      Expected: clean (no querySelector/toHaveClass/toHaveLength-literal/hardcoded-colour violations in the new tests; the new tests only assert ids/labels/booleans).
- [ ] Run the full e2e keyboard + palette specs together to confirm no regression in shortcut handling. `cd .worktree/Rackula-issue-2212 && npm run test:e2e -- e2e/keyboard.spec.ts e2e/command-palette.spec.ts`
      Expected: green. In particular, `keyboard.spec.ts` "Escape closes dialogs" and "? key opens help dialog" still pass (the palette interception does not steal Escape or `?`).
- [ ] Final commit if anything changed. `git add -A && git commit -m "chore: command palette shell full-suite verification"`

---

## Risks / open questions

- **Decision #5 deviation (no `deps`, no context).** The locked decision specified `createActionDispatch(deps)` threaded through a new Svelte context (`command-dispatch`) because it assumed stores might be per-instance. Verified reality: `getLayoutStore()` and every other `getXStore()` return process-wide singletons (e.g. `getLayoutStore` returns `layoutStoreFacade`), and the App-level callbacks (`maybeSave`, `handleFitAll`, `handleHelp`, ...) are themselves singleton-resolving module functions in `$lib/utils/app-actions` and `$lib/utils/dialog-actions`. So `createActionDispatch()` can resolve everything internally with zero injection, exactly like the existing `selection-actions.ts`/`dialog-actions.ts`. The plan therefore implements `createActionDispatch()` with no args and no context key. This is simpler, still satisfies "build once, both consumers use it" (each consumer calls `createActionDispatch()` and gets identical behaviour because the closures resolve the same singletons), and removes the only piece of context plumbing the decision required. If a reviewer insists on the context key for symmetry, it can be layered on later without changing the dispatch module. **Confirm with the issue author this simplification is acceptable.**

- **Decision #8 tightening: global/layout commands with `enabledWhen` are also gated.** Decision #8 says "global + layout always shown; selection-scoped shown only when enabledWhen passes." The projection additionally hides global/layout commands whose own `enabledWhen` fails (e.g. `share` and `view-yaml` when there are no racks; `undo`/`redo` when there is no history). Showing a command the user cannot run is worse UX and would dispatch a no-op. This is a deliberate, minor tightening, captured in `palette-commands.test.ts` ("gates global commands by their own enabledWhen too"). Flagging so it is not mistaken for a deviation from intent.

- **44px vs 48px touch target.** Decision #1/#4 say "44px" and "44px targets"; the project token is `--touch-target-min: 48px`. The plan uses the token (no hardcoded px, per ESLint hardcoded-value rule and the no-hardcoded-colour/value ethos). Result: the icon-only mobile pill and palette rows are 48px, not 44px. If 44px is a hard requirement, a new token would be needed; recommend accepting 48px (the established mobile target).

- **No search icon existed.** Confirmed `src/lib/components/icons/` has no magnifier; Task 6 adds `IconSearch.svelte` (a standard Phosphor magnifier path). If a specific brand glyph is wanted, swap the path.

- **DRackula dev prefix disappears from the toolbar.** The "D" prefix is rendered only inside the wordmark `<svg class="logo-title">`. Hiding the title with `showText={false}` (Task 8) means the dev "D" no longer shows on the toolbar app-menu trigger. The decision said "keep DRackula/dev behaviour intact if it is text-only - note how": it IS text-only and lives entirely in the hidden wordmark, so it is dropped from the toolbar trigger by design. If the dev indicator must remain visible, it would need to move onto the logo mark or elsewhere - out of scope for #2212; flag for the author.

- **`Command.GroupItems` requirement.** bits-ui v2.18.1 exports `Command.GroupItems` and the plan nests items inside it within `Command.Group`. If the runtime/autofixer shows items may sit directly under `Command.Group` in this version, the implementer should use whatever the library actually requires - verify against the installed component source, do not assume.

- **`Command.Root` filtering vs our projection (no conflict found).** `Command.Root` filters/sorts by the input value over each `Item`'s `value` + `keywords` (default `shouldFilter`). Our projection only decides which commands are _eligible_ (scope/enable gating); the live text filter is bits-ui's. The two compose cleanly: we render eligible items, bits-ui hides the non-matching ones as the user types, so we never call `compute-command-score`. The only caveat: `Item value` is set to the human label (so `textContent` and value agree) and `keywords` carries the registry synonyms; confirm fuzzy matches on both during the E2E "typing filters" test.

### Critical Files for Implementation

- /Users/gvns/code/projects/Rackula/Rackula/.worktree/Rackula-issue-2212/src/lib/actions/registry.ts
- /Users/gvns/code/projects/Rackula/Rackula/.worktree/Rackula-issue-2212/src/lib/components/KeyboardHandler.svelte
- /Users/gvns/code/projects/Rackula/Rackula/.worktree/Rackula-issue-2212/src/lib/components/DialogOrchestrator.svelte
- /Users/gvns/code/projects/Rackula/Rackula/.worktree/Rackula-issue-2212/src/lib/components/Toolbar.svelte
- /Users/gvns/code/projects/Rackula/Rackula/.worktree/Rackula-issue-2212/src/lib/stores/dialogs.svelte.ts
