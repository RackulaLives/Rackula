/**
 * Connection Store Tests (#369)
 *
 * Covers CRUD, validation rules, undo/redo integration, and dirty-state
 * tracking for the port-to-port connection store. Ports come from placing
 * real devices (DeviceType.interfaces -> PlacedPort via instantiatePorts),
 * mirroring how the app generates port ids in practice.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  getConnectionStore,
  validateConnection,
} from "$lib/stores/connection.svelte";
import { getLayoutStore } from "$lib/stores/layout.svelte";
import type { InterfaceType, PlacedPort } from "$lib/types";
import {
  createTestLayoutStore,
  createTestDeviceType,
  createTestInterfaceTemplate,
} from "./factories";

/**
 * Place a device with the given interface types in a rack and return its id
 * plus the resulting PlacedPort instances (real, store-generated ids).
 */
function placeDeviceWithPorts(
  store: ReturnType<typeof getLayoutStore>,
  rackId: string,
  slug: string,
  position: number,
  interfaceTypes: InterfaceType[],
): { deviceId: string; ports: PlacedPort[] } {
  const deviceType = createTestDeviceType({ slug });
  deviceType.interfaces = interfaceTypes.map((type, i) =>
    createTestInterfaceTemplate({ name: `port-${i}`, type }),
  );
  store.addDeviceTypeRaw(deviceType);
  store.placeDevice(rackId, slug, position);
  const device = store.racks
    .flatMap((r) => r.devices)
    .find((d) => d.device_type === slug)!;
  return { deviceId: device.id, ports: device.ports ?? [] };
}

describe("connection store", () => {
  let layoutStore: ReturnType<typeof getLayoutStore>;
  let rackId: string;

  beforeEach(() => {
    layoutStore = createTestLayoutStore();
    const rack = layoutStore.addRack("Test Rack", 42)!;
    rackId = rack.id;
  });

  describe("addConnection", () => {
    it("creates a valid connection between two ports", () => {
      const a = placeDeviceWithPorts(layoutStore, rackId, "device-a", 5, [
        "1000base-t",
      ]);
      const b = placeDeviceWithPorts(layoutStore, rackId, "device-b", 10, [
        "1000base-t",
      ]);
      const store = getConnectionStore();

      const result = store.addConnection({
        a_port_id: a.ports[0]!.id,
        b_port_id: b.ports[0]!.id,
      });

      expect("connection" in result).toBe(true);
      const connection = (result as { connection: { id: string } }).connection;
      expect(connection.id).toBeTruthy();
      expect(store.connections).toContainEqual(
        expect.objectContaining({
          a_port_id: a.ports[0]!.id,
          b_port_id: b.ports[0]!.id,
        }),
      );
    });
  });

  describe("validation: single connection per port", () => {
    it("errors when double-connecting an already-connected port", () => {
      const a = placeDeviceWithPorts(layoutStore, rackId, "device-a", 5, [
        "1000base-t",
      ]);
      const b = placeDeviceWithPorts(layoutStore, rackId, "device-b", 10, [
        "1000base-t",
      ]);
      const c = placeDeviceWithPorts(layoutStore, rackId, "device-c", 15, [
        "1000base-t",
      ]);
      const store = getConnectionStore();

      const first = store.addConnection({
        a_port_id: a.ports[0]!.id,
        b_port_id: b.ports[0]!.id,
      });
      expect("connection" in first).toBe(true);

      const second = store.addConnection({
        a_port_id: a.ports[0]!.id,
        b_port_id: c.ports[0]!.id,
      });

      expect("errors" in second).toBe(true);
      expect((second as { errors: string[] }).errors.length).toBeGreaterThan(0);
      // Only the first connection was created.
      expect(store.getConnectionsForPort(a.ports[0]!.id)).toContainEqual(
        expect.objectContaining({ b_port_id: b.ports[0]!.id }),
      );
      expect(store.getConnectionsForPort(a.ports[0]!.id)).not.toContainEqual(
        expect.objectContaining({ b_port_id: c.ports[0]!.id }),
      );
    });
  });

  describe("validation: self-connection", () => {
    it("errors when connecting a port to itself", () => {
      const a = placeDeviceWithPorts(layoutStore, rackId, "device-a", 5, [
        "1000base-t",
      ]);
      const store = getConnectionStore();

      const result = store.addConnection({
        a_port_id: a.ports[0]!.id,
        b_port_id: a.ports[0]!.id,
      });

      expect("errors" in result).toBe(true);
      expect(
        (result as { errors: string[] }).errors.some((e) =>
          e.includes("itself"),
        ),
      ).toBe(true);
    });
  });

  describe("validation: duplicate connection", () => {
    it("errors when creating a duplicate connection between the same ports", () => {
      const a = placeDeviceWithPorts(layoutStore, rackId, "device-a", 5, [
        "1000base-t",
      ]);
      const b = placeDeviceWithPorts(layoutStore, rackId, "device-b", 10, [
        "1000base-t",
      ]);
      const store = getConnectionStore();

      const first = store.addConnection({
        a_port_id: a.ports[0]!.id,
        b_port_id: b.ports[0]!.id,
      });
      expect("connection" in first).toBe(true);

      const duplicate = store.addConnection({
        a_port_id: a.ports[0]!.id,
        b_port_id: b.ports[0]!.id,
      });

      expect("errors" in duplicate).toBe(true);
      expect(
        (duplicate as { errors: string[] }).errors.some((e) =>
          e.toLowerCase().includes("already exists"),
        ),
      ).toBe(true);
    });

    it("errors on a reversed duplicate too (validated directly, isolated from the port-in-use check)", () => {
      const a = placeDeviceWithPorts(layoutStore, rackId, "device-a", 5, [
        "1000base-t",
        "1000base-t",
      ]);
      const b = placeDeviceWithPorts(layoutStore, rackId, "device-b", 10, [
        "1000base-t",
      ]);

      const validation = validateConnection(
        { a_port_id: b.ports[0]!.id, b_port_id: a.ports[0]!.id },
        [
          {
            id: "existing",
            a_port_id: a.ports[0]!.id,
            b_port_id: b.ports[0]!.id,
          },
        ],
        [...a.ports, ...b.ports],
      );

      expect(validation.valid).toBe(false);
      expect(
        validation.errors.some(
          (e) =>
            e.toLowerCase().includes("duplicate") ||
            e.toLowerCase().includes("already exists"),
        ),
      ).toBe(true);
    });
  });

  describe("validation: category and type compatibility", () => {
    it("warns on category mismatch (network vs console)", () => {
      const a = placeDeviceWithPorts(layoutStore, rackId, "device-a", 5, [
        "1000base-t",
      ]);
      const b = placeDeviceWithPorts(layoutStore, rackId, "device-b", 10, [
        "console",
      ]);
      const store = getConnectionStore();

      const validation = store.validateConnection({
        a_port_id: a.ports[0]!.id,
        b_port_id: b.ports[0]!.id,
      });

      expect(validation.valid).toBe(true);
      expect(validation.warnings.some((w) => w.includes("categories"))).toBe(
        true,
      );
    });

    it("warns on type mismatch within the same category (RJ45 vs SFP)", () => {
      const a = placeDeviceWithPorts(layoutStore, rackId, "device-a", 5, [
        "1000base-t",
      ]);
      const b = placeDeviceWithPorts(layoutStore, rackId, "device-b", 10, [
        "1000base-x-sfp",
      ]);
      const store = getConnectionStore();

      const validation = store.validateConnection({
        a_port_id: a.ports[0]!.id,
        b_port_id: b.ports[0]!.id,
      });

      expect(validation.valid).toBe(true);
      expect(validation.warnings.some((w) => w.includes("types"))).toBe(true);
    });

    it("raises no warning when both port type and category match", () => {
      const a = placeDeviceWithPorts(layoutStore, rackId, "device-a", 5, [
        "1000base-t",
      ]);
      const b = placeDeviceWithPorts(layoutStore, rackId, "device-b", 10, [
        "1000base-t",
      ]);
      const store = getConnectionStore();

      const validation = store.validateConnection({
        a_port_id: a.ports[0]!.id,
        b_port_id: b.ports[0]!.id,
      });

      expect(validation.warnings).toEqual([]);
    });

    it("does not block addConnection: warnings are non-blocking", () => {
      const a = placeDeviceWithPorts(layoutStore, rackId, "device-a", 5, [
        "1000base-t",
      ]);
      const b = placeDeviceWithPorts(layoutStore, rackId, "device-b", 10, [
        "console",
      ]);
      const store = getConnectionStore();

      const result = store.addConnection({
        a_port_id: a.ports[0]!.id,
        b_port_id: b.ports[0]!.id,
      });

      expect("connection" in result).toBe(true);
    });
  });

  describe("removeConnectionsForDevice", () => {
    it("removes every connection attached to any port on the device", () => {
      const hub = placeDeviceWithPorts(layoutStore, rackId, "hub", 5, [
        "1000base-t",
        "1000base-t",
      ]);
      const a = placeDeviceWithPorts(layoutStore, rackId, "device-a", 10, [
        "1000base-t",
      ]);
      const b = placeDeviceWithPorts(layoutStore, rackId, "device-b", 15, [
        "1000base-t",
      ]);
      const store = getConnectionStore();

      store.addConnection({
        a_port_id: hub.ports[0]!.id,
        b_port_id: a.ports[0]!.id,
      });
      store.addConnection({
        a_port_id: hub.ports[1]!.id,
        b_port_id: b.ports[0]!.id,
      });
      expect(store.getConnectionsForDevice(hub.deviceId).length).toBe(2);

      const removedCount = store.removeConnectionsForDevice(hub.deviceId);

      expect(removedCount).toBe(2);
      expect(store.getConnectionsForDevice(hub.deviceId)).toEqual([]);
      expect(store.getConnectionsForPort(a.ports[0]!.id)).toEqual([]);
      expect(store.getConnectionsForPort(b.ports[0]!.id)).toEqual([]);
    });

    it("returns 0 and records no history entry when the device has no connections", () => {
      const a = placeDeviceWithPorts(layoutStore, rackId, "device-a", 5, [
        "1000base-t",
      ]);
      layoutStore.clearHistory();

      const removedCount = getConnectionStore().removeConnectionsForDevice(
        a.deviceId,
      );

      expect(removedCount).toBe(0);
      expect(layoutStore.canUndo).toBe(false);
    });
  });

  describe("undo/redo", () => {
    it("undoes and redoes addConnection through the layout store history", () => {
      const a = placeDeviceWithPorts(layoutStore, rackId, "device-a", 5, [
        "1000base-t",
      ]);
      const b = placeDeviceWithPorts(layoutStore, rackId, "device-b", 10, [
        "1000base-t",
      ]);
      const store = getConnectionStore();
      layoutStore.clearHistory();

      store.addConnection({
        a_port_id: a.ports[0]!.id,
        b_port_id: b.ports[0]!.id,
      });
      expect(store.connections.length).toBeGreaterThan(0);
      expect(layoutStore.canUndo).toBe(true);

      layoutStore.undo();
      expect(store.connections).toEqual([]);
      expect(layoutStore.canRedo).toBe(true);

      layoutStore.redo();
      expect(store.connections.length).toBeGreaterThan(0);
    });

    it("undoes removeConnection, restoring the connection", () => {
      const a = placeDeviceWithPorts(layoutStore, rackId, "device-a", 5, [
        "1000base-t",
      ]);
      const b = placeDeviceWithPorts(layoutStore, rackId, "device-b", 10, [
        "1000base-t",
      ]);
      const store = getConnectionStore();
      const created = store.addConnection({
        a_port_id: a.ports[0]!.id,
        b_port_id: b.ports[0]!.id,
      }) as { connection: { id: string } };
      layoutStore.clearHistory();

      store.removeConnection(created.connection.id);
      expect(store.getConnection(created.connection.id)).toBeUndefined();

      layoutStore.undo();
      expect(store.getConnection(created.connection.id)).toEqual(
        expect.objectContaining({
          a_port_id: a.ports[0]!.id,
          b_port_id: b.ports[0]!.id,
        }),
      );
    });

    it("undoes removeConnectionsForDevice as a single step", () => {
      const hub = placeDeviceWithPorts(layoutStore, rackId, "hub", 5, [
        "1000base-t",
        "1000base-t",
      ]);
      const a = placeDeviceWithPorts(layoutStore, rackId, "device-a", 10, [
        "1000base-t",
      ]);
      const b = placeDeviceWithPorts(layoutStore, rackId, "device-b", 15, [
        "1000base-t",
      ]);
      const store = getConnectionStore();
      store.addConnection({
        a_port_id: hub.ports[0]!.id,
        b_port_id: a.ports[0]!.id,
      });
      store.addConnection({
        a_port_id: hub.ports[1]!.id,
        b_port_id: b.ports[0]!.id,
      });
      layoutStore.clearHistory();

      store.removeConnectionsForDevice(hub.deviceId);
      expect(store.getConnectionsForDevice(hub.deviceId)).toEqual([]);
      expect(layoutStore.canUndo).toBe(true);

      layoutStore.undo();
      expect(store.getConnectionsForDevice(hub.deviceId).length).toBe(2);
      expect(layoutStore.canUndo).toBe(false);
    });
  });

  describe("dirty state", () => {
    it("marks the layout dirty when a connection is added", () => {
      const a = placeDeviceWithPorts(layoutStore, rackId, "device-a", 5, [
        "1000base-t",
      ]);
      const b = placeDeviceWithPorts(layoutStore, rackId, "device-b", 10, [
        "1000base-t",
      ]);
      layoutStore.markClean();
      expect(layoutStore.isDirty).toBe(false);

      getConnectionStore().addConnection({
        a_port_id: a.ports[0]!.id,
        b_port_id: b.ports[0]!.id,
      });

      expect(layoutStore.isDirty).toBe(true);
    });

    it("marks the layout dirty when a connection is removed", () => {
      const a = placeDeviceWithPorts(layoutStore, rackId, "device-a", 5, [
        "1000base-t",
      ]);
      const b = placeDeviceWithPorts(layoutStore, rackId, "device-b", 10, [
        "1000base-t",
      ]);
      const store = getConnectionStore();
      const created = store.addConnection({
        a_port_id: a.ports[0]!.id,
        b_port_id: b.ports[0]!.id,
      }) as { connection: { id: string } };
      layoutStore.markClean();
      expect(layoutStore.isDirty).toBe(false);

      store.removeConnection(created.connection.id);

      expect(layoutStore.isDirty).toBe(true);
    });
  });
});
