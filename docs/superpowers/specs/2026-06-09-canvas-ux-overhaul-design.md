# Canvas UX Overhaul (Design Spec)

Status: Draft
Epic: UX Overhaul
Date: 2026-06-09

## Summary

The canvas chrome grew by accretion and now reads as a junk drawer: controls of
different scope (global, view, object) sit at the same altitude in one top-right
cluster, the splash screen gates entry, there is no recognisable file menu, and
there is no way to preview or hold open more than one layout. This spec redefines
the canvas shell around a single principle: place each control where its scope
lives. Global frame in the top bar, view and history on the canvas, object actions
on the object, properties in a side panel. It also replaces the runtime "is the
server up" guesswork with an explicit storage mode and an honest storage indicator.

This is a design spec, not an implementation plan. Two areas remain open and are
tracked as design spikes (see Open Questions); a third spike, the command palette,
is decided build-later and does not block the shell.

## Goals

Make the shell legible by scope. The top bar should answer "who am I, what is open,
where is it stored" and nothing else. Make the app open straight to work with no
gate. Give layouts a previewable, multi-open home. Make creation and placement feel
direct rather than dialog-driven. Present local-only storage as an honest, durable
arrangement rather than a failure state.

## Non-goals

Network connectivity between layouts is out of scope here and belongs to its own
future epic. Mobile adaptation of the new shell is out of scope for this spec. The
command palette is decided build-later; the shell only structures its actions as a
command registry so the palette can layer on. None of these are foreclosed: the
shell leaves room for a project or site container above the layout, which is where
connectivity would later attach.

## Audience

Rackula serves a diverse audience whose mental models differ: AV users who bay
open-frame racks into rows, IT and server users who think in standalone enclosed
racks, and homelabbers with small mixed setups. Concepts are not universal. The
shared-majority workflow, standalone racks and placing devices, is the default and
must be frictionless. Domain-specific features such as baying are explicit opt-ins
that never trigger by accident and do not clutter the canvas for users who do not
use them.

## The shell

### Workspace and tabs

Rackula becomes a multi-layout workspace on the familiar editor and browser model.
Layouts open as tabs across the top of the canvas. The sidebar Layouts list is the
durable library of everything that exists; tabs are the working set for the current
session. On launch the app opens straight to the canvas and restores the full set
of tabs that were open, lazily: only the active layout's content loads, the rest
load when focused. The old StartScreen is removed entirely: its functions (new
layout, import, the saved layouts list) move to the sidebar Layouts tab and the
app menu. A true first launch with no layouts shows the existing WelcomeScreen
empty state.

Tabs use a real tab shape, support drag to reorder, and reveal a close affordance on
hover. Closing a tab never deletes the layout; the layout persists in storage and in
the sidebar. Opening a layout from the sidebar focuses its tab if already open,
otherwise opens a new one. A tab carries a small unbacked-changes dot only when it
is inactive: the active tab needs no dot because the user is looking at that work,
and the inactive dots identify which background layout the storage chip's amber
state refers to. Tab keyboarding avoids browser-reserved combinations (no Ctrl+W,
Ctrl+T, Ctrl+Tab) and uses Alt+1 through 9 to jump between tabs. Ctrl+1 through 9
is also browser-reserved (it switches browser tabs in Chrome and cannot be
intercepted); Alt+1 through 9 is interceptable in all major browsers and matches
the Slack-in-browser convention.

The undo stack is per layout. Closing a tab discards that layout's undo history;
the layout itself persists in storage and in the sidebar.

Overflow shrinks tabs to a comfortable minimum near 120px, then a hard floor near 72px, then
collapses the remaining tabs into a right-aligned chevron menu that lists the open set only
(not the full library). Drag-reorder operates on the visible strip; picking a tab from the
chevron brings it back onto the strip. There is no horizontal scroll and no multi-row wrap.

Closing is non-destructive and needs no confirmation: the close affordance is a hover-revealed
x (always shown on the active and keyboard-focused tab), and the inactive dot yields to the x in
the same slot so the tab width does not jump. The word Close is used for tabs everywhere; Delete
is reserved for removing a layout from the sidebar library. A one-time first-run hint explains
that closing keeps the layout in the Layouts list. The only confirmation is closing an unsaved
new layout that was never added to the library.

Deleting or renaming a layout while a tab is open never closes the tab. A rename live-syncs to
the tab title. A delete (from the sidebar or server-side) flips the tab to a recoverable orphan
that offers Save as new, for both the active and inactive tab. Duplicate names across open tabs
gain a muted qualifier (relative update time, or a short id fragment) only when they collide; the
tooltip always carries the unambiguous name and id.

The full tab keyboard map: Alt+1 through 9 jump to a tab, Alt+W closes the current tab, and Alt+[
and Alt+] cycle to the previous and next tab (parallel to bare [ and ] for racks). The reserved
combinations Ctrl+W, Ctrl+T, Ctrl+Tab, and Ctrl+1 through 9 are avoided because the browser never
delivers them to the page. All existing app shortcuts survive unchanged; the map is authored as
command-registry entries so the HelpPanel list is generated (#2096).

Twin tabs pause per layout, not per workspace: a Web Lock keyed by layout id elects one editor
per layout, so editing one layout never pauses another open elsewhere. Opening a layout that is
already a tab focuses that tab, so there is at most one editable in-app tab per layout; the Reload
action reloads that one layout's working copy.

Full interaction detail, with the alternatives that were considered, is recorded in
docs/research/spike-2018-tabs-interaction-model.md.

### Session restore mechanics

Launch restores the full open tab set lazily (settled): only the active layout's content loads,
the rest load when focused. A restored-but-unloaded tab shows its name from the persisted open-set
metadata plus a quiet skeleton until focused. The persisted open-set carries enough per-tab
metadata (layout id, name, order, active flag) to render tab shells before any layout content is
read.

Focusing an unloaded tab hydrates it. If that layout is gone or unreadable, the tab resolves on
focus to an inline error with Retry and Remove tab; it never silently vanishes and never reads as
deleted when the cause is a transient failure. In server mode, an unreachable server at launch
renders the tab shells in an unreachable-and-retrying state under one workspace-level banner,
distinct from deleted, and hydrates when the connection returns.

Closing a tab removes it from the open set and discards that layout's undo history only; the
durable copy survives in storage and in the sidebar. A returning user with no restorable layouts
is told apart from a fresh install by a persisted has-ever-had-layouts signal: a fresh install
shows the WelcomeScreen, while lost data shows a distinct recovery state offering Retry, Import a
file, and Start fresh. When a save or snapshot POST returns 404 because the layout was deleted
server-side, the failed write becomes a Save as new offer so the open copy lands in the library
rather than being lost.

The per-layout browser storage schema (#2179) and undo/redo semantics across switch and restore
(#2182) are designed separately; this section states the interaction contract they satisfy.

### Top bar and app menu

The top bar carries only the workspace frame: the logo (which is also the app menu),
the tab strip, the storage chip, and the Settings gear. Everything else has moved to
a more appropriate home.

The app menu is lean. It contains only commands that have no other home: new and open
layout, import devices, import from NetBox, new custom device, export image, export
backup, share link, view YAML, keyboard shortcuts, and about. Edit and View are not
mirrored here because they live on the canvas and in the panel. The menu is storage
mode aware: the server build adds Save and Save As for the server library, while the
browser build leads with Export backup. App preferences stay behind the Settings gear,
not in the app menu.

### Canvas controls

View and history controls live on the canvas, bottom-left, as two visually separated
groups. The history group is undo and redo. The view group is zoom out, zoom readout,
zoom in, fit, and the display-mode lens. They read as two distinct groups, not one
pile.

### Object interaction model

Selecting any object floats its verbs just above it with a small margin. The pattern
is identical at both scales:

A selected device shows its verbs floating above the device row: move up, move down,
flip face, duplicate, delete, plus a slot control that appears only when the device
is half-width. The bar floats above the row with a small margin and flips below when
the row is near the rack name, so it never lands on the name.

A selected rack shows its verbs floating above the rack name: duplicate, focus,
export, delete. The name stays in place and is itself part of the rack's click
target. Selecting a rack includes its name, so nothing reflows.

Right-click mirrors the floating verbs for both. Properties for both dock in the side
panel. Verbs float, properties dock. Multi-select surfaces group actions, including
Bay together (see Creation).

Verb-bar behaviour at low zoom is unresolved: the bar renders at constant
screen-space size, so below some zoom level it is larger than the object it points
to and ambiguous about its target. A zoom threshold rule must be defined during
implementation breakdown.

### The side panel

The right panel is persistent and tabbed: Edit and View. The Edit tab is contextual
and shows properties for the current selection, or an empty-state prompt when nothing
is selected. The View tab is always reachable and holds the layout-scoped view toggles
(display mode, annotations, rear view). Theme is an app preference and lives behind
the Settings gear, not in the View tab. This replaces an earlier mode-swap
design in which selecting an object hid the View controls. The panel is collapsible to
a slim rail to give the canvas its width back, and it remembers whether it was left
collapsed. Multi-select and empty states are first-class.

### Edit panel section components (#1398)

The legacy EditPanel was decomposed into composable section components ahead of this
overhaul (#1398). These are the sections the Edit tab (#2077) composes, and they define
the contract that tab builds against:

- `EditPanelRack`: rack or group properties (name, height, U numbering, rear-view
  toggle, notes, annotation field, delete). Props: `selectedRack`, `selectedGroup`.
- `EditPanelMetadata`: device descriptive fields (name, type/brand, height, category,
  colour, mounted face, power ratings, type notes, IP, placement notes). Props:
  `selectedDeviceInfo`.
- `EditPanelPosition`: vertical position, half-width slot, container context. Props:
  `selectedDeviceInfo`.
- `EditPanelImage`: front/rear placement image overrides. Props: `selectedDeviceInfo`.
- `EditPanelActions`: remove from rack, delete custom type. Props: `selectedDeviceInfo`,
  and an `ondeletetype` callback (the host owns the confirm dialog).

Contract notes for the Edit tab:

- Sections are single-entity: each renders properties for one selected rack or device.
  The host (today `EditPanel`, later the Edit tab) owns empty-state and multi-select
  orchestration; sections never branch on nothing-selected.
- Sections access stores via the singleton getters directly. Only the resolved selection
  (`SelectedDeviceInfo`, `selectedRack`, `selectedGroup`) is passed as props; each section
  sources the rack id from the selection it receives (`selectedRack.id` /
  `selectedDeviceInfo.rack.id`). `SelectedDeviceInfo` is exported from `src/lib/types`.
- Transitional: `EditPanelRack` still hosts the rear-view and annotation toggles. These
  are layout-scoped view state that the View tab (#2078) absorbs; lift them out of
  `EditPanelRack` when #2078 lands.

## Storage

### Explicit storage mode

Storage mode is declared by configuration, not inferred at runtime. The setting is
storage: browser or storage: server. This replaces the previous approach of always
probing /api and guessing intent from connection history, which made a deliberately
backendless build indistinguishable from a server that was simply down.

The model has three tiers: a file on disk (portable, always available via export and
import), the browser (the live working copy, autosaved), and the server (a durable
library that survives the browser being cleared, present only in the server build).
In the browser build the durable home is the file; the browser holds the working copy.
In the server build the durable home is the server; the browser holds the working copy
and the file is a portable copy.

The design target for concurrency is one user on multiple devices, not multi-user
editing. When the working copy and the server copy diverge (a reconnect after working
offline, or another device wrote in between), the resolution is last-write-wins with
an automatic pre-overwrite snapshot of the losing copy; there is no merge or prompt
UX. Snapshot mechanics are resolved by spike #2019: snapshots live server-side in a
snapshots subdirectory of the layout folder, written only when a save's echoed
updatedAt mismatches the stored copy (a genuine divergence), keeping the five most
recent, restorable from the load dialog as a new write rather than an in-place
revert. The startup timestamp comparison moves to the same server-echo semantics,
and the browser working copy is kept after server saves rather than cleared. See
docs/research/spike-2019-storage-model-data-safety.md.

### The storage chip

A single compact chip lives at the top-right. Its dot answers one question regardless
of build: is my work in its durable home. The chip is workspace-wide: it aggregates
across all open layouts and shows green only when every open layout is in its durable
home. It never shows green while any open tab holds unbacked work; the inactive-tab
dots identify which layout the amber state refers to. The chip's states:

Browser build: green "In your browser, backed up" when a recent file backup exists,
amber "In your browser, backup needed" when only a working copy exists. The labels
differ as well as the colours, so colour is never the sole indicator of state. The
app can only know that an
export event happened, not that the file still exists on disk. "Recent" is defined
change-based (spike #2019): green means zero changes since the last successful
export, tracked by a changesSinceExport counter; any unexported change flips the
chip amber. A non-modal nudge fires at 30-change multiples so the strict chip does
not have to carry the reminder load alone.

Server build: green "Saved to <instance>" when synced, neutral "Saving" while writing,
red "<instance> unreachable" when disconnected and working from the browser.

Clicking the chip opens a self-contained popover with the facts (where stored, last
backup or sync) and the actions (export all, import, and in the browser build restore
from file).

### Messaging

The browser build shows a one-time, first-run notice framed honestly: Rackula runs
entirely in your browser, nothing is uploaded, clearing browser data erases layouts,
so export a file to keep a copy. It never shows the old "server unavailable" toast,
because there is no server to be unavailable. The server build keeps a single,
instance-named, reassuring toast when the backend genuinely drops ("Lost connection to
<instance>, working from your browser, changes will sync when it reconnects"), fired
once, with a quiet recovery toast on resync. The generic "Server unavailable, working
offline" toast is removed.

The data-safety and race-condition questions are resolved by spike #2019 (see Open
questions: storage).

### Storage mode misconfiguration

The explicit storage mode introduces a failure class the original chip never named:
the configured mode contradicting the observable deployment. The chip is the honest
surface for it, so it distinguishes configured intent from observed reality (#2063).
Two cases, both surfaced in the popover only, with no new toasts and a factual tone.

Browser mode while a server is reachable. A compose --profile persist install without
RACKULA_STORAGE_MODE=server, or a partially wired install, runs in browser mode while
/api/health answers. Layouts silently stay in the browser with a working server one
header away. The chip adds a passive popover line ("A Rackula server is reachable but
this instance stores layouts in the browser. Set RACKULA_STORAGE_MODE=server to use
it.") and changes nothing else: the dot, label, and durability status stay exactly as
the browser build defines them, because the file is still the durable home here. No
toast, no nagging. To detect this without re-introducing the runtime guesswork the
explicit mode replaced, browser mode runs the same hardened /api/health probe (the one
that validates a structured JSON payload, not an SPA fallback) purely to feed this hint.

Server mode where the server was never reached since load. A frontend-only install that
declares server mode gets the same treatment as a transient outage forever: an amber
chip and an instance-named drop toast, with no hint the deployment itself is broken. The
chip now splits the two error classes by whether the API has answered at least once this
session, tracked by a one-way ever-reached latch that never falls back on a later loss.
Never reached is a distinct chip state ("Server not found", popover copy "Check that the
API container is running and RACKULA_STORAGE_MODE matches the deployment.") and fires no
drop toast, since nothing was lost. Reached then lost keeps the existing offline
treatment, and the instance-named drop toast stays reserved for it. The circuit-breaker
trip is always reached-then-lost, since the breaker only opens after save attempts, which
require a reachable server.

These decisions follow the spike's messaging posture: name the broken state honestly,
fail toward the honest label rather than the reassuring one, and never add a toast where
a passive popover line will do.

## Creation and placement

Creation is by placing, not by filling in a dialog. The one exception is defining a
custom device type, which is data entry and stays a form launched from the palette.

A new rack is born from a single affordance revealed on hover, arrives at the
last-used size (a sticky default, not a fixed 42U), is selected on creation, and is
tuned in the panel. There is no upfront modal. On an empty canvas the empty state is
itself the call to action to add a rack, and dragging a device onto an empty canvas
creates a rack to hold it.

Baying is explicit and opt-in, never emergent from proximity. Dragging racks near each
other does not bay them. A bay is formed by selecting two racks and choosing Bay
together, or by setting Bay with on a rack in the panel, which is also where the
relationship is undone. Standalone is the default and nothing auto-snaps.

Device placement is drag-first with a live preview. The preview must show the unhappy
path, not just the happy one: a valid drop highlights the target slots, an invalid
drop (overlap, no room, wrong face) shows a red preview and snaps to the nearest legal
slot. A non-modal double-click on a palette item places it in the selected rack's next
free slot. A keyboard path exists so placement is not mouse-only. All creation and
placement is undoable.

## Sidebar Layouts tab

The sidebar gains a third tab beside Devices and Racks: Layouts. It is a compact list
of rows, each with a small cached mini-render of the layout, the name, and meta. Open
layouts carry a green dot, the active one is highlighted, and the list stays in sync
with the tabs. A New layout action sits at the top. Per-row actions (rename, duplicate,
export, delete) appear on hover and on right-click. The thumbnail is a real cached
render regenerated on save, not a placeholder, so it functions as a preview.

## Accessibility

The new shell changes keyboard navigation extensively, so accessibility is part of
the design, not a retrofit. Floating verb bars are reachable by keyboard, not only
by pointer. Storage chip state changes are announced to assistive technology.
Collapsing and expanding the side panel manages focus rather than dropping it. See
`docs/guides/ACCESSIBILITY.md` for the project checklist.

## Open questions (design spikes)

Two areas were tracked as design spikes under the UX Overhaul epic, with the storage
spike running first because tabs depend on its semantics. Both are now resolved. A
third spike, the command palette, is decided and non-blocking:

Tabs interaction model: resolved by spike #2018, full findings in
docs/research/spike-2018-tabs-interaction-model.md. The decisions are folded into
Workspace and tabs and Session restore mechanics above: shrink-then-chevron overflow over
the open set; non-destructive Close with a single new-layout confirm; orphan-on-delete with
Save as new; live rename to title with collision-only disambiguation; lazy restore with
title-plus-skeleton shells and an orphan/error fallback; the Alt+1-9 / Alt+W / Alt+[ Alt+]
keyboard map authored for the #2096 command registry; per-layout twin-tab pause via a
layout-id Web Lock with an at-most-one-editable-tab invariant; server-unreachable restore
shown as retrying not deleted; lost-data versus fresh-install empty states; and a 404 on a
deleted layout falling through to Save as new (#2041).

Storage model and data safety: resolved by spike #2019, full findings in
docs/research/spike-2019-storage-model-data-safety.md. The decisions: the chip is
green only at zero changes since the last successful export (a changesSinceExport
counter), with a non-modal nudge at 30-change multiples and a persisted snooze;
restore-from-file reuses the existing load pipeline behind a confirm when unbacked
changes would be replaced; beforeunload warns only on genuine in-flight loss risk.
Pre-overwrite snapshots are server-side, written only on a mismatched server-echoed
updatedAt, keep five per layout, and restore as a new write. Twin tabs are
detect-and-pause via the storage event with a per-tab id, Web Locks serialising
writes where available. Storage mode is set by RACKULA_STORAGE_MODE, injected by the
container entrypoint as `window.__RACKULA_CONFIG__`, defaulting to browser when no
config is present; explicit config always wins and the connection-history probe is
deleted.

Command palette: resolved by spike #2020 (full findings in
docs/research/spike-2020-command-palette.md, mock in
docs/research/spike-2020-palette-mock.svg). Still build-later and non-blocking. The
decisions: it is a command-first palette, thin UI projected from the command registry
(#2096), built by composing the bits-ui v2.18.1 `Command` component (a Svelte port of
cmdk, with the ARIA combobox/listbox model and a fuzzy scorer built in) inside the
existing bits-ui `Dialog` - no new dependency and no custom accessibility code.
Invocation is Ctrl+K (Cmd+K on macOS) bound on keydown capture with preventDefault, plus
a required visible "Search or jump to..." pill in the top bar's reserved slot (#2072),
because Ctrl+K interception is reliable but not universal (Chrome/Edge on Windows can
steal it) and the palette must never be the sole path to a command. Behaviour: built-in
fuzzy ranking plus registry keyword aliases, a small MRU recents list in localStorage,
and selection-aware contextual commands, over an empty state that is never blank
(recents, then the current selection's verbs, then a short grouped command list). Device
search and placement stay in the Devices sidebar; a palette "Add device..." sub-mode is
an optional later follow-on, not v1. Implementation is decomposed into #2212 (shell),
#2213 (recents and contextual commands), and #2214 (optional device sub-mode), all
sequenced after #2096, #2073, and #2075.

## Out of scope

Connectivity between layouts is a separate future epic; this shell leaves a
project-or-site-container-shaped hole above the layout for it. Mobile adaptation of the
new shell is not covered here. The command palette is build-later, not part of this
shell work beyond the command registry.

## Decision log

The top bar is the workspace frame only; other controls moved by scope. App opens
straight to the canvas. App menu is lean and storage-mode
aware. Storage mode is explicit (browser or server) over a three-tier file, browser,
server model, surfaced by one honest chip. Object verbs float above the object (device
above the row, rack above the name), properties dock in the panel. The panel is tabbed
Edit and View, collapsible, with multi-select and empty states. Creation is by placing
with a sticky default size; baying is explicit opt-in; placement preview shows valid
and invalid drops. Sidebar Layouts tab is compact rows with cached previews. Tab
switching is Alt+1 through 9 (Ctrl+1 through 9 is browser-reserved and
non-interceptable in Chrome). The storage chip is workspace-wide: green only when
every open layout is in its durable home. The undo stack is per layout and is
discarded when its tab closes. Launch restores the full open tab set lazily (only the
active layout's content loads). The design target for concurrency is one user on
multiple devices: server-mode conflicts resolve last-write-wins with an automatic
pre-overwrite snapshot, no merge or prompt UX. Browser-mode backup is manual export
plus nudges; no persistent-file-handle mechanism for now. The command palette is
build-later; shell actions are structured as a command registry so it can layer on.
Theme lives behind the Settings gear as an app preference; the View tab holds
layout-scoped toggles only. Delivery is incremental in coherent slices on main, no
long-lived branch; the storage spike runs before the tabs spike. Spike #2019
resolved the storage questions: chip green is strict zero-changes-since-export with
a 30-change nudge cadence; snapshots are server-side and mismatch-only via a
server-echoed updatedAt, keep five, restore as a new write; the browser working copy
is kept after server saves; twin tabs detect-and-pause; storage mode comes from
RACKULA_STORAGE_MODE via an entrypoint-injected `window.__RACKULA_CONFIG__`,
defaulting to browser (see docs/research/spike-2019-storage-model-data-safety.md).

Spike #2018 resolved the tabs interaction model (see
docs/research/spike-2018-tabs-interaction-model.md). The governing principle is trust the
model: closing is always non-destructive because the layout persists in the library. Overflow
shrinks tabs to a comfortable minimum then collapses the tail into a chevron menu over the open
set, no scroll or multi-row. Close uses a hover x with no confirm except for an unsaved new
layout not yet in the library; Delete is sidebar-only wording. Delete-while-open orphans the tab
with a Save as new offer rather than closing it; rename live-syncs to the title; duplicate names
disambiguate only on collision. Restore is lazy with title-plus-skeleton shells, an
orphan-or-error fallback on focus, and a retrying (not deleted) state when the server is
unreachable; lost-data and fresh-install empties are distinguished by a persisted
has-ever-had-layouts signal. The tab keyboard map is Alt+1-9 jump, Alt+W close, Alt+[ and Alt+]
cycle, authored as command-registry entries for the generated HelpPanel (#2096). Twin tabs pause
per layout via a layout-id Web Lock with an at-most-one-editable-tab-per-layout invariant, and a
404 on a deleted server layout falls through to Save as new (#2041). Undo across switch and
restore (#2182) and the browser per-layout storage schema (#2179) are designed separately.

Spike #2179 resolved the browser-mode multi-layout storage schema (see
docs/research/spike-2179-browser-multilayout-storage-schema.md). localStorage only for now
(IndexedDB tabled as a quota-triggered follow-up, since browser mode may be retired with the
Cloudflare Workers migration): one workspace index key (`Rackula:workspace`: schemaVersion,
activeId, ordered openTabs, and a library map carrying per-layout name, updatedAt, and the
durability counters) read synchronously at launch to paint tab shells, plus one body key per
layout (`Rackula:layout:<id>`) loaded lazily on focus. The old single `Rackula:autosave` slot is
adopted once into the first layout then deleted. Closing a tab drops it from openTabs only; the
body and library entry persist. Quota failures never auto-evict; they surface through the chip.
The twin-tab Web Lock and storage events re-key per layout id, and the index is the single
durability source for the chip rollup (#2035), tab dots (#2079), and sidebar dots (#2082).

A 2026-06-10 scope review of surfaces left untouched by the shell list added six items
and three guard rails. Dialogs unify on one primitive with three sizes (S 420, M 560,
L 720) that renders as a bottom sheet on mobile, replacing nine ad hoc dialog widths
and the dialog-versus-sheet split (#2092); it sequences before the side panel and
settings. Settings consolidate into a sectioned dialog (Appearance, Behaviour, Data)
behind the gear, and the theme toggles in the canvas context menu and HelpPanel are
removed so the gear is the single home (#2093). The command registry decided for the
palette becomes a now-not-later foundation: a typed registry (id, label, shortcut,
scope, enabled-when) feeds the app menu, verb bars, keyboard handler, and a generated
HelpPanel shortcut list, eliminating hand-maintained shortcut docs (#2096). The
Devices palette gains a pinned favourites section, virtualized rendering, and a
visible display-mode toggle in one pass (#2094). The empty-canvas state becomes a
template chooser (.rackula.yaml templates in static/templates, validated in CI
against the published schema #571, previews via the cached render pipeline; a v1
chooser may land earlier on the existing WelcomeScreen with static preview images,
with only the entry-point routing) landing together with StartScreen removal (#2095). Mobile implementation
is deferred to M12, but the design spike (#2097) runs at milestone start, before
#2075/#2076 implementation, so the new panel and dialog primitives are not rebuilt
bespoke for touch. Three guard
rails land before shell slices and are milestoned in M14 as wave 0 (no shell slice
merges until they are green): visual regression snapshots (#2098), axe-core
accessibility CI (#2099), and UX standards (WCAG 2.2 AA, 44px touch targets, reduced
motion, visible focus, managed focus) documented as PR gates (#2100).

## Alignment audit amendments (2026-06-12)

A cross-milestone audit (M02/M03/M04/M13/M14/M15) amended this spec. Full report:
the align-roadmap session plan file; per-issue details live on the issues.

### Canonical homes

| State                 | Canonical control        | Mirrors                                  | Scope            |
| --------------------- | ------------------------ | ---------------------------------------- | ---------------- |
| Display mode          | Bottom-left lens (#2074) | View tab (#2078), palette toggle (#2094) | Layout           |
| Annotations           | View tab (#2078)         | none (removed from #2093 Appearance)     | Layout           |
| Theme                 | Settings dialog (#2093)  | none                                     | App preference   |
| Per-layout durability | Chip derived API (#2035) | Tab dots (#2079), sidebar dots (#2082)   | Workspace rollup |

### Sequencing amendments

- M03's carrier-first epic (#2158) lands before M14 placement/drag/verb-bar work:
  the verb bar's slot control (#2075) is designed against the carrier model, not the
  slot_position pathway #2158 deletes.
- Wave 0 additions alongside the guard rails: browser-mode multi-layout storage
  schema design (#2179), undo/redo semantics across restore and tab switch (#2182),
  E2E shell strategy (#2183), i18n decision (#2184), performance budget (#2185).
- #2073 split: menu shell (#2073, mode-agnostic, after #2096) and mode-aware items
  (#2187, needs #2037). #2081 depends only on the shell slice.
- #2045 (export-all) moved into M14 to ride tabs; in server mode it flushes pending
  debounced saves before building the archive.
- The interim top bar (#2072) ships with an empty flex slot; the full
  logo/menu/tabs/chip/settings layout is the end state, not the slice's exit criteria.

## Command palette spike amendment (2026-06-13)

Spike #2020 resolved the command palette (still build-later, non-blocking). It is a
command-first palette, thin UI projected from the registry (#2096), built by composing
bits-ui v2.18.1's `Command` component (Svelte cmdk: ARIA combobox/listbox + fuzzy scorer
built in) inside the existing bits-ui `Dialog` - no new dependency. Ctrl+K (Cmd+K on
macOS) is the primary invocation, paired with a required visible "Search or jump to..."
pill in the #2072 top-bar slot, because Ctrl+K interception is reliable but not universal
(Chrome/Edge on Windows can steal it) and the palette is never the sole path to a command
(guaranteed by the registry being the single source for menu, verb bars, keyboard, help,
and palette). Behaviour: built-in fuzzy ranking plus keyword aliases, an MRU recents list
in localStorage, selection-aware contextual commands, and an empty state that is never
blank. Device search and placement stay in the Devices sidebar; a palette "Add device..."
sub-mode is an optional later follow-on. Decomposed into #2212 (shell), #2213 (recents and
contextual), and #2214 (optional device sub-mode), sequenced after #2096, #2073, #2075.
Full findings: docs/research/spike-2020-command-palette.md; mock:
docs/research/spike-2020-palette-mock.svg.
