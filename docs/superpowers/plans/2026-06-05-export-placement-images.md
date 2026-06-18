# Export Placement Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render device placement images (custom front/rear photos) in image-based exports, matching the editor.

**Architecture:** The export SVG generator (`export.ts` `renderRackView()`) currently looks up device images only by device-type slug. Add a placement-first, per-face lookup that mirrors `RackDevice.svelte`, so a `placement-{id}` image wins for the exported face and falls back to the device-type image when that face is absent. Single render path, so SVG/PNG/JPEG/PDF are all fixed at once.

**Tech Stack:** TypeScript, Vitest, the existing `generateExportSVG` SVG-construction code and `src/tests/factories.ts`.

**Spec:** `docs/superpowers/specs/2026-06-05-export-placement-images-design.md`

---

### Task 1: Render placement images in exports with per-face fallback

**Files:**

- Modify: `src/lib/utils/export.ts` (inside `renderRackView()`, the image lookup near line 886-891)
- Test: `src/tests/export-placement-images.test.ts` (create)

- [ ] **Step 1: Write the failing tests**

Create `src/tests/export-placement-images.test.ts` with this exact content:

```typescript
/**
 * Export placement images (#1902)
 *
 * Placement images (custom front/rear photos keyed by `placement-{id}`) render
 * in the editor (RackDevice.svelte) but were dropped from exports because the
 * export renderer only looked images up by device-type slug. These tests pin the
 * placement-first, per-face lookup that mirrors the editor.
 */

import { describe, it, expect } from "vitest";
import { generateExportSVG } from "$lib/utils/export";
import type { ExportOptions } from "$lib/types";
import type { ImageStoreMap } from "$lib/types/images";
import {
  createTestRack,
  createTestDeviceType,
  createTestDevice,
} from "./factories";

const baseOptions: ExportOptions = {
  format: "png",
  scope: "all",
  includeNames: true,
  includeLegend: false,
  background: "solid",
  displayMode: "image",
};

function imageHrefs(svg: SVGElement): string[] {
  return Array.from(svg.getElementsByTagName("image"))
    .map((el) => el.getAttribute("href") ?? "")
    .filter((href) => href.startsWith("data:"));
}

describe("export placement images (#1902)", () => {
  it("renders a placement image in the export, not just the device-type image", () => {
    const deviceType = createTestDeviceType({
      slug: "test-device",
      u_height: 2,
      is_full_depth: true,
    });
    const placed = createTestDevice({
      id: "dev-1",
      device_type: "test-device",
      position: 10,
      face: "both",
    });
    const rack = createTestRack({ devices: [placed] });

    const images: ImageStoreMap = new Map();
    images.set("placement-dev-1", {
      front: {
        dataUrl: "data:image/png;base64,PLACEMENTFRONT",
        filename: "placement-front.png",
      },
    });
    images.set("test-device", {
      front: {
        dataUrl: "data:image/png;base64,SLUGFRONT",
        filename: "slug-front.png",
      },
      rear: {
        dataUrl: "data:image/png;base64,SLUGREAR",
        filename: "slug-rear.png",
      },
    });

    const svg = generateExportSVG([rack], [deviceType], {
      ...baseOptions,
      exportView: "front",
    });

    expect(imageHrefs(svg)).toContain("data:image/png;base64,PLACEMENTFRONT");
  });

  it("falls back per face: front-only placement still shows the device-type rear image in a rear export", () => {
    const deviceType = createTestDeviceType({
      slug: "test-device",
      u_height: 2,
      is_full_depth: true,
    });
    const placed = createTestDevice({
      id: "dev-1",
      device_type: "test-device",
      position: 10,
      face: "both",
    });
    const rack = createTestRack({ devices: [placed] });

    const images: ImageStoreMap = new Map();
    images.set("placement-dev-1", {
      front: {
        dataUrl: "data:image/png;base64,PLACEMENTFRONT",
        filename: "placement-front.png",
      },
    });
    images.set("test-device", {
      rear: {
        dataUrl: "data:image/png;base64,SLUGREAR",
        filename: "slug-rear.png",
      },
    });

    const svg = generateExportSVG([rack], [deviceType], {
      ...baseOptions,
      exportView: "rear",
    });

    const hrefs = imageHrefs(svg);
    expect(hrefs).toContain("data:image/png;base64,SLUGREAR");
    expect(hrefs).not.toContain("data:image/png;base64,PLACEMENTFRONT");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/tests/export-placement-images.test.ts` Expected: FAIL. The first test fails because the export uses `images.get(device.slug)` and returns `SLUGFRONT` (or nothing), never `PLACEMENTFRONT`.

- [ ] **Step 3: Apply the fix**

In `src/lib/utils/export.ts`, inside `renderRackView()`, find this block (around line 886-891):

```typescript
// Check if we should show an image
const face = faceFilter === "rear" ? "rear" : "front";
const deviceImages = images?.get(device.slug);
const deviceImage = deviceImages?.[face];
// Support both URL-based (bundled) and dataUrl-based (user upload) images
const imageUrl = deviceImage?.url ?? deviceImage?.dataUrl;
```

Replace it with:

```typescript
// Check if we should show an image
const face = faceFilter === "rear" ? "rear" : "front";
// Placement-first, per-face lookup mirrors RackDevice.svelte: a placement
// image wins for this face, otherwise fall back to the device-type image.
// Per-face (not per-device) so a front-only placement still inherits the
// device-type rear image.
const placementImages = images?.get(`placement-${placedDevice.id}`);
const slugImages = images?.get(device.slug);
const deviceImage = placementImages?.[face] ?? slugImages?.[face];
// Support both URL-based (bundled) and dataUrl-based (user upload) images
const imageUrl = deviceImage?.url ?? deviceImage?.dataUrl;
```

Note: `placedDevice` is the `renderRackView()` loop variable and `device` is its resolved `DeviceType`; both are already in scope at this point. No signature changes.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/tests/export-placement-images.test.ts` Expected: PASS (2 tests).

- [ ] **Step 5: Run lint and the full unit suite to confirm no regressions**

Run: `npm run lint && npm run test:run` Expected: lint clean; all tests pass (including the existing export tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/utils/export.ts src/tests/export-placement-images.test.ts
git commit -m "fix: render device placement images in exports (#1902)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**

- "Mirror the editor's per-face fallback at the single export render point" -> Task 1 Step 3.
- "Per-face, not per-device" with the front-only edge case -> Task 1 Step 1 second test + Step 3 comment.
- "Fixes SVG/PNG/JPEG/PDF together" -> single change in the shared `renderRackView()`; no per-format work needed.
- "No toggle, no data-model change, no new deps" -> only `export.ts` lookup and a new test file are touched.
- Tests: placement `dataUrl` present in serialized export; per-face fallback -> both tests in Step 1, asserting on `<image>` hrefs via `getElementsByTagName` (no `querySelector`, no `toHaveClass`).

**Placeholder scan:** None. All steps contain runnable code and exact commands.

**Type consistency:** `ImageStoreMap`, `DeviceImageData` (`front`/`rear`), `ImageData` (`dataUrl`/`url`/`filename`), `ExportOptions`, and the factory signatures (`createTestRack`, `createTestDeviceType`, `createTestDevice`) match their definitions. `placedDevice.id` and `device.slug` match the loop variables in `renderRackView()`.
