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
import type { Connection } from "$lib/types";
import { createTestLayoutStore, placeDeviceWithPorts } from "./factories";

/**
 * Narrow an addConnection-style result to its success case, throwing with
 * the validation errors if it failed. Removes the repeated
 * `"connection"/"errors" in result` + manual cast pattern.
 */
function expectConnection(
  result: { connection: Connection } | { errors: string[] },
): Connection {
  if (!("connection" in result)) {
    throw new Error(
      `Expected a connection, got errors: ${result.errors.join(", ")}`,
    );
  }
  return result.connection;
}

/**
 * Narrow an addConnection-style result to its failure case, throwing if it
 * unexpectedly succeeded.
 */
function expectConnectionErrors(
  result: { connection: Connection } | { errors: string[] },
): string[] {
  if (!("errors" in result)) {
    throw new Error("Expected validation errors, got a connection");
  }
  return result.errors;
}

/**
 * Narrow an updateConnection-style result to its failure case, throwing if
 * it unexpectedly succeeded.
 */
function expectUpdateErrors(
  result: { success: true } | { errors: string[] },
): string[] {
  if (!("errors" in result)) {
    throw new Error("Expected validation errors, got success");
  }
  return result.errors;
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

      const connection = expectConnection(result);
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
      expectConnection(first);

      const second = store.addConnection({
        a_port_id: a.ports[0]!.id,
        b_port_id: c.ports[0]!.id,
      });

      expect(expectConnectionErrors(second).length).toBeGreaterThan(0);
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

      expect(
        expectConnectionErrors(result).some((e) => e.includes("itself")),
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
      expectConnection(first);

      const duplicate = store.addConnection({
        a_port_id: a.ports[0]!.id,
        b_port_id: b.ports[0]!.id,
      });

      expect(
        expectConnectionErrors(duplicate).some((e) =>
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

      expectConnection(result);
    });
  });

  describe("updateConnection", () => {
    it("applies a successful endpoint update", () => {
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
      const created = expectConnection(
        store.addConnection({
          a_port_id: a.ports[0]!.id,
          b_port_id: b.ports[0]!.id,
        }),
      );

      const result = store.updateConnection(created.id, {
        b_port_id: c.ports[0]!.id,
      });

      expect(result).toEqual({ success: true });
      expect(store.getConnection(created.id)).toEqual(
        expect.objectContaining({
          a_port_id: a.ports[0]!.id,
          b_port_id: c.ports[0]!.id,
        }),
      );
    });

    it("rejects a port change that fails validation, leaving the connection unchanged", () => {
      const a = placeDeviceWithPorts(layoutStore, rackId, "device-a", 5, [
        "1000base-t",
      ]);
      const b = placeDeviceWithPorts(layoutStore, rackId, "device-b", 10, [
        "1000base-t",
      ]);
      const c = placeDeviceWithPorts(layoutStore, rackId, "device-c", 15, [
        "1000base-t",
      ]);
      const d = placeDeviceWithPorts(layoutStore, rackId, "device-d", 20, [
        "1000base-t",
      ]);
      const store = getConnectionStore();
      const created = expectConnection(
        store.addConnection({
          a_port_id: a.ports[0]!.id,
          b_port_id: b.ports[0]!.id,
        }),
      );
      // c's port is already connected to d, so retargeting connection 1's
      // a-side onto c's port should fail the single-connection-per-port
      // check rather than silently succeeding.
      store.addConnection({
        a_port_id: c.ports[0]!.id,
        b_port_id: d.ports[0]!.id,
      });

      const result = store.updateConnection(created.id, {
        a_port_id: c.ports[0]!.id,
      });

      expect(expectUpdateErrors(result).length).toBeGreaterThan(0);
      expect(store.getConnection(created.id)).toEqual(
        expect.objectContaining({
          a_port_id: a.ports[0]!.id,
          b_port_id: b.ports[0]!.id,
        }),
      );
    });

    it("applies a label/color-only update without endpoint validation", () => {
      const a = placeDeviceWithPorts(layoutStore, rackId, "device-a", 5, [
        "1000base-t",
      ]);
      const b = placeDeviceWithPorts(layoutStore, rackId, "device-b", 10, [
        "1000base-t",
      ]);
      const store = getConnectionStore();
      const created = expectConnection(
        store.addConnection({
          a_port_id: a.ports[0]!.id,
          b_port_id: b.ports[0]!.id,
        }),
      );

      const result = store.updateConnection(created.id, {
        label: "uplink",
        color: "#ff5500",
      });

      expect(result).toEqual({ success: true });
      expect(store.getConnection(created.id)).toEqual(
        expect.objectContaining({ label: "uplink", color: "#ff5500" }),
      );
    });
  });

  describe("update integrity: id cannot be overwritten", () => {
    it("ignores an id field slipped into updateConnection's payload and leaves undo intact", () => {
      const a = placeDeviceWithPorts(layoutStore, rackId, "device-a", 5, [
        "1000base-t",
      ]);
      const b = placeDeviceWithPorts(layoutStore, rackId, "device-b", 10, [
        "1000base-t",
      ]);
      const store = getConnectionStore();
      const created = expectConnection(
        store.addConnection({
          a_port_id: a.ports[0]!.id,
          b_port_id: b.ports[0]!.id,
        }),
      );
      const originalId = created.id;
      layoutStore.clearHistory();

      // A caller with a loosely-typed payload (e.g. Partial<Connection> from
      // elsewhere) smuggles an `id` field through the public update API.
      // updateConnection's own signature now excludes `id`
      // (Partial<Omit<Connection, "id">>), so this models a caller whose
      // payload type is wider than that, cast away for the test.
      const payload: Record<string, unknown> = {
        id: "smuggled-id",
        label: "renamed",
      };
      store.updateConnection(
        originalId,
        payload as Partial<Omit<Connection, "id">>,
      );

      // Identity must be untouched: still reachable by its original id, not
      // reachable under the smuggled one.
      expect(store.getConnection(originalId)?.label).toBe("renamed");
      expect(store.getConnection("smuggled-id")).toBeUndefined();

      // Undo must still find the connection by its original id.
      expect(layoutStore.canUndo).toBe(true);
      layoutStore.undo();
      expect(store.getConnection(originalId)?.label).toBeUndefined();
    });
  });

  describe("update integrity: endpoints cannot be blanked", () => {
    it("rejects an explicit undefined a_port_id instead of skipping validation", () => {
      const a = placeDeviceWithPorts(layoutStore, rackId, "device-a", 5, [
        "1000base-t",
      ]);
      const b = placeDeviceWithPorts(layoutStore, rackId, "device-b", 10, [
        "1000base-t",
      ]);
      const store = getConnectionStore();
      const created = expectConnection(
        store.addConnection({
          a_port_id: a.ports[0]!.id,
          b_port_id: b.ports[0]!.id,
        }),
      );

      const result = store.updateConnection(created.id, {
        a_port_id: undefined,
        label: "x",
      });

      expect(expectUpdateErrors(result).length).toBeGreaterThan(0);
      expect(store.getConnection(created.id)?.a_port_id).toBe(a.ports[0]!.id);
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
      const beforeRemoval = store.getConnectionsForDevice(hub.deviceId);
      expect(beforeRemoval).toContainEqual(
        expect.objectContaining({
          a_port_id: hub.ports[0]!.id,
          b_port_id: a.ports[0]!.id,
        }),
      );
      expect(beforeRemoval).toContainEqual(
        expect.objectContaining({
          a_port_id: hub.ports[1]!.id,
          b_port_id: b.ports[0]!.id,
        }),
      );

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
      const created = expectConnection(
        store.addConnection({
          a_port_id: a.ports[0]!.id,
          b_port_id: b.ports[0]!.id,
        }),
      );
      layoutStore.clearHistory();

      store.removeConnection(created.id);
      expect(store.getConnection(created.id)).toBeUndefined();

      layoutStore.undo();
      expect(store.getConnection(created.id)).toEqual(
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
      const restored = store.getConnectionsForDevice(hub.deviceId);
      expect(restored).toContainEqual(
        expect.objectContaining({
          a_port_id: hub.ports[0]!.id,
          b_port_id: a.ports[0]!.id,
        }),
      );
      expect(restored).toContainEqual(
        expect.objectContaining({
          a_port_id: hub.ports[1]!.id,
          b_port_id: b.ports[0]!.id,
        }),
      );
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
      const created = expectConnection(
        store.addConnection({
          a_port_id: a.ports[0]!.id,
          b_port_id: b.ports[0]!.id,
        }),
      );
      layoutStore.markClean();
      expect(layoutStore.isDirty).toBe(false);

      store.removeConnection(created.id);

      expect(layoutStore.isDirty).toBe(true);
    });
  });
});
