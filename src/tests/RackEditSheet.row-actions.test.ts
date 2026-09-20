/**
 * Issue #2833: the verb bar is desktop-only, so on mobile the rack edit sheet
 * is where a rack or bay group gets its reorder and bay verbs. They follow the
 * desktop gating: reorder needs two or more row slots, baying is offered for
 * an empty standalone rack or a bayed group, and both are withheld when the
 * layout is read-only.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/svelte";
// RackEditSheet's Saved indicator renders a Tooltip (#3005), which needs the
// Tooltip.Provider context App.svelte supplies in the real app.
import RackEditSheet from "./helpers/TestRackEditSheet.svelte";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import { resetSelectionStore } from "$lib/stores/selection.svelte";
import { resetToastStore } from "$lib/stores/toast.svelte";
import { resetCanvasStore } from "$lib/stores/canvas.svelte";
import { getUIStore, resetUIStore } from "$lib/stores/ui.svelte";
import { organizeRackRow } from "$lib/utils/rack-row";
import { createTestDeviceType } from "./factories";

/** Row order as slot ids (a rack's id, or a group's id). */
function rowOrder(): string[] {
  const layout = getLayoutStore();
  return organizeRackRow(layout.racks, layout.rack_groups).map((item) =>
    item.kind === "rack" ? item.rack.id : item.group.id,
  );
}

function addRack(name: string) {
  const rack = getLayoutStore().addRack(name, 42);
  if (!rack) throw new Error("addRack returned null");
  return rack;
}

function button(name: string) {
  return screen.getByRole("button", { name });
}

function queryButton(name: string) {
  return screen.queryByRole("button", { name });
}

describe("RackEditSheet row actions (#2833)", () => {
  beforeEach(() => {
    resetHistoryStore();
    resetLayoutStore();
    resetSelectionStore();
    resetToastStore();
    resetCanvasStore();
    resetUIStore();
    getUIStore().setEnableBayedRacks(true);
  });
  afterEach(cleanup);

  it("moves the rack right in the row", async () => {
    const a = addRack("A");
    const b = addRack("B");
    render(RackEditSheet, { props: { rack: a } });

    await fireEvent.click(button("Move rack right"));

    expect(rowOrder()).toEqual([b.id, a.id]);
  });

  it("disables the move at the row edge", () => {
    const a = addRack("A");
    addRack("B");
    render(RackEditSheet, { props: { rack: a } });

    expect(button("Move rack left")).toBeDisabled();
    expect(button("Move rack right")).toBeEnabled();
  });

  it("offers no reorder for a single-rack row", () => {
    const solo = addRack("Solo");
    render(RackEditSheet, { props: { rack: solo } });

    expect(queryButton("Move rack left")).toBeNull();
    expect(queryButton("Move rack right")).toBeNull();
  });

  it("bays an empty standalone rack", async () => {
    const layout = getLayoutStore();
    const a = addRack("A");
    render(RackEditSheet, { props: { rack: a } });

    await fireEvent.click(button("Bay rack"));

    const group = layout.getRackGroupForRack(a.id);
    expect(group?.layout_preset).toBe("bayed");
    expect(group?.rack_ids).toEqual([a.id, expect.any(String)]);
  });

  it("extends a bayed group from the rack being edited", async () => {
    const layout = getLayoutStore();
    const a = addRack("A");
    const { groupId } = layout.createBayedRack(a.id);
    const second = layout.getRackGroupById(groupId!)!.rack_ids[1]!;
    render(RackEditSheet, {
      props: { rack: layout.getRackById(second)! },
    });

    await fireEvent.click(button("Bay rack"));

    expect(layout.getRackGroupById(groupId!)?.rack_ids).toEqual([
      a.id,
      second,
      expect.any(String),
    ]);
  });

  it("offers no bay for a populated standalone rack", () => {
    const layout = getLayoutStore();
    const a = addRack("A");
    const dt = createTestDeviceType({ slug: "test-switch", u_height: 1 });
    layout.addDeviceTypeRaw(dt);
    if (!layout.placeDevice(a.id, dt.slug, 10, "front")) {
      throw new Error("placeDevice failed");
    }
    render(RackEditSheet, { props: { rack: layout.getRackById(a.id)! } });

    expect(queryButton("Bay rack")).toBeNull();
  });

  it("offers no bay when bayed racks are turned off", () => {
    getUIStore().setEnableBayedRacks(false);
    const a = addRack("A");
    render(RackEditSheet, { props: { rack: a } });

    expect(queryButton("Bay rack")).toBeNull();
  });

  it("withholds reorder and bay in read-only mode", () => {
    getUIStore().setReadOnly(true);
    const a = addRack("A");
    addRack("B");
    render(RackEditSheet, { props: { rack: a } });

    expect(queryButton("Move rack left")).toBeNull();
    expect(queryButton("Move rack right")).toBeNull();
    expect(queryButton("Bay rack")).toBeNull();
  });
});
