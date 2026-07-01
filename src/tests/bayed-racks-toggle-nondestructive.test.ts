/**
 * Bayed racks toggle: non-destructive gating (#2742)
 *
 * The "Enable bayed racks" setting hides the creation/extension affordances
 * only. Turning it off must never modify or dissolve existing bay groups. This
 * test proves the flag is a pure UI gate: flipping it off leaves rack_groups
 * byte-for-byte unchanged while the gating getter reads false.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { getUIStore, resetUIStore } from "$lib/stores/ui.svelte";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";

describe("Enable bayed racks toggle (non-destructive)", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetUIStore();
  });

  it("gates the affordances without touching existing bay groups", () => {
    const layout = getLayoutStore();
    const ui = getUIStore();

    // Establish an existing bayed group.
    const result = layout.addBayedRackGroup("Bay", 3, 42, 19)!;
    const groupId = result.group.id;

    // Snapshot the groups before the flag flips. Serialise to a plain copy so
    // the comparison is against a value, not the live reactive proxy.
    const before = JSON.parse(JSON.stringify(layout.rack_groups));
    expect(ui.enableBayedRacks).toBe(true);

    // Turn the setting off: the gating getter must read false...
    ui.setEnableBayedRacks(false);
    expect(ui.enableBayedRacks).toBe(false);

    // ...but the existing bay group is untouched (non-destructive).
    expect(layout.rack_groups).toEqual(before);
    const group = layout.getRackGroupById(groupId)!;
    expect(group.layout_preset).toBe("bayed");
    expect(group.rack_ids).toEqual(result.group.rack_ids);

    // Turning it back on restores the flag and still leaves the group intact.
    ui.setEnableBayedRacks(true);
    expect(ui.enableBayedRacks).toBe(true);
    expect(layout.rack_groups).toEqual(before);
  });
});
