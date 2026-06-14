# Spike #2182: Undo/Redo Semantics Across Snapshot Restore and Tab Switching

Date: 2026-06-14
Status: Resolved (binding)
Milestone: M14 (Canvas UX Overhaul), wave 0
Epic: #2017
Gates: #2080 (lazy tab restore)
Informs: #2079 (tab strip), #2042 (snapshot restore)
Codebase notes: docs/research/2182-codebase.md
Related spikes: #2018 (tabs interaction model), #2179 (browser storage schema), #2019 (storage model and data safety)

## Executive summary

The governing decision is: undo history is owned per layout store instance, the
active tab's history is the only live history, and a snapshot restore is a fresh
hydration that resets that tab's history rather than an entry on the stack. None of
this is a human-only call. The spec (Canvas UX Overhaul, Decision log) and spike
#2018 already fix the high-level posture ("the undo stack is per layout and is
discarded when its tab closes"). This spike nails the three mechanics those
statements leave open:

1. Tab switching does not touch any history stack. Each open layout owns its own
   `HistoryStore`; switching tabs swaps which instance the global keyboard handler
   and toolbar read from. The redo stack of an inactive tab is preserved exactly as
   the user left it. Nothing is cleared on switch.
2. Snapshot restore is a hydration, not an undoable command. Restoring a snapshot
   (#2042 / spike #2019) replaces the active layout's content and clears that tab's
   history, exactly like opening a layout. Ctrl+Z after a restore does not back the
   restore out; undoing a restore is a separate Restore action in the load dialog
   reaching the auto-snapshot that spike #2019 already takes before a divergent
   write. Modelling restore as a load matches the user's mental model ("I loaded a
   different version") and keeps a whole-layout clone off the undo stack.
3. History is in-memory only and never persisted. A closed tab discards its
   history. A lazily-restored tab (#2080) hydrates with an empty history. The undo
   stack is not written to localStorage, not carried across reloads, and not part
   of the persisted open-set metadata.

This keeps the model honest: undo always replays against the layout the commands
were recorded against, because a tab's history and its layout instance live and die
together. It removes the existing latent bug where `loadLayout()` leaves a dangling
stack against the previous layout (codebase notes, Constraint 1).

## Why this is an engineering call, not a human-only one

The spec's Decision log already states the binding posture: "The undo stack is per
layout and is discarded when its tab closes. Launch restores the full open tab set
lazily (only the active layout's content loads)." Spike #2018 repeats it. There is
no product trade-off left for a human to weigh: a global cross-tab undo stack would
contradict an already-shipped decision and the per-instance architecture that
#1398-era decomposition was built for. The only open work was mechanical precision,
which is what this document supplies. Proceed.

## Technical findings (current code)

The codebase is already shaped for this decision. Verified against the live source:

- `HistoryStore` is an instantiable factory (`createHistoryStore()` in
  `src/lib/stores/history.svelte.ts`) holding two `$state` arrays (undo, redo), a
  hard cap of `MAX_HISTORY_DEPTH = 50` with FIFO trim, and a `clear()` method.
- `createLayoutStore(history = createHistoryStore())` takes a history instance.
  Today the session binds the module singleton: `createLayoutStore(getHistoryStore())`
  (layout.svelte.ts line 1215). The per-instance path the tab system needs already
  exists; the workspace just stops sharing one instance.
- A command holds closures over before/after primitives (indices, old/new values),
  not full layout snapshots. Most commands are tiny. The exceptions
  (`REMOVE_DEVICE`, `DELETE_DEVICE_TYPE`) `structuredClone` the removed entity plus
  its placement image blob into the command.
- `loadLayout()` (`src/lib/stores/layout/layout-lifecycle.ts`) wholesale-replaces
  layout state and calls `resetBackupTracking()`, but never touches history. This is
  the dangling-stack hazard the spike removes.
- `clearHistory()` is already a public method on the layout store
  (layout.svelte.ts line 1202), and `resetLayout()` calls `history.clear()`. The
  levers exist.
- The image store is a module-level GLOBAL singleton (`getImageStore()` in
  `src/lib/stores/images.svelte.ts`), keyed by device id (`placement-<deviceId>`),
  NOT owned per layout store. This is the one cross-tab coupling that constrains the
  design (see Constraints).
- No tab or workspace store exists yet. Per-tab history is greenfield. The keyboard
  handler (`KeyboardHandler.svelte`) listens at `window` and reads through
  `getLayoutStore()`; making it read the active tab's store is the integration point.

## Decision

### D1. History is per layout store instance, one live instance at a time

Each open layout is backed by its own `LayoutStore`, constructed with its own
`createHistoryStore()`. The workspace store (#2079) owns the map of open layout
instances and an `activeId`. "The active history" is defined as the active tab's
layout store's history. Switching tabs reassigns the active instance; it does not
mutate, clear, or rebuild any stack.

Consequence: an inactive tab's undo and redo stacks are frozen exactly as the user
left them. Returning to that tab and pressing Ctrl+Z resumes its own history. There
is no global undo that crosses layouts, and Ctrl+Z can never edit a layout the user
is not looking at.

### D2. Switching tabs never clears the redo stack

The redo stack is cleared only by a new executed command (existing
`HistoryStore.execute` behaviour). Tab switching executes no command, so redo
survives a round trip away from and back to a tab. This is the editor-standard
expectation and falls out of D1 for free: a different tab's edits run against a
different history instance and cannot invalidate this tab's redo.

### D3. Snapshot restore is a hydration that resets history, with an auto-snapshot for back-out

Restoring a snapshot (#2042, surfaced from the load dialog per spike #2019, which
specifies restore lands "as a new write rather than an in-place revert") goes through
the same `loadLayout()` hydration path as opening a layout, and therefore clears the
active tab's history (D4). It is not pushed onto the undo stack.

Back-out is handled the way spike #2019 already provides for it, not by Ctrl+Z:
spike #2019 takes an automatic pre-overwrite snapshot of the losing copy before a
divergent write. A restore is exactly such a write, so the pre-restore layout is
captured as a snapshot and is reachable again from the load dialog. "Undo my restore"
is "restore the snapshot taken just before it", a deliberate dialog action, not a
keystroke.

Rationale (this reverses an earlier draft that modelled restore as a
`RESTORE_SNAPSHOT` command):

- The user's mental model of restore is a load, not an edit. Threading it onto the
  per-edit undo stack is schema-first thinking that surprises the user.
- A command would carry a full-layout `structuredClone` as before-state. Under the
  50-cap FIFO trim, that command ages out after 50 ordinary edits, so the single most
  consequential action becomes silently un-undoable exactly when "back all the way
  out" is the real intent. Hydration sidesteps the cap entirely.
- A command makes restore reachable by redo. Ctrl+Shift+Z would re-apply a wholesale
  destructive layout swap with zero friction, far less friction than the dialog the
  restore came from. Hydration removes that gun.
- Hydration still closes the dangling-stack bug: the stack is cleared, not orphaned.

Note for #2042: every content swap into an open tab (file open, lazy hydration,
snapshot restore) is a hydration and clears history. There is no undoable-restore
command. The only "undo" of a restore is reloading the auto-snapshot from the dialog.

### D4. loadLayout into an already-open tab clears that tab's history

Hydrating a layout into a tab is a fresh start, not an edit. When a tab's layout
store loads content via `loadLayout()` (lazy hydration on focus, or file open into
the active tab), it clears that instance's history first. This fixes Constraint 1
from the codebase notes: today `loadLayout()` leaves the old stack live, so Ctrl+Z
replays commands recorded against a different layout. Add a `history.clear()` to the
load path (or call the existing `clearHistory()` immediately after load).

Boundary rule, stated once: all content swaps into a tab are hydrations, and every
hydration clears that tab's history. File open, lazy restore on focus (#2080), and
snapshot restore (#2042, D3) all route through the same clear-then-load primitive.
There is no second "fast" hydration path that skips the clear: a future refactor that
adds one would reintroduce the dangling-stack bug. Editing is the only thing that
records commands; loading never does.

### D5. History is in-memory only; closing or never-loading a tab means empty history

- Closing a tab discards its layout store instance and therefore its history. The
  durable layout copy survives in storage and the sidebar (spec, spike #2018). No
  confirmation tied to history; closing is non-destructive to the layout.
- A lazily-restored tab (#2080) starts with an empty history when it hydrates. The
  persisted open-set metadata (#2179: `Rackula:workspace`) carries id, name, order,
  and active flag only. It does not carry undo stacks. Reopening the app gives every
  tab a clean slate. We do not persist or rehydrate command stacks.
- Therefore an unloaded tab has no history object at all until focus hydrates it.
  `canUndo` for an unloaded tab is false by construction.

### D6. The global image store is the one shared resource; commands self-contain their blobs

The image store is global and keyed by device id, shared across all open tabs
(verified). This is the real cross-tab landmine, ahead of the command stacks. Two
things are locked here:

- Undo correctness does not depend on the image store surviving unchanged, because
  `REMOVE_DEVICE` / `DELETE_DEVICE_TYPE` commands already `structuredClone` the image
  blob into the command and restore it under the (possibly remapped) device id. A
  tab's history is self-sufficient for its own undo.
- Device-id uniqueness across open tabs must be ENFORCED at hydration, not assumed.
  `loadLayout` today deduplicates ids only within the layout being loaded. With tabs,
  opening or restoring a layout that reuses an id already live in another tab would
  alias `placement-<deviceId>` keys in the global image store, corrupting both tabs'
  images. The duplication of a layout, an import, or a snapshot from another session
  are exactly the paths that mint colliding ids. So hydration must regenerate ids
  against the set already live across all open tabs, not just within the incoming
  layout. This is the one change to existing behaviour the tab work requires for
  correctness; it is independent of undo but is where undo-of-image-removal would
  otherwise break.

This (and the global image store generally) is the memory and correctness hotspot to
watch, not the command stacks (see Memory).

## Memory model: N tabs by deep undo stacks

The concern in the issue ("N tabs x deep undo stacks") is real but bounded:

- Per command, most entries are a handful of primitives plus two closures: tens of
  bytes. A full 50-deep stack of typical edits (move, add, position) is a few KB.
- The expensive commands are `REMOVE_DEVICE` and `DELETE_DEVICE_TYPE`, which clone
  the entity and any placement image blob. A placement image can be tens to hundreds
  of KB. A pathological tab that deleted 50 image-bearing devices could hold several
  MB in its stack.
- Worst case across the workspace is `tabs x 50 x worst-command`. With a realistic
  open set (single digits of tabs) and mixed edits, total history memory is well
  under typical layout and image-store memory. The 50-cap is the existing safety
  valve and is kept.

Decision: no per-tab stack budget, no eviction of background-tab history, no change
to `MAX_HISTORY_DEPTH` for this spike. The cap stays at 50 per tab. If a future
memory budget (#2185) finds the open-set image-bearing-delete case dominant, the
mitigation is to trim background tabs' stacks, not to persist or share them; this is
recorded as a non-blocking follow-up, not a v1 requirement. The image store, being
global and unbounded, is the larger memory question and belongs to storage and image
work, not to this spike.

## Constraints handed to implementation

These are binding on #2079, #2080, and #2042.

C1. Workspace owns instances; "active history" is derived, never copied. The
workspace store holds `Map<layoutId, LayoutStore>` and `activeId`. The keyboard
handler and toolbar read undo/redo state from the active tab's store. Do not
maintain a separate global history object.

C2. Tab switch is pure focus change. No `clear()`, no `execute()`, no stack
mutation on switch. Redo survives. (D1, D2)

C3. Every hydration clears history on the tab it loads into, via one shared
clear-then-load primitive. File open, lazy restore (#2080), and snapshot restore
(#2042) all go through it. Add `history.clear()` to the load path so hydration never
leaves a dangling stack; do not add a second hydration path that skips the clear.
(D4) The clear itself is a small fix to existing code and removes a live bug
independent of tabs.

C4. Snapshot restore is a hydration, not a command. It routes through the same
load path (C3) and clears the active tab's history. It is NOT pushed onto the undo
stack and is NOT reachable by redo. Back-out is reloading the pre-restore
auto-snapshot from the load dialog (spike #2019 already takes that snapshot before a
divergent write). (D3) Owned by #2042; this spike defines the contract.

C5. Closed and unloaded tabs have no history. Do not persist undo stacks. Lazy
restore (#2080) hydrates with empty history. The `Rackula:workspace` open-set
metadata carries no command data. (D5) Binding on #2080.

C6. Device-id uniqueness across open tabs is enforced at hydration. Extend the
existing per-layout id regeneration in `loadLayout` to also regenerate against ids
already live in other open tabs, so the global image store keys
(`placement-<deviceId>`) never alias between layouts. Do not merely assume uniqueness.
(D6) This is the one correctness change tabs require; it is where undo-of-image-removal
would otherwise break. Binding on #2079/#2080 (whichever introduces the second open
tab).

C7. canUndo / canRedo reflect the active tab only. Tab dots and the storage chip read
durability, not history (spec: chip reads the #2035 derived durability API, not the
undo stack). Undo state is never aggregated across tabs. Binding on #2079: the
unbacked-changes dot is sourced from durability counters, not from `canUndo`.

C8. No undo across the workspace boundary. There is no "undo close tab" via the
command stack (the layout persists, so close is recoverable by reopening from the
sidebar, not by Ctrl+Z). Tab lifecycle (open, close, reorder) is workspace state,
not layout history. Binding on #2079.

## Acceptance criteria deltas for dependent issues

Handed to #2080 (lazy tab restore):

- A lazily-restored tab hydrates with an empty undo/redo history. Ctrl+Z
  immediately after first focusing a restored tab is a no-op (nothing to undo).
- The persisted open-set metadata contains no command/history data; only id, name,
  order, active flag (per #2179).
- Closing a tab discards its in-memory history; reopening from the sidebar starts a
  fresh history.

Handed to #2079 (tab strip):

- Switching tabs preserves each tab's undo and redo stacks unchanged; returning to a
  tab resumes its own history including redo.
- The unbacked-changes dot is derived from per-layout durability (#2035), never from
  `canUndo`/`canRedo`.
- The active tab's store is the single source the keyboard handler and history
  controls read from; there is no global undo stack.

Handed to #2042 (snapshot restore):

- Snapshot restore is a hydration: it routes through `loadLayout()`, clears the
  active tab's history, and is not pushed onto the undo stack or reachable by redo.
- Before restoring, the pre-restore layout is captured as a snapshot (spike #2019's
  pre-overwrite snapshot), so backing out a restore is reloading that snapshot from
  the load dialog, not Ctrl+Z.
- `loadLayout()` hydration (file open, lazy restore, restore) clears the target tab's
  history first, fixing the current dangling-stack behaviour.

## Implementation pointers (non-binding)

- The workspace store is the new piece (#2079). Give it `Map<layoutId, LayoutStore>`,
  `activeId`, and an `activeStore` derived getter. Repoint `getLayoutStore()`
  consumers (keyboard handler, toolbar, panels) at `activeStore`.
- Reuse `clearHistory()` (already public) for C3; do not invent a new API.
- Route snapshot restore through the same `loadLayout()` path as file open, after
  capturing the pre-restore layout as the spike #2019 snapshot. No new command type.
- For C6, extend `loadLayout`'s existing id-dedup (`layout-lifecycle.ts`) to seed its
  seen-id sets from the ids already live across open tabs, not just the incoming
  layout.
- Keep `MAX_HISTORY_DEPTH = 50` per instance.

## No issues created

This is a decision document. It hands acceptance criteria to existing issues
(#2079, #2080, #2042) and one small bug-fix instruction (C3) that rides whichever of
those touches the load path first. No new implementation issues are warranted.
