import { describe, it, expect } from "vitest";
import {
  getPaletteCommands,
  getPaletteEmptyState,
} from "$lib/actions/palette-commands";
import type { ActionEnabledContext, ActionId } from "$lib/actions/registry";

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

function emptyStateIds(
  ctx: ActionEnabledContext,
  recents: ActionId[],
): { recent: string[]; selection: string[]; commands: string[] } {
  const state = getPaletteEmptyState(ctx, recents);
  return {
    recent: state.recent.map((c) => c.id),
    selection: state.selection.map((c) => c.id),
    commands: state.commands.flatMap((g) => g.commands.map((c) => c.id)),
  };
}

describe("getPaletteEmptyState", () => {
  it("maps recents to commands in MRU order", () => {
    expect(emptyStateIds(baseCtx, ["share", "fit-all"]).recent).toEqual([
      "share",
      "fit-all",
    ]);
  });

  it("drops recents that are not currently included (enabledWhen fails)", () => {
    expect(
      emptyStateIds({ ...baseCtx, hasRacks: false }, ["share", "fit-all"])
        .recent,
    ).toEqual(["fit-all"]);
  });

  it("drops recents that are excluded from the palette", () => {
    const { recent } = emptyStateIds(baseCtx, ["command-palette", "fit-all"]);
    expect(recent).not.toContain("command-palette");
    expect(recent).toContain("fit-all");
  });

  it("surfaces only the enabled selection verbs for a selected device", () => {
    const ctx = { ...baseCtx, hasSelection: true, isDeviceSelected: true };
    const { selection } = emptyStateIds(ctx, []);
    expect(selection).toContain("duplicate-selection");
    expect(selection).toContain("move-device-up");
    expect(selection).toContain("delete-selection");
    expect(selection).not.toContain("focus-rack");
    expect(selection).not.toContain("export-rack");
  });

  it("shows no selection verbs when nothing is selected", () => {
    expect(emptyStateIds(baseCtx, []).selection).toEqual([]);
  });

  it("is never blank: commands list is non-empty with no recents or selection", () => {
    expect(emptyStateIds(baseCtx, []).commands.length).toBeGreaterThan(0);
  });

  it("does not duplicate an id across recent/selection and the commands list", () => {
    const ctx = { ...baseCtx, hasSelection: true, isDeviceSelected: true };
    const { recent, selection, commands } = emptyStateIds(ctx, ["fit-all"]);
    for (const id of [...recent, ...selection]) {
      expect(commands).not.toContain(id);
    }
  });
});
