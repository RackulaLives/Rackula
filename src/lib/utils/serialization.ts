/**
 * Layout Serialization and Factory Functions
 */

import type { Layout, Rack, FormFactor } from "$lib/types";
import { VERSION } from "$lib/version";
import { generateId } from "./device";

/**
 * Create a new empty layout
 * @param name - Layout name (default: "Racky McRackface")
 * @returns New Layout object with empty device_types (starter library is a runtime constant)
 */
export function createLayout(name: string = "Racky McRackface"): Layout {
  return {
    version: VERSION,
    name,
    racks: [], // Empty - user creates first rack via New Rack Wizard
    device_types: [], // Starter library is a runtime constant, not stored in layout
    settings: {
      display_mode: "label",
      show_labels_on_images: false,
    },
    metadata: {
      id: generateId(),
      name,
      schema_version: "1.0",
    },
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
  width: 10 | 19 | 21 | 23 = 19,
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
