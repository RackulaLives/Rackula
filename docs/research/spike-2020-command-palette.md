# Spike #2020: Command palette

Date: 2026-06-13 Epic: #2017 (Canvas UX Overhaul) Milestone: M14 Status: complete (build-later, non-blocking)

Supporting research: `2020-codebase.md`, `2020-external.md`, `2020-patterns.md`. Mock: `spike-2020-palette-mock.svg`.

---

## Executive summary

Build the command palette as command-first thin UI over the command registry (#2096), by composing the `Command` component that bits-ui v2.18.1 already ships (a Svelte port of cmdk, with the ARIA combobox/listbox model and the cmdk fuzzy scorer built in) inside the existing bits-ui `Dialog`. No new dependency, no custom accessibility code, no second command list to maintain.

Invoke with Ctrl+K (Cmd+K on macOS), and always pair it with a visible "Search or jump to..." pill in the top bar, because Ctrl+K interception is reliable but not universal (Chrome/Edge on Windows can steal it) and the palette must never be the sole path to a command. The registry guarantees that: menu, verb bars, keyboard handler, help overlay, and palette are all projections of one source, so the palette adds reach, not commands.

Behaviour: built-in fuzzy ranking plus keyword aliases; a small MRU recents list; and selection-aware contextual commands. The empty state shows recents, then the current selection's verbs, then a short grouped command list. Device search and placement stay in the Devices sidebar; a palette "Add device..." sub-mode is an optional later follow-on, not v1.

This sequences after #2096 (registry), #2073 (menu), and #2075 (verb bars).

---

## Recommendations per spike question

### Scope

Command-first, sourced from the #2096 registry and projected by its `scope` field (global / layout / selection):

- File / frame: new, open, import devices, import from NetBox, new custom device, export image, export backup, share, view YAML; Save / Save As in the server build.
- View: display mode, annotations, rear view, fit all, theme (a command even though its canonical home is the Settings gear).
- Layout: switch to an open layout, new layout (lands with tabs).
- Selection verbs (gated by enabled-when): device move/flip/duplicate/delete/slot; rack duplicate/focus/export/delete; multi-select bay together.

Device search + placement is NOT in the top-level list. Mature tools separate run-a-command from find/insert-an-entity (VS Code Palette vs Quick Open, Notion Cmd+K vs `/`, Figma quick actions). The Devices sidebar stays canonical; an "Add device..." sub-mode (pushed sub-page reusing `searchDevices()` + `placement.startPlacement()`) is an optional later add, never interleaved into the command list.

### Invocation and discoverability

- Primary: Ctrl+K / Cmd+K. Platform-correct glyph. Bind on keydown, capture phase, preventDefault + stopPropagation. Opens even from a focused field (special-cased like Escape); the global handler is inert inside the palette input.
- Verified caveat: Chrome/Edge on Windows can steal Ctrl+K to the address bar in some states; interception is ~95%+ once the app has focus. Mitigations: never make it the only path, document it, and plan a rebind escape hatch (and/or a documented alternate) as a later enhancement.
- Secondary (required): a "Search or jump to..." pill in the top bar's reserved slot (#2072) with the shortcut badge printed inside it. Also listed in the `?` help overlay (auto-generated from the registry). No mandatory coachmark.

### Relationship to the menu

The palette is an accelerator, never the sole path. Save, Share, Export and all other commands stay reachable from the lean app menu (#2073), canvas controls, and side panel. Structurally guaranteed by #2096: every surface is a projection of one registry, so they cannot drift and the palette cannot own a command no other surface exposes.

### Behaviour

- Fuzzy: bits-ui Command's built-in `compute-command-score`; add registry-supplied `keywords`/aliases so synonyms match. No Fuse.js for command mode.
- Recents: MRU of the last ~5 command ids in localStorage (`ui.svelte.ts` pattern). No frequency scoring in v1.
- Contextual: `scope: selection` commands appear only when enabled; the current selection's verbs lead the empty state.
- Empty state: recents -> selection block -> short grouped command list. Never blank.
- Anatomy: input row with search icon; grouped results with headings; rows with optional shortcut badges; footer key-hint bar.
- Mobile: bottom sheet, larger targets (`viewportStore.isMobile`); follows the M12 mobile shell (#2097).
- Accessibility: combobox + listbox via bits-ui Command (focus stays on input, arrows move aria-activedescendant) inside the focus-managed Dialog; announce open/close; honour the #2098/#2099/#2100 guard rails.

---

## Technical findings (from the codebase)

- bits-ui v2.18.1 ships `Command` (Root/Input/List/Empty/Group/GroupHeading/GroupItems/ Item/LinkItem/Separator/Viewport/Loading) and `compute-command-score`, plus `Dialog`, verified in node_modules. The palette is composition, not construction.
- Keyboard shortcuts live in `KeyboardHandler.svelte` (hardcoded) and are listed again in `HelpPanel.svelte`; #2096 collapses both into one registry. `shouldIgnoreKeyboard()` must special-case Ctrl+K like Escape.
- Device search already uses Fuse.js (`deviceFilters.ts`, `searchDevices()`); reuse it only if the device sub-mode is built.
- Only one dialog opens at a time (`dialogs.svelte.ts`); opening the palette closes others.
- Selection state (`selection.svelte.ts`) drives enabled-when; localStorage helpers in `ui.svelte.ts` fit a recents store.

## External findings (precedent)

- Ctrl/Cmd+K is the dominant convention; interceptable via preventDefault in Chrome, Firefox, Safari, with the documented Windows-Chrome address-bar edge case (cmdk #288; GitHub shipped rebindable shortcuts).
- The durable discoverability win is a visible header pill with the shortcut printed in it; the worst anti-pattern is palette-only commands.
- cmdk anatomy (input, grouped results, shortcut badges, footer, designed empty state) is the widely copied model; bits-ui Command implements it.
- WAI-ARIA combobox+listbox is the authoritative accessibility pattern: DOM focus on the input, aria-activedescendant for navigation, inside an escapable focus-managed dialog.

## Mock

See `spike-2020-palette-mock.svg`. Left: the discoverable top-bar pill and the design notes. Right: the open palette showing the input, a Recent group, a selection-aware Selection group, a Commands group with the "Add device..." sub-mode entry, shortcut badges, and the footer key-hint bar.

---

## Implementation decomposition

Filed as children of epic #2017, M14, sequenced after #2096 / #2073 / #2075. See `.claude/spike-2020-issues.yaml` for the full definitions.

1. Command palette shell: Ctrl/Cmd+K invocation + top-bar pill + bits-ui Command in a Dialog, command-mode projected from the registry, fuzzy ranking, footer, ARIA, listed in the help overlay. Depends on #2096.
2. Recents + contextual commands: MRU recents in localStorage and selection-aware empty state. Depends on shell.
3. (Optional, later) "Add device..." sub-mode: device search + placement as a pushed sub-page reusing `searchDevices()` and `placement.startPlacement()`. Depends on shell; lower priority.
