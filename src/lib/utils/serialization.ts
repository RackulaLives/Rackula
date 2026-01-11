/**
 * Layout Serialization and Factory Functions
 */

import type { Layout, Rack, FormFactor } from "$lib/types";
import { VERSION } from "$lib/version";

/**
 * Create a new empty layout
 * @param name - Layout name (default: "Racky McRackface")
 * @returns New Layout object with empty device_types (starter library is a runtime constant)
 */
export function createLayout(name: string = "Racky McRackface"): Layout {
  return {
    version: VERSION,
    name,
    racks: [createRackForNewLayout(name)],
    device_types: [], // Starter library is a runtime constant, not stored in layout
    settings: {
      display_mode: "label",
      show_labels_on_images: false,
    },
  };
}

/**
 * Create a default rack for a new layout (internal helper)
 * @param name - Rack name
 * @returns A default 42U Rack with empty devices
 */
function createRackForNewLayout(name: string): Rack {
  return {
    id: "rack-1",
    name,
    height: 42,
    width: 19,
    desc_units: false,
    show_rear: true,
    form_factor: "4-post-cabinet",
    starting_unit: 1,
    position: 0,
    devices: [],
    view: "front", // Runtime only
  };
}

/**
 * Create a rack with application-level defaults
 * @param name - Rack name
 * @param height - Rack height in U
 * @param width - Rack width (10 or 19)
 * @param form_factor - Form factor
 * @param desc_units - Whether units are numbered top-down
 * @param starting_unit - First U number
 * @param show_rear - Show rear view on canvas (default: true)
 * @returns A new Rack object
 */
export function createDefaultRack(
  name: string,
  height: number,
  width: 10 | 19 = 19,
  form_factor: FormFactor = "4-post-cabinet",
  desc_units: boolean = false,
  starting_unit: number = 1,
  show_rear: boolean = true,
  id: string = "rack-1",
): Rack {
  return {
    id,
    name,
    height,
    width,
    desc_units,
    show_rear,
    form_factor,
    starting_unit,
    position: 0,
    devices: [],
    view: "front", // Runtime only
  };
}
