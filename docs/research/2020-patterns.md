# Spike #2020 - Pattern analysis and recommendations

Synthesises `2020-codebase.md` and `2020-external.md` into a recommendation for each of
the spike's four questions. The palette is build-later: thin UI over the command registry
(#2096), non-blocking for the shell.

## Key insight

bits-ui v2.18.1 (already a dependency) ships a `Command` component that is a Svelte port
of cmdk: combobox/listbox ARIA done correctly, built-in command-score fuzzy ranking,
groups, empty state, separators, viewport. Composed inside the existing bits-ui `Dialog`
(focus trap, Esc, portal), it delivers the entire palette mechanic with zero new
dependencies and no custom accessibility code. The remaining work is data (the #2096
registry), chrome (header pill, footer, badges), and two behaviours bits-ui does not give
for free (recents, selection-aware empty state).

This collapses what would have been the hard part of the spike (build a correct,
accessible combobox) into composition. The recommendations below assume this base.

---

## Q1: Scope - which commands the palette indexes

Recommendation: command-first palette, sourced entirely from the #2096 registry, scoped
by the registry's existing `scope` field (global / layout / selection).

Indexed in v1:
- File / frame (global): new layout, open layout, import devices, import from NetBox,
  new custom device, export image, export backup, share link, view YAML; plus Save and
  Save As in the server build (the menu is already storage-mode aware).
- View (layout): toggle display mode, toggle annotations, toggle rear view, fit all.
  Theme is an app preference behind the Settings gear; expose it as a command too since a
  command is a legitimate accelerator even when the canonical control lives elsewhere.
- Layout switching (workspace): switch to an open layout/tab, new layout. (Lands with the
  tabs work; the palette reads whatever the registry exposes.)
- Selection-aware object verbs (selection scope, gated by enabled-when):
  device -> move up, move down, flip face, duplicate, delete, slot (half-width only);
  rack -> duplicate, focus, export, delete; multi-select -> bay together.

Device search + placement: NOT in the top-level command list for v1. Precedent is
consistent (VS Code Palette vs Quick Open; Notion Cmd+K vs `/`; Figma quick-actions are
command-first, not the object-insertion path). The Devices sidebar stays the canonical
place-a-device surface; folding device rows into the command list would both bloat it and
violate the "do not withhold from the plain UI" rule. If wanted, add device search later
as a dedicated sub-mode (a pushed "Add device..." sub-page reusing `searchDevices()` and
`placement.startPlacement()`), never interleaved into the top-level list. Filed as an
optional follow-up issue, not v1.

Rationale: the registry already classifies commands by scope, so "what the palette shows"
is a projection of the registry, not a second hand-maintained list. This is the whole
point of #2096.

## Q2: Invocation and discoverability

Primary invocation: Ctrl+K, Cmd+K on macOS. Detect platform, render the correct glyph
(Ctrl vs the Command symbol). Bind on `keydown`, capture phase, `preventDefault()` +
`stopPropagation()`. It must open even when focus is in a text field (special-case it the
way Escape already is in `KeyboardHandler`/`shouldIgnoreKeyboard`); inside the palette's
own input the global handler stays inert.

Verified caveat (do not assume): Chrome and Edge on Windows can still steal Ctrl+K to the
address bar in some states (fresh load / address-bar focus). Interception succeeds ~95%+
once the app has focus, which is why GitHub/Slack/Notion/Linear/Figma all rely on exactly
this. Mitigations: (a) never make the palette the only path to a command; (b) document the
limitation; (c) plan a settings-level rebind escape hatch (and/or a documented alternate
like Ctrl+/) as a later enhancement, not v1.

Secondary, discoverable invocation: a visible header affordance is required, not optional
(some users physically cannot produce Ctrl+K, and it can be stolen). The interim top bar
(#2072) already ships with an empty flex slot. Put a "Search or jump to..." command pill
there with the platform shortcut badge printed inside it. This is the single best
discoverability move in the research: it is clickable, screen-reader reachable, and
teaches the shortcut passively. Also list the palette in the `?` shortcuts overlay
(auto-generated from the registry per #2096). No mandatory onboarding coachmark.

## Q3: Relationship to the menu

The palette is an accelerator, never the sole path. Save, Share, Export, and every other
command stay reachable from the lean app menu (#2073), the canvas controls, and the side
panel. Guaranteed structurally by #2096: the registry is the single source of command
metadata; the app menu, verb bars, keyboard handler, HelpPanel, and palette are all
projections of it, so they cannot drift and the palette cannot hold a command that no
other surface exposes. The palette adds reach, not commands. This directly satisfies the
"withholding commands so they are palette-only is the worst crime against discoverability"
finding.

## Q4: Behaviour - fuzzy search, recents, contextual

Fuzzy search: use bits-ui Command's built-in `compute-command-score` (the cmdk scorer:
rewards contiguous matches, word boundaries, start-of-string). No Fuse.js for command
mode. Give each command a `keywords`/alias value (registry-supplied) so synonyms match
("place" finds Add device, "background"/"dark" finds theme, etc.). Tighten only if a small
command set produces junk matches.

Recents: lightweight MRU, last ~5 executed command ids, persisted to localStorage via the
existing `ui.svelte.ts` `safeGetItem`/`safeSetItem` pattern. Shown in the empty state.
Frequency (MFU) scoring is over-engineering for an occasional-use tool; MRU matches the
mental model. Not provided by bits-ui Command, so it is its own slice.

Contextual / selection-aware: commands with `scope: selection` appear only when their
enabled-when passes. When a device or rack is selected, surface its verbs at the top of
the empty state ("Duplicate selected device", "Delete", "Move up/down") - the same actions
already bound to keys, now discoverable. Also its own slice (depends on selection store).

Empty state (before typing): never blank. Order: Recents (if any) -> Contextual block for
the current selection -> a short grouped list of top global commands (Add rack, Export
image, Share, Toggle display mode, Fit all).

Visual structure (cmdk anatomy, what bits-ui Command renders): input row with leading
search icon; grouped results with section headings (Recent, Selection, File, View,
Layout); each row = label + optional trailing shortcut badge (doubles as passive shortcut
teaching); a footer key-hint bar (up/down navigate, enter run, esc close). Honour the
guard rails: visible focus, reduced motion, 44px touch targets (#2100), axe-clean (#2099).

Mobile: render as a bottom sheet with larger targets (`viewportStore.isMobile`). Mobile
shell is M12 (#2097); palette mobile treatment follows that work rather than being built
bespoke here.

Accessibility: combobox + listbox is handled by bits-ui Command (DOM focus stays on the
input, arrows move `aria-activedescendant`); wrap in the focus-managed bits-ui Dialog (Esc
always closes, focus returns to the trigger). Announce open/close to assistive tech.

---

## Implementation approaches considered

- Option A (recommended): bits-ui `Command` inside bits-ui `Dialog`, data from the #2096
  registry. No new deps, accessibility and fuzzy ranking for free. Work is chrome +
  recents + contextual.
- Option B: custom combobox over Fuse.js. More control, but re-implements the ARIA
  combobox pattern and a scorer that bits-ui already ships correctly. Rejected:
  unnecessary risk and maintenance for a build-later feature.
- Option C: add cmdk-svelte or kbar as a dependency. Rejected: duplicates a component we
  already have in bits-ui.

## Trade-offs

- bits-ui Command couples the palette to bits-ui's API, but the project already standardises
  on bits-ui, so this is consistent, not new coupling.
- Recents in localStorage is per-browser, not synced. Acceptable: recents are a
  convenience, not data.
- Deferring the device sub-mode keeps v1 small and legible; the cost is two surfaces for
  device actions (sidebar now, optional palette sub-mode later), which the precedent says
  is correct anyway.

## Recommendation summary

Command-first palette built by composing bits-ui Command in a bits-ui Dialog over the
registry (#2096). Ctrl/Cmd+K primary with a visible header pill as the required secondary
path; never the sole route to any command. Built-in fuzzy scoring + keyword aliases; MRU
recents and selection-aware contextual commands as follow-on slices; rich empty state;
device search deferred to an optional sub-mode. Sequenced after #2096 (registry), #2073
(menu), and #2075 (verb bars), all of which establish the registry the palette projects.
