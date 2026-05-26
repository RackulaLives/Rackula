# Cross-Rack Device Drag — Design Spec

**Issue:** #1592 — Support dragging between racks
**Milestone:** v0.10.0
**Labels:** feature, area:canvas, design, ux

## Problem

Devices cannot be moved between racks via drag. The entire drag pipeline (DragData, DropAction, event dispatch, Canvas handler) already supports cross-rack moves — only the store operation `moveDeviceToRack()` is blocked by an explicit guard that returns `false` for `fromRackId !== toRackId`.

## Design Decisions

| Decision           | Choice                   | Rationale                                                                                                                            |
| ------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Drag feel          | Identical to within-rack | Simplest implementation. Undo covers accidental moves. Add visual differentiation later if needed.                                   |
| Face handling      | Use drop target face     | Dropping on a front-face Rack → front face; rear-face Rack → rear face. Natural visual intent. Single-view racks default to "front". |
| Container children | Move with parent         | Dragging a container moves it and all children. Keeps containers intact.                                                             |
| Bayed racks        | Same as any rack         | No special restrictions on cross-rack moves within bayed groups.                                                                     |
| Undo/redo          | Single atomic command    | One Ctrl+Z restores device to source rack. Follows existing container-drop pattern.                                                  |

## Architecture

### Store-Level Changes

**File:** `src/lib/stores/layout.svelte.ts`

Remove the guard in `moveDeviceToRack()` and add cross-rack move logic:

```typescript
function moveDeviceToRack(
  fromRackId: string,
  deviceIndex: number,
  toRackId: string,
  newPosition: number,
  face?: "front" | "rear" | "both",
  slotPosition?: SlotPosition,
): boolean {
  if (fromRackId === toRackId) {
    // Same-rack move — delegate to existing function
    return moveDevice(fromRackId, deviceIndex, newPosition, slotPosition);
  }

  // Cross-rack move — create atomic command
  const command = createCrossRackMoveCommand(
    layoutStore,
    fromRackId,
    deviceIndex,
    toRackId,
    newPosition,
    face ?? "front",
    slotPosition,
  );
  return historyStore.execute(command);
}
```

**Signature change**: Add `face` parameter (before `slotPosition`). Existing call sites that don't pass `face` will get the default `"front"`.

### New Command

**File:** `src/lib/stores/commands/device.ts`

```typescript
interface CrossRackMoveData {
  sourceRackId: string;
  sourceIndex: number;
  targetRackId: string;
  targetPosition: number; // internal units
  face: "front" | "rear" | "both";
  slotPosition?: SlotPosition;
  device: PlacedDevice; // snapshot before move
  children: PlacedDevice[]; // container children (empty if not a container)
}
```

**Execute**:

1. Remove device (and children) from source rack at `sourceIndex`
2. Place device in target rack at `targetPosition` with `face`
3. Place children back into the device's container slots

**Undo**:

1. Remove device (and children) from target rack
2. Place device back in source rack at original position/face
3. Place children back into container slots

### Pipeline Changes (Minimal)

**File:** `src/lib/components/Canvas.svelte`

The `handleDeviceMoveRack` handler needs to pass `face` from the event to `moveDeviceToRack()`. Currently:

```typescript
function handleDeviceMoveRack(event: CustomEvent) {
  const {
    sourceRackId,
    sourceIndex,
    targetRackId,
    targetPosition,
    slot_position,
  } = event.detail;
  layoutStore.moveDeviceToRack(
    sourceRackId,
    sourceIndex,
    targetRackId,
    targetPosition,
    slot_position,
  );
}
```

Needs to become:

```typescript
function handleDeviceMoveRack(event: CustomEvent) {
  const {
    sourceRackId,
    sourceIndex,
    targetRackId,
    targetPosition,
    face,
    slot_position,
  } = event.detail;
  layoutStore.moveDeviceToRack(
    sourceRackId,
    sourceIndex,
    targetRackId,
    targetPosition,
    face,
    slot_position,
  );
}
```

The `face` field is **not yet** in the event detail. It must be threaded through the pipeline:

1. `resolveDropAction()` already receives `faceFilter` (the rack's rendered face) as a parameter. Add `face: faceFilter ?? "front"` to the `cross-rack-move` DropAction variant.
2. `dispatchDropAction()` must include `face` in the `devicemoverack` custom event detail.
3. `handleDeviceMoveRack()` in Canvas.svelte must destructure `face` and pass it to `moveDeviceToRack()`.

### What Doesn't Change

- **Drag pipeline**: DragData, resolveDropTarget, resolveDropAction, dispatchDropAction — all unchanged
- **Pointer drag bounds**: Already handles cross-rack dragging (#1467)
- **Drop preview**: Works as-is — the drop zone ghost appears in whatever rack the pointer is over
- **Collision detection**: Works as-is — `canPlaceDevice()` with no `excludeIndex` for cross-rack (device doesn't exist in target rack yet)
- **Existing tests**: `dnd-between-racks.test.ts` already validates the pipeline

### Face Resolution Detail

The drop coordinator resolves face from the target Rack component:

- Dropping on a front-face `Rack.svelte` instance → `face: "front"`
- Dropping on a rear-face `Rack.svelte` instance → `face: "rear"`
- Single-view racks → `face: "front"` (default)

This requires the `Rack.svelte` component to pass its current face to the drop coordinator. Currently, the rack interaction handlers receive `rack.id` — they also have access to `rackFace` (the `face` prop of the Rack component). The face needs to flow through the event detail chain: Rack → rack-pointer-drag → rack-drop-coordinator → DropAction.

### Collision Handling for Cross-Rack Moves

For cross-rack moves, `canPlaceDevice()` should NOT use `excludeIndex` because the device being moved doesn't exist in the target rack's device array. This is already the behavior in the existing code — `resolveDropAction()` sets `excludeIndex: undefined` for cross-rack moves, and the test suite validates this.

### Container Children

When the moved device has `subdevice_role: "parent"` and children with `container_id === device.id`:

1. Collect all children from the source rack
2. Remove parent + children from source rack
3. Place parent in target rack
4. Place children in target rack (their `container_id` still references the parent, which is now in the target rack)
5. Children retain their relative positions within the container

If the target rack doesn't have room for the parent + all children, the entire move is rejected (collision check fails, same as within-rack moves).

## Files to Modify

| File                                     | Change                                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/lib/stores/layout.svelte.ts`        | Remove guard, add cross-rack move logic, add `face` param                              |
| `src/lib/stores/commands/device.ts`      | Add `createCrossRackMoveCommand`                                                       |
| `src/lib/components/Canvas.svelte`       | Pass `face` from event to `moveDeviceToRack()`                                         |
| `src/lib/utils/rack-drop-coordinator.ts` | Add `face` field to `cross-rack-move` DropAction variant (from `faceFilter` parameter) |
| `src/lib/utils/rack-drop-handlers.ts`    | Include `face` in `devicemoverack` custom event detail                                 |
| `src/tests/dnd-between-racks.test.ts`    | Add integration test for actual cross-rack move execution                              |

## Verification

1. **Unit tests**: Cross-rack move command (execute, undo, redo) in `dnd-between-racks.test.ts`
2. **Manual testing**:
   - Drag device from Rack A to Rack B — device moves, appears at correct position
   - Drag device within same rack — still works (no regression)
   - Drag container with children between racks — parent + children all move
   - Undo cross-rack move — device returns to source rack at original position
   - Redo cross-rack move — device moves back to target rack
   - Drag to rear face of dual-view rack — device gets face="rear"
   - Drag between bays in a bayed group — works like any cross-rack move
3. **No-pipeline-changes verification**: Existing `dnd-between-racks.test.ts` tests still pass unchanged
