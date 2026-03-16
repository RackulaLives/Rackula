/**
 * Rack Actions Undo/Redo Tests
 *
 * Tests for:
 * - #1474: Deep clone in duplicateRack (structuredClone)
 * - #1476: Undo/redo support for duplicateRack and addBayedRackGroup
 */

import { describe, it, expect, beforeEach } from "vitest";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import { createTestDeviceType } from "./factories";

describe("Rack Actions Undo/Redo", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetHistoryStore();
  });

  describe("duplicateRack deep clone (#1474)", () => {
    it("mutating ports on original does not affect duplicate", () => {
      const store = getLayoutStore();

      // Create a rack with a device that has ports
      const rack = store.addRack("Original Rack", 42);
      expect(rack).not.toBeNull();

      const deviceType = createTestDeviceType({
        slug: "server-with-ports",
        u_height: 2,
        category: "server",
      });
      store.addDeviceTypeRaw(deviceType);
      store.placeDevice(rack!.id, "server-with-ports", 5);

      // Manually add ports to the placed device for testing deep clone
      const originalRack = store.layout.racks.find((r) => r.id === rack!.id)!;
      const originalDevice = originalRack.devices[0];
      expect(originalDevice).toBeDefined();

      // Add nested data (ports array) to the original device before duplication
      originalDevice.ports = [
        { id: "port-1", name: "eth0", type: "1000base-t" },
      ];

      // Duplicate the rack
      const result = store.duplicateRack(rack!.id);
      expect(result.rack).toBeDefined();
      expect(result.error).toBeUndefined();

      // Get the duplicated rack's device
      const dupRack = store.layout.racks.find(
        (r) => r.id === result.rack!.id,
      )!;
      const dupDevice = dupRack.devices[0];
      expect(dupDevice).toBeDefined();
      expect(dupDevice.ports).toBeDefined();

      // Mutate the original device's ports
      originalDevice.ports![0].name = "MUTATED";

      // The duplicate should NOT be affected by the mutation
      expect(dupDevice.ports![0].name).toBe("eth0");
    });
  });

  describe("duplicateRack undo/redo (#1476)", () => {
    it("duplicate can be undone and redone", () => {
      const store = getLayoutStore();

      const rack = store.addRack("My Rack", 42);
      expect(rack).not.toBeNull();

      const initialRackCount = store.layout.racks.length;

      // Duplicate the rack
      const result = store.duplicateRack(rack!.id);
      expect(result.rack).toBeDefined();
      expect(store.layout.racks).toHaveLength(initialRackCount + 1);

      // Undo should remove the duplicate
      const undone = store.undo();
      expect(undone).toBe(true);
      expect(store.layout.racks).toHaveLength(initialRackCount);
      expect(
        store.layout.racks.find((r) => r.id === result.rack!.id),
      ).toBeUndefined();

      // Redo should restore the duplicate
      const redone = store.redo();
      expect(redone).toBe(true);
      expect(store.layout.racks).toHaveLength(initialRackCount + 1);
      expect(
        store.layout.racks.find((r) => r.id === result.rack!.id),
      ).toBeDefined();
    });
  });

  describe("addBayedRackGroup undo/redo (#1476)", () => {
    it("bayed group creation can be undone and redone", () => {
      const store = getLayoutStore();

      const initialRackCount = store.layout.racks.length;

      // Create a bayed rack group with 2 bays
      const result = store.addBayedRackGroup("Test Group", 2, 42);
      expect(result).not.toBeNull();
      // eslint-disable-next-line no-restricted-syntax -- creation invariant: 2-bay group produces exactly 2 racks
      expect(result!.racks).toHaveLength(2);
      expect(result!.group).toBeDefined();

      const groupId = result!.group.id;
      const rackIds = result!.racks.map((r) => r.id);

      // Verify racks and group were created
      expect(store.layout.racks).toHaveLength(initialRackCount + 2);
      expect(store.layout.rack_groups).toBeDefined();
      expect(
        store.layout.rack_groups!.find((g) => g.id === groupId),
      ).toBeDefined();

      // Undo should remove the group and all racks
      // The batch command should undo in reverse: group first, then racks
      const undone = store.undo();
      expect(undone).toBe(true);
      expect(store.layout.racks).toHaveLength(initialRackCount);
      for (const rackId of rackIds) {
        expect(
          store.layout.racks.find((r) => r.id === rackId),
        ).toBeUndefined();
      }
      // Group should be gone
      const groups = store.layout.rack_groups ?? [];
      expect(groups.find((g) => g.id === groupId)).toBeUndefined();

      // Redo should restore everything
      const redone = store.redo();
      expect(redone).toBe(true);
      expect(store.layout.racks).toHaveLength(initialRackCount + 2);
      for (const rackId of rackIds) {
        expect(
          store.layout.racks.find((r) => r.id === rackId),
        ).toBeDefined();
      }
      expect(
        store.layout.rack_groups!.find((g) => g.id === groupId),
      ).toBeDefined();
    });
  });
});
