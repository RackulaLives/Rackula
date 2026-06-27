# Full-depth Devices in the Rear View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make full-depth devices always render and collide on both rack faces by deriving their effective face from device depth, and give the rear view a distinct treatment plus an empty-state hint.

**Architecture:** Introduce one pure helper, `effectiveFace(placedDevice, deviceType)`, that returns `"both"` for full-depth devices regardless of their stored `face`. Route every face-consuming site (render filter, collision, blocked-slots, SVG export, annotations) through it, so stored `face` is non-authoritative for full-depth devices and a physically-invisible full-depth device is unrepresentable. Add a rear visual treatment in `RackDevice.svelte`, a face-aware Mounted Face control, and a per-face empty-state hint.

**Tech Stack:** Svelte 5 runes, TypeScript strict, Vitest + @testing-library/svelte.

## Global Constraints

- Svelte 5 runes only (`$state`, `$derived`, `$effect`). No Svelte 4 stores.
- TypeScript strict mode. No `any`, no `@ts-nocheck`.
- Test rules (ESLint-enforced, will fail the build): no `querySelector`/DOM node access in tests, no `toHaveClass`, no `toHaveLength(<literal>)`, no hardcoded colour assertions. Use factories from `src/tests/factories.ts`. Assert behaviour (text, roles, accessible names), not structure.
- User-facing copy: Canadian spelling, no em dashes, no en dashes, no smart quotes, no emoji.
- Every commit: `git commit -s` (DCO sign-off is required or CI fails) and include these trailers:

  ```text
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01FSeSp8srtPQPDYpGGyqJ2t
  ```

- `is_full_depth` semantics: `undefined` or `true` means full-depth; `false` means half-depth. Always test with `!== false`.
- New test files live in `src/tests/` (import factories via `./factories`, code via `$lib/...`), matching `src/tests/rear-view-full-depth.test.ts`.

---

### Task 1: `effectiveFace` helper

**Files:**

- Create: `src/lib/utils/effective-face.ts`
- Test: `src/tests/effective-face.test.ts`

**Interfaces:**

- Produces: `effectiveFace(placedDevice: Pick<PlacedDevice, "face">, deviceType: Pick<DeviceType, "is_full_depth"> | undefined): DeviceFace`

- [ ] Step 1: Write the failing test

Create `src/tests/effective-face.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { effectiveFace } from "$lib/utils/effective-face";

describe("effectiveFace", () => {
  it("returns 'both' for a full-depth device regardless of stored face", () => {
    expect(effectiveFace({ face: "front" }, { is_full_depth: undefined })).toBe(
      "both",
    );
    expect(effectiveFace({ face: "rear" }, { is_full_depth: true })).toBe(
      "both",
    );
    expect(effectiveFace({ face: "both" }, {})).toBe("both");
  });

  it("returns the stored face for a half-depth device", () => {
    expect(effectiveFace({ face: "front" }, { is_full_depth: false })).toBe(
      "front",
    );
    expect(effectiveFace({ face: "rear" }, { is_full_depth: false })).toBe(
      "rear",
    );
  });

  it("returns the stored face when the device type is unknown", () => {
    expect(effectiveFace({ face: "front" }, undefined)).toBe("front");
  });
});
```

- [ ] Step 2: Run test to verify it fails

Run: `npm run test:run -- src/tests/effective-face.test.ts` Expected: FAIL (cannot resolve `$lib/utils/effective-face`).

- [ ] Step 3: Write minimal implementation

Create `src/lib/utils/effective-face.ts`:

```typescript
import type { DeviceFace, DeviceType, PlacedDevice } from "$lib/types";

/**
 * The face a placed device effectively occupies, given its device type.
 *
 * A full-depth device physically spans the whole rack depth, so it always
 * occupies both faces no matter what `face` value its placement stores. Stored
 * `face` is therefore non-authoritative for full-depth devices: legacy or
 * imported data may carry "front" or "rear", but the device is treated as
 * "both". Half-depth devices use their stored face.
 *
 * is_full_depth undefined or true means full-depth; false means half-depth.
 */
export function effectiveFace(
  placedDevice: Pick<PlacedDevice, "face">,
  deviceType: Pick<DeviceType, "is_full_depth"> | undefined,
): DeviceFace {
  if (deviceType && deviceType.is_full_depth !== false) {
    return "both";
  }
  return placedDevice.face;
}
```

- [ ] Step 4: Run test to verify it passes

Run: `npm run test:run -- src/tests/effective-face.test.ts` Expected: PASS (3 tests).

- [ ] Step 5: Commit

```bash
git add src/lib/utils/effective-face.ts src/tests/effective-face.test.ts
git commit -s -m "feat: add effectiveFace helper for full-depth face derivation"
```

---

### Task 2: Route collision through `effectiveFace`

**Files:**

- Modify: `src/lib/utils/collision.ts:170-176` and `:227-233` (and add an import)
- Test: `src/tests/collision-full-depth.test.ts`

**Interfaces:**

- Consumes: `effectiveFace` (Task 1); `canPlaceDevice(rack, deviceLibrary, deviceHeight, targetPosition, excludeIndex?, targetFace)`, `findCollisions(rack, deviceLibrary, newDeviceHeight, newPosition, excludeIndex?, targetFace)` (existing).

- [ ] Step 1: Write the failing test

Create `src/tests/collision-full-depth.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { canPlaceDevice, findCollisions } from "$lib/utils/collision";
import { toInternalUnits } from "$lib/utils/position";
import {
  createTestRack,
  createTestDevice,
  createTestDeviceType,
} from "./factories";

describe("collision treats full-depth devices as occupying both faces (#2337)", () => {
  it("rejects a rear placement behind a full-depth device stored as front-only", () => {
    // is_full_depth omitted -> full-depth.
    const fullDepth = createTestDeviceType({ slug: "srv", u_height: 1 });
    const rack = createTestRack({
      devices: [
        createTestDevice({ device_type: "srv", position: 5, face: "front" }),
      ],
    });

    // Old behaviour: opposite explicit faces never collide -> would be true.
    expect(
      canPlaceDevice(
        rack,
        [fullDepth],
        1,
        toInternalUnits(5),
        undefined,
        "rear",
      ),
    ).toBe(false);

    const blockers = findCollisions(
      rack,
      [fullDepth],
      1,
      toInternalUnits(5),
      undefined,
      "rear",
    );
    expect(blockers.map((b) => b.device_type)).toContain("srv");
  });

  it("still allows a rear placement behind a half-depth front device", () => {
    const halfDepth = createTestDeviceType({
      slug: "shallow",
      u_height: 1,
      is_full_depth: false,
    });
    const rack = createTestRack({
      devices: [
        createTestDevice({
          device_type: "shallow",
          position: 5,
          face: "front",
        }),
      ],
    });

    expect(
      canPlaceDevice(
        rack,
        [halfDepth],
        1,
        toInternalUnits(5),
        undefined,
        "rear",
      ),
    ).toBe(true);
  });
});
```

- [ ] Step 2: Run test to verify it fails

Run: `npm run test:run -- src/tests/collision-full-depth.test.ts` Expected: FAIL on the first test (`canPlaceDevice(... "rear")` returns `true`, expected `false`).

- [ ] Step 3: Add the import

At the top of `src/lib/utils/collision.ts`, add alongside the existing imports:

```typescript
import { effectiveFace } from "./effective-face";
```

- [ ] Step 4: Update both collision loops

In `canPlaceDevice`, replace lines 170-175:

```typescript
if (
  doRangesOverlap(newRange, existingRange) &&
  doFacesCollide(targetFace, placedDevice.face)
) {
  return false;
}
```

with:

```typescript
if (
  doRangesOverlap(newRange, existingRange) &&
  doFacesCollide(targetFace, effectiveFace(placedDevice, device))
) {
  return false;
}
```

In `findCollisions`, replace lines 227-232:

```typescript
if (
  doRangesOverlap(newRange, existingRange) &&
  doFacesCollide(targetFace, placedDevice.face)
) {
  collisions.push(placedDevice);
}
```

with:

```typescript
if (
  doRangesOverlap(newRange, existingRange) &&
  doFacesCollide(targetFace, effectiveFace(placedDevice, device))
) {
  collisions.push(placedDevice);
}
```

(`device` is the looked-up `DeviceType` already in scope inside the `if (device) {` block in both loops.)

- [ ] Step 5: Run test to verify it passes

Run: `npm run test:run -- src/tests/collision-full-depth.test.ts` Expected: PASS (2 tests).

- [ ] Step 6: Run the existing collision suite to check for regressions

Run: `npm run test:run -- src/tests/collision` Expected: PASS (no regressions in existing collision tests).

- [ ] Step 7: Commit

```bash
git add src/lib/utils/collision.ts src/tests/collision-full-depth.test.ts
git commit -s -m "fix: full-depth devices collide on both faces via effectiveFace"
```

---

### Task 3: Route the rack render filter through `effectiveFace`

**Files:**

- Modify: `src/lib/components/Rack.svelte:256-266` (visibleDevices), `:268-281` (containerChildren), and add an import
- Test: `src/tests/rear-view-full-depth.test.ts` (extend the existing file)

**Interfaces:**

- Consumes: `effectiveFace` (Task 1). `Rack` props already include `deviceLibrary: DeviceType[]` and `faceFilter?: "front" | "rear"`.

- [ ] Step 1: Write the failing test

In `src/tests/rear-view-full-depth.test.ts`, update the import on line 12 to add the factories:

```typescript
import {
  createTestDeviceTypeInput,
  createTestRack,
  createTestDevice,
  createTestDeviceType,
} from "./factories";
```

Then add this test inside the existing `describe` block:

```typescript
it("renders a full-depth device stored as front-only under the rear filter (legacy data)", () => {
  // A full-depth device whose placement carries face: "front" (prior-release
  // or imported data). It must still render on the rear.
  const deviceType = createTestDeviceType({
    slug: "nas",
    model: "NAS",
    u_height: 1,
  });
  const rack = createTestRack({
    devices: [
      createTestDevice({ device_type: "nas", position: 5, face: "front" }),
    ],
  });

  render(Rack, {
    props: {
      rack,
      deviceLibrary: [deviceType],
      selected: false,
      faceFilter: "rear",
    },
  });

  expect(screen.getByText("NAS")).toBeInTheDocument();
});
```

- [ ] Step 2: Run test to verify it fails

Run: `npm run test:run -- src/tests/rear-view-full-depth.test.ts` Expected: FAIL on the new test (`Unable to find an element with the text: NAS`); the existing two tests still pass.

- [ ] Step 3: Add the import

In `src/lib/components/Rack.svelte`, add to the script imports:

```typescript
import { effectiveFace } from "$lib/utils/effective-face";
```

- [ ] Step 4: Update `visibleDevices`

Replace lines 256-266:

```typescript
const visibleDevices = $derived(
  rack.devices
    .map((placedDevice, originalIndex) => ({ placedDevice, originalIndex }))
    .filter(({ placedDevice }) => {
      if (placedDevice.container_id) return false;
      return (
        placedDevice.face === "both" ||
        placedDevice.face === effectiveFaceFilter
      );
    }),
);
```

with:

```typescript
const visibleDevices = $derived(
  rack.devices
    .map((placedDevice, originalIndex) => ({ placedDevice, originalIndex }))
    .filter(({ placedDevice }) => {
      if (placedDevice.container_id) return false;
      const ef = effectiveFace(
        placedDevice,
        deviceLibrary.find((d) => d.slug === placedDevice.device_type),
      );
      return ef === "both" || ef === effectiveFaceFilter;
    }),
);
```

- [ ] Step 5: Update `containerChildren`

Replace the face check inside the `forEach` (lines 273-274):

```typescript
if (!pd.container_id) return;
if (pd.face !== "both" && pd.face !== effectiveFaceFilter) return;
```

with:

```typescript
if (!pd.container_id) return;
const ef = effectiveFace(
  pd,
  deviceLibrary.find((d) => d.slug === pd.device_type),
);
if (ef !== "both" && ef !== effectiveFaceFilter) return;
```

- [ ] Step 6: Run test to verify it passes

Run: `npm run test:run -- src/tests/rear-view-full-depth.test.ts` Expected: PASS (3 tests).

- [ ] Step 7: Validate the Svelte component

Use the Svelte MCP `svelte-autofixer` tool on `src/lib/components/Rack.svelte`. Apply any fixes it reports, then re-run it until clean.

- [ ] Step 8: Commit

```bash
git add src/lib/components/Rack.svelte src/tests/rear-view-full-depth.test.ts
git commit -s -m "fix: render full-depth devices on both faces via effectiveFace (#2337)"
```

---

### Task 4: Route blocked-slots and SVG export through `effectiveFace`

**Files:**

- Modify: `src/lib/utils/blocked-slots.ts:34-71` (and add an import)
- Modify: `src/lib/utils/export/svg.ts:78-84` (filterDevicesByFace) and `:822` (call site), add an import

**Interfaces:**

- Consumes: `effectiveFace` (Task 1). No behavioural change to blocked-slots (it already keys on `is_full_depth`); SVG export now includes a full-depth front-stored device in the rear export.

This task is a mechanical refactor onto the shared helper. Blocked-slots behaviour is unchanged, and the SVG filter change is covered by the Task 1 helper tests, so no new test is added (per the project rule against low-value tests). The gate is the full suite plus a type-check.

- [ ] Step 1: Update `blocked-slots.ts`

Add the import at the top:

```typescript
import { effectiveFace } from "./effective-face";
```

Replace the loop body (lines 41-67) so it derives the face once:

```typescript
for (const placedDevice of rack.devices) {
  // Find the device type to get height and depth.
  const deviceType = deviceLibrary.find(
    (d) => d.slug === placedDevice.device_type,
  );
  if (!deviceType) continue;

  const face = effectiveFace(placedDevice, deviceType);

  // Same face: visible, no hatching. Full-depth ("both"): visible on both
  // sides, no hatching.
  if (face === view || face === "both") continue;

  // A half-depth device on the opposite face: hatch the slots it occupies.
  // Position is in internal units (6 per U); convert to human units.
  const positionU = toHumanUnits(placedDevice.position);
  const bottom = positionU;
  const top = positionU + deviceType.u_height - 1;

  blocked.push({ bottom, top });
}
```

- [ ] Step 2: Update `export/svg.ts`

Add the import near the other utils imports:

```typescript
import { effectiveFace } from "$lib/utils/effective-face";
```

Replace `filterDevicesByFace` (lines 78-84):

```typescript
function filterDevicesByFace(
  devices: Rack["devices"],
  faceFilter: "front" | "rear" | undefined,
): Rack["devices"] {
  if (!faceFilter) return devices;
  return devices.filter((d) => d.face === "both" || d.face === faceFilter);
}
```

with:

```typescript
function filterDevicesByFace(
  devices: Rack["devices"],
  faceFilter: "front" | "rear" | undefined,
  deviceLibrary: DeviceType[],
): Rack["devices"] {
  if (!faceFilter) return devices;
  return devices.filter((d) => {
    const face = effectiveFace(
      d,
      deviceLibrary.find((dt) => dt.slug === d.device_type),
    );
    return face === "both" || face === faceFilter;
  });
}
```

Update the call site at line 822:

```typescript
const filteredDevices = filterDevicesByFace(rack.devices, faceFilter);
```

to:

```typescript
const filteredDevices = filterDevicesByFace(
  rack.devices,
  faceFilter,
  deviceLibrary,
);
```

(`deviceLibrary` is already in scope here; it is used on the next line at `:824`. Confirm `DeviceType` is imported in `svg.ts`; if not, add it to the type imports from `$lib/types`.)

- [ ] Step 3: Type-check and run the full suite

Run: `npm run test:run` Expected: PASS (whole suite green, including the existing blocked-slots and export tests).

- [ ] Step 4: Commit

```bash
git add src/lib/utils/blocked-slots.ts src/lib/utils/export/svg.ts
git commit -s -m "refactor: route blocked-slots and svg export through effectiveFace"
```

---

### Task 5: Route the annotation column through `effectiveFace`

**Files:**

- Modify: `src/lib/components/AnnotationColumn.svelte:104-109` (and add an import)
- Test: `src/tests/annotation-full-depth.test.ts`

**Interfaces:**

- Consumes: `effectiveFace` (Task 1). Fixes a latent bug: the current filter `d.face === faceFilter` drops `"both"` devices entirely, so full-depth annotations never showed.

- [ ] Step 1: Write the failing test

Create `src/tests/annotation-full-depth.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import AnnotationColumn from "$lib/components/AnnotationColumn.svelte";
import {
  createTestRack,
  createTestDevice,
  createTestDeviceType,
} from "./factories";

describe("AnnotationColumn shows full-depth devices on both faces", () => {
  it("annotates a full-depth device on the rear face", () => {
    const deviceType = createTestDeviceType({
      slug: "nas",
      model: "NAS",
      u_height: 1,
    });
    const rack = createTestRack({
      devices: [
        createTestDevice({
          device_type: "nas",
          position: 5,
          face: "front",
          name: "Big NAS",
        }),
      ],
    });

    render(AnnotationColumn, {
      props: {
        rack,
        deviceLibrary: [deviceType],
        annotationField: "name",
        faceFilter: "rear",
      },
    });

    expect(screen.getByText("Big NAS")).toBeInTheDocument();
  });
});
```

- [ ] Step 2: Run test to verify it fails

Run: `npm run test:run -- src/tests/annotation-full-depth.test.ts` Expected: FAIL (`Unable to find an element with the text: Big NAS`).

- [ ] Step 3: Add the import

In `src/lib/components/AnnotationColumn.svelte`, add to the script imports:

```typescript
import { effectiveFace } from "$lib/utils/effective-face";
```

- [ ] Step 4: Update `filteredDevices`

Replace lines 104-109:

```typescript
// Filter devices by face if faceFilter is provided
const filteredDevices = $derived(
  faceFilter ? rack.devices.filter((d) => d.face === faceFilter) : rack.devices,
);
```

with:

```typescript
// Filter devices by face if faceFilter is provided. Full-depth devices occupy
// both faces, so they annotate on either side.
const filteredDevices = $derived(
  faceFilter
    ? rack.devices.filter((d) => {
        const face = effectiveFace(d, deviceTypeMap.get(d.device_type));
        return face === "both" || face === faceFilter;
      })
    : rack.devices,
);
```

- [ ] Step 5: Run test to verify it passes

Run: `npm run test:run -- src/tests/annotation-full-depth.test.ts` Expected: PASS.

- [ ] Step 6: Validate the Svelte component

Run the Svelte MCP `svelte-autofixer` on `src/lib/components/AnnotationColumn.svelte`; apply fixes until clean.

- [ ] Step 7: Commit

```bash
git add src/lib/components/AnnotationColumn.svelte src/tests/annotation-full-depth.test.ts
git commit -s -m "fix: annotate full-depth devices on both faces via effectiveFace"
```

---

### Task 6: Rear visual treatment in `RackDevice.svelte`

**Files:**

- Modify: `src/lib/components/RackDevice.svelte` (deriveds near `:158`/`:194`, ariaLabel `:322-340`, rect `:605-621`, add a badge before the interfaces block, styles `:820+`)
- Test: `src/tests/rear-treatment.test.ts`

**Interfaces:**

- Consumes: existing `currentFace`, `device.is_full_depth`, `showImage`, `showImagePlaceholder`. No new exported interface.

- [ ] Step 1: Write the failing test

Create `src/tests/rear-treatment.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import Rack from "$lib/components/Rack.svelte";
import {
  createTestRack,
  createTestDevice,
  createTestDeviceType,
} from "./factories";

describe("Rear treatment for full-depth devices", () => {
  it("marks a full-depth device as rear in the rear view", () => {
    const deviceType = createTestDeviceType({
      slug: "nas",
      model: "NAS",
      u_height: 2,
    });
    const rack = createTestRack({
      devices: [
        createTestDevice({ device_type: "nas", position: 5, face: "front" }),
      ],
    });

    render(Rack, {
      props: {
        rack,
        deviceLibrary: [deviceType],
        selected: false,
        faceFilter: "rear",
      },
    });

    expect(screen.getByText("REAR")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /NAS.*rear/i }),
    ).toBeInTheDocument();
  });

  it("does not mark the same device as rear in the front view", () => {
    const deviceType = createTestDeviceType({
      slug: "nas",
      model: "NAS",
      u_height: 2,
    });
    const rack = createTestRack({
      devices: [
        createTestDevice({ device_type: "nas", position: 5, face: "front" }),
      ],
    });

    render(Rack, {
      props: {
        rack,
        deviceLibrary: [deviceType],
        selected: false,
        faceFilter: "front",
      },
    });

    expect(screen.queryByText("REAR")).not.toBeInTheDocument();
  });

  it("does not mark a rear-mounted half-depth device as rear", () => {
    const deviceType = createTestDeviceType({
      slug: "pdu",
      model: "PDU",
      u_height: 1,
      is_full_depth: false,
    });
    const rack = createTestRack({
      devices: [
        createTestDevice({ device_type: "pdu", position: 5, face: "rear" }),
      ],
    });

    render(Rack, {
      props: {
        rack,
        deviceLibrary: [deviceType],
        selected: false,
        faceFilter: "rear",
      },
    });

    expect(screen.getByText("PDU")).toBeInTheDocument();
    expect(screen.queryByText("REAR")).not.toBeInTheDocument();
  });
});
```

- [ ] Step 2: Run test to verify it fails

Run: `npm run test:run -- src/tests/rear-treatment.test.ts` Expected: FAIL on the first test (`Unable to find an element with the text: REAR`).

- [ ] Step 3: Add the derived flags

In `src/lib/components/RackDevice.svelte`, after `currentFace` (line 158) add:

```typescript
// The back of a full-depth device gets a distinct treatment in the rear view.
// Keyed on full-depth, so a rear-mounted half-depth device (whose real front
// you see from the back) is not differentiated.
const isRearTreatment = $derived(
  currentFace === "rear" && device.is_full_depth !== false,
);
```

After `showImage` (line 194) add:

```typescript
// Mute the colour body only when no real rear image is shown; the image
// already differentiates the back, so it stays at full fidelity.
const isRearMuted = $derived(isRearTreatment && !showImage);
```

- [ ] Step 4: Announce the rear face in the accessible name

In the `ariaLabel` derived (lines 322-340), after the `imageState` block add:

```typescript
const rearState =
  isRearTreatment && !showImage && !showImagePlaceholder ? ", rear" : "";
```

Then append `${rearState}` before `${selected ? ", selected" : ""}` in both `return` statements:

```typescript
if (containerContext) {
  return `${base} in ${containerContext.slotName} of ${containerContext.containerName} at U${containerContext.containerPosition}${imageState}${rearState}${selected ? ", selected" : ""}`;
}

return `${base} at U${positionHuman}${imageState}${rearState}${selected ? ", selected" : ""}`;
```

- [ ] Step 5: Mute the device rect and add the badge

On the `<rect class="device-rect">` (lines 605-621), add the conditional class. Change the opening:

```svelte
  <rect
    bind:this={rectElement}
    class="device-rect"
```

to:

```svelte
  <rect
    bind:this={rectElement}
    class="device-rect"
    class:rear-muted={isRearMuted}
```

Then add the badge directly before the interfaces block (the `{#if device.interfaces?.length}` around line 731), inside the `<g class="rack-device">`:

```svelte
<!-- Rear affordance: marks this as the back of a full-depth device. -->
{#if isRearTreatment}
  <text
    class="rear-badge"
    x={deviceWidth - 4}
    y="10"
    text-anchor="end"
    aria-hidden="true"
  >
    REAR
  </text>
{/if}
```

- [ ] Step 6: Add the styles

In the `<style>` block, after the `.device-name` rule add:

```css
.device-rect.rear-muted {
  /* Desaturate and darken the back of a full-depth device so it reads as the
       rear, not a duplicate of the front. Initial values; the frontend-design
       pass tunes these against the design tokens. */
  filter: saturate(0.45) brightness(0.82);
}

.rear-badge {
  fill: var(--neutral-50);
  font-size: 8px;
  font-weight: 600;
  letter-spacing: 0.06em;
  opacity: 0.85;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  pointer-events: none;
  user-select: none;
}
```

- [ ] Step 7: Run test to verify it passes

Run: `npm run test:run -- src/tests/rear-treatment.test.ts` Expected: PASS (3 tests).

- [ ] Step 8: Validate the Svelte component

Run the Svelte MCP `svelte-autofixer` on `src/lib/components/RackDevice.svelte`; apply fixes until clean.

- [ ] Step 9: Commit

```bash
git add src/lib/components/RackDevice.svelte src/tests/rear-treatment.test.ts
git commit -s -m "feat: distinct rear treatment for full-depth devices"
```

---

### Task 7: Per-face empty-state hint

**Files:**

- Modify: `src/lib/components/Rack.svelte` (after the devices `</g>` at `:553`, and styles)
- Test: `src/tests/empty-face-hint.test.ts`

**Interfaces:**

- Consumes: existing `visibleDevices`, `faceFilter`, `RACK_WIDTH`, `RACK_PADDING`, `RAIL_WIDTH`, `totalHeight`.

- [ ] Step 1: Write the failing test

Create `src/tests/empty-face-hint.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import Rack from "$lib/components/Rack.svelte";
import {
  createTestRack,
  createTestDevice,
  createTestDeviceType,
} from "./factories";

describe("Empty-face hint", () => {
  it("shows a hint when no devices face the rear", () => {
    // A half-depth front-only device: nothing is on the rear.
    const deviceType = createTestDeviceType({
      slug: "sw",
      model: "Switch",
      u_height: 1,
      is_full_depth: false,
    });
    const rack = createTestRack({
      devices: [
        createTestDevice({ device_type: "sw", position: 5, face: "front" }),
      ],
    });

    render(Rack, {
      props: {
        rack,
        deviceLibrary: [deviceType],
        selected: false,
        faceFilter: "rear",
      },
    });

    expect(
      screen.getByText(/no rear-facing or full-depth devices/i),
    ).toBeInTheDocument();
  });

  it("hides the hint when a device faces the rear", () => {
    const deviceType = createTestDeviceType({
      slug: "nas",
      model: "NAS",
      u_height: 1,
    });
    const rack = createTestRack({
      devices: [
        createTestDevice({ device_type: "nas", position: 5, face: "front" }),
      ],
    });

    render(Rack, {
      props: {
        rack,
        deviceLibrary: [deviceType],
        selected: false,
        faceFilter: "rear",
      },
    });

    expect(
      screen.queryByText(/no rear-facing or full-depth devices/i),
    ).not.toBeInTheDocument();
  });
});
```

- [ ] Step 2: Run test to verify it fails

Run: `npm run test:run -- src/tests/empty-face-hint.test.ts` Expected: FAIL on the first test (hint text not found).

- [ ] Step 3: Add the hint to the template

In `src/lib/components/Rack.svelte`, immediately after the devices layer closing `</g>` (line 553) and before the drop-preview block, add:

```svelte
<!-- Empty-state hint: only in a face-filtered (dual) view, so an empty rear
         reads as "nothing rear-facing here" rather than looking broken. -->
{#if faceFilter && visibleDevices.length === 0}
  <text
    class="empty-face-hint"
    x={RACK_WIDTH / 2}
    y={RACK_PADDING + RAIL_WIDTH + totalHeight / 2}
    dominant-baseline="middle"
    text-anchor="middle"
    role="note"
  >
    No {faceFilter}-facing or full-depth devices
  </text>
{/if}
```

- [ ] Step 4: Add the style

In the `<style>` block add:

```css
.empty-face-hint {
  /* Muted-text token with a concrete fallback; the frontend-design pass
       confirms the exact token. */
  fill: var(--neutral-400, #9aa3ad);
  font-size: 11px;
  font-family: var(--font-family, system-ui, sans-serif);
  pointer-events: none;
  user-select: none;
}
```

- [ ] Step 5: Run test to verify it passes

Run: `npm run test:run -- src/tests/empty-face-hint.test.ts` Expected: PASS (2 tests).

- [ ] Step 6: Validate the Svelte component

Run the Svelte MCP `svelte-autofixer` on `src/lib/components/Rack.svelte`; apply fixes until clean.

- [ ] Step 7: Commit

```bash
git add src/lib/components/Rack.svelte src/tests/empty-face-hint.test.ts
git commit -s -m "feat: empty-state hint for a face with no devices"
```

---

### Task 8: Face-aware Mounted Face control and clean-on-write guard

**Files:**

- Modify: `src/lib/components/EditPanelMetadata.svelte:448-468` (the Mounted Face control)
- Modify: `src/lib/stores/layout/recorded-device-actions.ts` (`updateDeviceFaceRecorded`, around `:451-463`)
- Test: `src/tests/full-depth-face-guard.test.ts`

**Interfaces:**

- Consumes: existing `isFullDepthDevice` derived (`EditPanelMetadata.svelte:107`), `handleFaceChange`, `selectedDeviceInfo`, `findDeviceTypeInArray`. The control no longer offers a single face for full-depth devices, and `updateDeviceFaceRecorded` coerces a full-depth device's face to `"both"` so stored data stays consistent.

The edit-panel control change is presentational; per the project testing policy it gets no DOM-structure test. The behavioural guard (`updateDeviceFaceRecorded`) is tested.

- [ ] Step 1: Write the failing test (the store guard)

Create `src/tests/full-depth-face-guard.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { resetLayoutStore, getLayoutStore } from "$lib/stores/layout.svelte";
import { createTestDeviceType } from "./factories";

describe("updateDeviceFace keeps full-depth devices on both faces", () => {
  beforeEach(() => resetLayoutStore());

  it("coerces a full-depth device's face back to 'both'", () => {
    const store = getLayoutStore();
    const rack = store.addRack("R", 42);
    const dt = createTestDeviceType({ slug: "srv", u_height: 1 }); // full-depth
    store.addDeviceTypeRaw(dt);
    store.placeDevice(rack!.id, dt.slug, 5);

    store.updateDeviceFace(rack!.id, 0, "front");

    expect(store.rack!.devices[0]!.face).toBe("both");
  });

  it("lets a half-depth device move to the rear", () => {
    const store = getLayoutStore();
    const rack = store.addRack("R", 42);
    const dt = createTestDeviceType({
      slug: "shallow",
      u_height: 1,
      is_full_depth: false,
    });
    store.addDeviceTypeRaw(dt);
    store.placeDevice(rack!.id, dt.slug, 5);

    store.updateDeviceFace(rack!.id, 0, "rear");

    expect(store.rack!.devices[0]!.face).toBe("rear");
  });
});
```

- [ ] Step 2: Run test to verify it fails

Run: `npm run test:run -- src/tests/full-depth-face-guard.test.ts` Expected: FAIL on the first test (face stored as `"front"`, expected `"both"`).

- [ ] Step 3: Add the clean-on-write guard

In `src/lib/stores/layout/recorded-device-actions.ts`, inside `updateDeviceFaceRecorded`, after the `deviceName` line (around 451) and before `const history = ctx.getHistory();`, add:

```typescript
// Full-depth devices are always mounted on both faces. Never store a single
// face for them, so data on disk matches how they render (they derive to
// "both" regardless, but this keeps saved layouts clean).
const targetFace: DeviceFace =
  deviceType && deviceType.is_full_depth !== false ? "both" : face;
```

Then change the command creation to use `targetFace` instead of `face`:

```typescript
const command = createUpdateDeviceFaceCommand(
  deviceIndex,
  oldFace,
  targetFace,
  adapter,
  deviceName,
);
```

(`DeviceFace` is already imported in this file; if not, add it to the `$lib/types` type import.)

- [ ] Step 4: Run test to verify it passes

Run: `npm run test:run -- src/tests/full-depth-face-guard.test.ts` Expected: PASS (2 tests).

- [ ] Step 5: Replace the Mounted Face control

In `src/lib/components/EditPanelMetadata.svelte`, replace the Mounted Face block (lines 448-468):

```svelte
<!-- Placement: editable mounted face -->
<section class="field-group">
  <h3 class="group-header">Placement</h3>
  <div class="form-group">
    <label for="device-face">Mounted Face</label>
    <select
      id="device-face"
      class="input-field"
      value={selectedDeviceInfo.placedDevice.face}
      onchange={(e) =>
        handleFaceChange((e.target as HTMLSelectElement).value as DeviceFace)}
    >
      <option value="front">Front</option>
      <option value="rear">Rear</option>
      <option value="both">Both (full-depth)</option>
    </select>
    {#if isFullDepthDevice && selectedDeviceInfo.placedDevice.face !== "both"}
      <p class="helper-text">Overriding default full-depth setting</p>
    {/if}
  </div>
</section>
```

with:

```svelte
<!-- Placement: mounted face. Full-depth devices are locked to both faces; only
     half-depth devices choose front or rear. -->
<section class="field-group">
  <h3 class="group-header">Placement</h3>
  <div class="form-group">
    <label for="device-face">Mounted Face</label>
    {#if isFullDepthDevice}
      <select id="device-face" class="input-field" disabled aria-disabled="true">
        <option value="both">Both (full-depth)</option>
      </select>
      <p class="helper-text">
        Set by device depth. To mount on a single face, change the device type to
        half-depth.
      </p>
    {:else}
      <select
        id="device-face"
        class="input-field"
        value={selectedDeviceInfo.placedDevice.face}
        onchange={(e) =>
          handleFaceChange((e.target as HTMLSelectElement).value as DeviceFace)}
      >
        <option value="front">Front</option>
        <option value="rear">Rear</option>
      </select>
    {/if}
  </div>
</section>
```

- [ ] Step 6: Validate the Svelte component

Run the Svelte MCP `svelte-autofixer` on `src/lib/components/EditPanelMetadata.svelte`; apply fixes until clean.

- [ ] Step 7: Commit

```bash
git add src/lib/components/EditPanelMetadata.svelte src/lib/stores/layout/recorded-device-actions.ts src/tests/full-depth-face-guard.test.ts
git commit -s -m "feat: lock full-depth mounted face to both, clean on write"
```

---

### Task 9: Full verification and self-review

**Files:** none (verification only)

- [ ] Step 1: Run the full unit suite

Run: `npm run test:run` Expected: PASS (whole suite green).

- [ ] Step 2: Lint

Run: `npm run lint` Expected: no errors. In particular, confirm no new test triggers the `no-restricted-syntax` rules (querySelector, toHaveClass, toHaveLength literal, hardcoded colours).

- [ ] Step 3: Type-check / build

Run: `npm run build` Expected: success, no TypeScript errors.

- [ ] Step 4: Manual confirmation of the reported bug

Run: `npm run dev`. Open the layout with the front-pinned full-depth NAS. Confirm: the NAS now renders in the REAR panel with the muted treatment and a "REAR" badge; selecting it in the rear updates the edit panel and the front instance; the Mounted Face control shows a disabled "Both (full-depth)" with the helper text; a rack face with nothing on it shows the empty-state hint.

- [ ] Step 5: Commit any final fixups

```bash
git add -A
git commit -s -m "test: full-depth rear-view verification fixups"
```

(Skip this commit if Steps 1-4 produced no changes.)

---

## Scoping notes (read before executing)

- Prior-release data guard: because the correctness mechanism is derive-on-read, nothing mutates on load, so there is no migration to guard with a formal upgrade-corpus fixture. The Task 3 test uses legacy-shaped data (a full-depth placement carrying `face: "front"`) and asserts it renders on the rear, which is the real regression guard. Adding a YAML entry to `src/tests/fixtures/upgrade-corpus/` is an optional follow-up; flag it if the team wants it in the formal corpus.
- Named follow-ups, out of scope here (file as separate issues): rear-view horizontal mirroring for half-width devices, and rear ports/power rendering for cable planning.
- The exact rear differentiation (desaturation vs badge vs both) and the muted-text token are deliberately first-pass values; the frontend-design skill tunes them after this plan lands.

## Self-review

Spec coverage: policy "always both" is enforced by derivation (Tasks 2-5) plus the clean-on-write guard and locked control (Task 8); the rear visual treatment with rear-image swap, muting, and badge is Task 6; the image-mode-no-rear-image case falls through to the muted colour/label body in Task 6 (the rect is always rendered, so muting applies behind the label); the empty-view hint is Task 7; backward compatibility is satisfied by derive-on-read with the Task 3 legacy-data test; collision/render reconciliation is Task 2; the dropped-annotation latent bug is fixed in Task 5. Non-goals (mirroring, ports, schema change) are respected and the first two are listed as follow-ups.

Placeholder scan: no TBD/TODO; every code step shows complete code; the only deferred values (rear styling, muted-text token) carry concrete defaults and are flagged for the frontend-design pass, not left blank.

Type consistency: `effectiveFace(placedDevice, deviceType)` has one signature used identically across Tasks 2-5; `isRearTreatment`/`isRearMuted` are defined before use in Task 6; `targetFace` in Task 8 reuses the already-imported `DeviceFace`.
