import { describe, it, expect } from "vitest";
import { organizeRackRow } from "$lib/utils/rack-row";
import { createTestRack } from "./factories";
import type { RackGroup } from "$lib/types";

describe("organizeRackRow", () => {
  it("orders standalone racks left to right by position", () => {
    const a = createTestRack({ id: "a", position: 2 });
    const b = createTestRack({ id: "b", position: 0 });
    const c = createTestRack({ id: "c", position: 1 });

    const row = organizeRackRow([a, b, c], []);

    const ids = row.map((item) =>
      item.kind === "rack" ? item.rack.id : item.group.id,
    );
    expect(ids).toEqual(["b", "c", "a"]);
  });

  it("keeps a group's members contiguous and in position order", () => {
    const solo = createTestRack({ id: "solo", position: 1 });
    const m1 = createTestRack({ id: "m1", position: 3 });
    const m2 = createTestRack({ id: "m2", position: 2 });
    const group: RackGroup = {
      id: "g1",
      rack_ids: ["m1", "m2"],
      layout_preset: "bayed",
    };

    const row = organizeRackRow([solo, m1, m2], [group]);

    // The group occupies its earliest member's slot (position 2), so it lands
    // after the standalone rack at position 1.
    expect(row[0]).toMatchObject({ kind: "rack", rack: { id: "solo" } });
    expect(row[1]?.kind).toBe("group");
    if (row[1]?.kind === "group") {
      expect(row[1].racks.map((rack) => rack.id)).toEqual(["m2", "m1"]);
    }
  });

  it("never renders a grouped rack as a standalone item", () => {
    const m1 = createTestRack({ id: "m1", position: 0 });
    const m2 = createTestRack({ id: "m2", position: 1 });
    const group: RackGroup = {
      id: "g1",
      rack_ids: ["m1", "m2"],
      layout_preset: "bayed",
    };

    const row = organizeRackRow([m1, m2], [group]);

    const standaloneIds = row.flatMap((item) =>
      item.kind === "rack" ? [item.rack.id] : [],
    );
    expect(standaloneIds).not.toContain("m1");
    expect(standaloneIds).not.toContain("m2");
  });

  it("drops groups whose member racks no longer exist", () => {
    const a = createTestRack({ id: "a", position: 0 });
    const ghost: RackGroup = {
      id: "g-ghost",
      rack_ids: ["missing"],
      layout_preset: "row",
    };

    const row = organizeRackRow([a], [ghost]);

    expect(row).toEqual([{ kind: "rack", rack: a }]);
  });

  it("includes a rack id repeated within one group only once", () => {
    const m = createTestRack({ id: "m", position: 0 });
    const group: RackGroup = {
      id: "g1",
      rack_ids: ["m", "m"],
      layout_preset: "bayed",
    };

    const row = organizeRackRow([m], [group]);

    const groups = row.flatMap((item) => (item.kind === "group" ? [item] : []));
    expect(groups[0]?.racks.map((rack) => rack.id)).toEqual(["m"]);
  });

  it("claims a rack listed in two groups for the first group only", () => {
    const shared = createTestRack({ id: "shared", position: 0 });
    const other = createTestRack({ id: "other", position: 1 });
    const g1: RackGroup = {
      id: "g1",
      rack_ids: ["shared"],
      layout_preset: "bayed",
    };
    const g2: RackGroup = {
      id: "g2",
      rack_ids: ["shared", "other"],
      layout_preset: "bayed",
    };

    const row = organizeRackRow([shared, other], [g1, g2]);

    const groups = row.flatMap((item) => (item.kind === "group" ? [item] : []));
    const g1Item = groups.find((item) => item.group.id === "g1");
    const g2Item = groups.find((item) => item.group.id === "g2");
    expect(g1Item?.racks.map((rack) => rack.id)).toEqual(["shared"]);
    expect(g2Item?.racks.map((rack) => rack.id)).toEqual(["other"]);
  });
});
