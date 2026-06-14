# Spike 2182: Undo/Redo Command-Stack Analysis for Snapshot Restore & Tab Switching

## Research Date
Research conducted for design spike #2182, which defines undo/redo semantics across snapshot restore and multi-layout tab switching.

## Files Examined

### History & Commands
- `/Users/gvns/code/projects/Rackula/Rackula/src/lib/stores/history.svelte.ts` — Central undo/redo manager (history stack)
- `/Users/gvns/code/projects/Rackula/Rackula/src/lib/stores/commands/types.ts` — Command interface & batch command
- `/Users/gvns/code/projects/Rackula/Rackula/src/lib/stores/commands/device.ts` — Device command implementations
- `/Users/gvns/code/projects/Rackula/Rackula/src/lib/stores/commands/rack.ts` — Rack command implementations
- `/Users/gvns/code/projects/Rackula/Rackula/src/lib/stores/commands/device-type.ts` — Device type commands
- `/Users/gvns/code/projects/Rackula/Rackula/src/lib/stores/commands/rack-group.ts` — Rack group commands

### Layout & State
- `/Users/gvns/code/projects/Rackula/Rackula/src/lib/stores/layout.svelte.ts` — Main layout store facade (source of truth)
- `/Users/gvns/code/projects/Rackula/Rackula/src/lib/stores/layout/layout-lifecycle.ts` — Layout creation/loading & snapshot restore
- `/Users/gvns/code/projects/Rackula/Rackula/src/lib/stores/layout/mutators.ts` — Raw state mutators (bypass history)
- `/Users/gvns/code/projects/Rackula/Rackula/src/lib/stores/layout/recorded-device-actions.ts` — Device actions with undo/redo
- `/Users/gvns/code/projects/Rackula/Rackula/src/lib/stores/layout/recorded-rack-actions.ts` — Rack actions with undo/redo
- `/Users/gvns/code/projects/Rackula/Rackula/src/lib/stores/layout/recorded-device-type-actions.ts` — Device type actions with undo/redo
- `/Users/gvns/code/projects/Rackula/Rackula/src/lib/stores/layout/types.ts` — LayoutStateAccess bridge interface
- `/Users/gvns/code/projects/Rackula/Rackula/src/lib/stores/layout/command-adapters.ts` — Command store adapters

### Keyboard Handling
- `/Users/gvns/code/projects/Rackula/Rackula/src/lib/components/KeyboardHandler.svelte` — Global keyboard shortcuts
- `/Users/gvns/code/projects/Rackula/Rackula/src/lib/utils/keyboard.ts` — Keyboard utilities & shortcut matching

### Tests
- `/Users/gvns/code/projects/Rackula/Rackula/src/tests/layout-undo-redo.test.ts` — Undo/redo integration tests
- `/Users/gvns/code/projects/Rackula/Rackula/src/tests/history-store.test.ts` — History store unit tests

---

## History Stack API

### Exports and Module Structure

**File:** `/Users/gvns/code/projects/Rackula/Rackula/src/lib/stores/history.svelte.ts`

**Factory Function:**
```typescript
export function createHistoryStore() {
  let undoStack = $state<Command[]>([]);
  let redoStack = $state<Command[]>([]);
  // ... returns instance with methods
}
export type HistoryStore = ReturnType<typeof createHistoryStore>;
```

**Module-Level Singleton:**
```typescript
const activeHistory = createHistoryStore();

export function getHistoryStore(): HistoryStore {
  return activeHistory;
}

export function resetHistoryStore(): void {
  activeHistory.clear();
}
```

### API Surface

Each `HistoryStore` instance exposes:

| Method/Property | Signature | Notes |
|---|---|---|
| `execute(command)` | `(command: Command) => void` | Executes command immediately, adds to undo stack, clears redo stack |
| `undo()` | `() => boolean` | Undoes last command, returns true if successful |
| `redo()` | `() => boolean` | Redoes last undone command, returns true if successful |
| `clear()` | `() => void` | Clears both undo and redo stacks |
| `canUndo` | `boolean` (getter) | Derived: `undoStack.length > 0` |
| `canRedo` | `boolean` (getter) | Derived: `redoStack.length > 0` |
| `undoDescription` | `string \| null` (getter) | Returns description of top undo item, e.g., "Undo: Move device" |
| `redoDescription` | `string \| null` (getter) | Returns description of top redo item |
| `historyLength` | `number` (getter) | Derived: `undoStack.length` |

### Data Structure

```typescript
let undoStack = $state<Command[]>([]);  // Stack of executed commands
let redoStack = $state<Command[]>([]);  // Stack of undone commands
```

- **Two separate stacks** (undo + redo), not a single pointer-based array
- Stacks are **immutable-updated** (spread into new arrays) to trigger Svelte reactivity
- Push to undo stack on `execute()`, pop from top on `undo()` and `redo()`
- **Redo stack is cleared** whenever a new action is executed (standard undo/redo behavior)

### Singleton vs Instance Model

The history store is **both**:
1. **Instantiable:** `createHistoryStore()` produces independent instances
2. **Singleton-backed:** The module maintains one active instance (`activeHistory`) via `getHistoryStore()`

**Layout store coupling:**
```typescript
// In layout.svelte.ts, line 1215:
const activeInstance = createLayoutStore(getHistoryStore());
```

Each `LayoutStore` instance receives a `HistoryStore` in its constructor. Currently, there is only one active layout, so there is only one active history. When multi-layout tabs are implemented (#2017), each tab's layout store will own its own history instance.

### Max Depth / Cap

```typescript
// In history.svelte.ts, line 15:
export const MAX_HISTORY_DEPTH = 50;

// In execute() method, line 53-55:
if (undoStack.length > MAX_HISTORY_DEPTH) {
  undoStack = undoStack.slice(-MAX_HISTORY_DEPTH);
}
```

- **Hard cap: 50 commands** in the undo stack
- Oldest commands are discarded when the limit is exceeded (FIFO trimming)
- Redo stack has no explicit cap (but is cleared whenever a new action is executed)

### What a Command Holds

**Interface:**
```typescript
export interface Command {
  type: CommandType;                // Enum: "ADD_DEVICE_TYPE", "MOVE_DEVICE", etc.
  description: string;              // Human-readable: "Move device", "Add rack"
  timestamp: number;                // Date.now() at command creation
  execute(): void;                  // Apply changes to state
  undo(): void;                     // Reverse changes
}
```

**Memory Model: Closure-Based Snapshots**

Commands **do not store full state snapshots**. Instead, they capture **before/after values** as closures:

**Example (from `device.ts`, MOVE_DEVICE):**
```typescript
export function createMoveDeviceCommand(
  index: number,
  oldPosition: number,
  newPosition: number,
  store: DeviceCommandStore,
  deviceName: string = "device",
): Command {
  return {
    type: "MOVE_DEVICE",
    description: `Move ${deviceName}`,
    timestamp: Date.now(),
    execute() {
      store.moveDeviceRaw(index, newPosition);
    },
    undo() {
      store.moveDeviceRaw(index, oldPosition);  // Closure captures oldPosition
    },
  };
}
```

**Example (REMOVE_DEVICE — stores device copy):**
```typescript
export function createRemoveDeviceCommand(
  index: number,
  device: PlacedDevice,
  store: DeviceCommandStore,
  deviceName: string = "device",
): Command {
  // Store a deep copy for restoration
  const deviceCopy = structuredClone(device);
  
  // Snapshot placement images
  const imageStore = getImageStore();
  const imageKey = `placement-${device.id}`;
  const imageSnapshot = imageStore.getAllImages().get(imageKey);
  const snapshotCopy = imageSnapshot
    ? structuredClone(imageSnapshot)
    : undefined;

  return {
    type: "REMOVE_DEVICE",
    description: `Remove ${deviceName}`,
    timestamp: Date.now(),
    execute() {
      getImageStore().removeAllDeviceImages(imageKey);
      store.removeDeviceAtIndexRaw(index);
    },
    undo() {
      const placedIdx = store.placeDeviceRaw(deviceCopy);
      // Restore images under actual (possibly remapped) device ID
      // ... (code for image restoration)
    },
  };
}
```

**Batch Commands:**
```typescript
export interface BatchCommand extends Command {
  type: "BATCH";
  commands: Command[];  // Nested array of commands
}

export function createBatchCommand(
  description: string,
  commands: Command[],
): BatchCommand {
  return {
    type: "BATCH",
    description,
    timestamp: Date.now(),
    commands,
    execute() {
      this.commands.forEach((cmd) => cmd.execute());
    },
    undo() {
      // Undo in reverse order for correctness
      [...this.commands].reverse().forEach((cmd) => cmd.undo());
    },
  };
}
```

**Memory Implications:**
- Commands are **minimally sized**: most hold only primitive values (index, oldValue, newValue)
- Complex commands (e.g., REMOVE_DEVICE, DELETE_DEVICE_TYPE) hold `structuredClone()` copies of devices/types + images
- At cap (50 commands), memory footprint is modest unless many REMOVE_DEVICE or DELETE_DEVICE_TYPE commands are present
- No full layout snapshots are stored (efficient)

---

## Layout Store (Source of Truth)

**File:** `/Users/gvns/code/projects/Rackula/Rackula/src/lib/stores/layout.svelte.ts`

### Factory Function & Instance

```typescript
export function createLayoutStore(
  history: HistoryStore = createHistoryStore(),
) {
  // Instance state (using $state rune)
  let layout = $state<Layout>(createLayout());
  let isDirty = $state(false);
  let changesSinceExport = $state(0);
  let hasEverExported = $state(false);
  let hasStarted = $state(loadHasStarted());
  let activeRackId = $state<string | null>(null);
  
  // ... rest of store definition
}

export type LayoutStore = ReturnType<typeof createLayoutStore>;

// Active instance for the app session
const activeInstance = createLayoutStore(getHistoryStore());

export function getLayoutStore(): LayoutStore {
  return activeInstance;
}
```

### State Access Bridge

The layout store delegates operations to extracted domain modules via the `LayoutStateAccess` interface (in `layout/types.ts`):

```typescript
const stateAccess: LayoutStateAccess = {
  getLayout: () => layout,
  setLayout: (l: Layout) => { layout = l; },
  getActiveRackId: () => activeRackId,
  setActiveRackId: (id: string | null) => { activeRackId = id; },
  markDirty,
  markStarted: () => { hasStarted = true; saveHasStarted(true); },
  resetBackupTracking: () => { isDirty = false; changesSinceExport = 0; hasEverExported = false; },
  getRackGroups: () => rack_groups,
  findRack: (id: string) => layout.racks.find((r) => r.id === id),
  findRackIndex: (id: string) => layout.racks.findIndex((r) => r.id === id),
  getHistory: () => history,
};
```

### State Shape

```typescript
interface Layout {
  version: string;                 // Format version (e.g., "0.2.0")
  name: string;                    // Layout name
  racks: Rack[];                   // Array of racks
  device_types: DeviceType[];      // Library of device types
  rack_groups?: RackGroup[];       // Optional: Grouped racks (bayed layouts)
  settings: {
    display_mode: DisplayMode;     // "label" | "image"
    show_labels_on_images: boolean;
  };
  metadata?: LayoutMetadata;       // UUID, description, etc.
}

interface Rack {
  id: string;                      // Unique rack ID
  name: string;
  height: number;                  // Height in U units
  width: number;                   // Rack width (e.g., 19, 23)
  devices: PlacedDevice[];         // Devices in this rack
  // ... position, view, show_rear, etc.
}

interface PlacedDevice {
  id: string;                      // UUID for the instance
  device_type: string;             // Slug reference to DeviceType
  position_u: number;              // Position in U (internal units)
  face: DeviceFace;                // "front", "rear", or "both"
  slot_position?: SlotPosition;    // "left", "right", or "full" (half-width devices)
  custom_name?: string;            // User-assigned name
  // ... and other properties (notes, IP, colour, images, container linkage, ports)
}
```

### Singleton vs Per-Layout

- **Currently:** Single active layout per app session. `getLayoutStore()` always returns the same instance.
- **Future (multi-layout #2017):** Each open tab will have its own `LayoutStore` instance (with its own state + history).
- The comment in layout.svelte.ts (line 135) confirms this design:
  > "Independent instances each own their state and history, which the multi-layout workspace (#2017) will use to open layouts as tabs."

---

## Snapshot Restore

**Files:**
- `/Users/gvns/code/projects/Rackula/Rackula/src/lib/stores/layout/layout-lifecycle.ts`
- `/Users/gvns/code/projects/Rackula/Rackula/src/lib/stores/layout.svelte.ts` (the `loadLayout` public API)

### How Snapshot Restore Replaces Layout State

**Public API (layout.svelte.ts, line 417):**
```typescript
function loadLayout(layoutData: Layout): void {
  loadLayoutImpl(stateAccess, layoutData);
}
```

**Implementation (layout-lifecycle.ts, lines 30–130):**

1. **Defensive ID regeneration** (first pass):
   - Deduplicates rack IDs across the entire layout
   - Deduplicates device IDs within each rack
   - Records old → new ID mappings for later reference rewriting

2. **Container linkage fix** (second pass per-rack):
   - Rewrites `container_id` references for devices that were moved during ID regeneration

3. **Rack group reference fix** (layout-level):
   - Rewrites `rack_group.rack_ids` to point to the remapped rack IDs

4. **Wholesale state replacement:**
   ```typescript
   ctx.setLayout({
     ...layoutData,
     metadata,
     racks: racksFirstPass,
     ...(rackGroups !== undefined ? { rack_groups: rackGroups } : {}),
   });
   ctx.resetBackupTracking();
   ```

5. **Active rack reset:**
   ```typescript
   ctx.setActiveRackId(ctx.getLayout().racks[0]?.id ?? null);
   ```

### Does It Touch the History Stack?

**No.** `loadLayout()` does **not** interact with the history stack at all. It:
- **Does not execute commands** (no `history.execute()` call)
- **Does not clear history** (no `history.clear()` call)

This means:
- If you load a snapshot while undo history exists, the undo stack is **still active** (user can undo after loading)
- If you undo/redo after loading a snapshot, you're replaying the *old* history against the *new* layout (potentially causing inconsistency if layouts differ in rack count, device count, etc.)

**Current behavior (as of the codebase):**
```typescript
// In layout.svelte.ts, resetLayout (which IS called on new project):
function resetLayout(clearStarted: boolean = true): void {
  layout = createLayout();
  isDirty = false;
  changesSinceExport = 0;
  hasEverExported = false;
  activeRackId = null;
  history.clear();  // <-- ONLY HERE is history cleared
  // ...
}
```

- `loadLayout()` → **does not clear history**
- `resetLayout()` → **does clear history** (only called on new project or explicit reset)

---

## Load / Autosave Pipeline

**Files:**
- `/Users/gvns/code/projects/Rackula/Rackula/src/lib/stores/layout/layout-lifecycle.ts`
- `/Users/gvns/code/projects/Rackula/Rackula/src/lib/storage` (persistence manager)
- `/Users/gvns/code/projects/Rackula/Rackula/src/lib/stores/layout.svelte.ts` (main load entry point)

### How a Layout Is Swapped In

When a layout is loaded (e.g., from a file dialog, or from localStorage on app startup):

1. **User triggers load** (e.g., Ctrl+O opens file dialog, or app startup loads from localStorage)
2. **Persistence manager reads file / localStorage**
3. **`layoutStore.loadLayout(layoutData)` is called** with the parsed `Layout` object
4. **`loadLayoutImpl(stateAccess, layoutData)` is called** (in layout-lifecycle.ts):
   - Performs ID deduplication and reference rewriting
   - Calls `ctx.setLayout()` to wholesale-replace the reactive `layout` state
   - Calls `ctx.resetBackupTracking()` to zero out `isDirty`, `changesSinceExport`, etc.
   - Sets `activeRackId` to first rack
   - Calls `ctx.markStarted()`

### Does Loading Reset History?

**No.** The undo/redo stack is **not cleared** when loading a layout via `loadLayout()`.

However:
- On **first app launch**, if a saved layout is restored from localStorage, the app has never built up undo history anyway (fresh session)
- On **explicit new project** (`resetLayout()`), history is cleared
- On **loading via file dialog** while already in the app, history is **not cleared** (this is a design gap — see Constraints below)

**Current Test Behavior (from layout-undo-redo.test.ts):**
```typescript
beforeEach(() => {
  resetLayoutStore();   // This clears history via resetLayout()
  resetHistoryStore();  // Explicit reset
  // ...
});
```

Tests explicitly reset both store and history. Real usage may not do this if swapping layouts mid-session.

---

## Multi-Layout / Tabs Today

**Status: Not yet implemented. Greenfield for #2017.**

### Current State

- **No tab/workspace concept exists** in the codebase
- **Single active layout** per app session
- `getLayoutStore()` always returns the same instance
- All UI components reference this single active layout

### Multi-Layout Design Readiness

The codebase **is architecturally prepared** for tabs:

1. **`createLayoutStore()` is instantiable:**
   - Each tab can own its own store instance
   - Each store owns its own undo/redo history
   - See comment in layout.svelte.ts (line 135):
     > "Independent instances each own their state and history, which the multi-layout workspace (#2017) will use to open layouts as tabs."

2. **`LayoutStateAccess` bridge pattern** allows modules to work with any layout instance (not hard-coded to global singleton)

3. **No global/window-level state** outside the store (good isolation)

### What's Missing (for Tabs)

- A **workspace store** to manage multiple layout instances (track active tab, tab list, etc.)
- **UI components** for tab headers, tab switching, etc.
- **Keyboard shortcuts** for tab switching (e.g., Ctrl+Tab, Ctrl+PageDown)
- **Session persistence** to save/restore open tabs and their state
- **Clear policy** on whether undo/redo is per-tab (yes, the architecture supports it) or global (design decision)

### Issue References

- **#2017:** Multi-layout workspace (tabs)
- **#2018:** Spike 2018 explores workspace interaction model (exists in `/docs/research/spike-2018-tabs-interaction-model.md`)

---

## Keyboard Wiring

**File:** `/Users/gvns/code/projects/Rackula/Rackula/src/lib/components/KeyboardHandler.svelte`

### Undo/Redo Shortcuts

The `KeyboardHandler` component wires the following shortcuts:

| Shortcut | Action | Code |
|---|---|---|
| `Ctrl+Z` (or `Cmd+Z` on Mac) | Undo | Line 165–174 |
| `Ctrl+Shift+Z` (or `Cmd+Shift+Z` on Mac) | Redo | Line 177–188 |
| `Ctrl+Y` (or `Cmd+Y` on Mac) | Redo (alternative) | Line 191–200 |

**Implementation (lines 164–200):**
```typescript
// Ctrl/Cmd+Z - undo
{
  key: "z",
  ctrl: true,
  action: performUndo,
},
{
  key: "z",
  meta: true,
  action: performUndo,
},

// Ctrl/Cmd+Shift+Z - redo
{
  key: "z",
  ctrl: true,
  shift: true,
  action: performRedo,
},
{
  key: "z",
  meta: true,
  shift: true,
  action: performRedo,
},

// Ctrl/Cmd+Y - redo (alternative)
{
  key: "y",
  ctrl: true,
  action: performRedo,
},
{
  key: "y",
  meta: true,
  action: performRedo,
},
```

### Keyboard Handler Integration

**Component location:** `/Users/gvns/code/projects/Rackula/Rackula/src/lib/components/KeyboardHandler.svelte`

**Used in:** `/Users/gvns/code/projects/Rackula/Rackula/src/App.svelte`

**Entry point:**
```typescript
function handleKeyDown(event: KeyboardEvent) {
  // Ignore if in input field
  if (shouldIgnoreKeyboard(event)) return;

  const shortcuts = getShortcuts();

  for (const shortcut of shortcuts) {
    if (matchesShortcut(event, shortcut)) {
      event.preventDefault();
      shortcut.action();
      return;
    }
  }
}

// Listen globally
<svelte:window onkeydown={handleKeyDown} />
```

### Handler Functions

**Lines 57–76:**
```typescript
function performUndo() {
  if (!layoutStore.canUndo) return;

  // Capture description before undo
  const desc = layoutStore.undoDescription?.replace("Undo: ", "") ?? "action";
  layoutStore.undo();
  toastStore.showToast(`Undid: ${desc}`, "info");
}

function performRedo() {
  if (!layoutStore.canRedo) return;

  // Capture description before redo
  const desc = layoutStore.redoDescription?.replace("Redo: ", "") ?? "action";
  layoutStore.redo();
  toastStore.showToast(`Redid: ${desc}`, "info");
}
```

### Keyboard Utilities

**File:** `/Users/gvns/code/projects/Rackula/Rackula/src/lib/utils/keyboard.ts`

Provides:
- `shouldIgnoreKeyboard(event)`: Returns true if focus is on input/textarea/select/contenteditable
- `matchesShortcut(event, shortcut)`: Case-insensitive key comparison with cross-platform Ctrl/Meta handling

---

## Constraints & Notes For The Decision

### 1. **Current History is Not Cleared on Snapshot Load**

**Issue:** Loading a snapshot via file dialog (mid-session) does **not** clear the undo stack. This means:
- User can undo after loading a new layout
- Undo commands from the *old* layout are replayed against the *new* layout
- Potential for inconsistency if old layout and new layout have different structures

**Decision needed for #2182:**
- Should `loadLayout()` clear history? (Options: always clear, conditionally clear, allow per-tab history to coexist)
- Should snapshot restore be treated as an undoable operation itself?

### 2. **Snapshot Restore Does No Validation of Command Applicability**

Commands hold **indices** (e.g., device index in rack) and **old/new values**. If you:
1. Load layout A (10 devices)
2. Perform operations (build up undo history)
3. Load layout B (3 devices)
4. Undo

The command will try to operate on indices that may not exist in layout B. The code does not guard against this.

**Current mitigation:** None (relying on caller to avoid this scenario by clearing history on load).

### 3. **Per-Tab History Is Architecturally Sound But Not Implemented**

The codebase supports instantiating per-tab history:
```typescript
const store1 = createLayoutStore(createHistoryStore());  // Tab 1
const store2 = createLayoutStore(createHistoryStore());  // Tab 2
```

Each tab would have independent undo stacks. **Decision needed:**
- Is this the intended behavior for #2017 (multi-layout tabs)?
- Or should history be **global** (single undo stack across all tabs)?
- Or should there be a **hybrid mode** (e.g., undo per-tab, but "show history" across all tabs)?

### 4. **Max History Depth is Hard-Coded to 50**

```typescript
export const MAX_HISTORY_DEPTH = 50;
```

At depth 50, memory usage is modest. No performance issues expected. However:
- User cannot configure this
- No warning when history is trimmed
- If many REMOVE_DEVICE commands are in history, memory could be higher (due to `structuredClone()`)

### 5. **Command Data Structure Uses Closures, Not Snapshots**

Commands capture before/after **values** (via closures), not full layout snapshots. This is memory-efficient but couples commands tightly to layout mutations:
- If you reload a layout with **different device order**, old commands (keyed by index) may operate on the wrong device
- If you change device **IDs** during load, image snapshot restoration may fail (see `actual_key` logic in REMOVE_DEVICE)

### 6. **Image Store Snapshots Add Complexity**

REMOVE_DEVICE and DELETE_DEVICE_TYPE commands snapshot placement images because the image store is separate from the layout state:
```typescript
const imageSnapshot = imageStore.getAllImages().get(imageKey);
const snapshotCopy = imageSnapshot ? structuredClone(imageSnapshot) : undefined;
```

On undo, images must be restored under a **possibly remapped device ID**:
```typescript
const actualKey = `placement-${actualId}`;
```

This adds brittleness. If image IDs get out of sync with device IDs, restoration fails silently.

### 7. **Batch Commands Support Nested Undoing**

Batch commands allow atomic undo of multiple operations (e.g., "delete device type" may delete the type + all placed instances). This works correctly:
```typescript
undo() {
  // Undo in reverse order
  [...this.commands].reverse().forEach((cmd) => cmd.undo());
}
```

But the max depth (50) still counts each batch as **one** command, even if it contains many nested operations. A delete with many children might consume the history quickly.

### 8. **Active Rack ID Affects Multi-Rack Operations**

Commands may depend on `activeRackId` to determine which rack to mutate:
```typescript
ctx.setActiveRackId(rackId);  // Set before executing cross-rack move
```

If you undo/redo across tabs with different active racks, the command might operate on the wrong rack. (This is a design assumption to review when implementing tabs.)

### 9. **No Explicit "Save Point" or Checkpoint**

Unlike some editors, there is no "mark as saved" signal to the undo system. The history system does not distinguish between "user has saved the current state" and "history has diverged from saved state."

Instead, the layout store tracks `isDirty` and `changesSinceExport` separately. Undo/redo do **not** update these counters (by design — undoing an edit should not mark the layout as needing save again).

### 10. **Keyboard Shortcuts Are Global, Not Scoped**

`KeyboardHandler` listens at the window level and processes all keydown events. There is no scoping by component or viewport:
```typescript
<svelte:window onkeydown={handleKeyDown} />
```

If multiple layouts are open as tabs, the global listener will undo/redo on whichever layout is **active** (by reference through `getLayoutStore()`). This is correct, but requires the workspace store to ensure `getLayoutStore()` returns the active tab's store.

### 11. **Tooltip Display of Shortcuts**

The Toolbar displays shortcut hints:
```svelte
<Tooltip
  text={layoutStore.undoDescription ?? "Undo"}
  shortcut="Ctrl+Z"
  position="bottom"
>
```

These are **hard-coded strings** ("Ctrl+Z", "Ctrl+Shift+Z"). On non-Windows/non-Mac (e.g., Linux), these should ideally reflect the actual keybinding. Currently, they do not update dynamically.

---

## Summary: Key Findings for #2182 Decision

1. **History stack is instantiable per-layout**, not global. Multi-tab architecture is ready.
2. **Snapshot restore does not clear history** — design decision needed whether it should.
3. **Commands use closure-based before/after values**, not full snapshots (memory-efficient but fragile across layout mutations).
4. **50-command hard cap** on undo stack (modest memory, reasonable limit).
5. **Keyboard wiring is global** (Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y) and can coexist with per-tab history.
6. **No tab/workspace concept exists yet** — greenfield for #2017.
7. **Active rack ID mixes state and behavior** — may need careful handling in multi-tab context.
8. **Image store is separate**, complicating undo of device removal (requires snapshot + restore).

---

**Document Generated:** 2026-06-14  
**Codebase Version:** Rackula @ `/Users/gvns/code/projects/Rackula/Rackula`
