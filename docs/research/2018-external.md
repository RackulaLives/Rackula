# Spike #2018 - Tabs Interaction Model: External Research

External research into how mature tools solve the tab interaction questions raised by
spike #2018 (Rackula becoming a multi-layout workspace where layouts open as tabs over a
sidebar Layouts library). Organised by research question. Each section ends with a
"Takeaway for Rackula" line. A cross-tool summary table closes the document.

Scope note: Rackula is a browser SPA with no native window chrome, so where a desktop app
(VS Code, JetBrains, Figma desktop, Slack desktop) relies on OS-level key capture, the
browser-reserved-shortcut constraints in section 5 override what that app can do. Treat
desktop-app shortcut tables as aspirational, not directly portable.

---

## 1. Tab overflow

How editors handle more open tabs than fit the bar width.

### Web browsers (Chrome / Chromium)

Chromium does not collapse tabs into a menu by default. It uses a two-phase strategy:
shrink-to-minimum, then scroll.

- Tab geometry constants (from `chrome/browser/ui/tabs/tab_style.cc`, Chromium `main`):
  - Base/standard tab content width `kTabWidth = 232` DIPs; `GetStandardWidth()` returns
    roughly 256 DIPs once corner radius is added. (Historically cited as ~240px maximum.)
  - Pinned tab content `kTabPinnedContentWidth = 24` DIPs; `GetPinnedWidth()` ~56 DIPs.
  - Minimum inactive tab: `kInteriorWidth = 16` DIPs, `GetMinimumInactiveWidth()`
    ~28 DIPs after separator overlap. Inactive tabs can shrink to roughly the favicon.
  - Minimum active tab: `GetMinimumActiveWidth()` = close-button size (~20 DIPs) plus
    insets, so the active tab always keeps room for its close button.
  - Source: https://source.chromium.org/chromium/chromium/src/+/HEAD:chrome/browser/ui/tabs/tab_style.cc
- As more tabs open, all inactive tabs shrink uniformly toward that ~28px floor; the
  active tab stays wider. Once the floor is hit, default Chrome stops adding tabs to the
  visible strip and overflows.
- A scrollable tab strip is gated behind `chrome://flags/#scrollable-tabstrip`. With it
  on, the shrink threshold is tunable (tabs shrink to pinned width / medium / large / do
  not shrink) and left/right scroll buttons appear once tabs overflow.
  - https://www.ghacks.net/2022/08/29/how-to-set-a-minimum-tab-width-in-google-chrome/
  - https://www.techradar.com/news/chrome-has-a-secret-scrollable-tabstrip-option-heres-how-to-enable-it
- Separate from the strip, Chrome ships Tab Search (Ctrl+Shift+A): a dropdown listing
  all open tabs plus recently-closed tabs. This is a search list, not a per-document
  library, but it is the closest thing to an "overflow menu mirroring a document list".

Firefox shrinks tabs to a configurable minimum (`browser.tabs.tabMinWidth`, default
~76px) then shows horizontal scroll arrows plus an "all tabs" (v) dropdown menu listing
every open tab. So Firefox does both: scroll AND a collapse-to-menu list.
- https://www.makeuseof.com/set-minimum-tab-width-firefox-chrome/

### VS Code

VS Code is the richest model and the best reference for Rackula. Three relevant axes:

- `workbench.editor.tabSizing` with options:
  - `fit` (default): each tab sized to fit its label; the strip overflows.
  - `shrink`: tabs shrink as more open, down to a minimum, before overflowing.
  - `fixed`: every tab the same width, bounded by
    `workbench.editor.tabSizingFixedMinWidth` and `tabSizingFixedMaxWidth`. The min is
    50px, chosen to leave room for the close button plus icon or partial title.
  - https://github.com/microsoft/vscode/pull/181729 (fixed-width tabs PR; 50px floor)
  - https://github.com/microsoft/vscode/issues/247711 (`tabSizingMaxWidth`)
- Overflow when single-row: a scroll bar appears between the tab strip and the editor; you
  drag/scroll hidden tabs into view. There is also a chevron / "..." overflow dropdown
  and the Open Editors view in the Explorer (toggled via the `...` button) that lists
  every open editor as a dropdown - i.e. the overflow list *does* mirror a separate
  document list.
  - https://code.visualstudio.com/docs/getstarted/userinterface
- Multi-row: `workbench.editor.wrapTabs` (Wrap Tabs) wraps tabs onto multiple rows above
  the editor instead of scrolling.

### JetBrains IDEs (IntelliJ / Rider / etc.)

Configured at Editor | General | Editor Tabs (Ctrl+Alt+S):

- Show tabs in one row (classic UI) / "Show tabs in: One row | Multiple rows" (new
  UI). Clearing one-row wraps tabs onto additional rows automatically.
- When in one row, "Hide tabs if there is no space" chooses between *squeeze* (shrink
  tabs) and *hide overflow into a drop-down list* reached via the "Show Hidden Tabs"
  triangle button at the right end of the strip. New UI also offers mouse-wheel/scroll.
- Tab limit field: default 10 open files; opening more auto-closes the oldest
  un-pinned tab (LRU eviction). Max 100 without registry edits. Pinning a tab exempts it.
- Placement: Top (default) / Bottom / Left / Right / None.
- https://www.jetbrains.com/help/rider/Managing_Editor_Tabs.html

The auto-close-oldest "Tab limit" is a notable pattern: it bounds the strip by *evicting*
documents (they stay on disk) rather than scrolling or wrapping.

### Figma / draw.io / Excalidraw (multi-document / page handling)

- Figma desktop opens files as OS-style tabs; when too many open, the desktop app's
  tab bar overflows and users report tabs becoming unreachable (no robust overflow menu),
  a long-standing complaint. Figma's primary multi-document surface is the file browser
  (sidebar of projects/files), not the tab bar. Pages *within* a file live in a left-panel
  Pages list, not tabs.
  - https://forum.figma.com/t/desktop-figma-app-too-many-tabs-open-cant-view-the-tabs-dont-fit-in-the-horizontal-view/59664
- draw.io / Excalidraw treat multiple diagrams as named pages along a bottom strip
  (spreadsheet-style), with a "+" and a page menu, rather than browser-style top tabs.
  Overflow is handled by a scroll/menu on that bottom strip.

### Takeaway for Rackula

Adopt the VS Code model: a `tabSizing` mode (start with shrink down to a ~50px floor
that always preserves the close button), then a chevron overflow dropdown that mirrors
the sidebar Layouts library (so the overflow menu and the library are the same mental
model). Avoid multi-row wrapping initially; it is the least-loved option. Consider a
JetBrains-style soft cap that nudges users to the sidebar rather than auto-evicting.

---

## 2. Close vs delete language & safety

Making "close" feel non-destructive and clearly distinct from "delete".

### Web browsers

- "Close tab" is fully recoverable: Ctrl/Cmd+Shift+T reopens the last-closed tab, and
  repeated presses walk back the close stack in reverse order. Also exposed via tab-bar
  right-click "Reopen closed tab" and History > Recently closed.
  - https://www.microsoft.com/en-us/edge/learning-center/how-to-reopen-closed-tabs
  - https://support.google.com/chrome/thread/286831772
- The wording is strictly "Close" - never "Delete". Closing never destroys the underlying
  page (it is a URL, re-fetchable). This is the cleanest mental separation: close = remove
  from view, delete = does not exist as a tab concept at all.

### VS Code

- "Close" (Ctrl/Cmd+W) closes the editor tab; the file persists on disk. Reopen via
  Ctrl/Cmd+Shift+T (reopen closed editor) or the recently-opened list.
- "Delete" is a separate, explicitly destructive Explorer action with its own confirm
  ("Are you sure you want to delete X? You can restore from Trash."), routing to the OS
  trash. The two verbs are never conflated.
- Closing a tab with unsaved changes prompts: Save / Don't Save / Cancel (a modal
  dirty-state guard). See section 4 for the Hot Exit variant.

### Google Docs / Sheets

There is no "close that keeps it" because there is no manual save: continuous autosave
to Drive means closing the browser tab simply leaves the doc in Drive untouched. Google
makes this obvious through the persistent "All changes saved in Drive" status text /
green-check indicator next to the title, so the user trusts that closing loses nothing.
- https://thetoolstrunk.com/does-google-docs-automatically-save/
Deletion is a distinct, explicitly-named action ("Move to trash") with a bottom undo
toast ("Moved to trash" + UNDO) and a 30-day Drive Trash retention.

### Figma

- Two clearly separated verbs. Closing a file (closing the tab / "leave the file") removes
  it from *your* view only and affects no collaborators.
- "Move to trash" is the destructive verb; the doc explicitly warns it "will remove the
  file for all collaborators, not just yourself." Trash is restorable (right-click >
  Restore, preserving comments/version-history/library links). Figma keeps files in trash
  until explicitly emptied (no fixed auto-purge documented), distinct from "permanently
  delete".
  - https://help.figma.com/hc/en-us/articles/360047512294-Delete-and-restore-files
- Community feedback specifically asks Figma to *separate* "Move to trash" from "Move file"
  in menus to prevent mis-clicks - a cautionary note on menu adjacency.

### Recoverable-deletion patterns observed

1. Reopen-closed stack (browsers, VS Code): close is cheap, ordered, keyboard-driven.
2. Undo toast (Google, Notion Cmd/Ctrl+Z): immediate single-action reversal.
3. Trash with retention (Google 30d, Notion 30d, Figma until-emptied, VS Code OS
   trash): durable second chance, separate destructive verb.

### Takeaway for Rackula

Use "Close" for tab dismissal and reserve "Delete" (or "Move to trash") for
removing a layout from the library - never overload one word. Closing a tab should keep
the layout in the sidebar library (the Google Docs model: closing just leaves it in the
"Drive"). Give delete an undo toast and/or a trash with retention. If closing a tab
with unsaved local changes, show a Save/Discard/Cancel guard (unless autosave makes this
moot).

---

## 3. Delete / rename while open (collaborative / multi-client)

What happens when a document is deleted or renamed elsewhere while a user has it open.

### Google Docs

- Live rename syncs into the open tab title automatically (collaborative model: the
  title is shared state). The open editor keeps working.
- If the doc is moved to trash elsewhere, the editing client surfaces a banner /
  "This item has been moved to trash" state; the still-open client retains the in-memory
  document and the work is recoverable via Drive Trash (30 days) or version history. Google
  also keeps client-side edits ~10 minutes post-close if the session is alive.
  - https://www.quora.com/What-happens-if-you-delete-a-document-from-Google-Docs
- Net behaviour: it does not silently nuke your open editor; it degrades to a banner +
  recoverable trash.

### Notion

- Deleting a page elsewhere does not lose your data as long as the browser tab
  holding that page stays open - the open client keeps the content in memory; the page
  goes to Trash (30-day retention), and Cmd/Ctrl+Z undoes the most recent delete.
  - https://www.usecarly.com/blog/how-to-recover-deleted-page-in-notion/
- Rename propagates live to the page title across clients (shared CRDT/state model).

### Figma

- Moving a file to trash "remove[s] the file for all collaborators." A collaborator with it
  open is dropped to an error / file-unavailable state; recovery is via restore-from-trash
  (preserving comments, version history, library connections).
  - https://help.figma.com/hc/en-us/articles/360047512294-Delete-and-restore-files
- Rename propagates live to the open file's title.

### VS Code (file deleted on disk while open)

- Governed by `workbench.editor.closeOnFileDelete` (default false). When false, the
  editor stays open as an orphaned buffer marked "deleted from disk"; if the buffer was
  dirty, edits are preserved and the user can re-save (effectively "save as new"). When
  true, the editor closes automatically.
  - https://github.com/microsoft/vscode/issues/23242
  - https://github.com/microsoft/vscode/issues/11642
- Rename on disk: VS Code re-associates the open editor with the new path where it can
  (e.g. via file-watcher rename events) and updates the tab label.

### Pattern summary

| Behaviour on delete-while-open | Tools |
| --- | --- |
| Keep open as recoverable orphan (don't close) | VS Code (default), Google Docs, Notion |
| Close / error the open client | Figma |
| Rename syncs live to tab title | All four |

The dominant safe pattern is do not auto-close; keep the in-memory copy and offer
recover / save-as-new, plus restorable trash.

### Takeaway for Rackula

When a layout is deleted/renamed in the sidebar while open in a tab: never silently close
the tab. Sync renames straight to the tab title; on delete, keep the tab as an orphaned
in-memory copy with a banner ("This layout was deleted") offering Save-as-new / Restore.
Back it with an undo toast + short retention. Since Rackula is single-user local-first,
the "collaborative" edge is really cross-tab (same browser) - see section 6.

---

## 4. Session / workspace restore

Restoring a multi-tab session after restart.

### Browsers ("continue where you left off" + lazy/discarded tabs)

- Chrome/Firefox "On startup > Continue where you left off" reopens the prior tab set.
  Restored background tabs are lazy-loaded: the tab shows its title + favicon in
  the strip but the page is not rendered until focused, at which point it loads from the
  network.
- Chrome Memory Saver (Chrome 110+) does the same to live tabs: discards background
  tabs after inactivity (~5 min when RAM is low; ML-informed since Chrome 140). A
  discarded tab keeps its title and favicon in the strip; on revisit the page reloads
  and form content + scroll position are restored the same way back/forward nav does.
  - https://developer.chrome.com/blog/memory-and-energy-saver-mode
  - https://developer.chrome.com/blog/tab-discarding
- If a restored/lazy tab's underlying resource is gone (URL 404s on load), the tab
  simply shows the error page when focused; the strip entry persists until closed. Nothing
  is restored because nothing was kept beyond the URL + serialized form state.

### VS Code (restore previous workspace + Hot Exit)

- `window.restoreWindows` reopens the previous workspace/window layout on launch.
- Hot Exit (`files.hotExit`) persists *unsaved* buffers to a backup folder on quit and
  restores them on next launch - so closing with dirty files does not prompt:
  - `onExit` (default): triggers when the app fully closes (last window). Windows without a
    folder are restored.
  - `onExitAndWindowClose`: also preserves unsaved files when closing any single window.
  - https://code.visualstudio.com/blogs/2016/11/30/hot-exit-in-insiders
- If a restored editor's file no longer exists on disk, it reopens as the orphaned
  "deleted from disk" buffer (per section 3) rather than vanishing; unsaved Hot-Exit
  content is still presented so the user can re-save.

### Takeaway for Rackula

Persist open-tab state (which layouts, order, active tab, dirty buffers) to
localStorage/IndexedDB and restore on load. Render restored tabs lazily: show
name + a placeholder icon immediately, hydrate the SVG/layout on focus (cheap, matches
browser behaviour and avoids parsing every layout at startup). If a restored tab points at
a layout that no longer exists in the library, keep the tab as a recoverable orphan
(section 3) instead of dropping it. Treat unsaved local edits like Hot Exit: back them up
so a refresh/crash never loses work.

---

## 5. Keyboard shortcuts - browser-reserved vs interceptable

Authoritative basis for which combos a web app can and cannot intercept.

### Cannot be intercepted (reserved by the browser UA)

Chrome/Chromium and other UAs do not dispatch keydown events for shortcuts bound to
browser-UI tab/window management, so `preventDefault()` can never block them:

- Ctrl/Cmd+W (close tab), Ctrl/Cmd+T (new tab), Ctrl/Cmd+N (new window),
  Ctrl+Tab / Ctrl+Shift+Tab (cycle tabs), Ctrl+PageUp/PageDown, and
  Ctrl/Cmd+1..9 (jump to tab N) are reserved.
- Rationale (W3C / browser implementers): if a page could swallow these, a keyboard-only
  user could be trapped in a page with no way to switch/close tabs. The reservation is a
  deliberate accessibility/security guarantee.
  - https://lists.w3.org/Archives/Public/public-webapps-github/2016Jan/0255.html
  - https://www.robin-drexler.com/2015/07/07/overriding-default-browser-shortcuts
  - https://dev.to/lico/react-overriding-browsers-keyboard-shortcuts-19bf
- MDN `KeyboardEvent`/`Event.preventDefault()` note that default actions can be cancelled
  only for events the page actually receives; UA-reserved accelerators are not cancellable.
  - https://developer.mozilla.org/en-US/docs/Web/API/Event/preventDefault

### Can be intercepted (safe candidates for a web app)

- Ctrl/Cmd+F, Ctrl/Cmd+R, Ctrl/Cmd+S, Ctrl/Cmd+P etc. *can* be `preventDefault()`-ed
  (Rackula already uses Ctrl+S/O/E/H/D - confirmed interceptable).
- Alt+number and Alt+letter generally reach the page on Chrome/Edge and can be
  bound. Slack uses sequential cycling - Ctrl+Tab / Ctrl+Shift+Tab for next/prev
  workspace and Ctrl/Cmd+number to jump to workspace N - but those are documented for
  the desktop app, where the app captures keys at the OS level. In the browser,
  Ctrl+Tab and Ctrl/Cmd+number are *reserved* and unavailable, which is exactly why web
  apps that need numbered jumps gravitate to Alt+number.
  - https://slack.com/help/articles/201374536-Slack-keyboard-shortcuts
- Gotcha: on Windows, Alt+letter triggers menu access keys (and Alt alone focuses the
  browser menu bar), so Alt+letter is risky cross-platform; Alt+digit is safer than
  Alt+letter. On macOS, Alt (Option)+letter inserts special characters in text fields, so
  guard against firing while a text input is focused.

### Good interceptable bindings for Rackula

- Close tab: Ctrl/Cmd+W is unavailable. Use a non-reserved combo, e.g. Alt+W or a
  Rackula-specific key, and expose close via the tab's X and context menu. (Do not rely on
  intercepting the browser's close.)
- Cycle next/prev tab: Ctrl+Tab is unavailable. Use Alt+PageDown / Alt+PageUp or
  Alt+] / Alt+[ (VS Code's "next/previous editor" defaults to Ctrl+Tab/Ctrl+PageDown,
  which a web app cannot reuse - pick Alt-based equivalents).
- Jump to tab N: Alt+1..9 (mirrors Slack-on-web and avoids the reserved Ctrl/Cmd+1..9).

### Takeaway for Rackula

Treat Ctrl/Cmd+W, +T, +Tab, and +1..9 as off-limits - never bind tab actions to them;
they will never reach the SPA. Build tab close/cycle/jump on Alt+digit / Alt+bracket /
Alt+PageUp-Down, guard handlers so they don't fire inside text inputs, and always provide
a visible mouse affordance (X button, context menu) since no keyboard shortcut is
guaranteed.

---

## 6. Multi-instance / same-doc-in-two-tabs

How web apps handle the same document open in two browser tabs.

### Primitives

- Web Locks API (`navigator.locks`, Baseline since March 2022, all major browsers,
  HTTPS only): same-origin tabs/workers acquire named locks. `request(name, cb)` holds an
  exclusive (default) or shared lock for the duration of the callback; `query()`
  introspects who holds/wants a lock; `ifAvailable: true` fails fast instead of queuing;
  `steal`/`signal` allow preemption/timeout. The canonical use is leader election: many
  tabs request `"doc:<id>"`, exactly one wins and becomes the writer.
  - https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API
  - https://github.com/w3c/web-locks/blob/main/EXPLAINER.md
- BroadcastChannel: same-origin tabs post/receive messages on a named channel - used
  *alongside* Web Locks to tell other tabs "I am the active editor of doc X" / "doc X
  changed, reload" / "doc X was closed, you may take over".
  - https://medium.com/@piyalidas.it/angular-cross-tab-sync-with-broadcastchannel-api-web-locks-api-ac31eff0a947

### Concrete patterns

- Per-document lock (recommended): lock name keyed by document id (`"layout:<id>"`),
  not a single app-wide lock. Tab A holds it and edits; tab B, on open, calls
  `request("layout:<id>", { ifAvailable: true })`, fails, and shows a banner
  ("This layout is open in another tab - open read-only / take over"). When A's tab closes
  or crashes, its lock releases automatically and B can acquire it. The W3C explainer cites
  exactly this "coordinate which tab actively edits, know when the active tab goes away"
  scenario.
- Per-app lock: a single `"net_db_sync"` lock ensures only one tab syncs to storage at
  all (prevents two tabs racing on the same IndexedDB/localStorage). Coarser; good for a
  background sync/save loop even when different docs are open.
- "Open elsewhere" warning (Google Docs, banking apps): combine Web Locks leader
  election + BroadcastChannel to surface a user-visible warning rather than silently letting
  two tabs clobber each other. Loke.dev and SitePen document production patterns.
  - https://loke.dev/blog/solving-browser-concurrency-web-locks-api
  - https://www.sitepen.com/blog/cross-tab-synchronization-with-the-web-locks-api
- CRDT/merge (Google Docs, Notion, Figma): rather than lock, they merge concurrent
  edits via operational transforms / CRDTs so two clients of the same doc just converge.
  This is heavyweight; only worth it if Rackula ever needs true concurrent editing.

### Per-document vs per-app distinction

- Per-document locking is the right granularity when independent docs can be edited
  concurrently in different tabs (Rackula's case: layout A in tab 1, layout B in tab 2 must
  both work). Lock the document, not the app.
- Per-app locking is for shared singletons (a single writer to the local store, a
  single sync worker). You may want both: a per-app lock around the persistence/save loop
  AND a per-document lock to detect same-layout-twice.

### Takeaway for Rackula

Since Rackula is local-first in one browser, the realistic conflict is the same layout
open in two tabs of the same origin. Use the Web Locks API keyed per layout id
(`navigator.locks.request("layout:<id>", { ifAvailable:true })`) for leader election plus
BroadcastChannel to notify other tabs of saves/closes, and show an "open in another
tab" banner offering read-only or take-over. Add a single per-app lock around the
persistence write loop so two tabs never corrupt the shared local store. Both APIs are
Baseline (2022+) and need no backend.

---

## Cross-tool summary table

| Question | Dominant convention across mature tools | Recommended for Rackula |
| --- | --- | --- |
| 1. Tab overflow | Shrink tabs to a min (~28-76px browsers; 50px VS Code fixed-min) then scroll; VS Code/Firefox/JetBrains also expose a chevron/"all tabs" dropdown that mirrors a document list. JetBrains caps at 10 tabs with LRU eviction. Multi-row exists (VS Code wrapTabs, JetBrains) but is least popular. | `tabSizing: shrink` to ~50px floor (preserve close button), then a chevron overflow dropdown that is the sidebar Layouts library. Skip multi-row. |
| 2. Close vs delete | "Close" is non-destructive everywhere and never called "Delete"; reopen-closed (Ctrl/Cmd+Shift+T). Delete is a separate verb ("Move to trash") with undo toast + 30-day retention (Google/Notion) or until-emptied trash (Figma) + dirty-state save prompt. | "Close" keeps layout in library; "Delete/Move to trash" is the only destructive verb, with undo toast + retention; save guard on dirty close. |
| 3. Delete/rename while open | Keep open as recoverable orphan, don't auto-close (VS Code default, Google Docs, Notion); Figma errors the open client. Renames sync live to the tab title in all. | Sync renames to tab title; on delete keep the tab as orphaned in-memory copy with Save-as-new/Restore banner + undo. |
| 4. Session restore | Reopen prior tab set; lazy/discarded tabs show title+favicon and hydrate on focus (Chrome Memory Saver restores form+scroll). VS Code Hot Exit persists unsaved buffers; missing resource reopens as orphan, not dropped. | Persist tab set + dirty buffers to IndexedDB; lazy-hydrate on focus; missing layout becomes recoverable orphan; back up unsaved edits (Hot-Exit style). |
| 5. Keyboard shortcuts | Ctrl/Cmd+W, +T, +N, +Tab, +PageUp/Down, +1..9 are UA-reserved and undeliverable to web pages. Slack's Ctrl+Tab/Ctrl+number work only in its desktop app; web apps use Alt+number. Alt+letter risks Windows menu access keys / macOS special chars. | Never bind tab actions to reserved combos. Use Alt+digit (jump), Alt+PageUp/Down or Alt+[ /] (cycle), Alt+W or custom (close); guard against text inputs; always provide mouse affordances. |
| 6. Same doc in two tabs | Web Locks API (leader election, Baseline 2022) + BroadcastChannel for "open elsewhere" warnings; per-document lock granularity; CRDT merge only in heavyweight collab tools (Google/Notion/Figma). | Per-layout Web Lock (`ifAvailable`) + BroadcastChannel for "open in another tab" banner (read-only/take-over); plus a per-app lock around the local-store write loop. No backend needed. |

---

### Primary sources

- Chromium tab geometry: https://source.chromium.org/chromium/chromium/src/+/HEAD:chrome/browser/ui/tabs/tab_style.cc
- Chrome scrollable tabstrip: https://www.ghacks.net/2022/08/29/how-to-set-a-minimum-tab-width-in-google-chrome/
- VS Code fixed-width tabs PR (50px min): https://github.com/microsoft/vscode/pull/181729
- VS Code UI / overflow + wrapTabs: https://code.visualstudio.com/docs/getstarted/userinterface
- VS Code Hot Exit: https://code.visualstudio.com/blogs/2016/11/30/hot-exit-in-insiders
- VS Code closeOnFileDelete: https://github.com/microsoft/vscode/issues/23242
- JetBrains editor tabs (one-row, hide-if-no-space, tab limit 10): https://www.jetbrains.com/help/rider/Managing_Editor_Tabs.html
- Figma delete/restore + trash: https://help.figma.com/hc/en-us/articles/360047512294-Delete-and-restore-files
- Chrome Memory Saver / discarded tabs: https://developer.chrome.com/blog/memory-and-energy-saver-mode , https://developer.chrome.com/blog/tab-discarding
- Reopen closed tab: https://www.microsoft.com/en-us/edge/learning-center/how-to-reopen-closed-tabs
- Browser-reserved shortcuts (W3C / discussion): https://lists.w3.org/Archives/Public/public-webapps-github/2016Jan/0255.html , https://www.robin-drexler.com/2015/07/07/overriding-default-browser-shortcuts
- Slack shortcuts (desktop): https://slack.com/help/articles/201374536-Slack-keyboard-shortcuts
- Web Locks API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API , https://github.com/w3c/web-locks/blob/main/EXPLAINER.md
- Cross-tab patterns: https://loke.dev/blog/solving-browser-concurrency-web-locks-api , https://www.sitepen.com/blog/cross-tab-synchronization-with-the-web-locks-api
- Notion delete/recover: https://www.usecarly.com/blog/how-to-recover-deleted-page-in-notion/
