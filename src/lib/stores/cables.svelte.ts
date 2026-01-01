/**
 * Cable Store
 * CRUD operations for cable connections between device interfaces
 */

import type { Cable, CableType, CableStatus, LengthUnit } from "$lib/types";
import { debug } from "$lib/utils/debug";
import { generateId } from "$lib/utils/device";
import { getLayoutStore } from "./layout.svelte";

/**
 * Input for creating a new cable
 */
export interface CreateCableInput {
  a_device_id: string;
  a_interface: string;
  b_device_id: string;
  b_interface: string;
  type?: CableType;
  color?: string;
  label?: string;
  length?: number;
  length_unit?: LengthUnit;
  status?: CableStatus;
}

/**
 * Validation result for cable operations
 */
export interface CableValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate cable data against layout constraints.
 *
 * This function is exported for unit testing. Application code should use
 * getCableStore().validateCable() which automatically provides the current
 * cable list from the layout store.
 *
 * @param cable - Cable data to validate
 * @param cables - Existing cables (for duplicate check)
 * @param excludeCableId - Cable ID to exclude from duplicate check (for updates)
 * @returns Validation result
 */
export function validateCable(
  cable: Pick<
    Cable,
    "a_device_id" | "a_interface" | "b_device_id" | "b_interface"
  >,
  cables: Cable[],
  excludeCableId?: string,
): CableValidationResult {
  const errors: string[] = [];
  const layoutStore = getLayoutStore();
  const rack = layoutStore.rack;
  const device_types = layoutStore.device_types;

  // Check A-side device exists
  const aDevice = rack.devices.find((d) => d.id === cable.a_device_id);
  if (!aDevice) {
    errors.push(`A-side device not found: ${cable.a_device_id}`);
  }

  // Check B-side device exists
  const bDevice = rack.devices.find((d) => d.id === cable.b_device_id);
  if (!bDevice) {
    errors.push(`B-side device not found: ${cable.b_device_id}`);
  }

  // Check A-side interface exists on device type
  if (aDevice) {
    const aDeviceType = device_types.find(
      (dt) => dt.slug === aDevice.device_type,
    );
    if (aDeviceType?.interfaces) {
      const hasInterface = aDeviceType.interfaces.some(
        (iface) => iface.name === cable.a_interface,
      );
      if (!hasInterface) {
        errors.push(
          `Interface '${cable.a_interface}' not found on device type '${aDevice.device_type}'`,
        );
      }
    } else {
      // Device type has no interfaces defined - allow any interface name
      // This supports user-defined cables on devices without explicit interface templates
      debug.warn(
        `Cable validation: Device type '${aDevice.device_type}' has no interfaces defined. Interface '${cable.a_interface}' will not be validated.`,
      );
    }
  }

  // Check B-side interface exists on device type
  if (bDevice) {
    const bDeviceType = device_types.find(
      (dt) => dt.slug === bDevice.device_type,
    );
    if (bDeviceType?.interfaces) {
      const hasInterface = bDeviceType.interfaces.some(
        (iface) => iface.name === cable.b_interface,
      );
      if (!hasInterface) {
        errors.push(
          `Interface '${cable.b_interface}' not found on device type '${bDevice.device_type}'`,
        );
      }
    } else {
      // Device type has no interfaces defined - allow any interface name
      debug.warn(
        `Cable validation: Device type '${bDevice.device_type}' has no interfaces defined. Interface '${cable.b_interface}' will not be validated.`,
      );
    }
  }

  // Check for duplicate cables (same A and B endpoints, in either direction)
  const isDuplicate = cables.some((existing) => {
    if (excludeCableId && existing.id === excludeCableId) return false;

    // Check both directions: A->B and B->A
    const matchesForward =
      existing.a_device_id === cable.a_device_id &&
      existing.a_interface === cable.a_interface &&
      existing.b_device_id === cable.b_device_id &&
      existing.b_interface === cable.b_interface;

    const matchesReverse =
      existing.a_device_id === cable.b_device_id &&
      existing.a_interface === cable.b_interface &&
      existing.b_device_id === cable.a_device_id &&
      existing.b_interface === cable.a_interface;

    return matchesForward || matchesReverse;
  });

  if (isDuplicate) {
    errors.push("Cable already exists between these endpoints");
  }

  // Check that A and B aren't the same endpoint
  if (
    cable.a_device_id === cable.b_device_id &&
    cable.a_interface === cable.b_interface
  ) {
    errors.push("Cable cannot connect an interface to itself");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get access to the cable store
 * Provides CRUD operations for cables within the current layout
 * @returns Store object with cable operations
 */
export function getCableStore() {
  const layoutStore = getLayoutStore();

  /**
   * Get all cables from the current layout
   */
  function getCables(): Cable[] {
    return layoutStore.layout.cables ?? [];
  }

  /**
   * Get a cable by ID
   */
  function getCableById(id: string): Cable | undefined {
    return getCables().find((c) => c.id === id);
  }

  /**
   * Get cables connected to a specific device
   */
  function getCablesByDevice(deviceId: string): Cable[] {
    return getCables().filter(
      (c) => c.a_device_id === deviceId || c.b_device_id === deviceId,
    );
  }

  /**
   * Get cables connected to a specific interface on a device
   */
  function getCablesByInterface(
    deviceId: string,
    interfaceName: string,
  ): Cable[] {
    return getCables().filter(
      (c) =>
        (c.a_device_id === deviceId && c.a_interface === interfaceName) ||
        (c.b_device_id === deviceId && c.b_interface === interfaceName),
    );
  }

  /**
   * Add a new cable to the layout
   * @returns The created cable, or null if validation failed
   */
  function addCable(
    input: CreateCableInput,
  ): { cable: Cable; errors: null } | { cable: null; errors: string[] } {
    const cables = getCables();

    // Validate the cable
    const validation = validateCable(input, cables);
    if (!validation.valid) {
      return { cable: null, errors: validation.errors };
    }

    // Create the cable
    const cable: Cable = {
      id: generateId(),
      a_device_id: input.a_device_id,
      a_interface: input.a_interface,
      b_device_id: input.b_device_id,
      b_interface: input.b_interface,
      type: input.type,
      color: input.color,
      label: input.label,
      length: input.length,
      length_unit: input.length_unit,
      status: input.status,
    };

    // Add to layout
    addCableRaw(cable);
    layoutStore.markDirty();

    return { cable, errors: null };
  }

  /**
   * Update an existing cable
   * @returns true if successful, false if cable not found or validation failed
   */
  function updateCable(
    id: string,
    updates: Partial<Omit<Cable, "id">>,
  ): { success: true; errors: null } | { success: false; errors: string[] } {
    const cables = getCables();
    const existingIndex = cables.findIndex((c) => c.id === id);
    if (existingIndex === -1) {
      return { success: false, errors: ["Cable not found"] };
    }

    const existing = cables[existingIndex]!;
    const updated = { ...existing, ...updates };

    // Validate if endpoints are being changed
    if (
      updates.a_device_id !== undefined ||
      updates.a_interface !== undefined ||
      updates.b_device_id !== undefined ||
      updates.b_interface !== undefined
    ) {
      const validation = validateCable(updated, cables, id);
      if (!validation.valid) {
        return { success: false, errors: validation.errors };
      }
    }

    // Update the cable
    updateCableRaw(id, updates);
    layoutStore.markDirty();

    return { success: true, errors: null };
  }

  /**
   * Remove a cable from the layout
   * @returns The removed cable, or undefined if not found
   */
  function removeCable(id: string): Cable | undefined {
    const cable = getCableById(id);
    if (!cable) return undefined;

    removeCableRaw(id);
    layoutStore.markDirty();

    return cable;
  }

  /**
   * Remove all cables connected to a device
   * Called when a device is removed from the rack
   * @returns Number of cables removed
   */
  function removeCablesByDevice(deviceId: string): number {
    const cables = getCables();
    const toRemove = cables.filter(
      (c) => c.a_device_id === deviceId || c.b_device_id === deviceId,
    );

    if (toRemove.length > 0) {
      // Batch removal using layout store's cable removal method
      // Plain Set is intentional - this is used immediately for filtering, not reactive state
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const toRemoveIds = new Set(toRemove.map((c) => c.id));
      layoutStore.removeCablesRaw(toRemoveIds);
      layoutStore.markDirty();
    }

    return toRemove.length;
  }

  // =============================================================================
  // Raw operations (bypass dirty tracking, used by undo/redo)
  // =============================================================================

  /**
   * Add a cable directly (raw)
   */
  function addCableRaw(cable: Cable): void {
    layoutStore.addCableRaw(cable);
  }

  /**
   * Update a cable directly (raw)
   */
  function updateCableRaw(
    id: string,
    updates: Partial<Omit<Cable, "id">>,
  ): void {
    layoutStore.updateCableRaw(id, updates);
  }

  /**
   * Remove a cable directly (raw)
   */
  function removeCableRaw(id: string): void {
    layoutStore.removeCableRaw(id);
  }

  return {
    // Getters
    get cables() {
      return getCables();
    },
    getCableById,
    getCablesByDevice,
    getCablesByInterface,

    // CRUD operations
    addCable,
    updateCable,
    removeCable,
    removeCablesByDevice,

    // Raw operations (for undo/redo)
    addCableRaw,
    updateCableRaw,
    removeCableRaw,

    // Validation
    validateCable: (
      cable: Pick<
        Cable,
        "a_device_id" | "a_interface" | "b_device_id" | "b_interface"
      >,
    ) => validateCable(cable, getCables()),
  };
}
