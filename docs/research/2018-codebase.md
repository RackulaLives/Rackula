# Spike #2018 - Codebase Exploration

Current state of the layout, storage, keyboard, and UI subsystems that the tabs
interaction model must build on. Read-only exploration; file:line references are accurate as
of the spike branch base (origin/main).

## Layout model and store

- `src/lib/stores/layout.svelte.ts` - `createLayoutStore()` (around line 138) builds a
  reactive store instance owning `layout`, `isDirty`, `changesSinceExport`, `hasEverExported`,
  `hasStarted`, `activeRackId`. Methods: `createNewLayout`, `loadLayout`, `resetLayout`,
  `setLayoutName`, rack ops (`addRack`/`deleteRack`/`updateRack`/`reorderRacks`/`duplicateRack`/
  `setActiveRack`/`getRackById`), dirty tracking (`markDirty`/`markClean`/`markExported`).
- `getLayoutStore()` (around line 1215) returns a single `activeInstance`. Today there is
  one layout at a time. A code comment (~line 136) states the instance design is "what the
  multi-layout workspace (#2017) will use to open layouts as tabs."
- Net-new for tabs: a registry of layout-store instances keyed by layout id, an active-id
  pointer, and tab metadata (order, dirty rollup). No "open set" or tab state exists yet.

## Storage layer (browser vs server)

- `src/lib/storage/availability.svelte.ts` - `getStorageMode()` returns `"browser" | "server"`
  read from `window.__RACKULA_CONFIG__.storage`. Mode is explicit, not probed (probe-and-
  guess removed in #2037 / commit a3c7ddc0 era).
- `src/lib/storage/api.ts` - server CRUD by UUID: `listSavedLayouts`, `loadSavedLayout(uuid)`,
  `saveLayoutToServer`, `deleteSavedLayout`. Layout routing is by `metadata.id` (UUID), not
  name.
- `src/lib/storage/working-copy.ts` - browser working copy in localStorage key
  `"Rackula:autosave"`, wrapped as `SessionData { layout, savedAt, changesSinceExport,
  hasEverExported, storageMode }`. `loadSessionWithTimestamp()` restores it; timestamps detect
  browser<->server mode flips. One working copy today (single layout).
- `src/lib/storage/manager.svelte.ts` - autosave debounce: browser ~1000ms, server ~2000ms
  when API healthy.
- Net-new for tabs (browser): per-layout working-copy slots. Owned by #2179, not this spike.

## Keyboard handling

- `src/lib/components/KeyboardHandler.svelte` - central registry in `getShortcuts()`
  (~line 79-300), dispatched by `handleKeyDown()` (~line 505). Each Ctrl binding is duplicated
  as a Meta binding for mac.
- Current bindings: Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z + Ctrl/Cmd+Y redo, Ctrl/Cmd+S save,
  Ctrl/Cmd+Shift+S save-as-zip, Ctrl/Cmd+O load, Ctrl/Cmd+E export, Ctrl/Cmd+H share,
  Ctrl/Cmd+D duplicate, `?` help, `I` display mode, `A` annotations, `F` fit all, `D` toggle
  sidebar, `[`/`]` cycle rack, Delete/Backspace delete, Escape clear/close, arrows move,
  Shift+arrows fine-move, Left/Right slot move.
- `src/lib/utils/keyboard.ts` - `matchesShortcut()` (~line 40-83) handles cross-platform
  Ctrl/Meta. `src/lib/utils/platform.ts` - `isMacOS()`, `getModifierLabels()`,
  `formatShortcut()` (mac "Cmd"/"Option" vs "Ctrl"/"Alt").
- No Alt-key bindings exist today - Alt+1-9 (tab switching) and any Alt-based close binding
  are net-new and uncontested.
- `src/lib/components/HelpPanel.svelte` - the `?` cheatsheet. Shortcut list is hardcoded
  (~line 144-184), maintained separately from KeyboardHandler. #2096 (command registry) will
  generate it; the new map should be authored in registry-friendly shape.

## Sidebar / Layouts library / StartScreen

- `src/lib/components/StartScreen.svelte` - launch splash (new layout / import / saved-layouts
  list). #2081 removes it; functions move to the sidebar Layouts tab + app menu.
- `src/lib/components/LoadDialog.svelte` - manual load (file import + server list + delete).
- `src/lib/components/Sidebar.svelte` + `SidebarTabs.svelte` - generic sidebar; `SidebarTabs`
  uses bits-ui Tabs (Devices/Racks) with selection persisted to localStorage via
  `ui.svelte.ts`. This is the working bits-ui Tabs pattern to follow.

## Twin-tab / multi-window

- No existing BroadcastChannel, storage-event guard, Web Locks, or "Reload" action. #2044
  is unimplemented. Today each browser tab edits its own `"Rackula:autosave"` independently,
  last-write-wins, no cross-tab awareness.

## Reusable UI patterns

- `src/lib/components/ConfirmDialog.svelte` - bits-ui Dialog wrapper; props `open`, `title`,
  `message`, `confirmLabel`, `cancelLabel`, `destructive`, callbacks. (`ConfirmReplaceDialog`
  is the save-first variant.)
- `src/lib/stores/toast.svelte.ts` + `Toast.svelte` / `ToastContainer.svelte` -
  `showToast(message, type, duration, action?)`; types success/error/warning/info; optional
  action button; auto-dismiss.
- First-run notice pattern: `src/App.svelte` (~line 177-205) - browser-mode one-time toast
  gated by localStorage flag `"rackula.browserMode.firstRunSeen"`, deduped via
  `showStorageToast()`. Directly reusable for the close-vs-delete first-run hint.
- Menus: `src/lib/components/ui/ContextMenu/` exists (bits-ui) but is unused - available
  for the tab overflow chevron, or a Popover. `ui/Accordion` used by DevicePalette.
- Drag/reorder: `src/lib/utils/dragdrop.ts` (drag data, drop calc, `currentDragData` shared
  state), `src/lib/stores/dragTooltip.svelte` (visual feedback), DND tokens
  `--colour-dnd-valid` / `--colour-dnd-invalid`. Rack reorder precedent:
  `src/lib/stores/layout/rack-actions.ts` `reorderRacks()`. Tab reorder should mirror this.

## Gaps (net-new for the tabs feature)

1. Layout-store registry + active pointer + tab metadata (order, per-tab dirty).
2. Tab strip UI (open set), overflow chevron, drag-reorder, inactive-only dot.
3. Close-vs-delete affordance + first-run hint + the single browser-never-backed-up confirm.
4. Persisted open-set + lazy restore on launch (shells before focus).
5. Deleted/rename-while-open handling (orphan + title sync + disambiguation).
6. Twin-tab per-layout guard + at-most-one-editable-tab invariant + Reload (#2044).
7. Per-layout browser working-copy slots (#2179, referenced only).
8. Command-registry-shaped keyboard map feeding HelpPanel (#2096).
