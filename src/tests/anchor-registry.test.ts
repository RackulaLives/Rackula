import { describe, it, expect, afterEach } from "vitest";
import {
  anchorKeysForSelection,
  deviceAnchorKey,
  lookupAnchor,
  rackAnchorKey,
  registerAnchor,
  resolveAnchor,
  type AnchorSelection,
} from "$lib/utils/anchor-registry";

const none: AnchorSelection = {
  deviceId: null,
  deviceFace: null,
  rackId: null,
  isDeviceSelected: false,
  isRackOrGroupSelected: false,
};

const cleanups: Array<() => void> = [];
function mount(key: string): HTMLElement {
  const el = document.createElement("div");
  document.body.append(el);
  cleanups.push(registerAnchor(key, el), () => el.remove());
  return el;
}

describe("anchor registry", () => {
  afterEach(() => {
    while (cleanups.length) cleanups.pop()!();
  });

  describe("anchorKeysForSelection", () => {
    it("prefers the clicked face of a device, then falls back to the other", () => {
      const keys = anchorKeysForSelection({
        ...none,
        isDeviceSelected: true,
        deviceId: "d1",
        deviceFace: "rear",
      });
      expect(keys).toEqual([
        deviceAnchorKey("d1", "rear"),
        deviceAnchorKey("d1", "front"),
      ]);
    });

    it("tries front then rear when the device face is unknown", () => {
      const keys = anchorKeysForSelection({
        ...none,
        isDeviceSelected: true,
        deviceId: "d1",
      });
      expect(keys).toEqual([
        deviceAnchorKey("d1", "front"),
        deviceAnchorKey("d1", "rear"),
      ]);
    });

    it("anchors a rack or bayed-group selection to the rack", () => {
      const keys = anchorKeysForSelection({
        ...none,
        isRackOrGroupSelected: true,
        rackId: "r1",
      });
      expect(keys).toEqual([rackAnchorKey("r1")]);
    });

    it("has no anchor without a selection", () => {
      expect(anchorKeysForSelection(none)).toEqual([]);
    });
  });

  describe("resolveAnchor", () => {
    it("returns the rear copy of a full-depth device clicked in the rear view", () => {
      mount(deviceAnchorKey("d1", "front"));
      const rear = mount(deviceAnchorKey("d1", "rear"));
      const keys = anchorKeysForSelection({
        ...none,
        isDeviceSelected: true,
        deviceId: "d1",
        deviceFace: "rear",
      });
      expect(resolveAnchor(keys)).toBe(rear);
    });

    it("falls back to the rear copy when a half-depth device renders only there", () => {
      const rear = mount(deviceAnchorKey("d1", "rear"));
      const keys = anchorKeysForSelection({
        ...none,
        isDeviceSelected: true,
        deviceId: "d1",
        deviceFace: "front",
      });
      expect(resolveAnchor(keys)).toBe(rear);
    });

    it("returns null when nothing is registered", () => {
      expect(resolveAnchor([rackAnchorKey("missing")])).toBeNull();
    });
  });

  describe("lookupAnchor", () => {
    it("picks the first element in document order when a key is shared", () => {
      // A bayed group renders each member in a front row and a rear row.
      mount(rackAnchorKey("r1"));
      const first = document.createElement("div");
      document.body.prepend(first);
      cleanups.push(registerAnchor(rackAnchorKey("r1"), first), () =>
        first.remove(),
      );
      expect(lookupAnchor(rackAnchorKey("r1"))).toBe(first);
    });

    it("ignores an element after it unregisters", () => {
      const el = document.createElement("div");
      document.body.append(el);
      const unregister = registerAnchor(rackAnchorKey("r2"), el);
      unregister();
      expect(lookupAnchor(rackAnchorKey("r2"))).toBeNull();
      el.remove();
    });

    it("ignores a registered element that is no longer in the document", () => {
      const el = mount(rackAnchorKey("r3"));
      el.remove();
      expect(lookupAnchor(rackAnchorKey("r3"))).toBeNull();
    });
  });
});
