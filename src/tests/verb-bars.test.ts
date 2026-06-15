import { describe, it, expect } from "vitest";
import {
  DEVICE_VERB_IDS,
  RACK_VERB_IDS,
  getVerbsForSelection,
} from "$lib/actions/verb-bars";
import { getActionById } from "$lib/actions/registry";
import type { ActionEnabledContext } from "$lib/actions/registry";

/**
 * Tests for the verb-bar projection module. These cover the filtering and
 * ordering logic in getVerbsForSelection, not the registry data itself
 * (which TypeScript validates).
 */

/** A fully-capable context with device selected. */
const deviceCtx: ActionEnabledContext = {
  hasSelection: true,
  isDeviceSelected: true,
  isRackSelected: false,
  canUndo: true,
  canRedo: false,
  hasRacks: true,
  mode: "browser",
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
};

describe("verb-bars projection", () => {
  describe("DEVICE_VERB_IDS ordering", () => {
    it("contains the expected ids in the declared order", () => {
      expect(DEVICE_VERB_IDS).toEqual([
        "move-device-up",
        "move-device-down",
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
    it("returns device verbs in order when a device is selected", () => {
      const result = getVerbsForSelection(deviceCtx);
      expect(result.map((a) => a.id)).toEqual(DEVICE_VERB_IDS);
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
    it("returns device verbs when both device and rack are flagged selected", () => {
      const bothCtx: ActionEnabledContext = {
        ...deviceCtx,
        isRackSelected: true,
      };
      expect(getVerbsForSelection(bothCtx).map((a) => a.id)).toEqual(
        DEVICE_VERB_IDS,
      );
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
});
