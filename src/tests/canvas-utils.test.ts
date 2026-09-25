/**
 * Canvas Utility Tests
 *
 * Tests for fit-all calculations and rack positioning.
 * These are coordinate math functions that benefit from unit testing.
 */

import { describe, it, expect } from "vitest";
import {
  calculateRacksBoundingBox,
  computeCanvasLayout,
  racksToPositions,
  racksToPositionsWithIds,
  calculateFitAll,
  ensureVisibleTransform,
  type Bounds,
  type CanvasSlot,
} from "$lib/utils/canvas";
import type { RackGroup } from "$lib/types";
import { createTestRack } from "./factories";
import { RACK_ROW_PADDING } from "$lib/constants/layout";

describe("Canvas Utils", () => {
  describe("calculateRacksBoundingBox", () => {
    it("returns zero bounds for empty array", () => {
      const bounds = calculateRacksBoundingBox([]);
      expect(bounds).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    });

    it("calculates bounding box for single rack position", () => {
      const positions = [{ x: 10, y: 20, width: 100, height: 200 }];
      const bounds = calculateRacksBoundingBox(positions);

      expect(bounds).toEqual({ x: 10, y: 20, width: 100, height: 200 });
    });

    it("calculates bounding box for multiple rack positions", () => {
      const positions = [
        { x: 0, y: 0, width: 100, height: 200 },
        { x: 120, y: 50, width: 100, height: 150 },
      ];
      const bounds = calculateRacksBoundingBox(positions);

      expect(bounds).toEqual({ x: 0, y: 0, width: 220, height: 200 });
    });
  });

  describe("computeCanvasLayout (#3370)", () => {
    const bay = (id: string, rackIds: string[], name?: string): RackGroup => ({
      id,
      name,
      rack_ids: rackIds,
      layout_preset: "bayed",
    });
    const rowGroup = (id: string, rackIds: string[]): RackGroup => ({
      id,
      name: id,
      rack_ids: rackIds,
      layout_preset: "row",
    });
    const slotIds = (slot: CanvasSlot) => slot.racks.map((r) => r.id);
    const contains = (outer: Bounds, inner: Bounds) =>
      inner.x >= outer.x &&
      inner.y >= outer.y &&
      inner.x + inner.width <= outer.x + outer.width &&
      inner.y + inner.height <= outer.y + outer.height;

    it("returns no rows and zero bounds for no racks", () => {
      expect(computeCanvasLayout([], [])).toEqual({
        rows: [],
        bounds: { x: 0, y: 0, width: 0, height: 0 },
      });
    });

    it("stacks each group in its own row below the standalone row", () => {
      const racks = [
        createTestRack({ id: "a", position: 0 }),
        createTestRack({ id: "m1", position: 1 }),
        createTestRack({ id: "m2", position: 2 }),
        createTestRack({ id: "b", position: 3 }),
        createTestRack({ id: "r1", position: 4 }),
      ];
      const { rows } = computeCanvasLayout(racks, [
        bay("bay", ["m1", "m2"]),
        rowGroup("row", ["r1"]),
      ]);

      expect(rows.map((row) => row.slots.map(slotIds))).toEqual([
        [["a"], ["b"]],
        [["m1", "m2"]],
        [["r1"]],
      ]);
      // Rows never overlap: each starts below the previous one's bottom.
      for (let i = 1; i < rows.length; i++) {
        const above = rows[i - 1]!;
        expect(rows[i]!.y).toBeGreaterThan(above.y + above.height);
      }
    });

    it("bottom-aligns the slots of a row without overlapping them", () => {
      const racks = [
        createTestRack({ id: "tall", position: 0, height: 42 }),
        createTestRack({ id: "short", position: 1, height: 12 }),
      ];
      const [row] = computeCanvasLayout(racks, []).rows;
      const [tall, short] = row!.slots;

      expect(tall!.y + tall!.height).toBe(short!.y + short!.height);
      expect(short!.x).toBeGreaterThan(tall!.x + tall!.width);
      expect(short!.height).toBeLessThan(tall!.height);
    });

    it("sizes a single-view rack narrower than a dual-view rack", () => {
      const racks = [
        createTestRack({ id: "front", position: 0, show_rear: false }),
        createTestRack({ id: "dual", position: 1, show_rear: true }),
      ];
      const [front, dual] = computeCanvasLayout(racks, []).rows[0]!.slots;

      expect(front!.width).toBeLessThan(dual!.width);
    });

    it("includes row-group chrome around the member racks", () => {
      const racks = [
        createTestRack({ id: "g1", position: 0, height: 42 }),
        createTestRack({ id: "g2", position: 1, height: 24 }),
      ];
      const [slot] = computeCanvasLayout(racks, [rowGroup("row", ["g1", "g2"])])
        .rows[0]!.slots;
      const [g1, g2] = slot!.racks;

      // Members sit strictly inside the group box (border, padding, label).
      for (const member of [g1!, g2!]) {
        expect(contains(slot!, member)).toBe(true);
        expect(member.y).toBeGreaterThan(slot!.y);
      }
      // Members are left to right in position order and share a baseline.
      expect(g2!.x).toBeGreaterThan(g1!.x + g1!.width);
      expect(g1!.y + g1!.height).toBe(g2!.y + g2!.height);
    });

    it("gives bayed members the group's shared box", () => {
      const racks = [
        createTestRack({ id: "m1", position: 0 }),
        createTestRack({ id: "m2", position: 1 }),
      ];
      const [slot] = computeCanvasLayout(racks, [bay("bay", ["m1", "m2"])])
        .rows[0]!.slots;

      for (const member of slot!.racks) {
        expect(member).toMatchObject({
          x: slot!.x,
          y: slot!.y,
          width: slot!.width,
          height: slot!.height,
        });
      }
    });

    it("makes a named bayed group taller than an unnamed one", () => {
      const racks = [createTestRack({ id: "m1", position: 0 })];
      const unnamed = computeCanvasLayout(racks, [bay("g", ["m1"])]);
      const named = computeCanvasLayout(racks, [bay("g", ["m1"], "Bay A")]);

      expect(named.bounds.height).toBeGreaterThan(unnamed.bounds.height);
    });

    it("bounds every slot, including group chrome", () => {
      const racks = [
        createTestRack({ id: "a", position: 0 }),
        createTestRack({ id: "m1", position: 1 }),
        createTestRack({ id: "r1", position: 2 }),
      ];
      const layout = computeCanvasLayout(racks, [
        bay("bay", ["m1"]),
        rowGroup("row", ["r1"]),
      ]);

      for (const slot of layout.rows.flatMap((row) => row.slots)) {
        expect(contains(layout.bounds, slot)).toBe(true);
      }
      expect(
        calculateRacksBoundingBox(
          racksToPositions(racks, [
            bay("bay", ["m1"]),
            rowGroup("row", ["r1"]),
          ]),
        ),
      ).toEqual(layout.bounds);
    });
  });

  describe("racksToPositionsWithIds", () => {
    it("maps a bayed group to one box and row-group members to their own", () => {
      const racks = [
        createTestRack({ id: "m1", position: 0 }),
        createTestRack({ id: "m2", position: 1 }),
        createTestRack({ id: "r1", position: 2 }),
        createTestRack({ id: "r2", position: 3 }),
      ];
      const groups: RackGroup[] = [
        { id: "bay", rack_ids: ["m1", "m2"], layout_preset: "bayed" },
        { id: "row", rack_ids: ["r1", "r2"], layout_preset: "row" },
      ];

      const targets = racksToPositionsWithIds(racks, groups);

      expect(targets.map((t) => t.rackIds)).toEqual([
        ["m1", "m2"],
        ["r1"],
        ["r2"],
      ]);
    });
  });

  describe("calculateFitAll", () => {
    it("returns defaults for empty rack array", () => {
      const result = calculateFitAll([], 800, 600);
      expect(result).toEqual({ zoom: 1, panX: 0, panY: 0 });
    });

    it("calculates zoom and pan to fit racks in viewport", () => {
      const positions = [{ x: 0, y: 0, width: 500, height: 1000 }];
      const result = calculateFitAll(positions, 800, 600);

      // Zoom should be less than 1 since content is larger than viewport
      expect(result.zoom).toBeLessThan(1);
      expect(result.zoom).toBeGreaterThan(0);
    });

    it("frames stacked group rows inside the viewport", () => {
      const racks = [
        createTestRack({ id: "a", position: 0, height: 12 }),
        createTestRack({ id: "m1", position: 1, height: 12 }),
        createTestRack({ id: "r1", position: 2, height: 12 }),
      ];
      const groups: RackGroup[] = [
        { id: "bay", rack_ids: ["m1"], layout_preset: "bayed" },
        { id: "row", name: "Row", rack_ids: ["r1"], layout_preset: "row" },
      ];
      const viewport = { width: 1600, height: 1000 };

      const { zoom, panX, panY } = calculateFitAll(
        racksToPositions(racks, groups),
        viewport.width,
        viewport.height,
      );

      // Every slot, chrome included, lands on screen.
      for (const slot of computeCanvasLayout(racks, groups).rows.flatMap(
        (row) => row.slots,
      )) {
        expect(slot.x * zoom + panX).toBeGreaterThanOrEqual(0);
        expect(slot.y * zoom + panY).toBeGreaterThanOrEqual(0);
        expect((slot.x + slot.width) * zoom + panX).toBeLessThanOrEqual(
          viewport.width,
        );
        expect((slot.y + slot.height) * zoom + panY).toBeLessThanOrEqual(
          viewport.height,
        );
      }
    });
  });

  describe("48U rack fit-all", () => {
    it("48U rack fit-all should not cut off the bottom", () => {
      const rack = createTestRack({ height: 48, width: 19 });

      // Simulate a viewport that's smaller than the rack
      const viewportWidth = 800;
      const viewportHeight = 600;

      const positions = racksToPositions([rack]);
      const { zoom } = calculateFitAll(
        positions,
        viewportWidth,
        viewportHeight,
      );

      // After fitting, the scaled content should fit within the viewport
      const bounds = calculateRacksBoundingBox(positions);
      const scaledWidth =
        (bounds.width + RACK_ROW_PADDING * 2) * zoom + 2 * RACK_ROW_PADDING;
      const scaledHeight =
        (bounds.height + RACK_ROW_PADDING * 2) * zoom + 2 * RACK_ROW_PADDING;

      // Content should fit within viewport (with some margin for rounding)
      expect(scaledWidth).toBeLessThanOrEqual(viewportWidth + 1);
      expect(scaledHeight).toBeLessThanOrEqual(viewportHeight + 1);
    });
  });

  describe("ensureVisibleTransform", () => {
    const viewport = { width: 800, height: 600 };
    const identity = { scale: 1, panX: 0, panY: 0 };

    it("returns the current transform when the target is fully contained", () => {
      const target = { x: 100, y: 100, width: 200, height: 200 };
      const result = ensureVisibleTransform(target, viewport, identity);
      expect(result).toEqual(identity);
    });

    it("returns the current transform for a shrinking, contained extent", () => {
      // A smaller extent inside the viewport must never move the camera.
      const target = { x: 300, y: 250, width: 80, height: 80 };
      const result = ensureVisibleTransform(target, viewport, identity);
      expect(result).toEqual(identity);
    });

    it("respects a non-identity current transform when already contained", () => {
      // At pan -100 the target's left edge sits exactly at the viewport origin.
      const target = { x: 100, y: 100, width: 200, height: 200 };
      const current = { scale: 1, panX: -100, panY: 0 };
      const result = ensureVisibleTransform(target, viewport, current);
      expect(result).toEqual(current);
    });

    it("pans left by the minimum needed when the target overflows the right edge", () => {
      const target = { x: 700, y: 100, width: 200, height: 200 };
      const result = ensureVisibleTransform(target, viewport, identity);
      // Right edge is 900 at pan 0; pan -100 lands it exactly on the edge.
      expect(result).toEqual({ scale: 1, panX: -100, panY: 0 });
    });

    it("pans up by the minimum needed when the target overflows the bottom edge", () => {
      const target = { x: 100, y: 500, width: 200, height: 200 };
      const result = ensureVisibleTransform(target, viewport, identity);
      // Bottom edge is 700 at pan 0; pan -100 lands it exactly on the edge.
      expect(result).toEqual({ scale: 1, panX: 0, panY: -100 });
    });

    it("pans right and down to reveal a target off the top-left", () => {
      const target = { x: -100, y: -50, width: 200, height: 200 };
      const result = ensureVisibleTransform(target, viewport, identity);
      expect(result).toEqual({ scale: 1, panX: 100, panY: 50 });
    });

    it("zooms out just enough to fit a target taller than the viewport", () => {
      const target = { x: 0, y: 0, width: 200, height: 1200 };
      const result = ensureVisibleTransform(target, viewport, identity);
      // fit scale = min(800/200, 600/1200) = 0.5; height fills the viewport.
      expect(result).toEqual({ scale: 0.5, panX: 0, panY: 0 });
    });

    it("clamps to min zoom and aligns top-left when the target cannot fully fit", () => {
      const target = { x: 0, y: 0, width: 5000, height: 5000 };
      const result = ensureVisibleTransform(target, viewport, identity);
      // fit scale 0.12 < min zoom 0.25, so clamp to 0.25 and align near edges.
      expect(result).toEqual({ scale: 0.25, panX: 0, panY: 0 });
    });

    it("leaves the camera still for a degenerate target", () => {
      const target = { x: 0, y: 0, width: 0, height: 0 };
      const result = ensureVisibleTransform(target, viewport, identity);
      expect(result).toEqual(identity);
    });
  });
});
