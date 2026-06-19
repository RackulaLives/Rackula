import { describe, it, expect } from "vitest";
import {
  DEVICE_VERB_IDS,
  RACK_VERB_IDS,
  getVerbsForSelection,
  getSelectionVerbsWithState,
} from "$lib/actions/verb-bars";
import { getActionById } from "$lib/actions/registry";
import type { ActionEnabledContext } from "$lib/actions/registry";

/**
 * Tests for the verb-bar projection module. These cover the filtering and
 * ordering logic in getVerbsForSelection, not the registry data itself
 * (which TypeScript validates).
 */

/** A fully-capable context with device selected (not a carrier child). */
const deviceCtx: ActionEnabledContext = {
  hasSelection: true,
  isDeviceSelected: true,
  isRackSelected: false,
  canUndo: true,
  canRedo: false,
  hasRacks: true,
  mode: "browser",
  canMoveDeviceSlot: false,
};

/** A fully-capable context with rack selected. */
const rackCtx: ActionEnabledContext = {
  hasSelection: true,
  isDeviceSelected: false,
  isRackSelected: true,
  canUndo: true,
  canRedo: false,
  hasRacks: true,
  mode: "browser",
  canMoveDeviceSlot: false,
};

/** No selection. */
const emptyCtx: ActionEnabledContext = {
  hasSelection: false,
  isDeviceSelected: false,
  isRackSelected: false,
  canUndo: false,
  canRedo: false,
  hasRacks: true,
  mode: "browser",
  canMoveDeviceSlot: false,
};

describe("verb-bars projection", () => {
  describe("DEVICE_VERB_IDS ordering", () => {
    it("contains the expected ids in the declared order", () => {
      expect(DEVICE_VERB_IDS).toEqual([
        "move-device-up",
        "move-device-down",
        "move-device-slot",
        "flip-device-face",
        "duplicate-selection",
        "delete-selection",
      ]);
    });
  });

  describe("RACK_VERB_IDS ordering", () => {
    it("contains the expected ids in the declared order", () => {
      expect(RACK_VERB_IDS).toEqual([
        "duplicate-selection",
        "focus-rack",
        "export-rack",
        "delete-selection",
      ]);
    });
  });

  describe("getVerbsForSelection - device context", () => {
    it("returns device verbs in declared order, gating the slot verb out for a non-child device", () => {
      // canMoveDeviceSlot is false for a normal device, so move-device-slot is
      // filtered; the rest keep their declared order.
      const result = getVerbsForSelection(deviceCtx);
      expect(result.map((a) => a.id)).toEqual([
        "move-device-up",
        "move-device-down",
        "flip-device-face",
        "duplicate-selection",
        "delete-selection",
      ]);
    });

    it("includes the slot verb only when the selected device can change cells", () => {
      const childCtx = { ...deviceCtx, canMoveDeviceSlot: true };
      const ids = getVerbsForSelection(childCtx).map((a) => a.id);
      expect(ids).toContain("move-device-slot");
      // It sits between the up/down nudges and the face flip.
      expect(ids.indexOf("move-device-slot")).toBeGreaterThan(
        ids.indexOf("move-device-down"),
      );
      expect(ids.indexOf("move-device-slot")).toBeLessThan(
        ids.indexOf("flip-device-face"),
      );
    });

    it("hides the slot verb when the device cannot change cells", () => {
      const ids = getVerbsForSelection(deviceCtx).map((a) => a.id);
      expect(ids).not.toContain("move-device-slot");
    });

    it("excludes rack-only verbs (focus-rack, export-rack) from device results", () => {
      const ids = getVerbsForSelection(deviceCtx).map((a) => a.id);
      expect(ids).not.toContain("focus-rack");
      expect(ids).not.toContain("export-rack");
    });

    it("includes delete-selection for a device selection", () => {
      const ids = getVerbsForSelection(deviceCtx).map((a) => a.id);
      expect(ids).toContain("delete-selection");
    });
  });

  describe("getVerbsForSelection - rack context", () => {
    it("returns rack verbs in order when a rack is selected", () => {
      const result = getVerbsForSelection(rackCtx);
      expect(result.map((a) => a.id)).toEqual(RACK_VERB_IDS);
    });

    it("excludes device-only verbs (move-device-up, move-device-down, flip-device-face) from rack results", () => {
      const ids = getVerbsForSelection(rackCtx).map((a) => a.id);
      expect(ids).not.toContain("move-device-up");
      expect(ids).not.toContain("move-device-down");
      expect(ids).not.toContain("flip-device-face");
    });

    it("includes delete-selection for a rack selection", () => {
      const ids = getVerbsForSelection(rackCtx).map((a) => a.id);
      expect(ids).toContain("delete-selection");
    });
  });

  describe("getVerbsForSelection - device takes precedence", () => {
    it("returns the device list (not the rack list) when both are flagged selected", () => {
      const bothCtx: ActionEnabledContext = {
        ...deviceCtx,
        isRackSelected: true,
      };
      const ids = getVerbsForSelection(bothCtx).map((a) => a.id);
      // Device verbs win over rack verbs; the slot verb stays gated off here.
      expect(ids).toEqual([
        "move-device-up",
        "move-device-down",
        "flip-device-face",
        "duplicate-selection",
        "delete-selection",
      ]);
      expect(ids).not.toContain("focus-rack");
    });
  });

  describe("getVerbsForSelection - no selection", () => {
    it("returns an empty array when nothing is selected", () => {
      expect(getVerbsForSelection(emptyCtx)).toEqual([]);
    });
  });

  describe("getVerbsForSelection - enabledWhen filtering", () => {
    it("excludes device verbs whose enabledWhen returns false in rack context", () => {
      // In rack context isDeviceSelected=false, so move-device-up and
      // flip-device-face would be filtered out - rack list is used, not device.
      // This is covered by the rack order test above.
      // Additional check: device list used only when isDeviceSelected is true.
      const partialCtx: ActionEnabledContext = {
        ...rackCtx,
        isDeviceSelected: false,
      };
      const ids = getVerbsForSelection(partialCtx).map((a) => a.id);
      expect(ids).not.toContain("move-device-up");
    });
  });

  describe("registry additions", () => {
    it("flip-device-face is registered with the correct label and scope", () => {
      const action = getActionById("flip-device-face");
      expect(action?.label).toBe("Flip face");
      expect(action?.scope).toBe("selection");
    });

    it("focus-rack is registered with the correct label and scope", () => {
      const action = getActionById("focus-rack");
      expect(action?.label).toBe("Focus");
      expect(action?.scope).toBe("selection");
    });

    it("export-rack is registered with the correct label and scope", () => {
      const action = getActionById("export-rack");
      expect(action?.label).toBe("Export");
      expect(action?.scope).toBe("selection");
    });

    it("flip-device-face enabledWhen passes for device selection", () => {
      const action = getActionById("flip-device-face");
      expect(action?.enabledWhen?.(deviceCtx)).toBe(true);
    });

    it("flip-device-face enabledWhen fails for rack selection", () => {
      const action = getActionById("flip-device-face");
      expect(action?.enabledWhen?.(rackCtx)).toBe(false);
    });

    it("focus-rack enabledWhen passes for rack selection", () => {
      const action = getActionById("focus-rack");
      expect(action?.enabledWhen?.(rackCtx)).toBe(true);
    });

    it("export-rack enabledWhen passes for rack selection", () => {
      const action = getActionById("export-rack");
      expect(action?.enabledWhen?.(rackCtx)).toBe(true);
    });
  });

  describe("getSelectionVerbsWithState - mobile projection", () => {
    it("includes all device verbs (even disabled ones) for a device selection", () => {
      const result = getSelectionVerbsWithState(deviceCtx);
      // move-device-slot is disabled (canMoveDeviceSlot=false) but still present,
      // unlike getVerbsForSelection which filters it out.
      expect(result.map((v) => v.id)).toEqual(DEVICE_VERB_IDS);
    });

    it("marks move-device-slot as disabled when canMoveDeviceSlot is false", () => {
      const result = getSelectionVerbsWithState(deviceCtx);
      const slotVerb = result.find((v) => v.id === "move-device-slot");
      expect(slotVerb?.disabled).toBe(true);
    });

    it("marks move-device-slot as enabled when canMoveDeviceSlot is true", () => {
      const childCtx = { ...deviceCtx, canMoveDeviceSlot: true };
      const result = getSelectionVerbsWithState(childCtx);
      const slotVerb = result.find((v) => v.id === "move-device-slot");
      expect(slotVerb?.disabled).toBe(false);
    });

    it("marks all device verbs enabled for a fully-capable device context", () => {
      const childCtx = { ...deviceCtx, canMoveDeviceSlot: true };
      const result = getSelectionVerbsWithState(childCtx);
      for (const verb of result) {
        expect(verb.disabled).toBe(false);
      }
    });

    it("returns rack verbs with state when a rack is selected", () => {
      const result = getSelectionVerbsWithState(rackCtx);
      expect(result.map((v) => v.id)).toEqual(RACK_VERB_IDS);
    });

    it("returns an empty array when nothing is selected", () => {
      expect(getSelectionVerbsWithState(emptyCtx)).toEqual([]);
    });

    it("device verbs take precedence when both device and rack are selected", () => {
      const bothCtx: ActionEnabledContext = {
        ...deviceCtx,
        isRackSelected: true,
      };
      const ids = getSelectionVerbsWithState(bothCtx).map((v) => v.id);
      expect(ids).toEqual(DEVICE_VERB_IDS);
    });

    it("labels come from the registry, not hardcoded", () => {
      const result = getSelectionVerbsWithState(deviceCtx);
      const upVerb = result.find((v) => v.id === "move-device-up");
      const registryAction = getActionById("move-device-up");
      expect(upVerb?.label).toBe(registryAction?.label);
    });
  });

  describe("read-only lock: enabledWhen respects ctx.readOnly", () => {
    const readOnlyCtx: ActionEnabledContext = {
      ...deviceCtx,
      canMoveDeviceSlot: true,
      readOnly: true,
    };

    it("disables all device mutation verbs when readOnly is true", () => {
      const result = getSelectionVerbsWithState(readOnlyCtx);
      for (const verb of result) {
        expect(verb.disabled).toBe(true);
      }
    });

    it("move-device-up is disabled when readOnly", () => {
      const result = getSelectionVerbsWithState(readOnlyCtx);
      const verb = result.find((v) => v.id === "move-device-up");
      expect(verb?.disabled).toBe(true);
    });

    it("move-device-down is disabled when readOnly", () => {
      const result = getSelectionVerbsWithState(readOnlyCtx);
      const verb = result.find((v) => v.id === "move-device-down");
      expect(verb?.disabled).toBe(true);
    });

    it("move-device-slot is disabled when readOnly (even if canMoveDeviceSlot is true)", () => {
      const result = getSelectionVerbsWithState(readOnlyCtx);
      const verb = result.find((v) => v.id === "move-device-slot");
      expect(verb?.disabled).toBe(true);
    });

    it("flip-device-face is disabled when readOnly", () => {
      const result = getSelectionVerbsWithState(readOnlyCtx);
      const verb = result.find((v) => v.id === "flip-device-face");
      expect(verb?.disabled).toBe(true);
    });

    it("duplicate-selection is disabled when readOnly", () => {
      const result = getSelectionVerbsWithState(readOnlyCtx);
      const verb = result.find((v) => v.id === "duplicate-selection");
      expect(verb?.disabled).toBe(true);
    });

    it("delete-selection is disabled when readOnly", () => {
      const result = getSelectionVerbsWithState(readOnlyCtx);
      const verb = result.find((v) => v.id === "delete-selection");
      expect(verb?.disabled).toBe(true);
    });

    it("all device mutation verbs are enabled when readOnly is false", () => {
      const readWriteCtx: ActionEnabledContext = {
        ...deviceCtx,
        canMoveDeviceSlot: true,
        readOnly: false,
      };
      const result = getSelectionVerbsWithState(readWriteCtx);
      for (const verb of result) {
        expect(verb.disabled).toBe(false);
      }
    });

    it("all device mutation verbs are enabled when readOnly is omitted", () => {
      // Backward-compatibility: omitting readOnly is identical to false.
      const ctxWithSlot: ActionEnabledContext = {
        ...deviceCtx,
        canMoveDeviceSlot: true,
      };
      const result = getSelectionVerbsWithState(ctxWithSlot);
      for (const verb of result) {
        expect(verb.disabled).toBe(false);
      }
    });
  });
});
