/**
 * Connection Creation Handler Tests (#1932)
 * Behavioral tests for the desktop click-to-click connection creation state
 * machine: enter, target, cancel (same-port click, which now surfaces the
 * store's own self-connection error), the already-connected error path, the
 * category/type/direction warning path, and the placement-mode collision
 * guard. Uses the real connection store and layout store (like
 * connection-store.test.ts) so validation is exercised for real, not mocked,
 * plus a real connection-creation store reset between tests and a spy for
 * the toast side effect.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { InterfaceTemplate } from "$lib/types";
import {
  handleConnectionPortClick,
  getDirectionMismatchWarning,
  getSignalMismatchWarning,
  type ConnectionCreationHandlerContext,
} from "$lib/utils/connection-creation";
import {
  getConnectionCreationStore,
  resetConnectionCreationStore,
} from "$lib/stores/connection-creation.svelte";
import { getConnectionStore } from "$lib/stores/connection.svelte";
import { getLayoutStore } from "$lib/stores/layout.svelte";
import {
  createTestLayoutStore,
  createTestInterfaceTemplate,
  createTestPlacedPort,
  placeDeviceWithPorts,
} from "./factories";

describe("handleConnectionPortClick", () => {
  let layoutStore: ReturnType<typeof getLayoutStore>;
  let rackId: string;
  let showToast: ReturnType<typeof vi.fn>;

  function buildContext(
    overrides: Partial<ConnectionCreationHandlerContext> = {},
  ): ConnectionCreationHandlerContext {
    const connectionStore = getConnectionStore();
    return {
      connectionCreation: getConnectionCreationStore(),
      isPlacementActive: false,
      validateConnection: connectionStore.validateConnection,
      addConnection: connectionStore.addConnection,
      showToast,
      ...overrides,
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
      const {
        ports: [portA],
      } = placeDeviceWithPorts(layoutStore, rackId, "device-a", 5, [
        "1000base-t",
      ]);
      const ctx = buildContext();

      handleConnectionPortClick(
        {
          portId: portA!.id,
          iface: createTestInterfaceTemplate(),
          port: portA,
        },
        ctx,
      );

      expect(getConnectionCreationStore().isCreating).toBe(true);
      expect(getConnectionCreationStore().sourcePortId).toBe(portA!.id);
      expect(showToast).not.toHaveBeenCalled();
    });

    it("is a defensive no-op for a port with no id (grouped/high-density device)", () => {
      const ctx = buildContext();

      handleConnectionPortClick(
        {
          portId: undefined,
          iface: createTestInterfaceTemplate(),
          port: undefined,
        },
        ctx,
      );

      expect(getConnectionCreationStore().isCreating).toBe(false);
      expect(showToast).not.toHaveBeenCalled();
    });
  });

  describe("mode collision: placement mode active (#1932 CodeAnt review)", () => {
    it("does not arm connection creation while placement mode is active", () => {
      const {
        ports: [portA],
      } = placeDeviceWithPorts(layoutStore, rackId, "device-a", 5, [
        "1000base-t",
      ]);
      const ctx = buildContext({ isPlacementActive: true });

      handleConnectionPortClick(
        {
          portId: portA!.id,
          iface: createTestInterfaceTemplate(),
          port: portA,
        },
        ctx,
      );

      expect(getConnectionCreationStore().isCreating).toBe(false);
      expect(showToast).not.toHaveBeenCalled();
    });

    it("ignores a target click on an already-armed connection while placement mode is active", () => {
      const {
        ports: [portA],
      } = placeDeviceWithPorts(layoutStore, rackId, "device-a", 5, [
        "1000base-t",
      ]);
      const {
        ports: [portB],
      } = placeDeviceWithPorts(layoutStore, rackId, "device-b", 10, [
        "1000base-t",
      ]);
      const iface = createTestInterfaceTemplate({ type: "1000base-t" });

      // Arm while placement is inactive.
      handleConnectionPortClick(
        { portId: portA!.id, iface, port: portA },
        buildContext({ isPlacementActive: false }),
      );
      expect(getConnectionCreationStore().isCreating).toBe(true);

      // Placement becomes active before the target click lands (e.g. armed
      // via the command palette mid-flow); the click must not complete or
      // cancel the already-armed connection, just no-op.
      handleConnectionPortClick(
        { portId: portB!.id, iface, port: portB },
        buildContext({ isPlacementActive: true }),
      );

      expect(getConnectionCreationStore().isCreating).toBe(true);
      expect(getConnectionCreationStore().sourcePortId).toBe(portA!.id);
      expect(getConnectionStore().connections).toEqual([]);
    });
  });

  describe("targeting a valid port", () => {
    it("creates the connection and exits the mode", () => {
      const {
        ports: [portA],
      } = placeDeviceWithPorts(layoutStore, rackId, "device-a", 5, [
        "1000base-t",
      ]);
      const {
        ports: [portB],
      } = placeDeviceWithPorts(layoutStore, rackId, "device-b", 10, [
        "1000base-t",
      ]);
      const ctx = buildContext();
      const ifaceA = createTestInterfaceTemplate({ type: "1000base-t" });
      const ifaceB = createTestInterfaceTemplate({ type: "1000base-t" });

      handleConnectionPortClick(
        { portId: portA!.id, iface: ifaceA, port: portA },
        ctx,
      );
      handleConnectionPortClick(
        { portId: portB!.id, iface: ifaceB, port: portB },
        ctx,
      );

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
      const {
        ports: [portA],
      } = placeDeviceWithPorts(layoutStore, rackId, "device-a", 5, [
        "1000base-t",
      ]);
      const ctx = buildContext();
      const iface = createTestInterfaceTemplate({ type: "1000base-t" });

      handleConnectionPortClick({ portId: portA!.id, iface, port: portA }, ctx);
      handleConnectionPortClick({ portId: portA!.id, iface, port: portA }, ctx);

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
      const {
        ports: [portA],
      } = placeDeviceWithPorts(layoutStore, rackId, "device-a", 5, [
        "1000base-t",
      ]);
      const {
        ports: [portB],
      } = placeDeviceWithPorts(layoutStore, rackId, "device-b", 10, [
        "1000base-t",
      ]);
      const {
        ports: [portC],
      } = placeDeviceWithPorts(layoutStore, rackId, "device-c", 15, [
        "1000base-t",
      ]);
      getConnectionStore().addConnection({
        a_port_id: portA!.id,
        b_port_id: portB!.id,
      });
      const ctx = buildContext();
      const iface = createTestInterfaceTemplate({ type: "1000base-t" });

      // Arm from device-c, then target device-a's port, which is already
      // connected to device-b.
      handleConnectionPortClick({ portId: portC!.id, iface, port: portC }, ctx);
      handleConnectionPortClick({ portId: portA!.id, iface, port: portA }, ctx);

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
      const {
        ports: [portA],
      } = placeDeviceWithPorts(layoutStore, rackId, "device-a", 5, ["xlr-3"]);
      const {
        ports: [portB],
      } = placeDeviceWithPorts(layoutStore, rackId, "device-b", 10, ["hdmi"]);
      const ctx = buildContext();
      const ifaceA = createTestInterfaceTemplate({ type: "xlr-3" });
      const ifaceB = createTestInterfaceTemplate({ type: "hdmi" });

      handleConnectionPortClick(
        { portId: portA!.id, iface: ifaceA, port: portA },
        ctx,
      );
      handleConnectionPortClick(
        { portId: portB!.id, iface: ifaceB, port: portB },
        ctx,
      );

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
      const {
        ports: [portA],
      } = placeDeviceWithPorts(layoutStore, rackId, "device-a", 5, [
        { type: "1000base-t", direction: "output" },
      ]);
      const {
        ports: [portB],
      } = placeDeviceWithPorts(layoutStore, rackId, "device-b", 10, [
        { type: "1000base-t", direction: "output" },
      ]);
      const ctx = buildContext();
      const ifaceA = createTestInterfaceTemplate({
        type: "1000base-t",
        direction: "output",
      });
      const ifaceB = createTestInterfaceTemplate({
        type: "1000base-t",
        direction: "output",
      });

      handleConnectionPortClick(
        { portId: portA!.id, iface: ifaceA, port: portA },
        ctx,
      );
      handleConnectionPortClick(
        { portId: portB!.id, iface: ifaceB, port: portB },
        ctx,
      );

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

  describe("warning path: signal mismatch", () => {
    it("creates the connection and joins a signal warning into the warning toast", () => {
      const {
        ports: [portA],
      } = placeDeviceWithPorts(layoutStore, rackId, "device-a", 5, [
        { type: "xlr-3", direction: "output" },
      ]);
      const {
        ports: [portB],
      } = placeDeviceWithPorts(layoutStore, rackId, "device-b", 10, [
        { type: "xlr-3", direction: "input" },
      ]);
      const ctx = buildContext();
      const ifaceA = createTestInterfaceTemplate({
        type: "xlr-3",
        direction: "output",
        signal_type: "analog-audio-speaker",
      });
      const ifaceB = createTestInterfaceTemplate({
        type: "xlr-3",
        direction: "input",
        signal_type: "analog-audio-mic",
      });

      handleConnectionPortClick(
        { portId: portA!.id, iface: ifaceA, port: portA },
        ctx,
      );
      handleConnectionPortClick(
        { portId: portB!.id, iface: ifaceB, port: portB },
        ctx,
      );

      expect(getConnectionStore().connections).toContainEqual(
        expect.objectContaining({
          a_port_id: portA!.id,
          b_port_id: portB!.id,
        }),
      );
      expect(showToast).toHaveBeenCalledWith(
        "Signal types do not match: Speaker level vs Mic level",
        "warning",
      );
    });
  });

  describe("cancellation resets state for the next attempt", () => {
    it("allows starting a fresh connection after a validation error cancelled the mode", () => {
      const {
        ports: [portA],
      } = placeDeviceWithPorts(layoutStore, rackId, "device-a", 5, [
        "1000base-t",
      ]);
      const {
        ports: [portB],
      } = placeDeviceWithPorts(layoutStore, rackId, "device-b", 10, [
        "1000base-t",
      ]);
      const ctx = buildContext();
      const iface = createTestInterfaceTemplate({ type: "1000base-t" });

      // Self-click cancels with an error.
      handleConnectionPortClick({ portId: portA!.id, iface, port: portA }, ctx);
      handleConnectionPortClick({ portId: portA!.id, iface, port: portA }, ctx);
      expect(getConnectionCreationStore().isCreating).toBe(false);

      // A fresh click starts a new attempt rather than staying stuck.
      handleConnectionPortClick({ portId: portA!.id, iface, port: portA }, ctx);
      expect(getConnectionCreationStore().isCreating).toBe(true);
      expect(getConnectionCreationStore().sourcePortId).toBe(portA!.id);

      handleConnectionPortClick({ portId: portB!.id, iface, port: portB }, ctx);
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
  it("warns when both ports are output (no PlacedPort override on either side)", () => {
    const a = createTestInterfaceTemplate({ direction: "output" });
    const b = createTestInterfaceTemplate({ direction: "output" });
    expect(getDirectionMismatchWarning(undefined, a, undefined, b)).toContain(
      "outputs",
    );
  });

  it("warns when both ports are input (no PlacedPort override on either side)", () => {
    const a = createTestInterfaceTemplate({ direction: "input" });
    const b = createTestInterfaceTemplate({ direction: "input" });
    expect(getDirectionMismatchWarning(undefined, a, undefined, b)).toContain(
      "inputs",
    );
  });

  it("does not warn when directions are complementary", () => {
    const a = createTestInterfaceTemplate({ direction: "output" });
    const b = createTestInterfaceTemplate({ direction: "input" });
    expect(getDirectionMismatchWarning(undefined, a, undefined, b)).toBeNull();
  });

  it("does not warn when either side is bidirectional", () => {
    const a = createTestInterfaceTemplate({ direction: "output" });
    const b = createTestInterfaceTemplate({ direction: "bidirectional" });
    expect(getDirectionMismatchWarning(undefined, a, undefined, b)).toBeNull();
  });

  it("does not warn for an undirected AV type with no explicit direction", () => {
    // xlr-3 has no inferDirection default (spike #1927): direction must be
    // set explicitly, so two undirected XLR ports compare as "nothing to
    // mismatch" rather than a false-positive warning.
    const a = createTestInterfaceTemplate({ type: "xlr-3" });
    const b = createTestInterfaceTemplate({ type: "xlr-3" });
    expect(getDirectionMismatchWarning(undefined, a, undefined, b)).toBeNull();
  });

  describe("PlacedPort.direction override precedence (#1932 CodeAnt review)", () => {
    it("resolves from the PlacedPort override, not the InterfaceTemplate default: an override can clear a template-level mismatch", () => {
      // Both templates say "output" (would warn on their own), but each
      // port's own override makes them complementary input/output. The
      // override must win, matching resolveConnectionPortDirection's
      // precedence (the same one connection rendering uses for its arrows).
      const aIface = createTestInterfaceTemplate({ direction: "output" });
      const bIface = createTestInterfaceTemplate({ direction: "output" });
      const aPort = createTestPlacedPort({ direction: "output" });
      const bPort = createTestPlacedPort({ direction: "input" });

      expect(
        getDirectionMismatchWarning(aPort, aIface, bPort, bIface),
      ).toBeNull();
    });

    it("resolves from the PlacedPort override, not the InterfaceTemplate default: an override can introduce a mismatch the templates alone would not have", () => {
      // Templates are complementary output/input (would not warn on their
      // own), but both ports' own overrides make them both "input".
      const aIface = createTestInterfaceTemplate({ direction: "output" });
      const bIface = createTestInterfaceTemplate({ direction: "input" });
      const aPort = createTestPlacedPort({ direction: "input" });
      const bPort = createTestPlacedPort({ direction: "input" });

      expect(
        getDirectionMismatchWarning(aPort, aIface, bPort, bIface),
      ).toContain("inputs");
    });
  });
});

describe("getSignalMismatchWarning", () => {
  type Case = {
    name: string;
    a: Partial<InterfaceTemplate>;
    b: Partial<InterfaceTemplate>;
    expected: string | null;
  };

  const cases: Case[] = [
    {
      name: "no warning when one side has no signal",
      a: { type: "adat-optical" },
      b: { type: "hdmi" },
      expected: null,
    },
    {
      name: "no warning for the same signal",
      a: { type: "hdmi" },
      b: { type: "hdmi" },
      expected: null,
    },
    {
      name: "warns across families (analog audio to video)",
      a: { type: "trs-1-4" },
      b: { type: "hdmi" },
      expected: "Signal types do not match: Line level vs HDMI",
    },
    {
      name: "warns within a family when both sides are explicit (mic vs line)",
      a: { type: "xlr-3", signal_type: "analog-audio-mic" },
      b: { type: "xlr-3", signal_type: "analog-audio-line" },
      expected: "Signal types do not match: Mic level vs Line level",
    },
    {
      name: "no warning within a family when one side is inferred (line out to XLR input)",
      a: { type: "xlr-3", direction: "output" },
      b: { type: "xlr-3", direction: "input" },
      expected: null,
    },
    {
      name: "no warning within a family when only one side is explicit",
      a: { type: "xlr-3", signal_type: "analog-audio-speaker" },
      b: { type: "trs-1-4" },
      expected: null,
    },
    {
      name: "no signal warning on top of a category mismatch (network port carrying Dante to HDMI)",
      a: { type: "1000base-t", signal_type: "digital-audio-dante" },
      b: { type: "hdmi" },
      expected: null,
    },
  ];

  it.each(cases)("$name", ({ a, b, expected }) => {
    expect(
      getSignalMismatchWarning(
        undefined,
        createTestInterfaceTemplate(a),
        undefined,
        createTestInterfaceTemplate(b),
      ),
    ).toBe(expected);
  });
});

describe("placeDeviceWithPorts test factory (#1932 CodeRabbit review)", () => {
  let layoutStore: ReturnType<typeof getLayoutStore>;
  let rackId: string;

  beforeEach(() => {
    layoutStore = createTestLayoutStore();
    const rack = layoutStore.addRack("Test Rack", 42)!;
    rackId = rack.id;
  });

  it("resolves the newly placed instance's ports, not an earlier instance with the same slug", () => {
    const first = placeDeviceWithPorts(layoutStore, rackId, "device-a", 5, [
      "1000base-t",
    ]);
    const second = placeDeviceWithPorts(layoutStore, rackId, "device-a", 10, [
      "1000base-t",
    ]);

    // Both placements share slug "device-a"; the second call must resolve to
    // the PlacedDevice it just placed, not fall back to the first instance
    // via a global first-match on slug (they are distinct placements with
    // distinct ids and distinct instantiated port ids, even though both
    // share the same device type and interface list).
    expect(second.deviceId).not.toBe(first.deviceId);
    expect(second.ports[0]!.id).not.toBe(first.ports[0]!.id);

    // Both instances persist as separate devices in the rack; the second
    // call did not silently replace or alias the first.
    const rackDeviceIds = layoutStore.racks
      .find((r) => r.id === rackId)!
      .devices.map((d) => d.id);
    expect(rackDeviceIds).toContain(first.deviceId);
    expect(rackDeviceIds).toContain(second.deviceId);
  });
});
