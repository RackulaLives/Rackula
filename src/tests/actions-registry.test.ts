import { describe, it, expect } from "vitest";
import {
  ACTION_REGISTRY,
  getActionById,
  findActionForEvent,
  getHelpGroups,
  getAppMenuSections,
} from "$lib/actions/registry";

/**
 * The actions registry is the single source of truth for command metadata:
 * keyboard shortcuts, the help overlay, and (later) the app menu and verb bars.
 * These tests cover the registry's behaviour - keybinding resolution and
 * help-group generation - not its data contents (which TypeScript validates).
 */

describe("actions registry", () => {
  describe("getActionById", () => {
    it("returns the matching action definition", () => {
      const action = getActionById("undo");
      expect(action?.id).toBe("undo");
    });

    it("returns undefined for an unknown id", () => {
      expect(getActionById("not-a-real-command" as never)).toBeUndefined();
    });

    it("never returns two definitions sharing the same id", () => {
      const ids = ACTION_REGISTRY.map((a) => a.id);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    });
  });

  describe("findActionForEvent (keybinding resolution)", () => {
    it("resolves Ctrl+S to the save action", () => {
      const event = new KeyboardEvent("keydown", { key: "s", ctrlKey: true });
      expect(findActionForEvent(event)?.id).toBe("save");
    });

    it("resolves Cmd+S to the save action (cross-platform)", () => {
      const event = new KeyboardEvent("keydown", { key: "s", metaKey: true });
      expect(findActionForEvent(event)?.id).toBe("save");
    });

    it("resolves Ctrl+Shift+Z to redo, not undo", () => {
      const event = new KeyboardEvent("keydown", {
        key: "z",
        ctrlKey: true,
        shiftKey: true,
      });
      expect(findActionForEvent(event)?.id).toBe("redo");
    });

    it("resolves Ctrl+Z (no shift) to undo, not redo", () => {
      const event = new KeyboardEvent("keydown", { key: "z", ctrlKey: true });
      expect(findActionForEvent(event)?.id).toBe("undo");
    });

    it("resolves bare letter keys without modifiers", () => {
      const event = new KeyboardEvent("keydown", { key: "f" });
      expect(findActionForEvent(event)?.id).toBe("fit-all");
    });

    it("is case-insensitive for letter keys", () => {
      const event = new KeyboardEvent("keydown", { key: "F" });
      expect(findActionForEvent(event)?.id).toBe("fit-all");
    });

    it("does not resolve a bare letter when a modifier is held", () => {
      // Ctrl+F should not trigger the bare 'f' (fit-all) action
      const event = new KeyboardEvent("keydown", { key: "f", ctrlKey: true });
      expect(findActionForEvent(event)).toBeUndefined();
    });

    it("returns undefined when no action matches", () => {
      const event = new KeyboardEvent("keydown", { key: "q", altKey: true });
      expect(findActionForEvent(event)).toBeUndefined();
    });

    it("resolves Escape", () => {
      const event = new KeyboardEvent("keydown", { key: "Escape" });
      expect(findActionForEvent(event)?.id).toBe("escape");
    });

    it("resolves the help key (?) when Shift is held (real keyboard)", () => {
      // On most layouts "?" is Shift+/, so the real keydown reports
      // shiftKey=true. The shortcut must still fire.
      const event = new KeyboardEvent("keydown", { key: "?", shiftKey: true });
      expect(findActionForEvent(event)?.id).toBe("show-help");
    });

    it("resolves the help key (?) without a reported Shift modifier", () => {
      const event = new KeyboardEvent("keydown", { key: "?" });
      expect(findActionForEvent(event)?.id).toBe("show-help");
    });

    it("resolves arrow keys to device movement", () => {
      const up = new KeyboardEvent("keydown", { key: "ArrowUp" });
      expect(findActionForEvent(up)?.id).toBe("move-device-up");
      const down = new KeyboardEvent("keydown", { key: "ArrowDown" });
      expect(findActionForEvent(down)?.id).toBe("move-device-down");
    });
  });

  describe("registry integrity", () => {
    it("every binding's key shape is reproducible by findActionForEvent", () => {
      // For each action that declares a keybinding, an event built from that
      // binding must resolve back to the same action. This guards against a
      // binding being shadowed by an earlier, more permissive one.
      for (const action of ACTION_REGISTRY) {
        for (const binding of action.bindings) {
          const event = new KeyboardEvent("keydown", {
            key: binding.key,
            ctrlKey: binding.ctrl ?? false,
            metaKey: binding.meta ?? false,
            shiftKey: binding.shift ?? false,
          });
          const resolved = findActionForEvent(event);
          expect(
            resolved?.id,
            `binding ${JSON.stringify(binding)} on "${action.id}" resolved to "${resolved?.id}"`,
          ).toBe(action.id);
        }
      }
    });

    it("gates an enabled-when action by the live selection/history context", () => {
      // The predicate is what consumers (verb bars, palette) call to enable or
      // hide a command. Test the gating behaviour, not the field's presence.
      const dup = getActionById("duplicate-selection");
      expect(dup?.enabledWhen).toBeDefined();
      const enabledCtx = {
        hasSelection: true,
        isDeviceSelected: true,
        isRackSelected: false,
        canUndo: false,
        canRedo: false,
        hasRacks: true,
        mode: "browser" as const,
      };
      const disabledCtx = { ...enabledCtx, isDeviceSelected: false };
      expect(dup?.enabledWhen?.(enabledCtx)).toBe(true);
      expect(dup?.enabledWhen?.(disabledCtx)).toBe(false);
    });

    it("gates undo/redo by history availability", () => {
      const undo = getActionById("undo");
      const redo = getActionById("redo");
      const base = {
        hasSelection: false,
        isDeviceSelected: false,
        isRackSelected: false,
        canUndo: false,
        canRedo: false,
        hasRacks: false,
        mode: "browser" as const,
      };
      expect(undo?.enabledWhen?.({ ...base, canUndo: true })).toBe(true);
      expect(undo?.enabledWhen?.(base)).toBe(false);
      expect(redo?.enabledWhen?.({ ...base, canRedo: true })).toBe(true);
      expect(redo?.enabledWhen?.(base)).toBe(false);
    });
  });

  describe("getHelpGroups (help overlay generation)", () => {
    it("groups actions by their help group, preserving group order", () => {
      const groups = getHelpGroups();
      const names = groups.map((g) => g.name);
      // Groups must appear in a stable, declared order.
      expect(names).toEqual([...new Set(names)]);
      expect(groups.length).toBeGreaterThan(0);
    });

    it("only includes registry actions flagged for the help overlay", () => {
      const groups = getHelpGroups();
      const shownLabels = new Set(
        groups.flatMap((g) => g.rows.map((r) => r.action)),
      );
      // Every help-flagged registry action with a renderable key appears.
      const helpActions = ACTION_REGISTRY.filter(
        (a) => a.helpGroup && (a.bindings.length > 0 || a.helpKeyLabel),
      );
      for (const action of helpActions) {
        expect(shownLabels.has(action.label)).toBe(true);
      }
      // Actions without a help group must NOT appear (e.g. toggle-sidebar).
      const hiddenAction = ACTION_REGISTRY.find((a) => !a.helpGroup);
      expect(hiddenAction).toBeDefined();
      expect(shownLabels.has(hiddenAction!.label)).toBe(false);
    });

    it("formats the displayed key from the action's primary binding", () => {
      const groups = getHelpGroups();
      const saveRow = groups
        .flatMap((g) => g.rows)
        .find((r) => r.action.toLowerCase().includes("save layout"));
      expect(saveRow).toBeDefined();
      // The mod key formats to Ctrl or Cmd; we just assert it includes "S".
      expect(saveRow?.key).toContain("S");
    });

    it("supports display-only help rows that have no real keybinding", () => {
      // e.g. "Scroll Wheel" -> "Zoom" is documented in help but is not a
      // keydown shortcut, so it carries a helpKeyLabel instead of bindings.
      const groups = getHelpGroups();
      const allRows = groups.flatMap((g) => g.rows);
      const scrollRow = allRows.find((r) =>
        r.action.toLowerCase().includes("zoom"),
      );
      expect(scrollRow).toBeDefined();
      expect(scrollRow?.key).toBeTruthy();
    });
  });

  describe("getAppMenuSections (app menu projection)", () => {
    it("projects only registry actions flagged for the app menu", () => {
      // Every item the menu shows must trace back to a registered action, so
      // the menu and the keyboard handler cannot drift apart.
      const sections = getAppMenuSections("browser");
      const ids = sections.flatMap((s) => s.items.map((i) => i.id));
      for (const id of ids) {
        const action = getActionById(id);
        expect(
          action,
          `menu item "${id}" has no registry action`,
        ).toBeDefined();
        expect(action?.appMenuGroup).toBeDefined();
      }
    });

    it("shows each app-menu action exactly once within a mode", () => {
      for (const mode of ["browser", "server"] as const) {
        const ids = getAppMenuSections(mode).flatMap((s) =>
          s.items.map((i) => i.id),
        );
        // No action appears twice in a given mode's menu.
        expect(ids.length).toBe(new Set(ids).size);
      }
    });

    it("covers every app-menu action across the two storage modes", () => {
      // Mode-exclusive items (browser-only export, server-only save) mean no
      // single mode is the full superset, but their union must be.
      const browserIds = getAppMenuSections("browser").flatMap((s) =>
        s.items.map((i) => i.id),
      );
      const serverIds = getAppMenuSections("server").flatMap((s) =>
        s.items.map((i) => i.id),
      );
      const union = new Set([...browserIds, ...serverIds]);
      const appMenuActionIds = ACTION_REGISTRY.filter(
        (a) => a.appMenuGroup,
      ).map((a) => a.id);
      expect(union).toEqual(new Set(appMenuActionIds));
    });

    it("omits server-only Save and Save As in browser mode", () => {
      const ids = getAppMenuSections("browser").flatMap((s) =>
        s.items.map((i) => i.id),
      );
      expect(ids).not.toContain("save");
      expect(ids).not.toContain("save-as");
    });

    it("adds Save and Save As in server mode", () => {
      const ids = getAppMenuSections("server").flatMap((s) =>
        s.items.map((i) => i.id),
      );
      expect(ids).toContain("save");
      expect(ids).toContain("save-as");
    });

    it("leads the browser file section with Export backup, not Save", () => {
      // Spec: the browser build leads with Export backup.
      const fileSection = getAppMenuSections("browser").find(
        (s) => s.group === "file",
      );
      expect(fileSection).toBeDefined();
      expect(fileSection?.items[0]?.id).toBe("export-backup");
    });

    it("carries the registry label and platform shortcut for each item", () => {
      const sections = getAppMenuSections("server");
      const save = sections
        .flatMap((s) => s.items)
        .find((i) => i.id === "save");
      expect(save?.label).toBe(getActionById("save")?.label);
      // mod+S formats to Ctrl+S or Cmd+S; we just assert the key letter shows.
      expect(save?.shortcut).toContain("S");
    });

    it("leaves shortcut undefined for actions with no keybinding", () => {
      const sections = getAppMenuSections("browser");
      const viewYaml = sections
        .flatMap((s) => s.items)
        .find((i) => i.id === "view-yaml");
      expect(viewYaml).toBeDefined();
      expect(viewYaml?.shortcut).toBeUndefined();
    });

    it("groups items into named sections in a stable order", () => {
      const sections = getAppMenuSections("browser");
      const groups = sections.map((s) => s.group);
      // Sections appear once each, in declared order.
      expect(groups).toEqual([...new Set(groups)]);
      expect(sections.length).toBeGreaterThan(0);
    });
  });

  describe("getAppMenuSections (mode-aware item enable/disable)", () => {
    // The app menu is the first runtime consumer of enabledWhen. It passes a
    // live context (rack presence, storage mode, selection/history) and the
    // registry decides which items are runnable. Disabled items stay in the
    // menu (accessible, greyed) rather than disappearing.
    const fullContext = {
      hasSelection: false,
      isDeviceSelected: false,
      isRackSelected: false,
      canUndo: false,
      canRedo: false,
      hasRacks: true,
      mode: "browser" as const,
    };

    it("leaves items enabled when no enable context is supplied", () => {
      // The signature stays backwards compatible: called with a mode alone,
      // every projected item is enabled (no disabled flag set true).
      const sections = getAppMenuSections("browser");
      const disabled = sections
        .flatMap((s) => s.items)
        .filter((i) => i.disabled);
      expect(disabled.length).toBe(0);
    });

    it("disables rack-dependent items when no racks exist", () => {
      // share and view-yaml need a rack to act on; with no racks they are
      // present but disabled, matching the prior FileMenu/AppMenu behaviour.
      const sections = getAppMenuSections("browser", {
        ...fullContext,
        hasRacks: false,
      });
      const items = sections.flatMap((s) => s.items);
      const share = items.find((i) => i.id === "share");
      const viewYaml = items.find((i) => i.id === "view-yaml");
      expect(share?.disabled).toBe(true);
      expect(viewYaml?.disabled).toBe(true);
    });

    it("enables rack-dependent items when at least one rack exists", () => {
      const sections = getAppMenuSections("browser", {
        ...fullContext,
        hasRacks: true,
      });
      const items = sections.flatMap((s) => s.items);
      expect(items.find((i) => i.id === "share")?.disabled).toBe(false);
      expect(items.find((i) => i.id === "view-yaml")?.disabled).toBe(false);
    });

    it("never disables items that declare no enable predicate", () => {
      // new-layout, import-devices, etc. have no enabledWhen, so they stay
      // enabled regardless of rack presence.
      const sections = getAppMenuSections("browser", {
        ...fullContext,
        hasRacks: false,
      });
      const items = sections.flatMap((s) => s.items);
      const newLayout = items.find((i) => i.id === "new-layout");
      const importDevices = items.find((i) => i.id === "import-devices");
      expect(newLayout?.disabled).toBe(false);
      expect(importDevices?.disabled).toBe(false);
    });

    it("disables but does not hide rack-dependent items", () => {
      // Disabled items remain in the projection so the menu stays accessible
      // (bits-ui renders them aria-disabled), rather than vanishing.
      const ids = getAppMenuSections("browser", {
        ...fullContext,
        hasRacks: false,
      }).flatMap((s) => s.items.map((i) => i.id));
      expect(ids).toContain("share");
      expect(ids).toContain("view-yaml");
    });
  });

  describe("rack-dependent enable predicates", () => {
    const base = {
      hasSelection: false,
      isDeviceSelected: false,
      isRackSelected: false,
      canUndo: false,
      canRedo: false,
      hasRacks: false,
      mode: "browser" as const,
    };

    it("gates share on rack presence", () => {
      const share = getActionById("share");
      expect(share?.enabledWhen).toBeDefined();
      expect(share?.enabledWhen?.({ ...base, hasRacks: true })).toBe(true);
      expect(share?.enabledWhen?.({ ...base, hasRacks: false })).toBe(false);
    });

    it("gates view-yaml on rack presence", () => {
      const viewYaml = getActionById("view-yaml");
      expect(viewYaml?.enabledWhen).toBeDefined();
      expect(viewYaml?.enabledWhen?.({ ...base, hasRacks: true })).toBe(true);
      expect(viewYaml?.enabledWhen?.({ ...base, hasRacks: false })).toBe(false);
    });
  });

  describe("scope classification", () => {
    it("classifies every action into a known scope", () => {
      const scopes = new Set(ACTION_REGISTRY.map((a) => a.scope));
      for (const scope of scopes) {
        expect(["global", "layout", "selection"]).toContain(scope);
      }
    });

    it("exposes save as a global-scope action", () => {
      const save = getActionById("save");
      expect(save).toBeDefined();
      expect(save?.scope).toBe("global");
    });

    it("exposes duplicate as a selection-scope action", () => {
      const dup = getActionById("duplicate-selection");
      expect(dup).toBeDefined();
      expect(dup?.scope).toBe("selection");
    });
  });
});
