import { describe, it, expect } from "vitest";
import { getPaletteCommands } from "$lib/actions/palette-commands";
import type { ActionEnabledContext } from "$lib/actions/registry";

const baseCtx: ActionEnabledContext = {
  hasSelection: false,
  isDeviceSelected: false,
  isRackSelected: false,
  canUndo: false,
  canRedo: false,
  hasRacks: true,
  mode: "browser",
};

function ids(ctx: ActionEnabledContext): string[] {
  return getPaletteCommands(ctx).flatMap((g) => g.commands.map((c) => c.id));
}

describe("getPaletteCommands", () => {
  it("always includes global and layout commands", () => {
    const list = ids(baseCtx);
    expect(list).toContain("fit-all"); // layout
    expect(list).toContain("share"); // global (hasRacks satisfies its predicate)
  });

  it("excludes the command-palette command itself", () => {
    expect(ids(baseCtx)).not.toContain("command-palette");
  });

  it("excludes import-devices (component-owned trigger, not module-dispatchable)", () => {
    expect(ids(baseCtx)).not.toContain("import-devices");
  });

  it("hides selection commands when nothing is selected", () => {
    expect(ids(baseCtx)).not.toContain("duplicate-selection");
    expect(ids(baseCtx)).not.toContain("delete-selection");
  });

  it("shows device selection commands when a device is selected", () => {
    const ctx = {
      ...baseCtx,
      hasSelection: true,
      isDeviceSelected: true,
    };
    const list = ids(ctx);
    expect(list).toContain("duplicate-selection");
    expect(list).toContain("move-device-up");
  });

  it("gates global commands by their own enabledWhen too", () => {
    // share needs a rack; with no racks it is hidden from the palette.
    expect(ids({ ...baseCtx, hasRacks: false })).not.toContain("share");
  });
});
