/**
 * Verb-bar projection: maps the action registry onto the floating verb bars
 * shown when a device or rack is selected. Consumers render these lists
 * directly; dispatch is wired at the call site.
 *
 * Priority: when isDeviceSelected is true, the device list is used regardless
 * of isRackSelected (device selection takes precedence).
 */

import {
  getActionById,
  type ActionDefinition,
  type ActionEnabledContext,
  type ActionId,
} from "$lib/actions/registry";

/** Ordered verb ids shown when a device is selected. */
export const DEVICE_VERB_IDS: ActionId[] = [
  "move-device-up",
  "move-device-down",
  "move-device-slot",
  "flip-device-face",
  "duplicate-selection",
  "delete-selection",
];

/** Ordered verb ids shown when a rack is selected. */
export const RACK_VERB_IDS: ActionId[] = [
  "duplicate-selection",
  "focus-rack",
  "export-rack",
  "delete-selection",
];

/**
 * Return the verb bar actions appropriate for the current selection, filtered
 * by each action's enabledWhen predicate. Returns an empty array when nothing
 * is selected. Preserves list order.
 */
export function getVerbsForSelection(
  ctx: ActionEnabledContext,
): ActionDefinition[] {
  let ids: ActionId[];

  if (ctx.isDeviceSelected) {
    ids = DEVICE_VERB_IDS;
  } else if (ctx.isRackSelected) {
    ids = RACK_VERB_IDS;
  } else {
    return [];
  }

  const result: ActionDefinition[] = [];
  for (const id of ids) {
    const action = getActionById(id);
    if (!action) continue;
    if (action.enabledWhen === undefined || action.enabledWhen(ctx)) {
      result.push(action);
    }
  }
  return result;
}
