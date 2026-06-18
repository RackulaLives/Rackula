# Spike #2018: Tabs Interaction Model

Date: 2026-06-14 Parent epic: #2017 (Canvas UX Overhaul, milestone M14) Spec: `docs/superpowers/specs/2026-06-09-canvas-ux-overhaul-design.md` Research inputs: `2018-codebase.md`, `2018-external.md`, `2018-patterns.md`

---

## Executive summary

Rackula's multi-layout shell is settled: layouts open as tabs (the session working set) over a sidebar Layouts library (the durable list), with real tab shape, drag-to-reorder, hover-revealed close, an inactive-only unbacked-changes dot, full-set lazy restore on launch, per-layout undo discarded on close, and Alt+1-9 tab switching. This spike resolves the interaction detail.

The governing principle, confirmed with the maintainer, is trust the model: closing a tab is always instant and non-destructive because the layout persists in the library; deleting or losing a layout while open keeps a recoverable orphan rather than yanking the tab; restore degrades to a recoverable state rather than dropping work. This matches the dominant convention across browsers, VS Code, Google Docs, and Notion (see `2018-external.md`).

Recommendations, one per owned question:

1. Overflow: shrink to a comfortable min (~120px), hard floor ~72px, then collapse the tail into a right-aligned chevron menu listing the open set (not the whole library). No scroll, no multi-row.
2. Close vs delete: hover `x`, one click, no confirm. "Close" for tabs, "Delete" only in the sidebar. A one-time first-run hint. The sole confirm is an unsaved new layout not yet in the library.
3. Delete/rename while open: orphan the tab (keep it, mark recoverable, offer Save as new); never auto-close. Rename live-syncs to the tab title. Disambiguate duplicate names only on collision.
4. Session restore: unloaded tab shows title + quiet skeleton; missing/unreadable layout resolves on focus to an inline orphan/error with Remove; closing never deletes the durable copy.
5. Keyboard map: Alt+1-9 jump (settled), Alt+W close tab, Alt+[ / Alt+] previous/next tab. All existing shortcuts survive; nothing is removed. Authored as command-registry entries for #2096.
6. Twin-tab guard (#2044): pause is per-layout (Web Lock keyed by layout id); at-most-one editable in-app tab per layout; Reload reloads that one layout.
7. Server-mode whole-set restore failure: render tab shells from persisted open-set metadata in an "unreachable, retrying" state; never present unreachable as deleted.
8. Zero restorable layouts: distinguish fresh-install-empty (WelcomeScreen) from lost-data-empty (a distinct recovery state) via a persisted has-ever-had-layouts signal.
9. Deleted-while-open + #2041 404: convert the failed save into a "Save as new" offer so the losing copy lands in the library.

Deferred and referenced, not designed here: undo/redo across tab switch and restore (#2182) and the browser-mode per-layout storage schema (#2179).

---

## 1. Overflow

Question: minimum tab width, how reordering interacts with the overflow set, and whether the overflow menu mirrors the sidebar.

### Alternatives

Option A - Shrink then chevron overflow menu (recommended)

```
+---------------------------------------------------------------+------+
| Homelab x | Rack B  o x | Lab Spare o x | Studio o x | Garage |  v 3 |
+---------------------------------------------------------------+------+
  active                                                   chevron shows
                                                           hidden-tab count
Click v -> dropdown of the OPEN SET only:
                         +--------------------------+
                         | o  Patch Room            |
                         | o  Edge Closet           |
                         |    Cold Spare            |
                         +--------------------------+
```

Option B - Horizontal scroll strip

```
< +----------+----------+----------+----------+----------+ >
  | Homelab  | Rack B   | Lab Spare| Studio   | Garage   |
  +----------+----------+----------+----------+----------+
   scroll arrows; hidden tabs have no at-a-glance presence
```

Option C - Multi-row wrap

```
+----------+----------+----------+----------+
| Homelab  | Rack B   | Lab Spare| Studio   |
+----------+----------+----------+----------+
| Garage   | Patch    | Edge     |
+----------+----------+----------+
   pushes the canvas down as rows grow
```

### Recommendation: Option A

- Min width: a comfortable minimum of ~120px (label + inactive dot + close still legible), then a hard floor of ~72px before collapsing the tail to the chevron. The active tab never shrinks below the room for its label and close button (mirrors Chromium/VS Code keeping the active tab usable; VS Code's 50px close-button floor is the lower bound, but Rackula tabs also carry a dot).
- Reorder x overflow: drag-reorder operates on the visible strip only. Reordering a tab to the far edge can push another tab into the overflow set, and selecting a tab from the chevron menu brings it back onto the visible strip (swapping with the last visible tab). Dragging a tab into or out of the chevron menu is out of scope for v1.
- Mirror the sidebar? The chevron menu lists the open set only (the hidden tabs), not the full library. It is a fast-switch surface, not a second library. It reuses the sidebar's compact row styling (name + dot) for visual consistency, but the sidebar remains the place to open layouts that are not yet tabs. This keeps two distinct mental models: chevron = "my open tabs that don't fit", sidebar = "everything that exists".
- Rejected: scroll hides which layouts are open (no glanceable state) and is fiddly on trackpads; multi-row is the least-liked option in every reference tool and steals canvas height. A JetBrains-style LRU auto-evict was considered and rejected: silently closing a user's tab contradicts trust-the-model.

Reuse: bits-ui `ui/ContextMenu` (currently unused) or a Popover for the chevron menu; bits-ui Tabs for the strip; `utils/dragdrop.ts` + `dragTooltip` and the `reorderRacks()` precedent for reorder.

---

## 2. Close versus delete

Question: make "close removes from the open set, the layout stays in the sidebar" obvious. Hover affordance, wording, first-time hint, and whether any confirmation is warranted for unbacked changes.

### Alternatives

Option A - Trust the model: silent close, single targeted confirm (recommended)

```
Tab (inactive, unbacked changes):   | Rack B  o            |   <- dot only
Tab (hover):                        | Rack B  o          x |   <- x fades in
Click x -> tab closes instantly, layout stays in the sidebar. No dialog.

One-time first-run toast (first close ever):
   +-----------------------------------------------------------+
   |  Closing a tab keeps the layout in your Layouts list.     |
   |  Open it again any time from the sidebar.          [Got it]|
   +-----------------------------------------------------------+

Sole confirm - an unsaved NEW layout not yet in the library:
   +-----------------------------------------------------------+
   |  "Untitled layout" isn't in your Layouts list yet.        |
   |  Close and discard it?                                    |
   |                          [Cancel]  [Discard]  [Keep open] |
   +-----------------------------------------------------------+
```

Option B - Confirm on every close with unbacked changes

```
Click x on any tab with unsaved changes ->
   +-----------------------------------------------------------+
   |  Rack B has unsaved changes. Close anyway?                |
   |                                   [Cancel]  [Close]       |
   +-----------------------------------------------------------+
   (taxes the common safe case; trains users to click through)
```

### Recommendation: Option A

- Affordance: the close `x` is revealed on hover (and always shown on the active tab and on keyboard focus for a11y). The inactive-only dot marks unbacked changes; on hover the dot yields to the `x` in the same slot so the tab width does not jump.
- Wording: "Close" everywhere for tabs (button title, context menu, first-run hint). "Delete" is reserved exclusively for removing a layout from the sidebar library. The two verbs are never conflated (the universal browser/VS Code/Figma convention).
- First-time hint: a single dismissible toast the first time the user ever closes a tab, gated by a localStorage flag, reusing the existing first-run-notice pattern in `App.svelte`. Never shown again.
- Confirmation policy: no confirm for closing a layout that lives in the library, because closing is non-destructive (it persists in browser storage or on the server and stays in the sidebar). The only confirm is the genuinely-at-risk case: a brand-new layout that has never been committed to the library (no server save, no browser library entry, untitled scratch) and has content. That case gets a Save / Discard / Keep-open guard, matching VS Code's untitled-buffer prompt.
- Note: this depends on #2179 making the browser-mode durable library persist closed layouts. The contract this spike sets: closing a tab must not delete the durable copy in either mode.

Reuse: `ConfirmDialog.svelte` for the single confirm; `toast.svelte.ts` + localStorage flag for the hint.

---

## 3. Delete and rename while open

Question: what happens when a layout is deleted from the sidebar (or server-side by another client) while its tab is open, for the active and an inactive tab; how rename syncs to the tab title; how duplicate names across tabs disambiguate.

### Alternatives

Option A - Orphan the tab, offer Save as new (recommended)

```
Layout deleted while open -> tab keeps its content, flips to orphan state:
   | Rack B (deleted) !  x |        <- struck/dimmed title + warning glyph

Active orphan tab shows an inline banner above the canvas:
   +-----------------------------------------------------------+
   | ! This layout was deleted from your Layouts list.         |
   |   Your open copy is still here.   [Save as new]  [Close]  |
   +-----------------------------------------------------------+
```

Option B - Auto-close the tab

```
Layout deleted -> tab vanishes; if it had changes, a toast:
   +-----------------------------------------------------------+
   |  Rack B was deleted. [Undo]                               |
   +-----------------------------------------------------------+
   (Figma-style; the complaint case - work can disappear from view)
```

### Recommendation: Option A

- Deleted-while-open: never auto-close, for both active and inactive tabs. The tab keeps its in-memory copy and flips to an orphan state (dimmed title + warning glyph; an inline banner on the active tab). The orphan offers "Save as new" (writes a fresh library entry / new UUID) and "Close" (discards, since the durable copy is already gone). An inactive orphan also shows the warning glyph so the user can find it. This is the VS Code `closeOnFileDelete: false` / Google Docs / Notion default and the safe choice under trust-the-model.
- Rename while open: a rename in the sidebar (or server-side) live-syncs to the open tab's title immediately. The title is shared state derived from the layout record, so the tab simply re-renders. No prompt, no divergence.
- Duplicate names across tabs: show a muted secondary qualifier on a tab title only when another open tab shares the same name. The qualifier is the layout's relative updated time (e.g. "Homelab - 2d") or, if those also match, a short id fragment (e.g. "Homelab - a3f1"). The tab's native tooltip always carries the unambiguous full name + id + storage source. Tabs with unique names show no qualifier. This mirrors VS Code's "show the distinguishing path segment only on collision" behaviour, adapted to Rackula's path-less model.

Reuse: `toast.svelte.ts` (action toast), `ConfirmDialog` not needed (orphan banner is inline); layout record `metadata.id` + `updatedAt` for disambiguation.

Defers to: #2041 (the server-side-delete path is the 404 case in section 9); #2179 (where the orphan's bytes live before Save as new).

---

## 4. Session restore mechanics

Question: what a restored-but-unloaded tab shows before focus; what happens when an unloaded tab's layout is deleted or unreadable; what happens to browser-mode working copies of closed tabs.

### Alternatives

Option A - Lazy hydrate with title + skeleton, orphan on failure (recommended)

```
On launch (full set restored, lazy):
   | Homelab |  Rack B (...)  |  Lab Spare (...) |  Studio (...) |
     loaded     not yet focused: title + quiet shimmer placeholder

Focus an unloaded tab -> hydrate its content. If the layout is gone/unreadable:
   +-----------------------------------------------------------+
   | ! Couldn't open "Lab Spare". It may have been deleted     |
   |   or its data is unreadable.        [Retry]  [Remove tab] |
   +-----------------------------------------------------------+
```

Option B - Eager load all on launch (rejected; spec already settled lazy)

### Recommendation: Option A

- Unloaded tab display: the tab shows its name (from persisted open-set metadata) plus a quiet skeleton/shimmer hint that it is not yet hydrated. It is fully clickable; focusing it triggers hydration. This matches browser lazy/discarded tabs (title + favicon, load on focus) and avoids parsing every layout's SVG at startup.
- Unloaded layout deleted/unreadable: resolve on focus, not at launch (so a bad layout never blocks startup). On focus, if the layout cannot be loaded, the tab resolves to an inline error/orphan state with Retry and Remove tab. It never silently vanishes and never shows as "deleted" when the real cause is a transient read failure (see section 7 for the server-unreachable variant).
- Browser-mode working copies of closed tabs: closing a tab does not delete the layout's durable browser copy; the layout remains in the sidebar and reopens cleanly. The precise key lifecycle (per-layout slots, eviction of truly-orphaned scratch copies) is owned by #2179. The contract this spike sets: (a) closing a tab removes it from the open set and discards its undo history only; (b) the durable copy survives; (c) an unsaved new layout that was never added to the library is the only thing a close may discard, and only after the section 2 confirm.
- Requirement this places on #2080/#2179: the persisted open-set must store enough per-tab metadata (layout id, display name, order, active flag) to render tab shells before any layout content is read. This is what makes both lazy restore and the section 7 offline-restore possible.

---

## 5. Browser-reserved shortcuts and the full keyboard map

Question: produce the full keyboard map avoiding Ctrl+W/T/Tab (and Ctrl+1-9), including close-tab and cycle-tabs, reconciling existing app shortcuts (state which survive, move, or are removed).

Hard constraint (authoritative, see `2018-external.md` section 5): Ctrl/Cmd+W, +T, +N, +Tab, +Shift+Tab, +PageUp/PageDown, and +1-9 are reserved by the browser and never reach the SPA. Tab actions must use interceptable combos and must also have mouse affordances. Alt+digit is the proven web-app pattern (Slack-on-web). Alt+letter can trigger menu access keys on Windows and special characters on macOS, so handlers must be guarded to not fire while a text input is focused.

### New tab bindings

```
Jump to tab 1..9      Alt+1 .. Alt+9        (settled in spec; mirrors Slack web)
Close current tab     Alt+W                 (mnemonic; Ctrl/Cmd+W is reserved)
Next tab              Alt+]                 (parallels bare ] = next rack)
Previous tab          Alt+[                 (parallels bare [ = previous rack)
New layout (optional) Alt+T                 (Ctrl/Cmd+T is reserved)
```

Validation note for implementation (#2096): confirm Alt+W and Alt+[ / Alt+] are interceptable on Chrome/Firefox/Safari and do not collide with Windows menu access keys; documented fallbacks are Ctrl+Alt+Left/Right (cycle) and a menu-only close if Alt+W proves unreliable. The bracket pairing (bare = rack, Alt = tab) is the recommended mnemonic.

### Reconciliation of existing shortcuts

| Shortcut | Action | Verdict |
| --- | --- | --- |
| Ctrl/Cmd+Z, +Shift+Z, +Y | undo / redo | Survive (interceptable; no tab conflict) |
| Ctrl/Cmd+S, +Shift+S | save / save as | Survive |
| Ctrl/Cmd+O | load / open | Survive |
| Ctrl/Cmd+E | export image | Survive |
| Ctrl/Cmd+H | share | Survive |
| Ctrl/Cmd+D | duplicate device/rack | Survive |
| `?` | help | Survive (generated list now includes tab keys) |
| `I` | display mode | Survive |
| `A` | annotations | Survive |
| `F` | fit all | Survive |
| `D` | toggle sidebar | Survive (distinct from Ctrl+D) |
| `[` / `]` | previous / next rack | Survive (bare); Alt+[ / Alt+] added for tabs |
| Delete / Backspace | delete selection | Survive |
| Escape | clear / close | Survive |
| arrows, Shift+arrows | move device | Survive |

Nothing is removed and nothing moves; the tab actions occupy the previously-empty Alt layer. The map is authored as command-registry entries (id, label, shortcut, scope, enabled-when) so #2096 generates both the HelpPanel list (today hand-maintained) and the menu from one source.

Reuse: `KeyboardHandler.svelte` registry, `utils/keyboard.ts` matcher, `platform.ts` `formatShortcut` (renders "Alt" vs "Option").

---

## 6. Twin-tab guard semantics (#2044)

Question: per-layout vs whole-workspace pause; same layout in two browser tabs vs two in-app tabs; is there an at-most-one-in-app-tab-per-layout invariant; what does Reload reload?

### Recommendation

- Pause granularity: per layout, not whole workspace. Editing layout A in browser tab 1 must not pause layout B that happens to be open in browser tab 2. The guard is a Web Lock keyed by layout id (`navigator.locks.request("layout:<id>", { ifAvailable: true })`); the tab that holds the lock is the active editor for that layout, others go read-only/paused for that layout only.
- Same layout in two browser tabs: the second browser tab fails to acquire `layout:<id>`, shows a per-layout banner ("This layout is open in another tab" with Read-only / Take over), and does not autosave. BroadcastChannel notifies peers of saves/closes so the banner updates live and a freed lock can be taken over.
- Same layout in two in-app tabs (one browser context): disallowed by invariant. Opening a layout that is already an open tab focuses the existing tab rather than creating a second tab (the spec already says "Opening a layout from the sidebar focuses its tab if already open"). So the at-most-one-editable-in-app-tab-per-layout invariant holds within a browser context and is enforced at open time.
- Reload action: reloads that one layout's working copy from its durable home (re-reads the server record or the browser slot for that layout id), replacing the paused tab's content; it does not reload the whole workspace or other tabs.

This makes #2044 a frontend-only concern (Web Locks + BroadcastChannel, both Baseline 2022, no backend). Cross-reference the storage spike (#2019) which already specified "twins detect-and-pause via the storage event with a per-tab id, Web Locks serialising writes"; this spike supplies the per-layout granularity and the at-most-one-tab invariant.

---

## 7. Whole-set restore failure in server mode

Question: server unreachable at launch with a multi-tab set (the storage spike #2019 defined continuity for a single working copy only).

### Recommendation

```
Launch, server unreachable, 4 tabs persisted:
   | Homelab (!) | Rack B (!) | Lab Spare (!) | Studio (!) |
   +-----------------------------------------------------------+
   | (!) Can't reach the server. Your tabs are here; retrying. |
   |     Layouts will load when the connection is back. [Retry]|
   +-----------------------------------------------------------+
```

- Render the tab shells from persisted open-set metadata (id, name, order, active) so the workspace looks intact, each tab in an "unreachable, retrying" state (distinct from the section 4 deleted/unreadable state).
- Show a single workspace-level banner, not one per tab. Auto-retry with backoff; on focus, attempt to load the focused layout.
- When the server returns, hydrate lazily on focus as normal. Never present an unreachable layout as deleted; "deleted" is reserved for a confirmed 404 (section 9).
- This relies on the same persisted open-set metadata required in section 4, and extends #2019's single-working-copy continuity to the multi-tab set. Feeds #2080.

---

## 8. Returning user with zero restorable layouts

Question: distinguish lost-data-empty from fresh-install-empty once StartScreen is gone (#2081).

### Alternatives

```
Fresh install (never had layouts):        Lost data (had layouts, none restorable):
+-----------------------------+           +-------------------------------------------+
|        Welcome to Rackula   |           |  We couldn't find your layouts.           |
|   [ New layout ]            |           |  They may have been cleared from this     |
|   [ Import a file ]         |           |  browser or the server is unavailable.    |
|   [ Start from a template ] |           |  [ Retry ]  [ Import a file ]  [ Start    |
+-----------------------------+           |             fresh ]                       |
   (existing WelcomeScreen)               +-------------------------------------------+
```

### Recommendation

- Distinguish the two via a persisted has-ever-had-layouts signal (a localStorage flag set the first time any layout is created or opened, plus the presence of prior open-set metadata).
- Fresh-install-empty (no signal, no prior open-set): show the existing WelcomeScreen empty state (new layout / import / template), which is where StartScreen's functions land per #2081.
- Lost-data-empty (signal present, but nothing restorable): show a distinct recovery state that does not pretend nothing was lost. It names the likely cause (browser cleared or server unavailable) and offers Retry, Import a file, and Start fresh. In server mode an unreachable server routes here in its retrying form (section 7) rather than the cheerful welcome.
- This is a design contract for #2081's empty-state routing; the flag's exact storage is a small addition the implementation owns.

---

## 9. Deleted-while-open and #2041's snapshot POST (404)

Question: the deleted-while-open case also breaks #2041's snapshot POST (404 for deleted layouts); the answer must cover where the losing copy goes.

### Recommendation

- When a save or pre-overwrite snapshot POST returns 404 because the layout was deleted server-side, do not drop the in-memory work. Convert the failure into the section 3 orphan: the tab flips to the deleted-orphan state and the failed save becomes a "Save as new" offer (writes a new library entry with a new UUID).

```
Autosave/snapshot POST -> 404 (layout deleted on server):
   +-----------------------------------------------------------+
   | ! "Rack B" was deleted on the server. Your changes are    |
   |   still here.                    [Save as new]  [Discard] |
   +-----------------------------------------------------------+
```

- "Save as new" is the single resolution for "where the losing copy goes": it lands in the library as a new layout rather than overwriting (there is nothing to overwrite) or vanishing. This composes with #2019's last-write-wins + pre-overwrite-snapshot model: a 404 is the one case where there is no server record to snapshot, so it falls through to save-as-new.
- This is the concrete contract #2041's frontend echo/conflict handler must implement for the deleted case (distinct from the updatedAt-mismatch conflict, which #2019/#2041 already cover).

---

## Deferred (referenced, not designed here)

- Undo/redo across tab switch and lazy restore: owned by #2182. This spike asserts only the interaction contract (per-layout undo, discarded on close); whether a restored tab's history is empty, checkpointed, or dangling is #2182's call.
- Browser-mode multi-layout persistence schema: owned by #2179. This spike states the contracts it must satisfy (durable copy survives close; open-set metadata holds id/name/order/active; per-tab slots; only an untitled never-saved scratch may be discarded on close).

## Cross-issue handoff

| Decision | Consumed by |
| --- | --- |
| Overflow, close affordance, drag-reorder, inactive dot, deleted/rename on active tab | #2079 |
| Unloaded placeholder, deleted/unreadable on focus, server-unreachable restore, empty states | #2080, #2081 |
| Open-focuses-existing-tab, overflow-vs-sidebar, rename sync, duplicate disambiguation | #2082 |
| Keyboard map as registry entries | #2096 |
| Per-layout pause, at-most-one-tab invariant, Reload scope | #2044 |
| 404 -> Save as new | #2041 |
| Persisted open-set metadata (id/name/order/active) | #2080, #2179 |
