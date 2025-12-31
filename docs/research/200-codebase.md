# Rackula DnD Codebase Exploration - Spike #200

**Date:** 2025-12-30
**Author:** Claude (automated research)

---

## Files Examined

### Infrastructure Layer
- `src/lib/utils/dragdrop.ts`: DragData interface, position calculation, drop feedback utilities
- `src/lib/utils/collision.ts`: Face-aware collision detection supporting full/half-depth devices
- `src/lib/utils/coordinates.ts`: SVG coordinate transforms with panzoom support
- `src/lib/utils/device-movement.ts`: Keyboard-driven movement with leapfrog collision handling
- `src/lib/utils/blocked-slots.ts`: Visual indicators for opposite-face devices

### Component Layer
- `src/lib/components/Canvas.svelte`: Top-level container, panzoom integration
- `src/lib/components/Rack.svelte`: SVG drop target with visual feedback
- `src/lib/components/RackDevice.svelte`: Draggable device with grip affordance
- `src/lib/components/DevicePaletteItem.svelte`: Draggable palette items
- `src/lib/components/RackDualView.svelte`: Front/rear dual-view wrapper

### State & Commands
- `src/lib/stores/layout.svelte.ts`: Central placement/movement operations
- `src/lib/stores/placement.svelte.ts`: Mobile tap-to-place workflow
- `src/lib/stores/commands/device.ts`: Undo/redo command implementations

### Tests
- `src/tests/dragdrop.test.ts`: DnD utility tests
- `src/tests/dnd-within-rack.test.ts`: Comprehensive integration tests

---

## Current DnD Architecture

### Three Operation Types
1. **Palette → Rack (device placement)**: User drags from device library to rack slot
2. **Rack → Rack (repositioning)**: User drags existing device to new position
3. **Cross-Rack (scaffolded)**: Code structure exists but single-rack mode limits usage

### Data Flow Pattern
```
DragStart → currentDragData (in-memory) → DragOver (position calc) → Drop (placement)
                    ↓
         Shared state bypasses browser dataTransfer security restrictions
```

### Key Interfaces
```typescript
interface DragData {
  type: 'palette' | 'rack';
  deviceType: DeviceType;      // For palette drags
  placedDevice?: PlacedDevice; // For rack drags
  sourceRackId?: string;       // For cross-rack moves
}
```

---

## Device Placement Flow

### Desktop Flow (Drag-and-Drop)
1. User clicks and drags device from palette
2. DragStart populates `currentDragData`
3. Rack.svelte calculates drop position using SVG coordinate transforms
4. Visual feedback: preview ghost, slot highlighting, collision warnings
5. Drop triggers `layout.placeDevice()` or `layout.moveDevice()`
6. Undo command is registered

### Mobile Flow (Tap-to-Place)
1. User taps device in palette
2. Enters "placement mode" with header indicator
3. Valid slots pulse with animation
4. User taps target slot
5. Device is placed, exit placement mode

**Key Insight:** Mobile tap-to-place is deliberately different from desktop DnD - it's more accessible and avoids accidental drops.

---

## Integration Points

### Canvas ↔ Rack
- Canvas provides panzoom wrapper
- Rack handles drop events within its SVG context
- Coordinate transforms handle panzoom scaling

### DevicePalette ↔ Rack
- Palette items set `currentDragData` on drag start
- Rack reads from shared state (not dataTransfer) for security reasons
- Both use same DragData interface

### RackDevice ↔ Rack
- RackDevice has grip affordance (3-line icon) as drag handle
- Device dragging uses same drop logic as palette
- Source position tracked for undo

### Layout Store ↔ Commands
- All mutations go through layout store
- Commands (PlaceDeviceCommand, MoveDeviceCommand) enable undo/redo
- Commands are atomic and reversible

---

## Constraints

### Deliberate Scope Limitations
- **Single-rack mode**: Hard-coded `RACK_ID` constant, multi-rack deferred
- **Full-U snapping only**: Drag snaps to full U positions (1, 2, 3...)
- **Half-U visualization**: Shift key shows 0.5U grid for reference only
- **No half-U snapping during drag**: Would require significant UX redesign

### Technical Constraints
- **SVG coordinate inversion**: y=0 at top, U1 at bottom - properly handled
- **Browser dataTransfer security**: Can't read drag data during dragover
- **Panzoom coordinate transforms**: All positions must account for zoom/pan

### Face-Aware Collision
- Two half-depth devices can share same U on opposite faces
- Full-depth devices block both faces
- Collision detection considers `is_full_depth` and `mounted_face`

---

## Existing UX Patterns

### Visual Feedback
- Drop preview ghost shows device at target position
- Valid drop zones highlight green
- Invalid drops show red border
- Opposite-face devices show as "blocked slots" (semi-transparent)

### Keyboard Navigation
- Arrow keys move selected device up/down
- Shift+arrow for 0.5U moves (if implemented)
- Leapfrog: device jumps over obstructions automatically

### Mobile Accessibility
- Long-press opens device context menu
- Tap-to-place avoids precision requirements
- Bottom sheet for device options
- Placement header shows active placement state

---

## Observations for NetBox Comparison

### Strengths of Current Approach
1. **Clean separation of concerns**: DnD utils, components, and stores are modular
2. **Mobile-first tap-to-place**: Superior to drag on touch devices
3. **Face-aware collision**: Full/half-depth support is production-ready
4. **Undo/redo**: Command pattern fully implemented
5. **Visual feedback**: Real-time preview and slot highlighting

### Potential Gaps (to verify against NetBox)
1. **Fine positioning**: No 0.5U drag snapping (schema supports it)
2. **Bulk operations**: No multi-device move (single-rack limits value)
3. **Drag preview labels**: Could show device name/U during drag
4. **Power/connectivity**: No cable routing or power chain visualization

### Architecture Readiness
- Schema already supports 0.5U positions
- Collision detection is face-aware
- Infrastructure exists for keyboard fine-positioning
- Multi-rack code is scaffolded (disabled)
