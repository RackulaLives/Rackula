import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import {
  shouldIgnoreKeyboard,
  matchesShortcut,
  type ShortcutHandler,
} from "$lib/utils/keyboard";
import KeyboardHandler from "$lib/components/KeyboardHandler.svelte";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import {
  getWorkspaceStore,
  resetWorkspaceStore,
} from "$lib/stores/workspace.svelte";
import { createLayout } from "$lib/utils/serialization";
import {
  getSelectionStore,
  resetSelectionStore,
} from "$lib/stores/selection.svelte";
import { getUIStore, resetUIStore } from "$lib/stores/ui.svelte";
import { dialogStore } from "$lib/stores/dialogs.svelte";
import * as appActions from "$lib/utils/app-actions";
import * as dialogActions from "$lib/utils/dialog-actions";
import * as storage from "$lib/storage";
import { CATEGORY_COLOURS } from "$lib/types/constants";
import { UNITS_PER_U, toInternalUnits } from "$lib/utils/position";
import { setupStoreWithRack, createBladeContainerWithChild } from "./factories";

describe("Keyboard Utilities", () => {
  describe("shouldIgnoreKeyboard", () => {
    it("returns true when focus is in input", () => {
      const input = document.createElement("input");
      document.body.appendChild(input);
      input.focus();

      const event = new KeyboardEvent("keydown", { key: "Delete" });
      Object.defineProperty(event, "target", { value: input });

      expect(shouldIgnoreKeyboard(event)).toBe(true);

      document.body.removeChild(input);
    });

    it("returns true when focus is in textarea", () => {
      const textarea = document.createElement("textarea");
      document.body.appendChild(textarea);
      textarea.focus();

      const event = new KeyboardEvent("keydown", { key: "Delete" });
      Object.defineProperty(event, "target", { value: textarea });

      expect(shouldIgnoreKeyboard(event)).toBe(true);

      document.body.removeChild(textarea);
    });

    it("returns true when focus is in contenteditable", () => {
      const div = document.createElement("div");
      // Manually set isContentEditable since jsdom doesn't handle it well
      Object.defineProperty(div, "isContentEditable", { value: true });
      document.body.appendChild(div);
      div.focus();

      const event = new KeyboardEvent("keydown", { key: "Delete" });
      Object.defineProperty(event, "target", { value: div });

      expect(shouldIgnoreKeyboard(event)).toBe(true);

      document.body.removeChild(div);
    });

    it("returns false for regular elements", () => {
      const div = document.createElement("div");
      const event = new KeyboardEvent("keydown", { key: "Delete" });
      Object.defineProperty(event, "target", { value: div });

      expect(shouldIgnoreKeyboard(event)).toBe(false);
    });
  });

  describe("matchesShortcut", () => {
    it("matches simple key", () => {
      const shortcut: ShortcutHandler = {
        key: "Delete",
        action: () => {},
      };
      const event = new KeyboardEvent("keydown", { key: "Delete" });

      expect(matchesShortcut(event, shortcut)).toBe(true);
    });

    it("matches key with ctrl modifier", () => {
      const shortcut: ShortcutHandler = {
        key: "s",
        ctrl: true,
        action: () => {},
      };
      const event = new KeyboardEvent("keydown", { key: "s", ctrlKey: true });

      expect(matchesShortcut(event, shortcut)).toBe(true);
    });

    it("matches key with meta modifier (Cmd)", () => {
      const shortcut: ShortcutHandler = {
        key: "s",
        meta: true,
        action: () => {},
      };
      const event = new KeyboardEvent("keydown", { key: "s", metaKey: true });

      expect(matchesShortcut(event, shortcut)).toBe(true);
    });

    it("does not match when modifier missing", () => {
      const shortcut: ShortcutHandler = {
        key: "s",
        ctrl: true,
        action: () => {},
      };
      const event = new KeyboardEvent("keydown", { key: "s" });

      expect(matchesShortcut(event, shortcut)).toBe(false);
    });

    it("does not match when key is different", () => {
      const shortcut: ShortcutHandler = {
        key: "Delete",
        action: () => {},
      };
      const event = new KeyboardEvent("keydown", { key: "Backspace" });

      expect(matchesShortcut(event, shortcut)).toBe(false);
    });

    it("is case-insensitive for letter keys", () => {
      const shortcut: ShortcutHandler = {
        key: "d",
        action: () => {},
      };
      const event = new KeyboardEvent("keydown", { key: "D" });

      expect(matchesShortcut(event, shortcut)).toBe(true);
    });
  });
});

describe("KeyboardHandler Component", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetSelectionStore();
    resetUIStore();
    dialogStore.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    dialogStore.close();
  });

  describe("Selection Shortcuts", () => {
    it("Escape key clears selection", async () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();

      const rack = layoutStore.addRack("Test Rack", 42);
      selectionStore.selectRack(rack!.id);
      expect(selectionStore.hasSelection).toBe(true);

      render(KeyboardHandler);

      await fireEvent.keyDown(window, { key: "Escape" });

      expect(selectionStore.hasSelection).toBe(false);
    });
  });

  describe("Device Movement Shortcuts", () => {
    it("ArrowUp moves selected device up 1U", async () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();

      // Setup: rack with device at position 5
      const rack = layoutStore.addRack("Test Rack", 42);
      const rackId = rack!.id;
      const deviceType = layoutStore.addDeviceType({
        name: "Test Server",
        u_height: 1,
        category: "server",
        colour: CATEGORY_COLOURS.server,
      });
      layoutStore.placeDevice(rackId, deviceType.slug, 5);

      // Select the device by ID
      const deviceId = layoutStore.rack!.devices[0]!.id;
      selectionStore.selectDevice(rackId, deviceId);

      render(KeyboardHandler);

      const initialPosition = layoutStore.rack!.devices[0]!.position;
      await fireEvent.keyDown(window, { key: "ArrowUp" });

      // Device should move up (higher U number) - 1U device moves by 1U = UNITS_PER_U internal units
      expect(layoutStore.rack!.devices[0]!.position).toBe(
        initialPosition + UNITS_PER_U,
      );
    });

    it("ArrowDown moves selected device down 1U", async () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();

      // Setup: rack with device at position 5
      const rack = layoutStore.addRack("Test Rack", 42);
      const rackId = rack!.id;
      const deviceType = layoutStore.addDeviceType({
        name: "Test Server",
        u_height: 1,
        category: "server",
        colour: CATEGORY_COLOURS.server,
      });
      layoutStore.placeDevice(rackId, deviceType.slug, 5);

      // Select the device by ID
      const deviceId = layoutStore.rack!.devices[0]!.id;
      selectionStore.selectDevice(rackId, deviceId);

      render(KeyboardHandler);

      const initialPosition = layoutStore.rack!.devices[0]!.position;
      await fireEvent.keyDown(window, { key: "ArrowDown" });

      // Device should move down (lower U number) - 1U device moves by 1U = UNITS_PER_U internal units
      expect(layoutStore.rack!.devices[0]!.position).toBe(
        initialPosition - UNITS_PER_U,
      );
    });

    it("ArrowDown does not move device below U1", async () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();

      // Setup: rack with device at position 1 (bottom)
      const rack = layoutStore.addRack("Test Rack", 42);
      const rackId = rack!.id;
      const deviceType = layoutStore.addDeviceType({
        name: "Test Server",
        u_height: 1,
        category: "server",
        colour: CATEGORY_COLOURS.server,
      });
      layoutStore.placeDevice(rackId, deviceType.slug, 1);

      // Select the device by ID
      const deviceId = layoutStore.rack!.devices[0]!.id;
      selectionStore.selectDevice(rackId, deviceId);

      render(KeyboardHandler);

      await fireEvent.keyDown(window, { key: "ArrowDown" });

      // Device should stay at position U1 (internal units = UNITS_PER_U)
      expect(layoutStore.rack!.devices[0]!.position).toBe(UNITS_PER_U);
    });
  });

  describe("UI Shortcuts", () => {
    it("D key toggles device palette", async () => {
      const uiStore = getUIStore();
      const initialState = uiStore.leftDrawerOpen;

      render(KeyboardHandler);

      await fireEvent.keyDown(window, { key: "d" });

      expect(uiStore.leftDrawerOpen).toBe(!initialState);
    });

    it("F key triggers fit all", async () => {
      const spy = vi
        .spyOn(appActions, "handleFitAll")
        .mockReturnValue(undefined);

      render(KeyboardHandler);

      await fireEvent.keyDown(window, { key: "f" });

      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe("Modifier Key Shortcuts", () => {
    it("Ctrl+S triggers save", async () => {
      const spy = vi.spyOn(appActions, "maybeSave").mockReturnValue(undefined);

      render(KeyboardHandler);

      await fireEvent.keyDown(window, { key: "s", ctrlKey: true });

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it("Cmd+S triggers save (Mac)", async () => {
      const spy = vi.spyOn(appActions, "maybeSave").mockReturnValue(undefined);

      render(KeyboardHandler);

      await fireEvent.keyDown(window, { key: "s", metaKey: true });

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it("Ctrl+O triggers load", async () => {
      const spy = vi.spyOn(storage, "handleLoad").mockResolvedValue(undefined);

      render(KeyboardHandler);

      await fireEvent.keyDown(window, { key: "o", ctrlKey: true });

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it("Ctrl+E triggers export", async () => {
      const spy = vi
        .spyOn(appActions, "maybeExport")
        .mockReturnValue(undefined);

      render(KeyboardHandler);

      await fireEvent.keyDown(window, { key: "e", ctrlKey: true });

      expect(spy).toHaveBeenCalledTimes(1);
    });

    // Ctrl/Cmd+D duplicates selected rack (multi-rack mode since v0.6.0)
    it("Ctrl+D duplicates selected rack", async () => {
      const { store: layoutStore, rack } = setupStoreWithRack();
      const selectionStore = getSelectionStore();

      selectionStore.selectRack(rack.id);
      const initialCount = layoutStore.rackCount;

      render(KeyboardHandler);

      await fireEvent.keyDown(window, { key: "d", ctrlKey: true });

      // Rack should be duplicated
      expect(layoutStore.rackCount).toBe(initialCount + 1);
    });

    it("Cmd+D duplicates selected rack (Mac)", async () => {
      const { store: layoutStore, rack } = setupStoreWithRack();
      const selectionStore = getSelectionStore();

      selectionStore.selectRack(rack.id);
      const initialCount = layoutStore.rackCount;

      render(KeyboardHandler);

      await fireEvent.keyDown(window, { key: "d", metaKey: true });

      // Rack should be duplicated
      expect(layoutStore.rackCount).toBe(initialCount + 1);
    });
  });

  describe("Ignore in Input Fields", () => {
    it("does not handle shortcuts when typing in input", async () => {
      const uiStore = getUIStore();
      const initialState = uiStore.leftDrawerOpen;

      render(KeyboardHandler);

      // Create an input and focus it
      const input = document.createElement("input");
      document.body.appendChild(input);
      input.focus();

      // Simulate keydown with input as target
      const event = new KeyboardEvent("keydown", {
        key: "d",
        bubbles: true,
      });
      Object.defineProperty(event, "target", { value: input });
      window.dispatchEvent(event);

      // Drawer should not toggle
      expect(uiStore.leftDrawerOpen).toBe(initialState);

      document.body.removeChild(input);
    });
  });

  describe("Display Mode Toggle", () => {
    it("I key toggles display mode", async () => {
      const uiStore = getUIStore();
      const initialMode = uiStore.displayMode;

      render(KeyboardHandler);

      await fireEvent.keyDown(window, { key: "i" });

      expect(uiStore.displayMode).not.toBe(initialMode);
    });

    it("I key is case insensitive", async () => {
      const uiStore = getUIStore();
      const initialMode = uiStore.displayMode;

      render(KeyboardHandler);

      await fireEvent.keyDown(window, { key: "I" });

      expect(uiStore.displayMode).not.toBe(initialMode);
    });
  });

  describe("Undo/Redo Shortcuts", () => {
    it("Ctrl+Z triggers undo when history available", async () => {
      const layoutStore = getLayoutStore();

      // Create initial state and make a change to enable undo
      const rack = layoutStore.addRack("Test Rack", 42);
      const rackId = rack!.id;
      const deviceType = layoutStore.addDeviceType({
        name: "Test Server",
        u_height: 1,
        category: "server",
        colour: CATEGORY_COLOURS.server,
      });
      layoutStore.placeDevice(rackId, deviceType.slug, 5);

      expect(layoutStore.canUndo).toBe(true);

      render(KeyboardHandler);

      await fireEvent.keyDown(window, { key: "z", ctrlKey: true });

      // After undo, device should be removed
      expect(layoutStore.rack!.devices.length).toBe(0);
    });

    it("Cmd+Z triggers undo (Mac)", async () => {
      const layoutStore = getLayoutStore();

      const rack = layoutStore.addRack("Test Rack", 42);
      const rackId = rack!.id;
      const deviceType = layoutStore.addDeviceType({
        name: "Test Server",
        u_height: 1,
        category: "server",
        colour: CATEGORY_COLOURS.server,
      });
      layoutStore.placeDevice(rackId, deviceType.slug, 5);

      expect(layoutStore.canUndo).toBe(true);

      render(KeyboardHandler);

      await fireEvent.keyDown(window, { key: "z", metaKey: true });

      expect(layoutStore.rack!.devices.length).toBe(0);
    });

    it("Ctrl+Shift+Z triggers redo when history available", async () => {
      const layoutStore = getLayoutStore();

      const rack = layoutStore.addRack("Test Rack", 42);
      const rackId = rack!.id;
      const deviceType = layoutStore.addDeviceType({
        name: "Test Server",
        u_height: 1,
        category: "server",
        colour: CATEGORY_COLOURS.server,
      });
      layoutStore.placeDevice(rackId, deviceType.slug, 5);
      layoutStore.undo(); // Undo the placement

      expect(layoutStore.canRedo).toBe(true);

      render(KeyboardHandler);

      await fireEvent.keyDown(window, {
        key: "z",
        ctrlKey: true,
        shiftKey: true,
      });

      // After redo, device should be back
      expect(layoutStore.rack!.devices.length).toBe(1);
    });

    it("Ctrl+Y triggers redo", async () => {
      const layoutStore = getLayoutStore();

      const rack = layoutStore.addRack("Test Rack", 42);
      const rackId = rack!.id;
      const deviceType = layoutStore.addDeviceType({
        name: "Test Server",
        u_height: 1,
        category: "server",
        colour: CATEGORY_COLOURS.server,
      });
      layoutStore.placeDevice(rackId, deviceType.slug, 5);
      layoutStore.undo();

      expect(layoutStore.canRedo).toBe(true);

      render(KeyboardHandler);

      await fireEvent.keyDown(window, { key: "y", ctrlKey: true });

      expect(layoutStore.rack!.devices.length).toBe(1);
    });

    it("Cmd+Shift+Z triggers redo (Mac)", async () => {
      const layoutStore = getLayoutStore();

      const rack = layoutStore.addRack("Test Rack", 42);
      const rackId = rack!.id;
      const deviceType = layoutStore.addDeviceType({
        name: "Test Server",
        u_height: 1,
        category: "server",
        colour: CATEGORY_COLOURS.server,
      });
      layoutStore.placeDevice(rackId, deviceType.slug, 5);
      layoutStore.undo();

      render(KeyboardHandler);

      await fireEvent.keyDown(window, {
        key: "z",
        metaKey: true,
        shiftKey: true,
      });

      expect(layoutStore.rack!.devices.length).toBe(1);
    });

    it("does nothing when undo is not available", async () => {
      const layoutStore = getLayoutStore();

      // Fresh store reset already puts us in a state with no history
      // The default state has a rack but no undoable actions
      // Let's clear history to ensure clean state
      layoutStore.clearHistory?.();

      render(KeyboardHandler);

      // Should not throw even when canUndo is false
      await fireEvent.keyDown(window, { key: "z", ctrlKey: true });

      // No error thrown means the test passes
    });

    it("does nothing when redo is not available", async () => {
      const layoutStore = getLayoutStore();

      // Fresh state with no redo history - use default rack
      const initialCount = layoutStore.rackCount;
      expect(layoutStore.canRedo).toBe(false);

      render(KeyboardHandler);

      // Should not throw
      await fireEvent.keyDown(window, { key: "y", ctrlKey: true });

      expect(layoutStore.rackCount).toBe(initialCount);
    });
  });

  describe("Delete Shortcuts", () => {
    it("Delete key triggers delete action", async () => {
      const spy = vi
        .spyOn(dialogActions, "handleDelete")
        .mockReturnValue(undefined);

      render(KeyboardHandler);

      await fireEvent.keyDown(window, { key: "Delete" });

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it("Backspace key triggers delete action", async () => {
      const spy = vi
        .spyOn(dialogActions, "handleDelete")
        .mockReturnValue(undefined);

      render(KeyboardHandler);

      await fireEvent.keyDown(window, { key: "Backspace" });

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it("Delete does not throw without selection", async () => {
      // Should not throw when no selection exists
      render(KeyboardHandler);

      await fireEvent.keyDown(window, { key: "Delete" });

      // Test passes if no error thrown
    });
  });

  describe("Help Shortcut", () => {
    it("? key opens the help dialog", async () => {
      render(KeyboardHandler);

      await fireEvent.keyDown(window, { key: "?" });

      expect(dialogStore.isOpen("help")).toBe(true);
    });

    it("? key does not throw", async () => {
      render(KeyboardHandler);

      // Should not throw
      await fireEvent.keyDown(window, { key: "?" });
    });
  });

  describe("Event Prevention", () => {
    it("prevents default for handled shortcuts", async () => {
      vi.spyOn(appActions, "maybeSave").mockReturnValue(undefined);
      render(KeyboardHandler);

      const event = new KeyboardEvent("keydown", {
        key: "s",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });

      const preventDefaultSpy = vi.spyOn(event, "preventDefault");
      window.dispatchEvent(event);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it("does not prevent default for unhandled keys", async () => {
      render(KeyboardHandler);

      const event = new KeyboardEvent("keydown", {
        key: "x", // Not a shortcut key
        bubbles: true,
        cancelable: true,
      });

      const preventDefaultSpy = vi.spyOn(event, "preventDefault");
      window.dispatchEvent(event);

      expect(preventDefaultSpy).not.toHaveBeenCalled();
    });
  });

  describe("Contained Device Movement Guard", () => {
    it("ArrowUp does not move a contained child device", async () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();

      const { rackId, containerId, childId, childPosition } =
        createBladeContainerWithChild();

      // Select the contained child
      selectionStore.selectDevice(rackId, childId);

      render(KeyboardHandler);

      await fireEvent.keyDown(window, { key: "ArrowUp" });

      // Child should NOT have moved (container-relative position unchanged)
      const childAfter = layoutStore.rack!.devices.find(
        (d) => d.id === childId,
      )!;
      expect(childAfter.position).toBe(childPosition);
      // Child should still be contained (not ejected)
      expect(childAfter.container_id).toBe(containerId);
    });

    it("ArrowDown does not move a contained child device", async () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();

      const { rackId, containerId, childId, childPosition } =
        createBladeContainerWithChild();

      selectionStore.selectDevice(rackId, childId);

      render(KeyboardHandler);

      await fireEvent.keyDown(window, { key: "ArrowDown" });

      const childAfter = layoutStore.rack!.devices.find(
        (d) => d.id === childId,
      )!;
      expect(childAfter.position).toBe(childPosition);
      expect(childAfter.container_id).toBe(containerId);
    });
  });

  describe("Multi-U Device Movement", () => {
    it("moves 2U device by 1U (consistent step size)", async () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();

      const rack = layoutStore.addRack("Test Rack", 42);
      const rackId = rack!.id;
      const deviceType = layoutStore.addDeviceType({
        name: "Server",
        u_height: 2,
        category: "server",
        colour: CATEGORY_COLOURS.server,
      });
      layoutStore.placeDevice(rackId, deviceType.slug, 10);
      const deviceId = layoutStore.rack!.devices[0]!.id;
      selectionStore.selectDevice(rackId, deviceId);

      render(KeyboardHandler);

      const initialPosition = layoutStore.rack!.devices[0]!.position;
      await fireEvent.keyDown(window, { key: "ArrowUp" });

      // All devices move by 1U regardless of height
      expect(layoutStore.rack!.devices[0]!.position).toBe(
        initialPosition + UNITS_PER_U,
      );
    });

    it("leapfrogs over blocking devices", async () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();

      const rack = layoutStore.addRack("Test Rack", 42);
      const rackId = rack!.id;
      const serverType = layoutStore.addDeviceType({
        name: "Server",
        u_height: 1,
        category: "server",
        colour: CATEGORY_COLOURS.server,
      });

      // Place a device at position 5
      layoutStore.placeDevice(rackId, serverType.slug, 5);
      const firstDeviceId = layoutStore.rack!.devices[0]!.id;
      // Place another device at position 6 (blocking)
      layoutStore.placeDevice(rackId, serverType.slug, 6);

      // Select the first device (at position 5) by ID
      selectionStore.selectDevice(rackId, firstDeviceId);

      render(KeyboardHandler);

      await fireEvent.keyDown(window, { key: "ArrowUp" });

      // Should leapfrog over the blocking device at 6, land at U7 (internal units = 42)
      expect(layoutStore.rack!.devices[0]!.position).toBe(toInternalUnits(7));
    });
  });

  describe("Tab Navigation Shortcuts", () => {
    beforeEach(() => {
      resetWorkspaceStore();
    });

    it("Alt+1 jumps to the first open tab", async () => {
      const workspace = getWorkspaceStore();
      const firstId = workspace.activeId;
      const secondId = workspace.openTab(createLayout("Second"));
      // Focus is on the second tab after opening it.
      expect(workspace.activeId).toBe(secondId);

      render(KeyboardHandler);

      // Alt+1 jumps to the first tab. macOS remaps Alt+digit to a symbol, so the
      // handler keys off event.code (Digit1), not event.key.
      await fireEvent.keyDown(window, {
        key: "1",
        code: "Digit1",
        altKey: true,
      });

      expect(workspace.activeId).toBe(firstId);
    });

    it("Alt+N is a no-op when fewer than N tabs are open", async () => {
      const workspace = getWorkspaceStore();
      const onlyId = workspace.activeId;

      render(KeyboardHandler);

      await fireEvent.keyDown(window, {
        key: "5",
        code: "Digit5",
        altKey: true,
      });

      expect(workspace.activeId).toBe(onlyId);
    });
  });
});
