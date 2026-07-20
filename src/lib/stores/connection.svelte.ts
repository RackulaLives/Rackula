/**
 * Connection Store
 * CRUD operations and validation for port-to-port connections (#369)
 *
 * Structured after cables.svelte.ts, but unlike the deprecated Cable store
 * (retiring in #3091), the mutating operations here go through the layout
 * store's recorded/raw command pattern (src/lib/stores/layout/
 * recorded-connection-actions.ts + src/lib/stores/commands/connection.ts),
 * so add/update/remove are undoable via the existing history system.
 *
 * Connections reference PlacedPort.id directly (Connection.a_port_id /
 * b_port_id). Serialization with stable port IDs across save/load is out of
 * scope here — see #3090.
 */

import { SvelteSet } from "svelte/reactivity";
import type { Connection, PlacedPort } from "$lib/types";
import { generateId } from "$lib/utils/device";
import { getPortCategory } from "$lib/utils/port-utils";
import { getLayoutStore } from "./layout.svelte";

/**
 * Input for creating a new connection
 */
export interface CreateConnectionInput {
  a_port_id: string;
  b_port_id: string;
  label?: string;
  color?: string;
}

/**
 * Validation result for connection operations. Errors block the operation;
 * warnings are informational only (a mismatched connection is still allowed,
 * e.g. bridging a network port to a console port for out-of-band access).
 */
export interface ConnectionValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Every PlacedPort across every rack. Connections reference ports by id
 * only, and ports live on PlacedDevice.ports, so validation must search
 * every rack, not just the active one (mirrors validateCable's cross-rack
 * device lookup in cables.svelte.ts).
 */
function getAllPlacedPorts(): PlacedPort[] {
  const layoutStore = getLayoutStore();
  return layoutStore.racks.flatMap((rack) =>
    rack.devices.flatMap((device) => device.ports ?? []),
  );
}

/**
 * Validate connection data against layout constraints.
 *
 * This function is exported for unit testing. Application code should use
 * getConnectionStore().validateConnection(), which automatically supplies
 * the current connection list and port index from the layout store.
 *
 * @param input - Connection data to validate
 * @param connections - Existing connections (for duplicate/port-in-use checks)
 * @param allPorts - Every placed port across every rack (for type/category lookups)
 * @param excludeConnectionId - Connection ID to exclude from checks (for updates)
 */
export function validateConnection(
  input: CreateConnectionInput,
  connections: Connection[],
  allPorts: PlacedPort[],
  excludeConnectionId?: string,
): ConnectionValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Self-connection
  if (input.a_port_id === input.b_port_id) {
    errors.push("Cannot connect a port to itself");
  }

  // Both ports must reference a placed port
  const aPort = allPorts.find((p) => p.id === input.a_port_id);
  const bPort = allPorts.find((p) => p.id === input.b_port_id);
  if (!aPort) {
    errors.push(`A-side port not found: ${input.a_port_id}`);
  }
  if (!bPort) {
    errors.push(`B-side port not found: ${input.b_port_id}`);
  }

  // Single connection per port: most ports allow only one connection
  const isPortInUse = (portId: string) =>
    connections.some(
      (c) =>
        c.id !== excludeConnectionId &&
        (c.a_port_id === portId || c.b_port_id === portId),
    );
  if (isPortInUse(input.a_port_id)) {
    errors.push(`Port already has a connection: ${input.a_port_id}`);
  }
  if (input.b_port_id !== input.a_port_id && isPortInUse(input.b_port_id)) {
    errors.push(`Port already has a connection: ${input.b_port_id}`);
  }

  // Duplicate connection between the same two ports, in either direction
  const isDuplicate = connections.some((existing) => {
    if (excludeConnectionId && existing.id === excludeConnectionId)
      return false;
    const matchesForward =
      existing.a_port_id === input.a_port_id &&
      existing.b_port_id === input.b_port_id;
    const matchesReverse =
      existing.a_port_id === input.b_port_id &&
      existing.b_port_id === input.a_port_id;
    return matchesForward || matchesReverse;
  });
  if (isDuplicate) {
    errors.push("Connection already exists between these ports");
  }

  // Category/type compatibility (warning only). The Connection model has no
  // class field: compatibility is always derived from the referenced ports'
  // types via getPortCategory(), never stored. A category mismatch (e.g.
  // network <-> power) is the stronger signal; only check exact type
  // equality when the categories already agree, to avoid two warnings for
  // the same underlying mismatch.
  if (aPort && bPort) {
    const aCategory = getPortCategory(aPort.type);
    const bCategory = getPortCategory(bPort.type);
    if (aCategory !== bCategory) {
      warnings.push(
        `Port categories do not match: ${aCategory} vs ${bCategory}`,
      );
    } else if (aPort.type !== bPort.type) {
      warnings.push(`Port types do not match: ${aPort.type} vs ${bPort.type}`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Get access to the connection store.
 * Provides CRUD operations, validation, and undo/redo-backed mutation for
 * port-to-port connections within the current layout.
 * @returns Store object with connection operations
 */
export function getConnectionStore() {
  const layoutStore = getLayoutStore();

  /**
   * Get all connections from the current layout
   */
  function getConnections(): Connection[] {
    return layoutStore.layout.connections ?? [];
  }

  /**
   * Get a connection by ID
   */
  function getConnection(id: string): Connection | undefined {
    return getConnections().find((c) => c.id === id);
  }

  /**
   * Get connections attached to a specific port
   */
  function getConnectionsForPort(portId: string): Connection[] {
    return getConnections().filter(
      (c) => c.a_port_id === portId || c.b_port_id === portId,
    );
  }

  /**
   * Get connections attached to any port on a specific device
   */
  function getConnectionsForDevice(deviceId: string): Connection[] {
    const device = layoutStore.racks
      .flatMap((rack) => rack.devices)
      .find((d) => d.id === deviceId);
    if (!device?.ports || device.ports.length === 0) return [];
    const portIds = new SvelteSet(device.ports.map((p) => p.id));
    return getConnections().filter(
      (c) => portIds.has(c.a_port_id) || portIds.has(c.b_port_id),
    );
  }

  /**
   * Add a new connection to the layout. Undoable via the layout store's
   * history.
   * @returns The created connection, or the validation errors that blocked it
   */
  function addConnection(
    input: CreateConnectionInput,
  ): { connection: Connection } | { errors: string[] } {
    const validation = validateConnection(
      input,
      getConnections(),
      getAllPlacedPorts(),
    );
    if (!validation.valid) {
      return { errors: validation.errors };
    }

    const connection: Connection = {
      id: generateId(),
      a_port_id: input.a_port_id,
      b_port_id: input.b_port_id,
      label: input.label,
      color: input.color,
    };

    layoutStore.addConnectionRecorded(connection);

    return { connection };
  }

  /**
   * Update an existing connection. Undoable via the layout store's history.
   * @returns Success, or the validation errors that blocked the update
   */
  function updateConnection(
    id: string,
    updates: Partial<Connection>,
  ): { success: true } | { errors: string[] } {
    const existing = getConnection(id);
    if (!existing) {
      return { errors: ["Connection not found"] };
    }

    // Only revalidate endpoints if the update touches a port; label/color
    // edits skip the port-based checks entirely.
    if (updates.a_port_id !== undefined || updates.b_port_id !== undefined) {
      const merged: CreateConnectionInput = {
        a_port_id: updates.a_port_id ?? existing.a_port_id,
        b_port_id: updates.b_port_id ?? existing.b_port_id,
      };
      const validation = validateConnection(
        merged,
        getConnections(),
        getAllPlacedPorts(),
        id,
      );
      if (!validation.valid) {
        return { errors: validation.errors };
      }
    }

    layoutStore.updateConnectionRecorded(id, updates);

    return { success: true };
  }

  /**
   * Remove a connection from the layout. Undoable via the layout store's
   * history.
   * @returns The removed connection, or undefined if not found
   */
  function removeConnection(id: string): Connection | undefined {
    return layoutStore.removeConnectionRecorded(id);
  }

  /**
   * Remove every connection attached to any port on a device, as a single
   * undoable unit.
   * @returns The number of connections removed
   */
  function removeConnectionsForDevice(deviceId: string): number {
    const device = layoutStore.racks
      .flatMap((rack) => rack.devices)
      .find((d) => d.id === deviceId);
    if (!device?.ports || device.ports.length === 0) return 0;
    const portIds = new SvelteSet(device.ports.map((p) => p.id));
    return layoutStore.removeConnectionsForPortsRecorded(portIds);
  }

  // =============================================================================
  // Raw operations (bypass dirty tracking and history; used by the undo/redo
  // command layer itself, exposed here for API symmetry with the CRUD ops)
  // =============================================================================

  function addConnectionRaw(connection: Connection): void {
    layoutStore.addConnectionRaw(connection);
  }

  function updateConnectionRaw(id: string, updates: Partial<Connection>): void {
    layoutStore.updateConnectionRaw(id, updates);
  }

  function removeConnectionRaw(id: string): void {
    layoutStore.removeConnectionRaw(id);
  }

  return {
    // Getters
    get connections() {
      return getConnections();
    },
    getConnection,
    getConnectionsForPort,
    getConnectionsForDevice,

    // CRUD operations (undo/redo-backed)
    addConnection,
    updateConnection,
    removeConnection,
    removeConnectionsForDevice,

    // Raw operations (for undo/redo)
    addConnectionRaw,
    updateConnectionRaw,
    removeConnectionRaw,

    // Validation
    validateConnection: (input: CreateConnectionInput) =>
      validateConnection(input, getConnections(), getAllPlacedPorts()),
  };
}
