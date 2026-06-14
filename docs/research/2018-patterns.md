# Spike #2018 - Pattern Synthesis

Synthesis of `2018-codebase.md` (what Rackula has) and `2018-external.md` (what mature tools
do) into the patterns and trade-offs that drive the recommendations. The full decision record
with mocked alternatives lives in `spike-2018-tabs-interaction-model.md`.

## Key insights

1. VS Code is the closest analogue to Rackula's shell: an editor with a document library
   (Explorer / sidebar) and a working set (open editors / tabs). Its overflow, close-vs-delete,
   delete-while-open (`closeOnFileDelete: false`), and Hot Exit behaviours map almost
   one-to-one onto the questions this spike owns. Borrow it rather than inventing.
2. The dominant safe pattern across browsers, VS Code, Google Docs, and Notion is never
   auto-destroy the working copy: close is recoverable, delete-while-open keeps a recoverable
   orphan, restore falls back to an orphan rather than dropping a tab. This is exactly the
   "trust the model" posture the maintainer chose, so external precedent and project intent
   agree.
3. Browser-reserved shortcuts are a hard wall, not a preference. Ctrl/Cmd+W/T/N/Tab/PageUp-Down
   and Ctrl/Cmd+1-9 never reach an SPA (W3C accessibility guarantee). Alt+digit is the proven
   web-app escape hatch (Slack-on-web). Every tab keyboard action must live in the
   interceptable set, and every action must also have a mouse affordance because no key is
   guaranteed.
4. Same-layout-in-two-tabs is solvable with zero backend using Web Locks (Baseline 2022) keyed
   per layout id for leader election, plus BroadcastChannel for the "open elsewhere" banner.
   This makes the #2044 guard a frontend-only concern and lets the pause be per-layout.
5. Rackula already owns every UI primitive needed: bits-ui Tabs (working pattern in
   SidebarTabs), an unused bits-ui ContextMenu for the overflow chevron, ConfirmDialog, a toast
   store, a first-run-notice pattern, and a dragdrop + reorder precedent (`reorderRacks`). The
   tab strip is composition of existing parts plus a layout-store registry, not new
   infrastructure.

## Reuse map (build on, do not reinvent)

| Need | Existing thing to reuse |
| --- | --- |
| Tab strip a11y/keyboarding | bits-ui Tabs (`SidebarTabs.svelte` pattern) |
| Overflow chevron menu | unused `ui/ContextMenu` (or a Popover) |
| Drag-to-reorder tabs | `utils/dragdrop.ts` + `stores/dragTooltip.svelte`, mirror `reorderRacks()` |
| First-run "close keeps it" hint | `App.svelte` first-run toast + localStorage flag pattern |
| Never-backed-up close confirm | `ConfirmDialog.svelte` |
| Orphan / deleted banners + undo | `toast.svelte.ts` (`showToast` with action) |
| Keyboard map | `KeyboardHandler.svelte` registry + `platform.ts` `formatShortcut` |
| Tab/active state | layout-store instance design (registry is the net-new part) |

## Approach trade-offs, per owned question

- Overflow: scroll vs collapse-to-menu vs multi-row vs LRU-evict. Collapse-to-chevron wins for
  a small-N workspace (homelab layouts, not 50 files); scroll hides state, multi-row is the
  least-loved option everywhere, LRU-evict surprises users. Min width follows VS Code's 50px
  close-button floor, but Rackula tabs carry a dot + label so a ~120px "comfortable min" before
  the hard floor reads better.
- Close vs delete: confirm-always vs trust-the-model. Confirm-always taxes the common safe case
  to guard a rare one; trust-the-model matches every reference tool and the chosen posture. The
  single residual risk (a browser-mode layout that exists ONLY as this unsaved working copy and
  has never been backed up) gets the one targeted confirm.
- Delete/rename while open: auto-close vs orphan. Auto-close is the Figma behaviour and the one
  users complain about; orphan-with-save-as-new is the VS Code/Google/Notion default and the
  safe choice. Rename always live-syncs to the title (universal).
- Session restore: eager vs lazy (settled lazy). The open detail is the placeholder and the
  missing-resource fallback; browsers show title + favicon and error-on-focus, which maps to
  title + skeleton and orphan-on-focus here.
- Keyboard map: the only real design freedom is which interceptable combos for close and cycle.
  Alt+W (close) and Ctrl+Alt+Arrow / Alt+PageUp-Down (cycle) are the candidates; final pick is
  validated against interception and text-input focus, and authored as command-registry entries
  for #2096.
- Twin-tab guard: per-app pause vs per-layout pause. Per-app pause would freeze layout B because
  layout A is open elsewhere, which is wrong for a multi-layout workspace; per-layout (lock keyed
  by layout id) is correct and is what Web Locks naturally expresses.

## Cross-issue impact

- #2079 (tab strip), #2080 (lazy restore), #2082 (sidebar) consume the interaction decisions
  directly as acceptance criteria.
- #2096 (command registry) consumes the keyboard map.
- #2044 (twin-tab guard) gets per-layout pause semantics + the at-most-one-editable invariant +
  Reload scope.
- #2041 (snapshot POST 404) gets the deleted-while-open -> save-as-new resolution.
- #2081 (StartScreen removal) gets the lost-data-empty vs fresh-install-empty distinction.
- Deferred: #2182 (undo across switch/restore), #2179 (browser per-layout storage schema). This
  spike states the interaction contract those issues must satisfy but does not design them.
