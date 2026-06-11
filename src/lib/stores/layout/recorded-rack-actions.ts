/**
 * Recorded Rack Actions for Layout Store
 *
 * Extracted from layout/command-adapters.ts — rack-level operations
 * with undo/redo support. Each function creates a Command wrapping raw
 * mutators, then executes it through the history system.
 */

import type { Rack } from "$lib/types";
import { getHistoryStore } from "../history.svelte";
import {
  createUpdateRackCommand,
  createClearRackCommand,
  createBatchCommand,
} from "../commands";
import type { LayoutStateAccess } from "./types";
import { getCommandStoreAdapter } from "./command-adapters";
import { getTargetRack, getRackById } from "./rack-actions";

/**
 * Update rack settings with undo/redo support
 * @param ctx - Layout state access
 * @param rackId - Rack ID
 * @param updates - Settings to update
 */
export function updateRackRecorded(
  ctx: LayoutStateAccess,
  rackId: string,
  updates: Partial<Omit<Rack, "devices" | "view">>,
): void {
  const targetRack = getRackById(ctx, rackId);
  if (!targetRack) return;

  // Set active rack so Raw functions target the correct rack
  ctx.setActiveRackId(rackId);

  // Capture before state
  const before: Partial<Omit<Rack, "devices" | "view">> = {};
  for (const key of Object.keys(updates) as (keyof Omit<
    Rack,
    "devices" | "view"
  >)[]) {
    before[key] = targetRack[key] as never;
  }

  const history = getHistoryStore();
  const adapter = getCommandStoreAdapter(ctx);

  const command = createUpdateRackCommand(before, updates, adapter);
  history.execute(command);
  ctx.markDirty();
}

/**
 * Update the same fields on multiple racks atomically — a single undo reverts
 * every rack in the batch. Used to keep bayed-group U-numbering in sync (#1520).
 *
 * @param ctx - Layout state access
 * @param targets - rackId → updates pairs; racks that already match are silently skipped
 * @param description - History entry label
 */
export function updateRacksBatchRecorded(
  ctx: LayoutStateAccess,
  targets: {
    rackId: string;
    updates: Partial<Omit<Rack, "devices" | "view">>;
  }[],
  description: string,
): void {
  const adapter = getCommandStoreAdapter(ctx);
  const history = getHistoryStore();
  const commands = [];

  for (const { rackId, updates } of targets) {
    const targetRack = getRackById(ctx, rackId);
    if (!targetRack) continue;

    const before: Partial<Omit<Rack, "devices" | "view">> = {};
    let differs = false;
    for (const key of Object.keys(updates) as (keyof Omit<
      Rack,
      "devices" | "view"
    >)[]) {
      const current = targetRack[key];
      const next = updates[key];
      if (current !== next) {
        differs = true;
      }
      before[key] = current as never;
    }
    if (!differs) continue;

    // Each sub-command sets the active rack first because updateRackRaw
    // targets whichever rack is active.
    const inner = createUpdateRackCommand(before, updates, adapter);
    commands.push({
      type: "UPDATE_RACK" as const,
      description,
      timestamp: Date.now(),
      execute() {
        ctx.setActiveRackId(rackId);
        inner.execute();
      },
      undo() {
        ctx.setActiveRackId(rackId);
        inner.undo();
      },
    });
  }

  if (commands.length === 0) return;

  const batch = createBatchCommand(description, commands);
  history.execute(batch);
  ctx.markDirty();
}

/**
 * Clear rack devices with undo/redo support
 * Uses active rack unless a rackId override is provided
 * @param ctx - Layout state access
 * @param rackId - Optional rack ID override
 */
export function clearRackRecorded(
  ctx: LayoutStateAccess,
  rackId?: string,
): void {
  if (rackId) {
    ctx.setActiveRackId(rackId);
  }
  const target = getTargetRack(ctx);
  if (!target || target.rack.devices.length === 0) return;

  const devices = [...target.rack.devices];
  const history = getHistoryStore();
  const adapter = getCommandStoreAdapter(ctx);

  const command = createClearRackCommand(devices, adapter);
  history.execute(command);
  ctx.markDirty();
}
