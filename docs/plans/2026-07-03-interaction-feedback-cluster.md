# Interaction Feedback Cluster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the two interaction correctness bugs found by the 2026-07-03 Svelte 5 hot-path audit (keyboard selection clearing, duplicate SVG clipPath ids), delete the vestigial half-U Shift grid, and add restrained, reduced-motion-safe feedback to placement, movement, and selection, plus the two screen-reader announcement gaps that keep the quality floor under the new motion.

**Architecture:** All changes are local to existing components and stores; no new files except two test files. Motion uses Svelte 5 primitives only: `transition:fade`/`transition:fly` with the documented `prefersReducedMotion` parameter pattern, `Tween.of` from svelte/motion for SVG attribute glides, and one scoped CSS keyframe. Announcements reuse the existing assertive live region rendered by DialogOrchestrator via `placementStore.announcePosition`.

**Tech Stack:** Svelte 5.56 runes, svelte/motion (`Tween`, `prefersReducedMotion`), svelte/transition (`fade`, `fly`), Vitest + @testing-library/svelte.

## Global Constraints

- Svelte 5 runes only; never reintroduce Svelte 4 stores.
- Rail positions are whole-U integers. Tweens interpolate the rendered y attribute only; stored positions stay integers.
- Every motion addition must respect prefers-reduced-motion. Svelte transitions and tweens are JS-driven (web animations / rAF), so the global CSS reset in `src/lib/styles/animations.css` does NOT cover them; each needs the explicit `prefersReducedMotion.current` guard. Plain CSS keyframes ARE covered by the global reset.
- Motion must never run per-frame during pointer drag or pan. All animated values in this plan change only on discrete commits (slot change, place, delete, select).
- Testing policy: behaviour over structure. Visual-only motion gets no tests. No `querySelector`, no `toHaveClass`, no exact-length assertions on data arrays (ESLint enforces).
- Test factories live in `src/tests/factories.ts`. jest-dom matchers are available (`src/tests/setup.ts`).
- Commits: `type: description` format, signed off (`git commit -s`), with `Co-Authored-By` trailer for AI assistance.
- Doc text follows repo writing style: no em dashes, no emoji, succinct.
- Worktree gotcha: the pre-commit prettier hook no-ops in worktrees (no root node_modules). Before pushing, run the main checkout's prettier binary on every touched file and re-commit if it changes anything.

### Verified doc references

| Claim | Svelte doc section |
| --- | --- |
| Local transitions play only when their own block is created or destroyed, not a parent block | transition: > Local vs global |
| `prefersReducedMotion.current` in transition params | svelte/motion > prefersReducedMotion (5.7+) |
| `Tween.of(() => value, options)` with `.current`, rAF-driven | svelte/motion > Tween (5.8+) |
| `$props.id()` generates an instance-unique id | $props > $props.id() (5.20+) |
| Component `@keyframes` are hash-scoped | Scoped styles > Scoped keyframes |

---

### Task 1: Guard canvas keydown so bubbled Enter/Space stops clearing the selection

The bug: `handleCanvasKeydown` in Canvas.svelte clears the selection on any Enter/Space keydown that bubbles up from a rack, device, or the verb bar. Tab-to-rack + Enter selects and instantly clears; verb-bar keyboard activation breaks the same way. `handleCanvasClick` (line 331) already has the correct `event.target === event.currentTarget` guard; the keydown handler is missing it.

**Files:**

- Modify: `src/lib/components/Canvas.svelte:376-381`
- Test: `src/tests/Canvas.selection-keydown.test.ts` (create)

**Interfaces:**

- Consumes: `getSelectionStore().selectRack(rackId)`, `.selectedRackId`, `.clearSelection()` from `src/lib/stores/selection.svelte.ts`.
- Produces: no API change; behaviour fix only.

- [ ] **Step 1: Write the failing test**

Model the setup on `src/tests/Canvas.touch-listener-lifecycle.test.ts` (same store resets and matchMedia stub). With no racks in the layout store, Canvas renders the empty state whose add-rack button (`data-testid="add-rack-affordance"`) is a child of the canvas div (`data-testid="rack-canvas"`), giving a bubbling child target without any drag machinery.

```typescript
// src/tests/Canvas.selection-keydown.test.ts
/**
 * Regression test for the 2026-07-03 audit finding: Enter/Space keydown
 * bubbling up from canvas children (racks, devices, verb bar) must not clear
 * the selection. Only a keydown on the canvas surface itself clears it,
 * mirroring the guard handleCanvasClick already has.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import Canvas from "$lib/components/Canvas.svelte";
import { resetCanvasStore } from "$lib/stores/canvas.svelte";
import { resetLayoutStore } from "$lib/stores/layout.svelte";
import {
  getSelectionStore,
  resetSelectionStore,
} from "$lib/stores/selection.svelte";
import { resetUIStore } from "$lib/stores/ui.svelte";
import { resetPlacementStore } from "$lib/stores/placement.svelte";
import { resetViewportStore } from "$lib/utils/viewport.svelte";

describe("Canvas keyboard selection clearing", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetSelectionStore();
    resetUIStore();
    resetCanvasStore();
    resetPlacementStore();
    resetViewportStore();

    vi.stubGlobal("matchMedia", (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps the selection when Enter bubbles up from a canvas child", async () => {
    const selectionStore = getSelectionStore();
    const { getByTestId } = render(Canvas);
    selectionStore.selectRack("rack-1");

    await fireEvent.keyDown(getByTestId("add-rack-affordance"), {
      key: "Enter",
    });

    expect(selectionStore.selectedRackId).toBe("rack-1");
  });

  it("clears the selection when Enter targets the canvas surface itself", async () => {
    const selectionStore = getSelectionStore();
    const { getByTestId } = render(Canvas);
    selectionStore.selectRack("rack-1");

    await fireEvent.keyDown(getByTestId("rack-canvas"), { key: "Enter" });

    expect(selectionStore.selectedRackId).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify the first case fails**

Run: `npm run test:run -- src/tests/Canvas.selection-keydown.test.ts`

Expected: "keeps the selection when Enter bubbles up from a canvas child" FAILS (selection was cleared); the surface case passes.

- [ ] **Step 3: Add the guard**

In `src/lib/components/Canvas.svelte`, replace the existing handler (lines 376-381):

```svelte
  function handleCanvasKeydown(event: KeyboardEvent) {
    // Only act when the canvas surface itself is the target. Keydown bubbles,
    // so without this guard Enter/Space on a rack, device, or the verb bar
    // would clear the selection those elements just made (same guard as
    // handleCanvasClick above).
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      selectionStore.clearSelection();
    }
  }
```

- [ ] **Step 4: Run the test to verify both cases pass**

Run: `npm run test:run -- src/tests/Canvas.selection-keydown.test.ts`

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/Canvas.svelte src/tests/Canvas.selection-keydown.test.ts
git commit -s -m "fix: only clear selection when canvas surface itself receives Enter/Space"
```

---

### Task 2: Instance-unique clipPath ids via $props.id()

The bug: `RackDevice.svelte:330` builds `clipId` from `device.slug` + `position`. Full-depth devices render on BOTH faces in dual view (PR #2641), so the front and rear Rack instances emit two `<clipPath>` elements with the same id in one document; the same collision happens across racks when the same device type sits at the same U. The first clipPath in document order wins, clipping images with the wrong geometry when rack widths differ. `$props.id()` (Svelte 5.20+) generates an id unique to the component instance.

**Files:**

- Modify: `src/lib/components/RackDevice.svelte:329-330`

**Interfaces:**

- Consumes: `$props.id()` rune. The two consumers (`<clipPath id={clipId}>` at line 671, `clip-path="url(#{clipId})"` at line 695) are unchanged.

- [ ] **Step 1: Replace the slug-position id with an instance id**

Replace lines 329-330:

```typescript
// Unique clipPath ID for this device instance
const clipId = $derived(`clip-${device.slug}-${position}`);
```

with:

```typescript
// Unique clipPath ID for this device instance. $props.id() is per component
// instance, so dual-view front/rear renders and same-type-same-U devices in
// different racks can never collide (duplicate SVG ids clip with the wrong
// geometry).
const uid = $props.id();
const clipId = `clip-${uid}`;
```

Note `clipId` stops being `$derived`: the instance id never changes, so a plain `const` is correct.

- [ ] **Step 2: Verify no other consumer relied on the old id shape**

Run: `grep -rn "clip-" src --include="*.svelte" --include="*.ts" | grep -v "clip-path" | grep -v "clipId"`

Expected: no hits referencing the `clip-<slug>-<position>` pattern outside RackDevice.svelte.

- [ ] **Step 3: Run the unit suite and type check**

Run: `npm run test:run` and `npm run check`

Expected: both pass (no test asserts clip id values; the required `validate` gate does not run svelte-check, so run it explicitly).

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/RackDevice.svelte
git commit -s -m "fix: make device image clipPath ids instance-unique via \$props.id()"
```

---

### Task 3: Delete the vestigial half-U Shift grid

The half-U grid preview shipped with 0.5U rail positioning (#145, commit ec253df92). The carrier-first model made rail positions whole-U integers and deleted fractional positions, so the grid previews a feature that no longer exists. Meanwhile every rendered Rack face registers its own window Shift listeners, and pressing Shift anywhere mounts up to `rackHeight` SVG lines per rack face. Project rule: delete unused code completely. Grep confirms no test or e2e file references `shiftKeyHeld` or `rack-grid-line-half`.

**Files:**

- Modify: `src/lib/components/Rack.svelte:160, 445-450, 453, 513`
- Modify: `src/lib/components/RackFrame.svelte:44-45, 78, 192-203, 398-403`

**Interfaces:**

- Produces: `RackFrame` loses its optional `shiftKeyHeld` prop. `Rack.svelte` is its only caller (verified by grep).

- [ ] **Step 1: Delete the Shift tracking from Rack.svelte**

Remove these four pieces:

Line 160:

```typescript
let shiftKeyHeld = $state(false);
```

Lines 445-450:

```typescript
function handleShiftDown(event: KeyboardEvent) {
  if (event.key === "Shift") shiftKeyHeld = true;
}
function handleShiftUp(event: KeyboardEvent) {
  if (event.key === "Shift") shiftKeyHeld = false;
}
```

Line 453:

```svelte
<svelte:window onkeydown={handleShiftDown} onkeyup={handleShiftUp} />
```

Line 513 (inside the `<RackFrame ...>` call):

```svelte
{shiftKeyHeld}
```

- [ ] **Step 2: Delete the prop and grid from RackFrame.svelte**

Remove the prop declaration (lines 44-45):

```typescript
    /** Whether Shift key is held (shows half-U grid lines) */
    shiftKeyHeld?: boolean;
```

Remove the destructure default (line 78):

```typescript
    shiftKeyHeld = false,
```

Remove the render block (lines 192-203):

```svelte
<!-- Half-U grid lines (shown when Shift is held for fine positioning) -->
{#if shiftKeyHeld}
  {#each Array(rackHeight).fill(null) as _halfLine, i (i)}
    <line
      x1={railWidth}
      y1={i * uHeight + uHeight / 2 + rackPadding + railWidth}
      x2={rackWidth - railWidth}
      y2={i * uHeight + uHeight / 2 + rackPadding + railWidth}
      class="rack-grid-line-half"
    />
  {/each}
{/if}
```

Remove the CSS (lines 398-403):

```css
.rack-grid-line-half {
  stroke: var(--colour-selection);
  stroke-width: 1;
  stroke-dasharray: 4 2;
  opacity: 0.6;
}
```

- [ ] **Step 3: Verify nothing references the deleted code**

Run: `grep -rn "shiftKeyHeld\|rack-grid-line-half\|handleShiftDown\|handleShiftUp" src e2e`

Expected: no hits.

- [ ] **Step 4: Run lint, type check, and unit suite**

Run: `npm run lint && npm run check && npm run test:run`

Expected: all pass (unused-code lint would catch a missed reference).

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/Rack.svelte src/lib/components/RackFrame.svelte
git commit -s -m "refactor: delete vestigial half-U Shift grid and per-rack window key listeners"
```

---

### Task 4: Placement banner fly transition

The placement banner (`PlacementIndicator.svelte`) pops in and out with no motion. Add `transition:fly` using the literal reduced-motion pattern from the svelte/motion docs (y collapses to 0, leaving only a fade, when reduced motion is set). Fires only on placement arm/cancel/place, never during drag or pan. The existing `role="status" aria-live="polite"` stays untouched.

No test: visual-only change (TDD protocol: skip tests for visual-only components).

**Files:**

- Modify: `src/lib/components/PlacementIndicator.svelte:6-9, 26`

- [ ] **Step 1: Add the imports**

In the script block (after the existing imports at lines 7-9):

```typescript
import { fly } from "svelte/transition";
import { prefersReducedMotion } from "svelte/motion";
```

- [ ] **Step 2: Add the transition to the banner div**

Replace line 26:

```svelte
  <div class="placement-indicator" role="status" aria-live="polite">
```

with:

```svelte
  <div
    class="placement-indicator"
    role="status"
    aria-live="polite"
    transition:fly={{ y: prefersReducedMotion.current ? 0 : -12, duration: 150 }}
  >
```

- [ ] **Step 3: Verify in the running app**

Run: `npm run dev`, arm a device from the palette (click a palette item's add flow or tap-to-place on mobile emulation), cancel it.

Expected: banner slides down 12px while fading in on arm, reverses on cancel. With DevTools emulating `prefers-reduced-motion: reduce`, it fades with no vertical movement.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/PlacementIndicator.svelte
git commit -s -m "feat: fly transition on placement banner with reduced-motion fallback"
```

---

### Task 5: Fade on device placement and removal

Devices appear and disappear from racks with no confirmation motion. Add a `transition:fade` wrapper on each keyed `{#each}` item in Rack.svelte so placing, deleting, cross-rack moves, and undo/redo fade in/out.

Placement of the wrapper is load-bearing: local transitions (the default) play only when the block they directly belong to is created or destroyed, not when a parent block changes (docs: transition: > Local vs global). The wrapper `<g>` must therefore sit DIRECTLY inside the `{#each}` item, wrapping the `{#if device}` block. Placed inside the `{#if}`, the transition would never play, because each-item removal destroys the `{#if}` as a parent-block side effect. This local default is also what prevents a mass fade on initial mount and on layout tab switches: the each items are then created as a side effect of the each block itself mounting, so no transition plays.

`fade` animates only opacity, which is safe on SVG `<g>` (avoiding the CSS-transform-on-transformed-`<g>` jump documented at RackDevice.svelte, Issue #5). Accepted trade-off: during the 150ms outro a deleted device remains pointer-hittable; reduced motion sets duration 0.

No test: visual-only change.

**Files:**

- Modify: `src/lib/components/Rack.svelte:26-58 (imports), 522-565 (each block)`

- [ ] **Step 1: Add the imports**

In the Rack.svelte script imports:

```typescript
import { fade } from "svelte/transition";
import { prefersReducedMotion } from "svelte/motion";
```

- [ ] **Step 2: Wrap the each item content**

The current structure (from line 522):

```svelte
{#each visibleDevices as { placedDevice, originalIndex } (placedDevice.id)}
  {@const device = getDeviceBySlug(placedDevice.device_type)}
  {@const containerCtx = placedDevice.container_id
    ? getContainerContext(placedDevice)
    : undefined}
  {@const children = containerChildren.get(placedDevice.id) ?? []}
  {#if device}
    {@const isHoveredContainer =
      containerHoverInfo?.containerId === placedDevice.id}
    <RackDevice ... />
  {/if}
{/each}
```

becomes (only the `<g>` open/close lines are new; the `{@const}` lines and everything inside `{#if device}` are unchanged):

```svelte
{#each visibleDevices as { placedDevice, originalIndex } (placedDevice.id)}
  {@const device = getDeviceBySlug(placedDevice.device_type)}
  {@const containerCtx = placedDevice.container_id
    ? getContainerContext(placedDevice)
    : undefined}
  {@const children = containerChildren.get(placedDevice.id) ?? []}
  <!-- Transition wrapper must sit directly in the each item: local
             transitions only play when their own block is created/destroyed,
             so inside the if it would never fire on place/delete, and being
             local it correctly skips initial mount and tab switches. -->
  <g
    transition:fade={{
      duration: prefersReducedMotion.current ? 0 : 150,
    }}
  >
    {#if device}
      {@const isHoveredContainer =
        containerHoverInfo?.containerId === placedDevice.id}
      <RackDevice ... />
    {/if}
  </g>
{/each}
```

- [ ] **Step 3: Verify in the running app**

Run: `npm run dev`. Place a device (fades in), delete it (fades out), undo (fades back in), switch layout tabs (no fade), reload (no fade on initial render).

Expected: exactly those behaviours; same-rack moves do not fade (same key, same element).

- [ ] **Step 4: Run lint and unit suite**

Run: `npm run lint && npm run test:run`

Expected: pass. E2E selectors target `[data-testid="rack-device"]`, which is untouched inside the new wrapper.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/Rack.svelte
git commit -s -m "feat: fade devices in and out on placement, removal, and undo"
```

---

### Task 6: Selection settle keyframe

Selecting a device shows the selection outline with no feedback; a one-shot scoped CSS keyframe makes it settle (stroke fades in from a wider stroke). CSS animations play when the `{#if selected}` block creates the rect. Component `@keyframes` are hash-scoped (docs: Scoped styles), so no global namespace risk. Stroke-only animation avoids all SVG transform pitfalls. Reduced motion is automatic: the global reset in `src/lib/styles/animations.css:205` forces `animation-duration: 0.01ms` on plain CSS animations.

The `to` state is deliberately omitted from the keyframe so the animation lands on the element's computed style: `stroke-width` is 2 on desktop but 3 under the existing `max-width: 430px` override, and a hardcoded `to` would end-jump on mobile.

No test: visual-only change.

**Files:**

- Modify: `src/lib/components/RackDevice.svelte:930-935 (style block)`

- [ ] **Step 1: Add the animation to the selection rect style**

Replace the `.device-selection` rule (line 930):

```css
.device-selection {
  fill: none;
  stroke: var(--colour-selection);
  stroke-width: 2;
  pointer-events: none;
}
```

with:

```css
.device-selection {
  fill: none;
  stroke: var(--colour-selection);
  stroke-width: 2;
  pointer-events: none;
  animation: selection-settle 120ms ease-out;
}

/* One-shot settle when the selection rect mounts. No `to` block: the
     animation ends on the computed stroke-width (2 desktop, 3 small screens).
     The global prefers-reduced-motion reset collapses the duration. */
@keyframes selection-settle {
  from {
    stroke-opacity: 0;
    stroke-width: 4;
  }
}
```

- [ ] **Step 2: Verify in the running app**

Run: `npm run dev`. Click a device.

Expected: outline settles in over ~120ms; deselect/reselect re-fires; drag/move does not re-fire (the rect stays mounted while selected).

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/RackDevice.svelte
git commit -s -m "feat: settle animation on device selection outline"
```

---

### Task 7: Drop preview glides between U slots

During drag and keyboard placement the drop preview teleports one full slot height per boundary crossing. Drive its y through `Tween.of` so it glides. Targets are discrete whole-U slot commits (dragdrop.ts snaps to whole U before the preview updates), never per-frame pointer positions, so the 90ms glide cannot fight the pointer. The tween writes the y attribute per rAF frame, sidestepping CSS-on-SVG-geometry concerns. `Tween.of` initialises at the current value on mount, so the preview appears at the pointer with no initial glide, and remounting on a different rack (the `{#if activePreview}` in Rack.svelte toggles per rack) correctly skips gliding across racks.

No test: visual-only change.

**Files:**

- Modify: `src/lib/components/RackDropZone.svelte:9-10 (imports), 42-45 (derived), 51 (y attribute)`

- [ ] **Step 1: Add imports and the tween**

In the script block:

```typescript
import { Tween, prefersReducedMotion } from "svelte/motion";
import { cubicOut } from "svelte/easing";
```

After the existing `previewY` derived (lines 43-45), add:

```typescript
// Glide between whole-U slots. Slot targets are discrete commits, never
// per-frame pointer tracking, so the tween cannot fight the pointer.
const previewYMotion = Tween.of(() => previewY, {
  duration: 90,
  easing: cubicOut,
});
```

- [ ] **Step 2: Use the tweened value in the rect**

Replace line 51:

```svelte
y={previewY}
```

with:

```svelte
y={prefersReducedMotion.current ? previewY : previewYMotion.current}
```

- [ ] **Step 3: Verify in the running app**

Run: `npm run dev`. Drag a palette device slowly up a rack; also arm keyboard placement and move the cursor with arrow keys.

Expected: the dashed preview glides between slots instead of jumping; with reduced motion emulated it snaps as before. Feedback colour changes (valid/blocked) stay instant.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/RackDropZone.svelte
git commit -s -m "feat: tween drop preview between U slots"
```

---

### Task 8: Committed device moves settle instead of teleporting

Committed moves (drop into a new slot, arrow-key nudge, undo/redo, container resize shifting positions) snap instantly. Tween the rendered y so the device settles over 120ms. Stored positions remain whole-U integers; only the rendered translate interpolates. During a pointer drag only the tooltip and drop preview move, and the device jumps once on drop, so the tween never runs per-frame against the pointer. Cross-rack moves destroy/recreate the component (different keyed each), so they fade via Task 5 rather than tweening across the canvas.

No test: visual-only change.

**Files:**

- Modify: `src/lib/components/RackDevice.svelte (script imports, after yPosition at line 257, transform at line 620)`

- [ ] **Step 1: Add imports and the tween**

In the script imports:

```typescript
import { Tween, prefersReducedMotion } from "svelte/motion";
import { cubicOut } from "svelte/easing";
```

After the `yPosition` derived (lines 256-258), add:

```typescript
// Settle committed moves (drop, keyboard nudge, undo). Positions are
// whole-U integers that change only on commit, never per-frame during a
// drag, so the tween never fights the pointer.
const yMotion = Tween.of(() => yPosition, {
  duration: 120,
  easing: cubicOut,
});
```

- [ ] **Step 2: Use the tweened value in the group transform**

Replace line 620:

```svelte
transform="translate({RAIL_WIDTH + slotXOffset}, {yPosition})"
```

with:

```svelte
transform="translate({RAIL_WIDTH + slotXOffset}, {prefersReducedMotion.current
  ? yPosition
  : yMotion.current})"
```

- [ ] **Step 3: Verify in the running app**

Run: `npm run dev`. Select a device and nudge it with ArrowUp/ArrowDown; drag it to a new slot; undo.

Expected: the device settles into place over ~120ms in every case; reduced motion snaps. The selection outline and any container children travel with the group (they are inside the same `<g>`).

- [ ] **Step 4: Run the unit suite**

Run: `npm run test:run`

Expected: pass. Position assertions in tests read store state (integers), not rendered attributes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/RackDevice.svelte
git commit -s -m "feat: settle tween for committed device moves"
```

---

### Task 9: Announce arrow-key device moves to screen readers

ArrowUp/ArrowDown device move is a documented primary shortcut, yet it is imperceptible to screen-reader users (a changed aria-label on a focused element is not reliably re-announced) and a blocked move fails silently for everyone. Announce both outcomes through the existing assertive live region: DialogOrchestrator permanently renders `placementStore.placementAnnouncement` in an `aria-live="assertive"` div (`data-testid="placement-sr-announcer"`), and `placementStore.announcePosition(text)` sets it. No new region needed.

**Files:**

- Modify: `src/lib/actions/selection-actions.ts:42-77 (_moveSelectedDevice)`
- Test: `src/tests/selection-move-announcements.test.ts` (create)

**Interfaces:**

- Consumes: `getPlacementStore().announcePosition(text: string)` and `.placementAnnouncement` from `src/lib/stores/placement.svelte.ts`; `getLayoutStore().addRack(name, height)` (returns the rack object), `.addDeviceType(input)` (returns DeviceType), `.placeDeviceSmart(rackId, slug, humanU)`; `getSelectionStore().selectDevice(rackId, deviceId)`; `createTestDeviceTypeInput` from `src/tests/factories.ts`.
- Produces: `moveSelectedDeviceUp()` / `moveSelectedDeviceDown()` (existing exports, unchanged signatures) now set the live announcement.

- [ ] **Step 1: Write the failing test**

```typescript
// src/tests/selection-move-announcements.test.ts
/**
 * Arrow-key device moves must be perceivable without vision: a successful
 * move announces the new U position through the assertive live region
 * (placementStore.placementAnnouncement, rendered by DialogOrchestrator),
 * and a blocked move announces the failure instead of no-oping silently.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import {
  getSelectionStore,
  resetSelectionStore,
} from "$lib/stores/selection.svelte";
import {
  getPlacementStore,
  resetPlacementStore,
} from "$lib/stores/placement.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import {
  moveSelectedDeviceUp,
  moveSelectedDeviceDown,
} from "$lib/actions/selection-actions";
import { createTestDeviceTypeInput } from "./factories";

describe("arrow-key device move announcements", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetSelectionStore();
    resetPlacementStore();
    resetHistoryStore();
  });

  function placeAndSelect(positionU: number): void {
    const layoutStore = getLayoutStore();
    const rack = layoutStore.addRack("Test Rack", 12);
    const dt = layoutStore.addDeviceType(createTestDeviceTypeInput());
    layoutStore.placeDeviceSmart(rack!.id, dt.slug, positionU);
    // Store mutations replace arrays immutably (rack-actions.ts), so re-read
    // the rack from the store rather than trusting the creation-time reference.
    const liveRack = layoutStore.racks.find((r) => r.id === rack!.id)!;
    getSelectionStore().selectDevice(rack!.id, liveRack.devices[0]!.id);
  }

  it("announces the new position after a successful move up", () => {
    placeAndSelect(5);
    moveSelectedDeviceUp();
    expect(getPlacementStore().placementAnnouncement).toBe("Moved to U6");
  });

  it("announces failure when the device is already at the top", () => {
    placeAndSelect(12);
    moveSelectedDeviceUp();
    expect(getPlacementStore().placementAnnouncement).toBe(
      "Cannot move up, no free position",
    );
  });

  it("announces failure when the device is already at the bottom", () => {
    placeAndSelect(1);
    moveSelectedDeviceDown();
    expect(getPlacementStore().placementAnnouncement).toBe(
      "Cannot move down, no free position",
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- src/tests/selection-move-announcements.test.ts`

Expected: FAIL, `placementAnnouncement` is null in all three cases.

- [ ] **Step 3: Announce from \_moveSelectedDevice**

In `src/lib/actions/selection-actions.ts`, add the import (alongside the existing store imports):

```typescript
import { getPlacementStore } from "$lib/stores/placement.svelte";
```

Then replace the tail of `_moveSelectedDevice` (currently lines 61-77):

```typescript
const result = findNextValidPosition(
  rack,
  layoutStore.device_types,
  deviceIndex,
  direction,
);

if (result.success && result.newPosition !== null) {
  const humanPosition = toHumanUnits(result.newPosition);
  layoutStore.moveDevice(
    selectionStore.selectedRackId!,
    deviceIndex,
    humanPosition,
  );
}
```

with:

```typescript
const result = findNextValidPosition(
  rack,
  layoutStore.device_types,
  deviceIndex,
  direction,
);

// Announce through the assertive live region DialogOrchestrator renders
// (placement-sr-announcer). A focused element's aria-label change is not
// reliably re-announced, and a blocked move must not fail silently.
const placementStore = getPlacementStore();
if (result.success && result.newPosition !== null) {
  const humanPosition = toHumanUnits(result.newPosition);
  layoutStore.moveDevice(
    selectionStore.selectedRackId!,
    deviceIndex,
    humanPosition,
  );
  placementStore.announcePosition(`Moved to U${humanPosition}`);
} else {
  placementStore.announcePosition(
    direction === 1
      ? "Cannot move up, no free position"
      : "Cannot move down, no free position",
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- src/tests/selection-move-announcements.test.ts`

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/selection-actions.ts src/tests/selection-move-announcements.test.ts
git commit -s -m "feat: announce arrow-key device moves via the assertive live region"
```

---

### Task 10: Announce palette search results to screen readers

Palette search live-filters the list and auto-collapses sections, but nothing announces results, so a screen-reader user gets no feedback that their query matched or not. Add an sr-only status region next to the search input, derived from existing state (`isSearchActive`, `hasResults`, `totalDevicesCount`; all already in scope in DevicePalette.svelte). `.sr-only` is a global utility (src/app.css:216). The text updates at most once per 150ms debounce settle.

**Files:**

- Modify: `src/lib/components/DevicePalette.svelte (template, after the .search-row div around line 580)`
- Test: `src/tests/palette-search-announcements.test.ts` (create)

**Interfaces:**

- Consumes: `TestDevicePalette` helper (`src/tests/helpers/TestDevicePalette.svelte`) used by existing palette component tests; search input `data-testid="search-devices"`.
- Produces: a `data-testid="palette-search-announcer"` status region.

- [ ] **Step 1: Write the failing test**

Counts are asserted by pattern, not exact number (zero-change rule: adding a starter device must not break this test).

```typescript
// src/tests/palette-search-announcements.test.ts
/**
 * Palette search must announce its outcome to screen readers: a status
 * region reports the match count after the debounce settles, reports
 * "No devices match" for a miss, and stays silent while search is empty.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
import TestDevicePalette from "./helpers/TestDevicePalette.svelte";
import { resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetUIStore } from "$lib/stores/ui.svelte";
import { resetToastStore } from "$lib/stores/toast.svelte";

describe("palette search result announcements", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetUIStore();
    resetToastStore();
  });

  it("stays silent while search is empty", () => {
    render(TestDevicePalette);
    expect(screen.getByTestId("palette-search-announcer")).toHaveTextContent(
      /^$/,
    );
  });

  it("announces no matches for a miss", async () => {
    render(TestDevicePalette);
    await fireEvent.input(screen.getByTestId("search-devices"), {
      target: { value: "zzz-no-such-device" },
    });
    await waitFor(() => {
      expect(screen.getByTestId("palette-search-announcer")).toHaveTextContent(
        "No devices match",
      );
    });
  });

  it("announces a match count for a hit", async () => {
    render(TestDevicePalette);
    await fireEvent.input(screen.getByTestId("search-devices"), {
      target: { value: "shelf" },
    });
    await waitFor(() => {
      expect(screen.getByTestId("palette-search-announcer")).toHaveTextContent(
        /\d+ devices? found/,
      );
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- src/tests/palette-search-announcements.test.ts`

Expected: FAIL, `palette-search-announcer` testid not found.

- [ ] **Step 3: Add the status region**

In `src/lib/components/DevicePalette.svelte`, directly after the closing `</div>` of `.search-container` (around line 581), add:

```svelte
<!-- Search outcome for screen readers. The visual list filters live, but
       AT users need the result announced; polite so it never interrupts
       typing. Text settles at most once per debounce (150ms). -->
<div class="sr-only" role="status" data-testid="palette-search-announcer">
  {#if isSearchActive}
    {hasResults
      ? `${totalDevicesCount} ${totalDevicesCount === 1 ? "device" : "devices"} found`
      : "No devices match"}
  {/if}
</div>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- src/tests/palette-search-announcements.test.ts`

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/DevicePalette.svelte src/tests/palette-search-announcements.test.ts
git commit -s -m "feat: announce palette search results to screen readers"
```

---

### Task 11: Full verification

- [ ] **Step 1: Run the full local gate**

Run: `npm run lint && npm run check && npm run test:run`

Expected: all pass. `npm run check` is explicit because the required `validate` gate does not run svelte-check.

- [ ] **Step 2: Manual smoke of every changed interaction**

Run: `npm run dev` and walk through: keyboard Tab to a rack, Enter (selection sticks); place/delete/undo a device (fades); select a device (settle); drag between slots (preview glides, device settles on drop); arrow-key nudge at top of rack (no crash, announcement set); search the palette for a miss and a hit; toggle dual view with a full-depth device that has an image (both faces clip correctly). Then emulate `prefers-reduced-motion: reduce` in DevTools and confirm: no fly, no fade time, no glide, instant snaps.

- [ ] **Step 3: Format check with the main checkout's prettier**

From the worktree, run the main checkout's binary on the touched files (the worktree pre-commit hook no-ops):

```bash
/Users/gvns/code/projects/Rackula/Rackula/node_modules/.bin/prettier --check \
  src/lib/components/Canvas.svelte src/lib/components/RackDevice.svelte \
  src/lib/components/Rack.svelte src/lib/components/RackFrame.svelte \
  src/lib/components/PlacementIndicator.svelte src/lib/components/RackDropZone.svelte \
  src/lib/components/DevicePalette.svelte src/lib/actions/selection-actions.ts \
  src/tests/Canvas.selection-keydown.test.ts src/tests/selection-move-announcements.test.ts \
  src/tests/palette-search-announcements.test.ts
```

Expected: clean; if not, `--write`, re-run the suite, and amend or follow-up commit.

- [ ] **Step 4: Push and open a PR**

Push the branch, open the PR, and wait for both bots (CodeRabbit and CodeAnt; CodeAnt reviews as a PR comment, not a status check) before merging.
