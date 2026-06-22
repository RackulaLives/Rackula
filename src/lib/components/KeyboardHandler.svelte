<!--
  KeyboardHandler component
  Handles global keyboard shortcuts for the application
-->
<script lang="ts">
  import { shouldIgnoreKeyboard } from "$lib/utils/keyboard";
  import { findActionForEvent } from "$lib/actions/registry";
  import {
    createActionDispatch,
    isCommandPaletteShortcut,
  } from "$lib/actions/dispatch";
  import { getWorkspaceStore } from "$lib/stores/workspace.svelte";
  import { dialogStore } from "$lib/stores/dialogs.svelte";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getPlacementStore } from "$lib/stores/placement.svelte";
  import { getCanvasStore } from "$lib/stores/canvas.svelte";
  import {
    createPlacementKeyboardController,
    focusRackContainer,
  } from "$lib/utils/placement-keyboard-controller";

  const workspace = getWorkspaceStore();
  const dispatch = createActionDispatch();

  const layoutStore = getLayoutStore();
  const placementStore = getPlacementStore();
  const canvasStore = getCanvasStore();

  // Keyboard placement (#106): while a device is armed, arrow / Tab / Enter /
  // Escape drive a U-slot cursor and place via the same store path as
  // tap-to-place. Reads live store values through getters so one controller
  // instance stays correct as racks and the armed device change.
  const placementKeyboard = createPlacementKeyboardController({
    getRacks: () => layoutStore.racks,
    getDeviceLibrary: () => layoutStore.device_types,
    getActiveRackId: () => layoutStore.activeRackId,
    isPlacing: () => placementStore.isPlacing,
    getPendingDevice: () => placementStore.pendingDevice,
    getTargetFace: () => placementStore.targetFace,
    getCursorPosition: () => placementStore.cursorPosition,
    setActiveRack: (id) => layoutStore.setActiveRack(id),
    setCursor: (rackId, position) => placementStore.setCursor(rackId, position),
    announce: (text) => placementStore.announcePosition(text),
    cancelPlacement: () => placementStore.cancelPlacement(),
    placeDevice: (rackId, slug, position, face) =>
      layoutStore.placeDeviceSmart(rackId, slug, position, face),
    completePlacement: (summary) => placementStore.completePlacement(summary),
    onPlaced: () =>
      canvasStore.fitAll(layoutStore.racks, layoutStore.rack_groups),
    // Move focus to the newly focused rack so the visible focus ring follows the
    // cursor across a Tab/arrow rack switch.
    onFocusRack: (rackId) => focusRackContainer(rackId),
  });

  /**
   * Alt+1-9 jumps to the Nth open layout tab. Keyed off event.code (Digit1..9)
   * rather than event.key because macOS remaps Alt+digit to a symbol (Alt+1
   * yields the character produced by that key, not "1"). Returns true when the
   * event was a tab-jump so the caller can stop processing.
   */
  function handleTabJump(event: KeyboardEvent): boolean {
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return false;
    }
    const match = /^Digit([1-9])$/.exec(event.code);
    if (!match) return false;

    event.preventDefault();
    const index = Number(match[1]) - 1;
    const tab = workspace.tabs[index];
    if (tab) {
      workspace.switchTo(tab.id);
    }
    return true;
  }

  function handleKeyDown(event: KeyboardEvent) {
    // Palette shortcut fires even from a text field, and before any other
    // handling. It is the first special-case to run before shouldIgnoreKeyboard.
    if (isCommandPaletteShortcut(event)) {
      event.preventDefault();
      event.stopPropagation();
      dialogStore.open("commandPalette");
      return;
    }

    // While the palette is open the global handler is inert: the Dialog owns
    // Escape and the Command input owns typing.
    if (dialogStore.isOpen("commandPalette")) return;

    // Ignore if in input field
    if (shouldIgnoreKeyboard(event)) return;

    // Keyboard placement (#106) owns arrow / Tab / Enter / Escape while a device
    // is armed, so it runs before the action registry (which binds arrows to
    // move-device and Escape to clear-selection). It only consumes keys while
    // placing; otherwise it returns false and handling continues as normal.
    if (placementKeyboard.handleKeyDown(event)) {
      event.preventDefault();
      return;
    }

    // Workspace tab jumps (Alt+1-9) are dynamic, not fixed registry actions, so
    // they take precedence over the action registry.
    if (handleTabJump(event)) return;

    const action = findActionForEvent(event);
    if (!action) return;

    event.preventDefault();
    dispatch[action.id]?.();
  }
</script>

<svelte:window onkeydown={handleKeyDown} />
