# Command Palette Recents and Selection-Aware Empty State (#2213) Implementation Plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development

## Goal

Make the command palette open useful rather than blank. Add two behaviours bits-ui Command does not provide: a small MRU recents list persisted to localStorage, and a selection-aware empty state shown before the user types (Recent, then the current selection's verbs, then a short grouped command list, never blank). When a query is present, the existing flat ranked list from #2212 is retained so bits-ui Command's built-in fuzzy filter ranks across everything.

## Architecture

The palette is a pure projection of the actions registry (`ACTION_REGISTRY`). #2212 added `getPaletteCommands(ctx)` (one flat grouped list, gated by `enabledWhen`) and `CommandPalette.svelte` (bits-ui `Command.*` inside bits-ui `Dialog.*`). #2213 extends that seam without changing the registry:

1. A new module-singleton runes store `palette-recents.svelte.ts` records executed command ids (MRU, dedupe, cap 5) and persists them through the existing `safeGetItem`/`safeSetItem` helpers in `$lib/utils/safe-storage`. Untrusted stored data is validated on load: array-of-strings, filtered to ids that exist in the registry (`getActionById`), capped to 5, tolerant of malformed/oversized/missing data.
2. `CommandPalette.svelte`'s `run(id)` calls `recordCommand(id)` before closing, so only palette-run commands are recorded.
3. A new pure function `getPaletteEmptyState(ctx, recentIds)` in `palette-commands.ts` projects the three empty-state sections. It reuses the existing `isIncluded` gating so recents that became excluded or whose `enabledWhen` now fails are dropped, and de-duplicates the grouped list against recent/selection. This stays pure and unit-testable (the seam #2214 will extend).
4. `CommandPalette.svelte` renders three sections when `search` is empty (Recent, Selection, Commands), all inside one `Command.List` so bits-ui keyboard nav and the combobox/listbox a11y model are preserved; it renders the existing flat `getPaletteCommands` list when `search` is non-empty.

### Key verified facts (real API)

- `safeGetItem`/`safeSetItem` live in `src/lib/utils/safe-storage.ts`, NOT in `ui.svelte.ts` (the issue text is imprecise; `ui.svelte.ts` imports them). Signatures:
  - `safeGetItem(key: string, type: StorageType = "local"): string | null`
  - `safeSetItem(key: string, value: string, type: StorageType = "local"): boolean`
  - The validation-on-load pattern lives in the `ui.svelte.ts` `load*FromStorage` functions (e.g. `loadSidebarTabFromStorage` reads `safeGetItem`, validates, falls back to a default). The recents store mirrors this.
- `getActionById(id): ActionDefinition | undefined` exists in `registry.ts` and is the registry-existence check for validation.
- Selection-scoped actions and their `enabledWhen`: `delete-selection` (`hasSelection`), `move-device-up`/`move-device-down`/`flip-device-face` (`isDeviceSelected`), `duplicate-selection` (`isDeviceSelected || isRackSelected`), `focus-rack`/`export-rack` (`isRackSelected`). All `scope: "selection"`.
- `palette-commands.ts` exports `PaletteCommand` (`{ id; label; shortcut?; keywords }`), `PaletteCommandGroup` (`{ heading; commands }`), `getPaletteCommands(ctx)`, with module-private `EXCLUDED`, `GROUP_ORDER`, `groupOf`, `shortcutOf`, `isIncluded`. Reuse `isIncluded` and `shortcutOf`; extract a `toPaletteCommand(action)` helper.
- `CommandPalette.svelte` derives `ctx`, `groups = getPaletteCommands(ctx)`, `let search = $state("")`, `run(id)` (sets `search=""`, `dialogStore.close()`, `dispatch[id]?.()`), `handleOpenChange`. Items use `value={command.label}`, `keywords={command.keywords}`, `onSelect`, `data-testid={`command-palette-item-${command.id}`}`.
- Vitest uses happy-dom + vite-plugin-svelte (so `.svelte.ts` runes compile, `localStorage` available). Store tests reset module state via an exported `reset*` that re-reads storage (`resetSelectionStore`, `resetUIStore`); the recents store exports `resetPaletteRecents()`.
- `selectedType` includes `"group"` (multi-select). No `bay-together` action exists yet; the Selection block surfaces only selection-scoped actions that exist and pass `enabledWhen`. Do not invent a bay action.
- E2E: `e2e/command-palette.spec.ts` uses `gotoWithRack(page, SMALL_RACK_SHARE)`, `PLATFORM_MODIFIER`, `getByTestId`, `getByRole("dialog", { name: "Command palette" })`. `selectDevice(page, index=0)` selects a placed device. `SMALL_RACK_SHARE` has a rack but no placed device; use `RACK_WITH_DEVICE_SHARE` for the selection test (verify it carries a device, else place one via `dragDeviceToRack`).

## Tech Stack

- Svelte 5 runes (`$state`, `$derived`); TypeScript strict; no new dependencies.
- Vitest + happy-dom for unit; Playwright for E2E.
- CSS via design tokens only; no hardcoded colours.
- Testing rules (ESLint hard-blocks): no `querySelector`, no `toHaveClass`, no `toHaveLength(literal)` without justified disable, no hardcoded colours. Test pure logic and user-visible behaviour only.

## File Structure

- `src/lib/stores/palette-recents.svelte.ts` (new): MRU recents store. `recordCommand(id)`, `getRecents()`, `getPaletteRecents()`, `resetPaletteRecents()`. Persists validated command-id arrays via safe-storage.
- `src/lib/actions/palette-commands.ts` (modified): add pure `getPaletteEmptyState(ctx, recentIds)` returning `{ recent, selection, commands }`; extract a `toPaletteCommand(action)` helper reused by both projections.
- `src/lib/components/CommandPalette.svelte` (modified): wire `recordCommand(id)` into `run`; derive empty-state sections; render Recent / Selection / Commands when `search` is empty, flat grouped list when non-empty; add section + per-item testids.
- `src/tests/palette-recents.test.ts` (new): unit tests for the recents store (MRU, dedupe, cap-at-5, persist/load roundtrip, ignores unknown/malformed/oversized stored ids).
- `src/tests/palette-commands.test.ts` (modified): add `getPaletteEmptyState` unit tests (recent filtered to enabled + MRU order; selection only enabled verbs; never-blank fallback; no duplication).
- `e2e/command-palette.spec.ts` (modified): add E2E for recents-after-run, selection block on device selection, never-blank empty state.

---

### Task 1: Recents store (pure, persisted)

Create `src/lib/stores/palette-recents.svelte.ts` as a module singleton like `selection.svelte.ts`: module-level `$state`, an initial load from storage at import, and a `resetPaletteRecents()` that re-reads storage (mirroring `resetSelectionStore`/`resetUIStore` so tests can isolate state and exercise the load path).

- [ ] Write the failing test file `src/tests/palette-recents.test.ts`. Reset between tests with `localStorage.clear()` then `resetPaletteRecents()`. Behaviour only:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import {
  getRecents,
  recordCommand,
  resetPaletteRecents,
} from "$lib/stores/palette-recents.svelte";
import { safeSetItem } from "$lib/utils/safe-storage";

const KEY = "rackula:palette:recents";

beforeEach(() => {
  localStorage.clear();
  resetPaletteRecents();
});

describe("palette recents store", () => {
  it("records an executed command id", () => {
    recordCommand("fit-all");
    expect(getRecents()).toEqual(["fit-all"]);
  });

  it("moves a re-run command to the front (MRU) without duplicating", () => {
    recordCommand("fit-all");
    recordCommand("share");
    recordCommand("fit-all");
    expect(getRecents()).toEqual(["fit-all", "share"]);
  });

  it("caps the list at five most-recent ids", () => {
    recordCommand("fit-all");
    recordCommand("share");
    recordCommand("export");
    recordCommand("undo");
    recordCommand("redo");
    recordCommand("toggle-display-mode");
    expect(getRecents()).toEqual([
      "toggle-display-mode",
      "redo",
      "undo",
      "export",
      "share",
    ]);
  });

  it("persists recents across a store reset (load roundtrip)", () => {
    recordCommand("share");
    recordCommand("fit-all");
    resetPaletteRecents();
    expect(getRecents()).toEqual(["fit-all", "share"]);
  });

  it("drops unknown ids that are not in the registry on load", () => {
    safeSetItem(KEY, JSON.stringify(["fit-all", "not-a-real-command"]));
    resetPaletteRecents();
    expect(getRecents()).toEqual(["fit-all"]);
  });

  it("tolerates malformed stored JSON without throwing", () => {
    safeSetItem(KEY, "{not json");
    resetPaletteRecents();
    expect(getRecents()).toEqual([]);
  });

  it("tolerates a stored value that is not an array of strings", () => {
    safeSetItem(KEY, JSON.stringify({ a: 1 }));
    resetPaletteRecents();
    expect(getRecents()).toEqual([]);
    safeSetItem(KEY, JSON.stringify([1, 2, 3]));
    resetPaletteRecents();
    expect(getRecents()).toEqual([]);
  });

  it("caps an oversized stored array to five on load", () => {
    safeSetItem(
      KEY,
      JSON.stringify([
        "toggle-display-mode",
        "redo",
        "undo",
        "export",
        "share",
        "fit-all",
      ]),
    );
    resetPaletteRecents();
    // eslint-disable-next-line no-restricted-syntax -- behavioural invariant: load caps at 5
    expect(getRecents()).toHaveLength(5);
    expect(getRecents()).not.toContain("fit-all");
  });
});
```

- [ ] Run red: `cd /Users/gvns/code/projects/Rackula/Rackula/.worktree/Rackula-issue-2213 && npx vitest run src/tests/palette-recents.test.ts` (fails: module missing).

- [ ] Implement `src/lib/stores/palette-recents.svelte.ts`:

```typescript
/**
 * Palette recents store: an MRU of the last few command ids actually executed
 * from the command palette (#2213). Recents are a separate concern from undo
 * history; they record "what command did the user run", not document state.
 *
 * Persisted via the existing safe-storage helpers. On load the stored value is
 * untrusted: it is validated to an array of strings, filtered to ids that exist
 * in the registry, and capped, tolerating malformed/oversized/missing data.
 */
import { getActionById, type ActionId } from "$lib/actions/registry";
import { safeGetItem, safeSetItem } from "$lib/utils/safe-storage";

const RECENTS_KEY = "rackula:palette:recents";
const MAX_RECENTS = 5;

function sanitise(parsed: unknown): ActionId[] {
  if (!Array.isArray(parsed)) return [];
  const result: ActionId[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "string") continue;
    const action = getActionById(entry as ActionId);
    if (!action) continue;
    if (result.includes(action.id)) continue;
    result.push(action.id);
    if (result.length >= MAX_RECENTS) break;
  }
  return result;
}

function loadFromStorage(): ActionId[] {
  const raw = safeGetItem(RECENTS_KEY);
  if (raw === null) return [];
  try {
    return sanitise(JSON.parse(raw));
  } catch {
    return [];
  }
}

let recents = $state<ActionId[]>(loadFromStorage());

function persist(): void {
  safeSetItem(RECENTS_KEY, JSON.stringify(recents));
}

/** Record a command id as just executed: move-to-front, dedupe, cap at 5. */
export function recordCommand(id: ActionId): void {
  recents = [id, ...recents.filter((existing) => existing !== id)].slice(
    0,
    MAX_RECENTS,
  );
  persist();
}

/** Snapshot of current recents (MRU order, newest first). */
export function getRecents(): ActionId[] {
  return recents;
}

/** Reactive getter for components. */
export function getPaletteRecents() {
  return {
    get recents() {
      return recents;
    },
  };
}

/** Reset the store from storage (primarily for testing). */
export function resetPaletteRecents(): void {
  recents = loadFromStorage();
}
```

- [ ] Run green: `npx vitest run src/tests/palette-recents.test.ts`.
- [ ] Lint: `npm run lint`.
- [ ] Commit: `git add src/lib/stores/palette-recents.svelte.ts src/tests/palette-recents.test.ts && git commit -m "feat: add palette recents MRU store (#2213)"`

---

### Task 2: Empty-state projection (pure)

Extend `palette-commands.ts` with `getPaletteEmptyState`. Reuse `isIncluded` (applies `EXCLUDED` + `enabledWhen`) and `shortcutOf`. Extract `toPaletteCommand(action)` from the existing inline build in `getPaletteCommands` so both projections share the shape.

- [ ] Append failing tests to `src/tests/palette-commands.test.ts` (use existing `baseCtx`):

```typescript
import { getPaletteEmptyState } from "$lib/actions/palette-commands";
import type { ActionId } from "$lib/actions/registry";

function emptyStateIds(
  ctx: ActionEnabledContext,
  recents: ActionId[],
): { recent: string[]; selection: string[]; commands: string[] } {
  const state = getPaletteEmptyState(ctx, recents);
  return {
    recent: state.recent.map((c) => c.id),
    selection: state.selection.map((c) => c.id),
    commands: state.commands.flatMap((g) => g.commands.map((c) => c.id)),
  };
}

describe("getPaletteEmptyState", () => {
  it("maps recents to commands in MRU order", () => {
    expect(emptyStateIds(baseCtx, ["share", "fit-all"]).recent).toEqual([
      "share",
      "fit-all",
    ]);
  });

  it("drops recents that are not currently included (enabledWhen fails)", () => {
    expect(
      emptyStateIds({ ...baseCtx, hasRacks: false }, ["share", "fit-all"])
        .recent,
    ).toEqual(["fit-all"]);
  });

  it("drops recents that are excluded from the palette", () => {
    const { recent } = emptyStateIds(baseCtx, ["command-palette", "fit-all"]);
    expect(recent).not.toContain("command-palette");
    expect(recent).toContain("fit-all");
  });

  it("surfaces only the enabled selection verbs for a selected device", () => {
    const ctx = { ...baseCtx, hasSelection: true, isDeviceSelected: true };
    const { selection } = emptyStateIds(ctx, []);
    expect(selection).toContain("duplicate-selection");
    expect(selection).toContain("move-device-up");
    expect(selection).toContain("delete-selection");
    expect(selection).not.toContain("focus-rack");
    expect(selection).not.toContain("export-rack");
  });

  it("shows no selection verbs when nothing is selected", () => {
    expect(emptyStateIds(baseCtx, []).selection).toEqual([]);
  });

  it("is never blank: commands list is non-empty with no recents or selection", () => {
    expect(emptyStateIds(baseCtx, []).commands.length).toBeGreaterThan(0);
  });

  it("does not duplicate an id across recent/selection and the commands list", () => {
    const ctx = { ...baseCtx, hasSelection: true, isDeviceSelected: true };
    const { recent, selection, commands } = emptyStateIds(ctx, ["fit-all"]);
    for (const id of [...recent, ...selection]) {
      expect(commands).not.toContain(id);
    }
  });
});
```

- [ ] Run red: `npx vitest run src/tests/palette-commands.test.ts` (fails: `getPaletteEmptyState` not exported).

- [ ] Implement in `src/lib/actions/palette-commands.ts`:

```typescript
function toPaletteCommand(action: ActionDefinition): PaletteCommand {
  return {
    id: action.id,
    label: action.label,
    shortcut: shortcutOf(action),
    keywords: action.keywords ?? [],
  };
}

export interface PaletteEmptyState {
  recent: PaletteCommand[];
  selection: PaletteCommand[];
  commands: PaletteCommandGroup[];
}

/**
 * Project the palette empty state (before typing): Recent, the current
 * selection's verbs, then a short grouped command list. Never blank: the
 * grouped list always carries the remaining included commands even when recent
 * and selection are empty. Pure and unit-testable (#2214 extends this).
 */
export function getPaletteEmptyState(
  ctx: ActionEnabledContext,
  recentIds: ActionId[],
): PaletteEmptyState {
  const recent: PaletteCommand[] = [];
  for (const id of recentIds) {
    const action = ACTION_REGISTRY.find((a) => a.id === id);
    if (!action || !isIncluded(action, ctx)) continue;
    recent.push(toPaletteCommand(action));
  }

  const selection: PaletteCommand[] = [];
  for (const action of ACTION_REGISTRY) {
    if (action.scope !== "selection") continue;
    if (!isIncluded(action, ctx)) continue;
    selection.push(toPaletteCommand(action));
  }

  const shown = new Set<ActionId>([
    ...recent.map((c) => c.id),
    ...selection.map((c) => c.id),
  ]);
  const commands = getPaletteCommands(ctx)
    .map((group) => ({
      heading: group.heading,
      commands: group.commands.filter((c) => !shown.has(c.id)),
    }))
    .filter((group) => group.commands.length > 0);

  return { recent, selection, commands };
}
```

Refactor `getPaletteCommands`'s inner object literal to `const command = toPaletteCommand(action);`.

- [ ] Run green: `npx vitest run src/tests/palette-commands.test.ts`.
- [ ] Lint: `npm run lint`.
- [ ] Commit: `git add src/lib/actions/palette-commands.ts src/tests/palette-commands.test.ts && git commit -m "feat: add selection-aware palette empty-state projection (#2213)"`

---

### Task 3: CommandPalette.svelte wiring

Record on run, derive the empty state, render three sections when `search` is empty and the existing flat list when non-empty.

Recording scope: record ONLY palette-run commands (in `run(id)`), not keyboard-invoked actions. Justification: the keyboard path is a separate dispatch consumer; recording it would surface non-palette muscle-memory commands (Undo, Escape) and couple #2213 to KeyboardHandler.

Testid scheme: Recent rows `command-palette-recent-item-<id>`; Selection rows `command-palette-selection-item-<id>`; Commands rows and the flat list reuse `command-palette-item-<id>` (Commands excludes recent/selection ids and only coexists with them in the empty state, so no duplication within one render). Section markers `command-palette-recent` and `command-palette-selection`.

- [ ] In the `<script>`: add imports and derived state:

```typescript
import {
  getPaletteCommands,
  getPaletteEmptyState,
} from "$lib/actions/palette-commands";
import { recordCommand, getRecents } from "$lib/stores/palette-recents.svelte";
```

After `const groups = $derived(getPaletteCommands(ctx));`:

```typescript
const showEmptyState = $derived(search.trim() === "");
const emptyState = $derived(getPaletteEmptyState(ctx, getRecents()));
```

- [ ] Update `run`:

```typescript
function run(id: ActionId) {
  recordCommand(id);
  search = "";
  dialogStore.close();
  dispatch[id]?.();
}
```

- [ ] Replace the body inside `<Command.Viewport>` with the empty-state sections (`{#if showEmptyState}`) and the flat list (`{:else}`). Recent and Selection use `Command.Group`/`Command.GroupHeading`/`Command.GroupItems`/`Command.Item` (so bits-ui registers them as navigable items); `Command.Empty` stays for the no-match case. Recent group carries `data-testid="command-palette-recent"`, its items `command-palette-recent-item-<id>`; Selection group `data-testid="command-palette-selection"`, items `command-palette-selection-item-<id>`; Commands groups and the `{:else}` flat list keep `command-palette-item-<id>`. Insert a `Command.Separator` between sections when a prior section rendered. (Full markup per the component's existing item structure; reuse `.command-group`, `.command-group-heading`, `.command-item`, `.command-separator`, `.command-item-label`, `.command-item-shortcut` classes; NO new CSS.)

- [ ] Validate with the Svelte MCP autofixer (`mcp__svelte__svelte-autofixer`); fix + re-run until clean.
- [ ] Verify exports resolve + behaviour: `npx vitest run src/tests/palette-commands.test.ts src/tests/palette-recents.test.ts`.
- [ ] Lint: `npm run lint` (+ `npm run check` if present).
- [ ] Commit: `git add src/lib/components/CommandPalette.svelte && git commit -m "feat: record palette recents and render selection-aware empty state (#2213)"`

---

### Task 4: E2E coverage

Add three tests to `e2e/command-palette.spec.ts`. localStorage is fresh per Playwright context so Recent starts empty.

- [ ] Recents-after-run (use `fit-all`, no secondary dialog):

```typescript
test("a command run from the palette appears under Recent on reopen", async ({
  page,
}) => {
  await page.keyboard.press(`${PLATFORM_MODIFIER}+k`);
  await page.getByTestId("command-palette-input").fill("fit all");
  await expect(page.getByTestId("command-palette-item-fit-all")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("dialog", { name: "Command palette" }),
  ).not.toBeVisible();

  await page.keyboard.press(`${PLATFORM_MODIFIER}+k`);
  await expect(page.getByTestId("command-palette-recent")).toBeVisible();
  await expect(
    page.getByTestId("command-palette-recent-item-fit-all"),
  ).toBeVisible();
});
```

- [ ] Selection block (use a fixture/placed device + `selectDevice`). Update the spec's top import to include `RACK_WITH_DEVICE_SHARE` and `selectDevice` (verify the fixture carries a device; else `dragDeviceToRack` after `gotoWithRack(SMALL_RACK_SHARE)`):

```typescript
test("selecting a device surfaces its verbs in the Selection block", async ({
  page,
}) => {
  await gotoWithRack(page, RACK_WITH_DEVICE_SHARE);
  await selectDevice(page, 0);
  await page.keyboard.press(`${PLATFORM_MODIFIER}+k`);
  await expect(page.getByTestId("command-palette-selection")).toBeVisible();
  await expect(
    page.getByTestId("command-palette-selection-item-duplicate-selection"),
  ).toBeVisible();
  await expect(
    page.getByTestId("command-palette-selection-item-delete-selection"),
  ).toBeVisible();
});
```

- [ ] Never-blank:

```typescript
test("the empty palette is never blank", async ({ page }) => {
  await page.keyboard.press(`${PLATFORM_MODIFIER}+k`);
  await expect(
    page.getByRole("dialog", { name: "Command palette" }),
  ).toBeVisible();
  await expect(page.getByTestId("command-palette-item-fit-all")).toBeVisible();
  await expect(page.getByText("No matching commands")).toHaveCount(0);
});
```

- [ ] Run: `npm run test:e2e -- e2e/command-palette.spec.ts` (all existing + 3 new pass).
- [ ] Full unit suite: `npm run test:run`.
- [ ] Commit: `git add e2e/command-palette.spec.ts && git commit -m "test: e2e for palette recents and selection-aware empty state (#2213)"`

---

## Risks / open questions

- safe-storage location: helpers are in `src/lib/utils/safe-storage.ts`, not `ui.svelte.ts` (issue wording imprecise). Plan imports from `$lib/utils/safe-storage`, same as `ui.svelte.ts`.
- Recording scope: recents recorded only in `CommandPalette.run(id)`, not on keyboard invocations (justified above). If product later wants all executed commands, move the hook into the dispatch/keyboard path (out of scope here).
- bits-ui filtering vs custom sectioning: empty-state and flat list are mutually exclusive (`{#if showEmptyState}{:else}`), so the same id is never mounted twice and the filter only ranks the flat list. Keep the mutual exclusion.
- Cross-section keyboard nav: Recent/Selection/Commands are real `Command.Group`s so every row is a navigable `Command.Item`, preserving the combobox/listbox a11y model (#2099/#2100). Verify bits-ui v2.18.1 forwards `data-testid` on `Command.Group`; if not, put the section testid on `Command.GroupHeading` or rely on the per-item section-prefixed testids.
- Testid duplication: Commands excludes ids in Recent/Selection and only coexists with them in the empty state, so `command-palette-item-<id>` never duplicates in one render; #2212 selectors stay valid.
- `getRecents()` reactivity: returns the module `$state` array read inside a `$derived`, so it tracks; the palette also remounts per open. If the derived does not update, use `getPaletteRecents().recents`.
- `RACK_WITH_DEVICE_SHARE` contents: the selection E2E assumes a placed device; verify against `e2e/helpers` at execution, else place one via `dragDeviceToRack`.
