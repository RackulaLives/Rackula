import { describe, it, expect } from "vitest";
import {
  getPaletteCommands,
  getPaletteEmptyState,
  getPaletteSearchCommands,
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
  canMoveDeviceSlot: false,
};

function ids(ctx: ActionEnabledContext): string[] {
  return getPaletteCommands(ctx).flatMap((g) => g.commands.map((c) => c.id));
}

// The unified palette grouping scheme (#2775), in display order. Mirrors the
// private PALETTE_GROUP_ORDER in palette-commands.ts; kept here so the test
// pins the contract rather than re-importing an internal.
const UNIFIED_GROUP_ORDER = [
  "Selection",
  "Create / Add device",
  "Navigation / View",
  "File / Document",
  "Devices",
  "Workspace",
  "App",
];

function headings(ctx: ActionEnabledContext): string[] {
  return getPaletteCommands(ctx).map((g) => g.heading);
}

function idsInGroup(ctx: ActionEnabledContext, heading: string): string[] {
  return (
    getPaletteCommands(ctx)
      .find((g) => g.heading === heading)
      ?.commands.map((c) => c.id) ?? []
  );
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

  it("lists import-devices now that its trigger is module-dispatchable", () => {
    expect(ids(baseCtx)).toContain("import-devices");
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

  it("hides rack-cycling commands in browse until there are 2+ racks", () => {
    // baseCtx has one rack (hasMultipleRacks undefined): cycle-rack is hidden.
    expect(ids(baseCtx)).not.toContain("cycle-rack-prev");
    expect(ids(baseCtx)).not.toContain("cycle-rack-next");
    const multi = { ...baseCtx, hasMultipleRacks: true };
    expect(ids(multi)).toContain("cycle-rack-prev");
    expect(ids(multi)).toContain("cycle-rack-next");
  });
});

describe("getPaletteCommands unified grouping (#2775)", () => {
  it("places every command under a known group (no Other bucket)", () => {
    for (const heading of headings(baseCtx)) {
      expect(UNIFIED_GROUP_ORDER).toContain(heading);
    }
    expect(headings(baseCtx)).not.toContain("Other");
  });

  it("orders groups context -> frequency -> admin", () => {
    const indices = headings(baseCtx).map((h) =>
      UNIFIED_GROUP_ORDER.indexOf(h),
    );
    const ascending = [...indices].sort((a, b) => a - b);
    expect(indices).toEqual(ascending);
  });

  it("folds the former app-menu-only actions into the palette", () => {
    const list = ids(baseCtx); // browser mode
    for (const id of [
      "new-layout",
      "load",
      "import-devices",
      "import-netbox",
      "new-custom-device",
      "restore-file",
      "view-yaml",
      "export-backup",
      "export-all",
      "settings",
    ]) {
      expect(list).toContain(id);
    }
  });

  it("groups New custom device under Create, not Devices", () => {
    expect(idsInGroup(baseCtx, "Create / Add device")).toContain(
      "new-custom-device",
    );
    expect(idsInGroup(baseCtx, "Devices")).not.toContain("new-custom-device");
  });

  it("keeps Settings searchable under App", () => {
    expect(idsInGroup(baseCtx, "App")).toContain("settings");
  });

  it("shows only the browser save variant in browser mode", () => {
    const list = ids({ ...baseCtx, mode: "browser" });
    expect(list).toContain("export-backup");
    expect(list).not.toContain("save-as");
    expect(list).not.toContain("save");
  });

  it("shows only the server save variants in server mode", () => {
    const list = ids({ ...baseCtx, mode: "server" });
    expect(list).toContain("save-as");
    expect(list).toContain("save");
    expect(list).not.toContain("export-backup");
  });

  it("never shows both the server and browser save variants at once", () => {
    for (const mode of ["browser", "server"] as const) {
      const list = ids({ ...baseCtx, mode });
      expect(list.includes("save-as") && list.includes("export-backup")).toBe(
        false,
      );
    }
  });

  it("lists each command at most once (no duplicated rows)", () => {
    const list = ids(baseCtx);
    const duplicates = list.filter((id, i) => list.indexOf(id) !== i);
    // eslint-disable-next-line no-restricted-syntax -- behavioral invariant: the projection must list each command id at most once, so there are no duplicates
    expect(duplicates).toHaveLength(0);
  });

  it("lists Export image exactly once", () => {
    const exportRows = ids(baseCtx).filter((id) => id === "export");
    // eslint-disable-next-line no-restricted-syntax -- behavioral invariant: Export image must surface exactly once across all palette groups
    expect(exportRows).toHaveLength(1);
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

// The browse list hides context-gated commands; the search list keeps them,
// greyed with a reason, so search stays honest while browse stays short (#2778,
// rule 10). These tests pin that browse-hides / search-reveals-disabled split.
describe("getPaletteSearchCommands (#2778)", () => {
  function find(ctx: ActionEnabledContext, id: ActionId) {
    return getPaletteSearchCommands(ctx).find((c) => c.id === id);
  }

  it("includes runnable commands with no disabled reason", () => {
    const fitAll = find(baseCtx, "fit-all");
    expect(fitAll).toBeDefined();
    expect(fitAll?.disabledReason).toBeUndefined();
  });

  it("reveals selection verbs greyed with a reason when nothing is selected", () => {
    // Browse hides them; search keeps them disabled with "select gear first".
    expect(ids(baseCtx)).not.toContain("delete-selection");
    const del = find(baseCtx, "delete-selection");
    expect(del).toBeDefined();
    expect(del?.disabledReason).toBe("select gear first");
  });

  it("uses a neutral reason for a selection verb that does not fit the current selection", () => {
    // A rack is selected, so "select gear first" would be misleading for a
    // device-only verb; the reason must be neutral instead.
    const rackSelected = {
      ...baseCtx,
      hasSelection: true,
      isRackSelected: true,
    };
    expect(find(rackSelected, "move-device-up")?.disabledReason).toBe(
      "unavailable here",
    );
  });

  it("reveals rack-gated globals greyed with a reason when no rack exists", () => {
    const noRack = { ...baseCtx, hasRacks: false };
    expect(find(noRack, "share")?.disabledReason).toBe("needs a rack");
    expect(find(noRack, "view-yaml")?.disabledReason).toBe("needs a rack");
  });

  it("reveals rack-cycling greyed with a reason when there are fewer than 2 racks", () => {
    expect(find(baseCtx, "cycle-rack-next")?.disabledReason).toBe(
      "needs 2 or more racks",
    );
  });

  it("labels history commands by history, not by rack, when greyed", () => {
    // Undo/Redo are global with a rack present but no history: the blocker is
    // empty history, not a missing rack, so the reason must say so.
    expect(find(baseCtx, "undo")?.disabledReason).toBe("nothing to undo");
    expect(find(baseCtx, "redo")?.disabledReason).toBe("nothing to redo");
  });

  it("greys mutating verbs with a read-only reason when the layout is locked", () => {
    // A selection exists but the layout is locked: the blocker is the lock, so
    // the reason is read-only rather than the selection one.
    const locked = { ...baseCtx, hasSelection: true, readOnly: true };
    expect(find(locked, "delete-selection")?.disabledReason).toBe("read-only");
  });

  it("never includes the wrong-mode storage variant, even greyed", () => {
    // The browser build offers export-backup; Save / Save As (server-only) must
    // not appear at all, not even as a greyed row.
    const browserIds = getPaletteSearchCommands(baseCtx).map((c) => c.id);
    expect(browserIds).toContain("export-backup");
    expect(browserIds).not.toContain("save");
    expect(browserIds).not.toContain("save-as");
  });

  it("excludes the non-pickable actions (command-palette, escape)", () => {
    const searchIds = getPaletteSearchCommands(baseCtx).map((c) => c.id);
    expect(searchIds).not.toContain("command-palette");
    expect(searchIds).not.toContain("escape");
  });
});
