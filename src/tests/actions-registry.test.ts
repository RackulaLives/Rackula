import { describe, it, expect } from "vitest";
import {
  ACTION_REGISTRY,
  getActionById,
  getActionTooltip,
  findActionForEvent,
  getHelpGroups,
} from "$lib/actions/registry";

/**
 * The actions registry is the single source of truth for command metadata:
 * keyboard shortcuts, the help overlay, and the command palette projection.
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

    it("resolves Ctrl+K to the command palette", () => {
      const event = new KeyboardEvent("keydown", { key: "k", ctrlKey: true });
      expect(findActionForEvent(event)?.id).toBe("command-palette");
    });

    it("resolves Cmd+K to the command palette (cross-platform)", () => {
      const event = new KeyboardEvent("keydown", { key: "k", metaKey: true });
      expect(findActionForEvent(event)?.id).toBe("command-palette");
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
        canMoveDeviceSlot: false,
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
        canMoveDeviceSlot: false,
      };
      expect(undo?.enabledWhen?.({ ...base, canUndo: true })).toBe(true);
      expect(undo?.enabledWhen?.(base)).toBe(false);
      expect(redo?.enabledWhen?.({ ...base, canRedo: true })).toBe(true);
      expect(redo?.enabledWhen?.(base)).toBe(false);
    });
  });

  describe("getHelpGroups (help overlay generation)", () => {
    it("includes a shortcut row for every keybound, help-flagged registry action (#3000)", () => {
      // Generated from the registry, not a hand-maintained list: every action
      // that declares both a helpGroup and a binding must surface as a row, so
      // the help panel cannot drift from the actual keybindings.
      const rows = getHelpGroups().flatMap((g) => g.rows);
      const shownLabels = new Set(rows.map((r) => r.action));

      const keyboundHelpActions = ACTION_REGISTRY.filter(
        (a) => a.bindings.length > 0,
      );
      expect(keyboundHelpActions.length).toBeGreaterThan(0);
      for (const action of keyboundHelpActions) {
        expect(shownLabels.has(action.label)).toBe(true);
      }

      // No row exists for a help-flagged action without any binding: showing
      // one would be a lie (nothing to press).
      const unboundHelpActions = ACTION_REGISTRY.filter(
        (a) => a.helpGroup && a.bindings.length === 0,
      );
      for (const action of unboundHelpActions) {
        expect(shownLabels.has(action.label)).toBe(false);
      }
    });

    it("formats a generated row's key the same way the registry tooltip does", () => {
      const rows = getHelpGroups().flatMap((g) => g.rows);
      const saveRow = rows.find((r) => r.action === "Save layout");
      expect(saveRow?.key).toBe(getActionTooltip("save")?.shortcut);
    });

    it("groups keyboard shortcuts under their declared help group, ahead of the canvas gestures", () => {
      const groups = getHelpGroups();
      const names = groups.map((g) => g.name);
      // Keyboard groups render before the mouse-gesture section, and only
      // groups with at least one row appear.
      expect(names).toContain("Navigation");
      expect(names).toContain("Editing");
      expect(names).toContain("File");
      expect(names[names.length - 1]).toBe("Canvas");
      expect(names.indexOf("Canvas")).toBeGreaterThan(names.indexOf("File"));

      const zoomRow = groups
        .flatMap((g) => g.rows)
        .find((r) => r.action.toLowerCase().includes("zoom"));
      expect(zoomRow).toBeDefined();
      expect(zoomRow?.key).toBeTruthy();
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
      canMoveDeviceSlot: false,
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

  describe("getActionTooltip (registry-driven tooltip content)", () => {
    it("returns the action label as the tooltip text", () => {
      const tooltip = getActionTooltip("toggle-display-mode");
      expect(tooltip?.label).toBe(getActionById("toggle-display-mode")?.label);
    });

    it("includes the primary key for an action with a bare-key binding", () => {
      // toggle-display-mode binds the single key "i"; the badge shows it
      // uppercased with no modifier.
      const tooltip = getActionTooltip("toggle-display-mode");
      expect(tooltip?.shortcut).toBe("I");
    });

    it("includes a modifier for an action with a chorded binding", () => {
      // duplicate-selection binds mod+D; the formatted shortcut carries the
      // platform modifier label and the key, joined as "<mod> + D".
      const tooltip = getActionTooltip("duplicate-selection");
      expect(tooltip?.shortcut).toMatch(/ \+ D$/);
    });

    it("omits the shortcut for an action with no binding", () => {
      // flip-device-face has no keyboard binding, so the tooltip is label-only.
      const flip = getActionById("flip-device-face");
      expect(flip?.bindings.length).toBe(0);
      const tooltip = getActionTooltip("flip-device-face");
      expect(tooltip?.label).toBe(flip?.label);
      expect(tooltip?.shortcut).toBeUndefined();
    });

    it("returns undefined for an unknown id", () => {
      expect(getActionTooltip("not-a-real-command" as never)).toBeUndefined();
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
