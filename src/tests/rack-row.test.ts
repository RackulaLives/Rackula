import { describe, it, expect } from "vitest";
import {
  organizeRackRow,
  reorderRackRow,
  planBayedInsert,
  planRowAfterRemoval,
} from "$lib/utils/rack-row";
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

describe("reorderRackRow", () => {
  it("swaps a standalone rack right past its neighbour", () => {
    const a = createTestRack({ id: "a", position: 0 });
    const b = createTestRack({ id: "b", position: 1 });
    const c = createTestRack({ id: "c", position: 2 });

    const assignments = reorderRackRow([a, b, c], [], "a", "right");

    expect(assignments).toEqual([
      { id: "b", position: 0 },
      { id: "a", position: 1 },
      { id: "c", position: 2 },
    ]);
  });

  it("swaps a standalone rack left past its neighbour", () => {
    const a = createTestRack({ id: "a", position: 0 });
    const b = createTestRack({ id: "b", position: 1 });

    const assignments = reorderRackRow([a, b], [], "b", "left");

    expect(assignments).toEqual([
      { id: "b", position: 0 },
      { id: "a", position: 1 },
    ]);
  });

  it("is a no-op moving the leftmost slot left", () => {
    const a = createTestRack({ id: "a", position: 0 });
    const b = createTestRack({ id: "b", position: 1 });
    expect(reorderRackRow([a, b], [], "a", "left")).toBeNull();
  });

  it("is a no-op moving the rightmost slot right", () => {
    const a = createTestRack({ id: "a", position: 0 });
    const b = createTestRack({ id: "b", position: 1 });
    expect(reorderRackRow([a, b], [], "b", "right")).toBeNull();
  });

  it("is a no-op with a single slot", () => {
    const a = createTestRack({ id: "a", position: 0 });
    expect(reorderRackRow([a], [], "a", "right")).toBeNull();
    expect(reorderRackRow([a], [], "a", "left")).toBeNull();
  });

  it("returns null when the rack is not in the row", () => {
    const a = createTestRack({ id: "a", position: 0 });
    const b = createTestRack({ id: "b", position: 1 });
    expect(reorderRackRow([a, b], [], "missing", "right")).toBeNull();
  });

  it("moves a whole bay group as one unit when a member is selected", () => {
    const solo = createTestRack({ id: "solo", position: 0 });
    const m1 = createTestRack({ id: "m1", position: 1 });
    const m2 = createTestRack({ id: "m2", position: 2 });
    const group: RackGroup = {
      id: "g1",
      rack_ids: ["m1", "m2"],
      layout_preset: "bayed",
    };

    // Row order is [solo, group]; selecting a member and moving left puts the
    // whole group first, with its members still contiguous and in order.
    const assignments = reorderRackRow([solo, m1, m2], [group], "m2", "left");

    expect(assignments).toEqual([
      { id: "m1", position: 0 },
      { id: "m2", position: 1 },
      { id: "solo", position: 2 },
    ]);
  });

  it("keeps a bay group's members contiguous after a reorder", () => {
    const solo = createTestRack({ id: "solo", position: 0 });
    const m1 = createTestRack({ id: "m1", position: 1 });
    const m2 = createTestRack({ id: "m2", position: 2 });
    const group: RackGroup = {
      id: "g1",
      rack_ids: ["m1", "m2"],
      layout_preset: "bayed",
    };

    const assignments = reorderRackRow([solo, m1, m2], [group], "m1", "left")!;
    const byId = new Map(assignments.map((a) => [a.id, a.position]));
    // Members stay adjacent (positions differ by one) and the standalone rack
    // is pushed to the far slot.
    expect(Math.abs(byId.get("m1")! - byId.get("m2")!)).toBe(1);
    expect(byId.get("solo")).toBe(2);
  });
});

describe("planBayedInsert", () => {
  it("places the new rack immediately right of a standalone source", () => {
    const a = createTestRack({ id: "a", position: 0 });
    const b = createTestRack({ id: "b", position: 1 });
    const c = createTestRack({ id: "c", position: 2 });

    const assignments = planBayedInsert([a, b, c], [], "a", "new");

    expect(assignments).toEqual([
      { id: "a", position: 0 },
      { id: "new", position: 1 },
      { id: "b", position: 2 },
      { id: "c", position: 3 },
    ]);
  });

  it("pushes the racks to the right of a mid-row insert along", () => {
    const a = createTestRack({ id: "a", position: 0 });
    const b = createTestRack({ id: "b", position: 1 });
    const c = createTestRack({ id: "c", position: 2 });

    const assignments = planBayedInsert([a, b, c], [], "b", "new")!;
    const byId = new Map(assignments.map((x) => [x.id, x.position]));

    // The new rack lands right after b; c is shifted one slot right and nothing
    // shares a position.
    expect(byId.get("b")).toBe(1);
    expect(byId.get("new")).toBe(2);
    expect(byId.get("c")).toBe(3);
    expect(new Set(assignments.map((x) => x.position)).size).toBe(
      assignments.length,
    );
  });

  it("keeps the new member inside the source's bay block", () => {
    const m1 = createTestRack({ id: "m1", position: 0 });
    const m2 = createTestRack({ id: "m2", position: 1 });
    const solo = createTestRack({ id: "solo", position: 2 });
    const group: RackGroup = {
      id: "g1",
      rack_ids: ["m1", "m2"],
      layout_preset: "bayed",
    };

    const assignments = planBayedInsert([m1, m2, solo], [group], "m1", "new")!;
    const byId = new Map(assignments.map((x) => [x.id, x.position]));

    // new sits between the two existing members, so the bay block m1/new/m2
    // stays contiguous and solo follows.
    expect(byId.get("m1")).toBe(0);
    expect(byId.get("new")).toBe(1);
    expect(byId.get("m2")).toBe(2);
    expect(byId.get("solo")).toBe(3);
  });

  it("returns null when the source rack is not in the row", () => {
    const a = createTestRack({ id: "a", position: 0 });
    expect(planBayedInsert([a], [], "missing", "new")).toBeNull();
  });
});

describe("planRowAfterRemoval", () => {
  it("drops the removed rack and reindexes the remaining row contiguously", () => {
    const a = createTestRack({ id: "a", position: 0 });
    const b = createTestRack({ id: "b", position: 1 });
    const c = createTestRack({ id: "c", position: 2 });

    const assignments = planRowAfterRemoval([a, b, c], [], "b");

    expect(assignments).toEqual([
      { id: "a", position: 0 },
      { id: "c", position: 1 },
    ]);
  });

  it("reindexes a bay member removal so the survivors stay contiguous", () => {
    const m1 = createTestRack({ id: "m1", position: 0 });
    const m2 = createTestRack({ id: "m2", position: 1 });
    const m3 = createTestRack({ id: "m3", position: 2 });
    const solo = createTestRack({ id: "solo", position: 3 });
    const group: RackGroup = {
      id: "g1",
      rack_ids: ["m1", "m2", "m3"],
      layout_preset: "bayed",
    };

    const assignments = planRowAfterRemoval([m1, m2, m3, solo], [group], "m1")!;

    expect(assignments).toEqual([
      { id: "m2", position: 0 },
      { id: "m3", position: 1 },
      { id: "solo", position: 2 },
    ]);
  });

  it("treats a group's lone survivor as a standalone slot", () => {
    const m1 = createTestRack({ id: "m1", position: 0 });
    const m2 = createTestRack({ id: "m2", position: 1 });
    const solo = createTestRack({ id: "solo", position: 2 });
    const group: RackGroup = {
      id: "g1",
      rack_ids: ["m1", "m2"],
      layout_preset: "bayed",
    };

    // Removing m1 leaves the group with a single member; the survivor m2
    // reindexes ahead of solo exactly as if it were standalone.
    const assignments = planRowAfterRemoval([m1, m2, solo], [group], "m1")!;

    expect(assignments).toEqual([
      { id: "m2", position: 0 },
      { id: "solo", position: 1 },
    ]);
  });

  it("returns null when the removed rack is not in the row", () => {
    const a = createTestRack({ id: "a", position: 0 });
    expect(planRowAfterRemoval([a], [], "missing")).toBeNull();
  });
});
