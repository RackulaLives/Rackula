/**
 * Test Factories
 *
 * Centralized factory functions for creating test data.
 * Use these instead of defining inline mocks in test files.
 *
 * @example
 * import { createTestRack, createTestDeviceType, createTestDevice } from './factories';
 *
 * const rack = createTestRack({ height: 24 });
 * const deviceType = createTestDeviceType({ u_height: 2 });
 * const device = createTestDevice({ position: 5 });
 */

import { vi } from "vitest";
import type {
  Rack,
  DeviceType,
  PlacedDevice,
  DeviceFace,
  DeviceCategory,
  Layout,
  LayoutSettings,
  Airflow,
} from "$lib/types";
import type { Command, CommandType } from "$lib/stores/commands/types";

// =============================================================================
// Rack Factory
// =============================================================================

/**
 * Creates a test Rack with sensible defaults.
 * All properties can be overridden.
 */
export function createTestRack(overrides: Partial<Rack> = {}): Rack {
  return {
    name: "Test Rack",
    height: 42,
    width: 19,
    position: 0,
    desc_units: false,
    show_rear: true,
    form_factor: "4-post",
    starting_unit: 1,
    devices: [],
    ...overrides,
  };
}

// =============================================================================
// DeviceType Factory
// =============================================================================

export interface CreateTestDeviceTypeOptions {
  slug?: string;
  u_height?: number;
  model?: string;
  manufacturer?: string;
  category?: DeviceCategory;
  colour?: string;
  is_full_depth?: boolean;
  airflow?: Airflow;
  face?: DeviceFace;
}

/**
 * Creates a test DeviceType with sensible defaults.
 * Schema v1.0.0: Flat structure with colour, category at top level
 *
 * @example
 * // Simple usage
 * const device = createTestDeviceType();
 *
 * // With overrides
 * const server = createTestDeviceType({ u_height: 2, category: 'server' });
 *
 * // Shorthand for slug + height
 * const switch = createTestDeviceType('my-switch', 1);
 */
export function createTestDeviceType(
  slugOrOptions?: string | CreateTestDeviceTypeOptions,
  u_height?: number,
): DeviceType {
  // Handle shorthand: createTestDeviceType('slug', 2)
  if (typeof slugOrOptions === "string") {
    return {
      slug: slugOrOptions,
      model: `Test Device ${slugOrOptions}`,
      u_height: u_height ?? 1,
      // Flat structure in v1.0.0
      category: "server",
      colour: "#4A90D9",
    };
  }

  // Handle options object
  const options = slugOrOptions ?? {};
  const result: DeviceType = {
    slug: options.slug ?? "test-device",
    u_height: options.u_height ?? 1,
    model: options.model ?? "Test Device",
    // Flat structure in v1.0.0
    category: options.category ?? "server",
    colour: options.colour ?? "#336699",
  };

  // Add optional properties only if specified
  if (options.manufacturer) result.manufacturer = options.manufacturer;
  if (options.is_full_depth !== undefined)
    result.is_full_depth = options.is_full_depth;
  if (options.airflow) result.airflow = options.airflow;

  return result;
}

// =============================================================================
// PlacedDevice Factory
// =============================================================================

/**
 * Creates a test PlacedDevice with sensible defaults.
 * Schema v1.0.0: PlacedDevice now requires a UUID id field
 */
export function createTestDevice(
  overrides: Partial<PlacedDevice> = {},
): PlacedDevice {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    device_type: "test-device",
    position: 10,
    face: "front",
    ...overrides,
  };
}

// =============================================================================
// Command Factory
// =============================================================================

/**
 * Creates a mock Command for testing history/undo-redo.
 * Execute and undo are vi.fn() mocks for assertion.
 */
export function createMockCommand(
  description: string,
  type: CommandType = "PLACE_DEVICE",
): Command & {
  execute: ReturnType<typeof vi.fn>;
  undo: ReturnType<typeof vi.fn>;
} {
  return {
    type,
    description,
    timestamp: Date.now(),
    execute: vi.fn(),
    undo: vi.fn(),
  };
}

// =============================================================================
// Layout Factory
// =============================================================================

/**
 * Creates default LayoutSettings.
 */
export function createTestLayoutSettings(
  overrides: Partial<LayoutSettings> = {},
): LayoutSettings {
  return {
    display_mode: "label",
    show_labels_on_images: false,
    ...overrides,
  };
}

/**
 * Creates a complete test Layout.
 */
export function createTestLayout(overrides: Partial<Layout> = {}): Layout {
  return {
    version: "1.0",
    name: "Test Layout",
    rack: createTestRack(),
    device_types: [],
    settings: createTestLayoutSettings(),
    ...overrides,
  };
}

// =============================================================================
// Device Library Factory
// =============================================================================

/**
 * Creates a minimal device library for testing.
 * Useful when you need multiple device types.
 */
export function createTestDeviceLibrary(): DeviceType[] {
  return [
    createTestDeviceType({ slug: "server-1", u_height: 2, category: "server" }),
    createTestDeviceType({
      slug: "switch-1",
      u_height: 1,
      category: "network",
      colour: "#50FA7B",
    }),
    createTestDeviceType({
      slug: "pdu-1",
      u_height: 1,
      category: "power",
      colour: "#FFB86C",
    }),
    createTestDeviceType({
      slug: "half-depth-device",
      u_height: 1,
      is_full_depth: false,
      category: "network",
    }),
  ];
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Common test constants matching production values.
 * Import these instead of hardcoding values in tests.
 */
export const TEST_CONSTANTS = {
  /** Height of one rack unit in pixels */
  U_HEIGHT: 22,
  /** Padding around rack content */
  RACK_PADDING: 4,
  /** Width of mounting rails */
  RAIL_WIDTH: 17,
  /** Standard rack widths */
  RACK_WIDTH_10: 110,
  RACK_WIDTH_19: 220,
} as const;
