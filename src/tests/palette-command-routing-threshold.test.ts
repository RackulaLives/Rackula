import { describe, it, expect } from "vitest";
import {
  getPaletteSearchCommands,
  noConfidentCommandMatch,
  CONFIDENT_COMMAND_MATCH,
} from "$lib/actions/palette-commands";
import type { ActionEnabledContext } from "$lib/actions/registry";

// Locks the device-vs-command routing decision (#2996) against the REAL
// action registry and the REAL bits-ui scorer (via getPaletteSearchCommands
// and noConfidentCommandMatch, no mocking, no browser). #2996's fix hinges on
// a hand-tuned confidence threshold: a query that genuinely names a command
// scores ~0.99, an interior-word/keyword coincidence ("server" inside "...
// Media Server", "device" inside "Toggle device sidebar") scores ~0.89, and
// CONFIDENT_COMMAND_MATCH (0.95) sits between the two bands on purpose. That
// threshold is calibrated to today's registry data - it is not derived from
// any invariant of the scorer - so a future command label/keyword change
// could silently push a device word up past 0.95 (hiding the device bridge)
// or drop a command verb below it (routing Enter into the bridge instead of
// running the command). These tests assert the routing OUTCOME on both sides
// of the boundary so either drift fails CI immediately, without a browser
// round-trip. Server mode is used throughout so both storage-mode-split
// commands (e.g. "Save layout") are present in one context.
const ctx: ActionEnabledContext = {
  hasSelection: false,
  isDeviceSelected: false,
  isRackSelected: false,
  canUndo: false,
  canRedo: false,
  hasRacks: true,
  canMoveDeviceSlot: false,
  mode: "server",
};

const commands = getPaletteSearchCommands(ctx);

describe("noConfidentCommandMatch routing bands (#2996)", () => {
  it(`is set below the two observed bands, so the bands stay well separated (currently ${CONFIDENT_COMMAND_MATCH})`, () => {
    // Not a float pin on the scorer's output - just a sanity bound on the
    // threshold itself, so a change to CONFIDENT_COMMAND_MATCH that broke the
    // "sits between the bands" property would be caught here too.
    expect(CONFIDENT_COMMAND_MATCH).toBeGreaterThan(0.9);
    expect(CONFIDENT_COMMAND_MATCH).toBeLessThan(1);
  });

  describe("device/category queries stay below the threshold (bridge available)", () => {
    it.each(["xserve", "switch", "server", "device", "rack"])(
      "%s does not confidently match any registry command",
      (query) => {
        expect(noConfidentCommandMatch(query, commands)).toBe(true);
      },
    );
  });

  describe("genuine command verbs clear the threshold (bridge suppressed)", () => {
    it.each(["export", "save", "open", "new", "share"])(
      "%s confidently matches a registry command",
      (query) => {
        expect(noConfidentCommandMatch(query, commands)).toBe(false);
      },
    );
  });

  it("never treats an empty/whitespace query as a no-match (that is browse, not #2996)", () => {
    expect(noConfidentCommandMatch("", commands)).toBe(false);
    expect(noConfidentCommandMatch("   ", commands)).toBe(false);
  });
});
