# Spike #2020 - Codebase research (command palette)

Scope: map the current code the Ctrl+K palette must integrate with. The palette is thin UI over the planned command registry (#2096). Read-only investigation.

## Files Examined

- `src/lib/utils/keyboard.ts` - shortcut matching + `shouldIgnoreKeyboard()` filter
- `src/lib/components/KeyboardHandler.svelte` - global key listener, ~30 hardcoded shortcuts (`getShortcuts()`)
- `src/lib/components/HelpPanel.svelte` - hardcoded `shortcutGroups` (4 groups), bits-ui Dialog
- `src/lib/components/Dialog.svelte` - reusable bits-ui Dialog wrapper (focus trap, Esc, portal)
- `src/lib/components/DialogOrchestrator.svelte` - central dialog/sheet rendering
- `src/lib/stores/dialogs.svelte.ts` - dialog/sheet open state (one dialog at a time)
- `src/lib/components/DevicePalette.svelte` - device library sidebar (Fuse.js search, grouping)
- `src/lib/components/DevicePaletteItem.svelte` - draggable items, double-click/drag placement
- `src/lib/utils/deviceFilters.ts` - Fuse.js fuzzy search, multi-word AND
- `src/lib/stores/layout.svelte.ts` - main layout store (all mutating actions)
- `src/lib/stores/selection.svelte.ts` - selection state (rack/device/group by UUID)
- `src/lib/stores/ui.svelte.ts` - UI prefs, localStorage persistence pattern
- `src/lib/stores/placement.svelte.ts` - tap-to-place mode (mobile)
- `src/lib/utils/app-actions.ts` - file ops (save/load/export/share), fit
- `src/App.svelte` - wiring of keyboard + dialogs + toolbar events
- `package.json` - bits-ui v2.18.1, fuse.js v7.4.2

## Keyboard Handling

- Dispatch: `KeyboardHandler.svelte` binds `svelte:window` `onkeydown`; `handleKeyDown` matches against `getShortcuts()` (a hardcoded list, ~30 entries).
- Filter: `shouldIgnoreKeyboard()` (`keyboard.ts`) skips events from input / textarea / contenteditable. Escape is special-cased so it still fires from fields.
- Existing shortcuts: Esc, ArrowUp/Down (+Shift fine, +Left/Right slot), Delete/Backspace, F (fit), D (toggle sidebar), A (annotations), `[`/`]` (cycle rack), Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y (undo/redo), Ctrl+S / Ctrl+Shift+S (save / save as), Ctrl+O (load), Ctrl+E (export), Ctrl+H (share), Ctrl+D (duplicate), `?` (help), I (display mode), N (annotation column).
- `Ctrl+K` is currently free.

## Help Panel

- `HelpPanel.svelte` renders a hardcoded `shortcutGroups` array (Navigation, General, Editing, File), formatted via `formatShortcut()` for platform (Ctrl vs Cmd).
- Drift problem: shortcuts are declared in `KeyboardHandler` but listed again in `HelpPanel`. Adding one means editing two files. The palette would be a third place. This is what the command registry (#2096) removes - the palette must consume the registry, never hold its own command table.

## App Menu / Toolbar (current, pre-#2072/#2073/#2074)

- `Toolbar.svelte`: left logo lockup (triggers help), centre action cluster (undo/redo/view/fit/export/share), right `FileMenu` (desktop) / mobile quick actions.
- `FileMenu.svelte` (save/load/export/share/import/layouts), `SettingsMenu.svelte` (theme/display mode/annotations/compatible-only).
- Toolbar emits events; `App.svelte` delegates to `app-actions.ts` (`maybeSave`, `maybeExport`, `handleShare`) or opens dialogs via `dialogStore.open()`.

## Devices Palette (search + placement)

- Search engine: Fuse.js v7.4.2 via `searchDevices()` in `deviceFilters.ts`.
  - Keys/weights: model 3, manufacturer 2, slug 1, category 1.
  - `threshold: 0.3`, `ignoreLocation: true`, `includeScore: true`.
  - Multi-word AND: split on whitespace, every token must match some field.
- DevicePalette: `searchQueryRaw`/`searchQuery` debounced 150ms; grouping mode brand/category/flat persisted to localStorage; bits-ui Accordion for groups.
- Placement: drag-to-place (`createPaletteDragData` -> canvas drop -> `layoutStore.placeDevice()`); double-click emits `onselect` (not fully wired to placement); mobile tap-to-place infra in `placement.svelte.ts` (`startPlacement`/`cancelPlacement`) but not wired from double-click.
- Compatibility: active rack width drives `filterPaletteDevicesByRackWidth()`; items show an incompatible reason when not placeable.

## Core Actions / Verbs (what the palette invokes)

- File: `maybeSave()`, `maybeSaveAs()`, `handleLoad()` (dialog), `maybeExport()` -> `handleExport()`, `handleShare()` - all in/around `app-actions.ts`.
- View: `uiStore.toggleDisplayMode()`, `uiStore.toggleAnnotations()`, `uiStore.toggleTheme()`, `canvasStore.fitAll()`. Rear view lives in `layout.settings` (not yet a toggle action).
- Layout/rack: `layoutStore.addRack()`, `duplicateRack()`, `updateRack()` (rename), `setActiveRack()`; rack delete via confirm dialog.
- Device: `placeDeviceRecorded()`, `moveDeviceRecorded()`, `duplicateDevice()`, `updateDeviceFaceRecorded()` (flip), name/notes/ip/colour recorded variants; delete via confirm dialog.
- Selection: `selectionStore.selectRack()`, `selectDevice()`, `clearSelection()`.
- History: `layoutStore.undo()`, `redo()`.

Note: `src/lib/stores/commands/` is the undo/redo Command Pattern, NOT the registry. The registry (#2096) is a separate, new "actions registry" concept.

## Dialog / Overlay Primitives

- `Dialog.svelte` wraps bits-ui `Dialog.Root/Portal/Overlay/Content/Title`: focus trap, Esc-to-close, click-outside, ARIA - all managed by bits-ui.
- `dialogs.svelte.ts`: scalar open state -> only one dialog at a time. Opening the palette should close any open dialog (and vice versa).
- Mobile uses custom bottom "sheets" (not a bits-ui component) via DialogOrchestrator.

## bits-ui combobox/command availability (verified in node_modules)

- bits-ui v2.18.1 ships Dialog, Tabs, Accordion, Tooltip, Popover, Select, Combobox, AND a full `Command` component. Verified at `node_modules/bits-ui/dist/bits/command/`.
- The `Command` component is a Svelte port of cmdk. It exposes: `Command.Root, Input, List, Empty, Group, GroupHeading, GroupItems, Item, LinkItem, Separator, Viewport, Loading`. It ships its own `compute-command-score` (the same command-score fuzzy scorer cmdk uses) and implements the ARIA combobox/listbox model (focus stays on input, `aria-activedescendant` navigation) internally.
- Implication (revised): the palette does NOT need a custom combobox, and does NOT need Fuse.js for command ranking. Compose `bits-ui` `Command.*` inside a `bits-ui` `Dialog` (modal, focus trap, Esc, portal). No new dependency. The accessibility pattern, fuzzy filtering, grouping, and empty state are provided by the component; we supply the command data (from the #2096 registry) and the chrome (mock below).
- Fuse.js stays the device-search engine in the existing Devices sidebar; if a device sub-mode is added to the palette later it can reuse `searchDevices()`, but command-mode ranking uses bits-ui Command's built-in scorer.

## State Stores (selection, persistence, recents)

- Selection: `selection.svelte.ts` module-level `$state` (`selectedType`, `selectedRackId`, `selectedDeviceId` by stable UUID). Palette enables selection-scoped commands from this.
- Persistence: `ui.svelte.ts` uses `safeGetItem`/`safeSetItem` localStorage helpers with validation (e.g. sidebar tab, warn-unsaved, compatible-only). Same pattern fits a recents store.
- Recents: none today. Options - localStorage MRU list of command ids (recommended), or derive "last action" from undo history. Recents must be a separate concern from undo.
- Feedback: `toast.svelte.ts` `showToast()` for command confirmation.

## Integration Points for the Palette

1. Register `Ctrl+K` (and `Cmd+K`) as a global command that opens the palette.
2. Read command set, labels, shortcuts, scope, and enabled-when from the registry (#2096).
3. Command-mode ranking comes from bits-ui Command's built-in scorer; Fuse.js is reused only for the optional device sub-mode.
4. Render inside a bits-ui Dialog (focus trap, Esc, portal); mobile -> bottom sheet.
5. Selection-scoped commands gate on `selectionStore`.
6. Optional recents via the `ui.svelte.ts` localStorage pattern.

## Constraints / Gotchas

1. `shouldIgnoreKeyboard()` suppresses shortcuts while typing in a field. `Ctrl+K` should open the palette even from a field (like Esc is special-cased), but inside the palette's own input the global handler must be inert.
2. Shortcut list currently lives in two places (handler + HelpPanel). Palette must not add a third - consume the registry.
3. Selection-aware commands need an `enabled-when` predicate per command.
4. Device placement has two paths (drag, tap). A palette "place device" should reuse `placement.startPlacement()` rather than invent a third.
5. One dialog at a time - opening the palette closes other dialogs.
6. Mobile needs larger targets / bottom-sheet layout; `viewportStore.isMobile` exists.
7. Svelte 5 runes only - palette state is `$state`, no Svelte 4 stores.
8. Don't conflate the undo `Command` pattern with registry command entries.
