/**
 * Full-depth placement preview and keyboard cursor honesty (#2925).
 *
 * The store derives a pending (not-yet-placed) full-depth device's collision
 * face as "both" regardless of which sub-view (front/rear) it is being placed
 * from - a full-depth device physically spans the whole rack depth. The
 * preview (resolveDropTarget), the drop-action resolver (resolveDropAction),
 * and the keyboard cursor (validStartPositions) must derive the same
 * collision face, or a full-depth device previews as valid over an existing
 * device on the opposite face and then gets refused by the actual placement
 * (same honesty class as #2854).
 */
import { describe, it, expect, vi } from "vitest";

// Control the resolved SVG coordinate without a real DOM geometry. The
// feedback decision under test is downstream of the coordinate math (which is
// unchanged).
vi.mock("$lib/utils/coordinates", async (importActual) => {
  const actual = await importActual<typeof import("$lib/utils/coordinates")>();
  return { ...actual, screenToSVG: vi.fn(() => ({ x: 100, y: 200 })) };
});

import { pendingCollisionFace } from "$lib/utils/effective-face";
import { validStartPositions } from "$lib/utils/placement-keyboard";
import {
  resolveDropTarget,
  resolveDropAction,
  type RackDimensions,
  type DropCoordinateInput,
} from "$lib/utils/rack-drop-coordinator";
import {
  createTestRack,
  createTestDevice,
  createTestDeviceType,
} from "./factories";

describe("pendingCollisionFace", () => {
  const fullDepth = createTestDeviceType({ slug: "srv", u_height: 1 }); // is_full_depth omitted -> full-depth
  const halfDepth = createTestDeviceType({
    slug: "shallow",
    u_height: 1,
    is_full_depth: false,
  });

  it("collapses a full-depth device's collision face to 'both' regardless of view face", () => {
    expect(pendingCollisionFace(fullDepth, "front")).toBe("both");
    expect(pendingCollisionFace(fullDepth, "rear")).toBe("both");
  });

  it("passes through the raw view face for a half-depth device", () => {
    expect(pendingCollisionFace(halfDepth, "front")).toBe("front");
    expect(pendingCollisionFace(halfDepth, "rear")).toBe("rear");
  });
});

describe("validStartPositions excludes slots blocked on the opposite face for a full-depth pending device (#2925)", () => {
  // The pending device being placed is full-depth: it physically spans both
  // faces, so it must collide with a device explicitly mounted on the rear,
  // even though the keyboard cursor is only scanning the front view.
  const fullDepth = createTestDeviceType({ slug: "srv", u_height: 1 });
  const halfDepthRearNeighbour = createTestDeviceType({
    slug: "shallow",
    u_height: 1,
    is_full_depth: false,
  });

  it("excludes a U occupied by a rear-mounted half-depth device when placing a full-depth device from the front view", () => {
    const rack = createTestRack({
      height: 5,
      devices: [
        createTestDevice({ device_type: "shallow", position: 2, face: "rear" }),
      ],
    });
    // Old (buggy) behaviour: raw "front" (the pending full-depth device's
    // uncorrected view face) vs the rear neighbour's explicit "rear" never
    // collide, so U2 would wrongly appear as a valid start.
    expect(
      validStartPositions(
        rack,
        [fullDepth, halfDepthRearNeighbour],
        fullDepth,
        "front",
      ),
    ).not.toContain(2);
  });
});

describe("resolveDropTarget / resolveDropAction agree for a full-depth device over an occupied opposite face (#2925)", () => {
  const dims: RackDimensions = {
    rackHeight: 12, // matches Rack.svelte's rack.height
    rackWidth: 220,
    interiorWidth: 220 - 17 * 2,
    uHeight: 22,
    rackPadding: 0,
    railWidth: 17,
  };
  const coords: DropCoordinateInput = {
    svgElement: {} as SVGSVGElement,
    clientX: 100,
    clientY: 200,
  };
  const fullDepth = createTestDeviceType({ slug: "srv", u_height: 1 });
  const halfDepthRearNeighbour = createTestDeviceType({
    slug: "shallow",
    u_height: 1,
    is_full_depth: false,
  });

  // These dims/coords resolve to targetU 3 (mirrors chassis-child-placement.test.ts).
  function rackWithRearNeighbourAtU3() {
    return createTestRack({
      height: 12,
      devices: [
        createTestDevice({ device_type: "shallow", position: 3, face: "rear" }),
      ],
    });
  }

  it("previews a full-depth device as blocked over a rear half-depth device at the same U, even from the front view", () => {
    const result = resolveDropTarget(
      coords,
      dims,
      rackWithRearNeighbourAtU3(),
      [fullDepth, halfDepthRearNeighbour],
      fullDepth,
      "front",
    );
    // Old (buggy) behaviour: doFacesCollide("front", "rear") is false, so this
    // would wrongly report "valid".
    expect(result.feedback).toBe("blocked");
  });

  it("resolves the drop action to invalid for the same scenario, matching the preview", () => {
    const action = resolveDropAction(
      coords,
      dims,
      rackWithRearNeighbourAtU3(),
      [fullDepth, halfDepthRearNeighbour],
      { type: "palette", device: fullDepth },
      "front",
    );
    // Old (buggy) behaviour: this would wrongly resolve to a "palette-drop",
    // which the store then refuses (a refused drop after a green preview).
    expect(action.kind).toBe("invalid");
  });
});
