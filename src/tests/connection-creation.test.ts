/**
 * Connection Creation Handler Tests (#1932)
 * Behavioral tests for the desktop click-to-click connection creation state
 * machine: enter, target, cancel (same-port click, which now surfaces the
 * store's own self-connection error), the already-connected error path, and
 * the category/type/direction warning path. Uses the real connection store
 * and layout store (like connection-store.test.ts) so validation is
 * exercised for real, not mocked, plus a real connection-creation store
 * reset between tests and a spy for the toast side effect.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  handleConnectionPortClick,
  getDirectionMismatchWarning,
  type ConnectionCreationHandlerContext,
} from "$lib/utils/connection-creation";
import {
  getConnectionCreationStore,
  resetConnectionCreationStore,
} from "$lib/stores/connection-creation.svelte";
import { getConnectionStore } from "$lib/stores/connection.svelte";
import { getLayoutStore } from "$lib/stores/layout.svelte";
import type { InterfaceType, PlacedPort } from "$lib/types";
import {
  createTestLayoutStore,
  createTestDeviceType,
  createTestInterfaceTemplate,
} from "./factories";

/**
 * Place a device with the given interface templates in a rack and return its
 * PlacedPort instances (real, store-generated ids), mirroring
 * connection-store.test.ts's helper.
 */
function placeDeviceWithPorts(
  store: ReturnType<typeof getLayoutStore>,
  rackId: string,
  slug: string,
  position: number,
  interfaces: Array<{ type: InterfaceType; direction?: "input" | "output" }>,
): PlacedPort[] {
  const deviceType = createTestDeviceType({ slug });
  deviceType.interfaces = interfaces.map((i, index) =>
    createTestInterfaceTemplate({
      name: `port-${index}`,
      type: i.type,
      direction: i.direction,
    }),
  );
  store.addDeviceTypeRaw(deviceType);
  store.placeDevice(rackId, slug, position);
  const device = store.racks
    .flatMap((r) => r.devices)
    .find((d) => d.device_type === slug)!;
  return device.ports ?? [];
}

describe("handleConnectionPortClick", () => {
  let layoutStore: ReturnType<typeof getLayoutStore>;
  let rackId: string;
  let showToast: ReturnType<typeof vi.fn>;

  function buildContext(): ConnectionCreationHandlerContext {
    const connectionStore = getConnectionStore();
    return {
      connectionCreation: getConnectionCreationStore(),
      validateConnection: connectionStore.validateConnection,
      addConnection: connectionStore.addConnection,
      showToast,
    };
  }

  beforeEach(() => {
    layoutStore = createTestLayoutStore();
    const rack = layoutStore.addRack("Test Rack", 42)!;
    rackId = rack.id;
    resetConnectionCreationStore();
    showToast = vi.fn();
  });

  describe("entering the mode", () => {
    it("arms the mode with the clicked port as source", () => {
      const [portA] = placeDeviceWithPorts(layoutStore, rackId, "device-a", 5, [
        { type: "1000base-t" },
      ]);
      const ctx = buildContext();

      handleConnectionPortClick(
        { portId: portA!.id, iface: createTestInterfaceTemplate() },
        ctx,
      );

      expect(getConnectionCreationStore().isCreating).toBe(true);
      expect(getConnectionCreationStore().sourcePortId).toBe(portA!.id);
      expect(showToast).not.toHaveBeenCalled();
    });

    it("is a defensive no-op for a port with no id (grouped/high-density device)", () => {
      const ctx = buildContext();

      handleConnectionPortClick(
        { portId: undefined, iface: createTestInterfaceTemplate() },
        ctx,
      );

      expect(getConnectionCreationStore().isCreating).toBe(false);
      expect(showToast).not.toHaveBeenCalled();
    });
  });

  describe("targeting a valid port", () => {
    it("creates the connection and exits the mode", () => {
      const [portA] = placeDeviceWithPorts(layoutStore, rackId, "device-a", 5, [
        { type: "1000base-t" },
      ]);
      const [portB] = placeDeviceWithPorts(
        layoutStore,
        rackId,
        "device-b",
        10,
        [{ type: "1000base-t" }],
      );
      const ctx = buildContext();
      const ifaceA = createTestInterfaceTemplate({ type: "1000base-t" });
      const ifaceB = createTestInterfaceTemplate({ type: "1000base-t" });

      handleConnectionPortClick({ portId: portA!.id, iface: ifaceA }, ctx);
      handleConnectionPortClick({ portId: portB!.id, iface: ifaceB }, ctx);

      expect(getConnectionCreationStore().isCreating).toBe(false);
      expect(getConnectionStore().connections).toContainEqual(
        expect.objectContaining({
          a_port_id: portA!.id,
          b_port_id: portB!.id,
        }),
      );
      expect(showToast).not.toHaveBeenCalled();
    });
  });

  describe("clicking the same port twice", () => {
    it("surfaces the store's self-connection error and exits the mode", () => {
      const [portA] = placeDeviceWithPorts(layoutStore, rackId, "device-a", 5, [
        { type: "1000base-t" },
      ]);
      const ctx = buildContext();
      const iface = createTestInterfaceTemplate({ type: "1000base-t" });

      handleConnectionPortClick({ portId: portA!.id, iface }, ctx);
      handleConnectionPortClick({ portId: portA!.id, iface }, ctx);

      expect(getConnectionCreationStore().isCreating).toBe(false);
      expect(showToast).toHaveBeenCalledWith(
        expect.stringContaining("itself"),
        "error",
      );
      expect(getConnectionStore().connections).toEqual([]);
    });
  });

  describe("targeting an already-connected port", () => {
    it("shows an error toast, creates no connection, and exits the mode", () => {
      const [portA] = placeDeviceWithPorts(layoutStore, rackId, "device-a", 5, [
        { type: "1000base-t" },
      ]);
      const [portB] = placeDeviceWithPorts(
        layoutStore,
        rackId,
        "device-b",
        10,
        [{ type: "1000base-t" }],
      );
      const [portC] = placeDeviceWithPorts(
        layoutStore,
        rackId,
        "device-c",
        15,
        [{ type: "1000base-t" }],
      );
      getConnectionStore().addConnection({
        a_port_id: portA!.id,
        b_port_id: portB!.id,
      });
      const ctx = buildContext();
      const iface = createTestInterfaceTemplate({ type: "1000base-t" });

      // Arm from device-c, then target device-a's port, which is already
      // connected to device-b.
      handleConnectionPortClick({ portId: portC!.id, iface }, ctx);
      handleConnectionPortClick({ portId: portA!.id, iface }, ctx);

      expect(getConnectionCreationStore().isCreating).toBe(false);
      expect(showToast).toHaveBeenCalledWith(
        expect.stringContaining("already has a connection"),
        "error",
      );
      // Only the original connection exists; the failed attempt added nothing.
      expect(getConnectionStore().connections).toContainEqual(
        expect.objectContaining({ a_port_id: portA!.id, b_port_id: portB!.id }),
      );
      expect(
        getConnectionStore().connections.some(
          (c) => c.a_port_id === portC!.id || c.b_port_id === portC!.id,
        ),
      ).toBe(false);
    });
  });

  describe("warning path: category/type and direction mismatches", () => {
    it("creates the connection and shows a warning toast on a type mismatch (XLR to HDMI)", () => {
      const [portA] = placeDeviceWithPorts(layoutStore, rackId, "device-a", 5, [
        { type: "xlr-3" },
      ]);
      const [portB] = placeDeviceWithPorts(
        layoutStore,
        rackId,
        "device-b",
        10,
        [{ type: "hdmi" }],
      );
      const ctx = buildContext();
      const ifaceA = createTestInterfaceTemplate({ type: "xlr-3" });
      const ifaceB = createTestInterfaceTemplate({ type: "hdmi" });

      handleConnectionPortClick({ portId: portA!.id, iface: ifaceA }, ctx);
      handleConnectionPortClick({ portId: portB!.id, iface: ifaceB }, ctx);

      expect(getConnectionCreationStore().isCreating).toBe(false);
      expect(getConnectionStore().connections).toContainEqual(
        expect.objectContaining({
          a_port_id: portA!.id,
          b_port_id: portB!.id,
        }),
      );
      expect(showToast).toHaveBeenCalledWith(
        expect.stringContaining("types do not match"),
        "warning",
      );
    });

    it("creates the connection and shows a warning toast on a direction mismatch (output to output)", () => {
      const [portA] = placeDeviceWithPorts(layoutStore, rackId, "device-a", 5, [
        { type: "1000base-t", direction: "output" },
      ]);
      const [portB] = placeDeviceWithPorts(
        layoutStore,
        rackId,
        "device-b",
        10,
        [{ type: "1000base-t", direction: "output" }],
      );
      const ctx = buildContext();
      const ifaceA = createTestInterfaceTemplate({
        type: "1000base-t",
        direction: "output",
      });
      const ifaceB = createTestInterfaceTemplate({
        type: "1000base-t",
        direction: "output",
      });

      handleConnectionPortClick({ portId: portA!.id, iface: ifaceA }, ctx);
      handleConnectionPortClick({ portId: portB!.id, iface: ifaceB }, ctx);

      expect(getConnectionCreationStore().isCreating).toBe(false);
      expect(getConnectionStore().connections).toContainEqual(
        expect.objectContaining({
          a_port_id: portA!.id,
          b_port_id: portB!.id,
        }),
      );
      expect(showToast).toHaveBeenCalledWith(
        expect.stringContaining("outputs"),
        "warning",
      );
    });
  });

  describe("cancellation resets state for the next attempt", () => {
    it("allows starting a fresh connection after a validation error cancelled the mode", () => {
      const [portA] = placeDeviceWithPorts(layoutStore, rackId, "device-a", 5, [
        { type: "1000base-t" },
      ]);
      const [portB] = placeDeviceWithPorts(
        layoutStore,
        rackId,
        "device-b",
        10,
        [{ type: "1000base-t" }],
      );
      const ctx = buildContext();
      const iface = createTestInterfaceTemplate({ type: "1000base-t" });

      // Self-click cancels with an error.
      handleConnectionPortClick({ portId: portA!.id, iface }, ctx);
      handleConnectionPortClick({ portId: portA!.id, iface }, ctx);
      expect(getConnectionCreationStore().isCreating).toBe(false);

      // A fresh click starts a new attempt rather than staying stuck.
      handleConnectionPortClick({ portId: portA!.id, iface }, ctx);
      expect(getConnectionCreationStore().isCreating).toBe(true);
      expect(getConnectionCreationStore().sourcePortId).toBe(portA!.id);

      handleConnectionPortClick({ portId: portB!.id, iface }, ctx);
      expect(getConnectionCreationStore().isCreating).toBe(false);
      expect(getConnectionStore().connections).toContainEqual(
        expect.objectContaining({
          a_port_id: portA!.id,
          b_port_id: portB!.id,
        }),
      );
    });
  });
});

describe("getDirectionMismatchWarning", () => {
  it("warns when both ports are output", () => {
    const a = createTestInterfaceTemplate({ direction: "output" });
    const b = createTestInterfaceTemplate({ direction: "output" });
    expect(getDirectionMismatchWarning(a, b)).toContain("outputs");
  });

  it("warns when both ports are input", () => {
    const a = createTestInterfaceTemplate({ direction: "input" });
    const b = createTestInterfaceTemplate({ direction: "input" });
    expect(getDirectionMismatchWarning(a, b)).toContain("inputs");
  });

  it("does not warn when directions are complementary", () => {
    const a = createTestInterfaceTemplate({ direction: "output" });
    const b = createTestInterfaceTemplate({ direction: "input" });
    expect(getDirectionMismatchWarning(a, b)).toBeNull();
  });

  it("does not warn when either side is bidirectional", () => {
    const a = createTestInterfaceTemplate({ direction: "output" });
    const b = createTestInterfaceTemplate({ direction: "bidirectional" });
    expect(getDirectionMismatchWarning(a, b)).toBeNull();
  });

  it("does not warn for an undirected AV type with no explicit direction", () => {
    // xlr-3 has no inferDirection default (spike #1927): direction must be
    // set explicitly, so two undirected XLR ports compare as "nothing to
    // mismatch" rather than a false-positive warning.
    const a = createTestInterfaceTemplate({ type: "xlr-3" });
    const b = createTestInterfaceTemplate({ type: "xlr-3" });
    expect(getDirectionMismatchWarning(a, b)).toBeNull();
  });
});
