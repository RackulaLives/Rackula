<!--
  KeyboardHandler component
  Handles global keyboard shortcuts for the application
-->
<script lang="ts">
  import {
    shouldIgnoreKeyboard,
    matchesShortcut,
    type ShortcutHandler,
  } from "$lib/utils/keyboard";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getSelectionStore } from "$lib/stores/selection.svelte";
  import { getUIStore } from "$lib/stores/ui.svelte";
  import { getToastStore } from "$lib/stores/toast.svelte";
  import { getPlacementStore } from "$lib/stores/placement.svelte";
  import { findNextValidPosition } from "$lib/utils/device-movement";
  import { analytics } from "$lib/utils/analytics";

  interface Props {
    onsave?: () => void;
    onload?: () => void;
    onexport?: () => void;
    ondelete?: () => void;
    onfitall?: () => void;
    onhelp?: () => void;
    ontoggledisplaymode?: () => void;
    ontoggleannotations?: () => void;
  }

  let {
    onsave,
    onload,
    onexport,
    ondelete,
    onfitall,
    onhelp,
    ontoggledisplaymode,
    ontoggleannotations,
  }: Props = $props();

  const layoutStore = getLayoutStore();
  const selectionStore = getSelectionStore();
  const uiStore = getUIStore();
  const toastStore = getToastStore();
  const placementStore = getPlacementStore();

  /**
   * Perform undo with toast notification
   */
  function performUndo() {
    if (!layoutStore.canUndo) return;

    // Capture description before undo
    const desc = layoutStore.undoDescription?.replace("Undo: ", "") ?? "action";
    layoutStore.undo();
    toastStore.showToast(`Undid: ${desc}`, "info");
  }

  /**
   * Perform redo with toast notification
   */
  function performRedo() {
    if (!layoutStore.canRedo) return;

    // Capture description before redo
    const desc = layoutStore.redoDescription?.replace("Redo: ", "") ?? "action";
    layoutStore.redo();
    toastStore.showToast(`Redid: ${desc}`, "info");
  }

  // Define all shortcuts
  function getShortcuts(): ShortcutHandler[] {
    return [
      // Escape - cancel placement mode, or clear selection and close drawers
      {
        key: "Escape",
        action: () => {
          // Priority: cancel placement mode first
          if (placementStore.isPlacing) {
            placementStore.cancelPlacement();
            // Reset view to show full rack after placement is cancelled
            onfitall?.();
            return;
          }
          // Otherwise clear selection and close drawers
          selectionStore.clearSelection();
          uiStore.closeLeftDrawer();
          uiStore.closeRightDrawer();
        },
      },

      // Arrow keys - move selected device (without modifiers)
      {
        key: "ArrowUp",
        action: () => moveSelectedDevice(1),
      },
      {
        key: "ArrowDown",
        action: () => moveSelectedDevice(-1),
      },
      // Shift+Arrow keys - move by 0.5U (fine movement)
      {
        key: "ArrowUp",
        shift: true,
        action: () => moveSelectedDevice(1, 0.5),
      },
      {
        key: "ArrowDown",
        shift: true,
        action: () => moveSelectedDevice(-1, 0.5),
      },
      // Left/Right arrows - move selected rack (disabled in single-rack mode)
      {
        key: "ArrowLeft",
        action: () => moveSelectedRack(-1),
      },
      {
        key: "ArrowRight",
        action: () => moveSelectedRack(1),
      },

      // Delete/Backspace - delete selection
      {
        key: "Delete",
        action: () => ondelete?.(),
      },
      {
        key: "Backspace",
        action: () => ondelete?.(),
      },

      // F - fit all
      {
        key: "f",
        action: () => onfitall?.(),
      },

      // D - toggle sidebar (device palette)
      {
        key: "d",
        action: () => uiStore.toggleLeftDrawer(),
      },

      // A - toggle airflow display
      {
        key: "a",
        action: () => uiStore.toggleAirflow(),
      },

      // [ - cycle to previous rack
      {
        key: "[",
        action: () => cycleActiveRack(-1),
      },

      // Ctrl/Cmd+Z - undo
      {
        key: "z",
        ctrl: true,
        action: performUndo,
      },
      {
        key: "z",
        meta: true,
        action: performUndo,
      },

      // Ctrl/Cmd+Shift+Z - redo
      {
        key: "z",
        ctrl: true,
        shift: true,
        action: performRedo,
      },
      {
        key: "z",
        meta: true,
        shift: true,
        action: performRedo,
      },

      // Ctrl/Cmd+Y - redo (alternative)
      {
        key: "y",
        ctrl: true,
        action: performRedo,
      },
      {
        key: "y",
        meta: true,
        action: performRedo,
      },

      // Ctrl/Cmd+S - save
      {
        key: "s",
        ctrl: true,
        action: () => onsave?.(),
      },
      {
        key: "s",
        meta: true,
        action: () => onsave?.(),
      },

      // Ctrl/Cmd+O - load
      {
        key: "o",
        ctrl: true,
        action: () => onload?.(),
      },
      {
        key: "o",
        meta: true,
        action: () => onload?.(),
      },

      // Ctrl/Cmd+E - export
      {
        key: "e",
        ctrl: true,
        action: () => onexport?.(),
      },
      {
        key: "e",
        meta: true,
        action: () => onexport?.(),
      },

      // Ctrl/Cmd+D - duplicate selected (device or rack)
      {
        key: "d",
        ctrl: true,
        action: () => duplicateSelected(),
      },
      {
        key: "d",
        meta: true,
        action: () => duplicateSelected(),
      },

      // ? - show help
      {
        key: "?",
        action: () => onhelp?.(),
      },

      // I - toggle display mode (label/image)
      {
        key: "i",
        action: () => ontoggledisplaymode?.(),
      },

      // N - toggle annotation column
      {
        key: "n",
        action: () => ontoggleannotations?.(),
      },

      // ] - cycle to next rack
      {
        key: "]",
        action: () => cycleActiveRack(1),
      },
    ];
  }

  /**
   * Move the selected device up or down, using shared movement utility.
   * Leapfrogs over blocking devices to find valid positions.
   * @param direction - 1 for up (higher U), -1 for down (lower U)
   * @param stepOverride - Optional step size (default: device height). Use 0.5 for fine movement.
   */
  function moveSelectedDevice(direction: 1 | -1, stepOverride?: number) {
    if (!selectionStore.isDeviceSelected) return;
    if (
      selectionStore.selectedRackId === null ||
      selectionStore.selectedDeviceId === null
    )
      return;

    // Get the rack containing the selected device
    const rack = layoutStore.getRackById(selectionStore.selectedRackId);
    if (!rack) return;

    // Get device index from ID (UUID-based tracking)
    const deviceIndex = selectionStore.getSelectedDeviceIndex(rack.devices);
    if (deviceIndex === null) return;

    // Use shared utility to find next valid position
    const result = findNextValidPosition(
      rack,
      layoutStore.device_types,
      deviceIndex,
      direction,
      stepOverride,
    );

    if (result.success && result.newPosition !== null) {
      layoutStore.moveDevice(
        selectionStore.selectedRackId!,
        deviceIndex,
        result.newPosition,
      );
    }
  }

  /**
   * Move the selected rack left or right (reserved for future use)
   * @param _direction - -1 for left, 1 for right
   */
  function moveSelectedRack(_direction: number) {
    // Reserved for future rack reordering
  }

  /**
   * Cycle to the next or previous rack
   * @param direction - -1 for previous, 1 for next
   */
  function cycleActiveRack(direction: -1 | 1) {
    const racks = layoutStore.racks;
    if (racks.length === 0) return;

    const currentId = layoutStore.activeRackId;
    const currentIndex = currentId
      ? racks.findIndex((r) => r.id === currentId)
      : -1;

    // Calculate new index with wrapping
    let newIndex: number;
    if (currentIndex === -1) {
      // No active rack, select first or last based on direction
      newIndex = direction === 1 ? 0 : racks.length - 1;
    } else {
      newIndex = (currentIndex + direction + racks.length) % racks.length;
    }

    const newRack = racks[newIndex];
    if (!newRack) return;

    // Skip toast if cycling landed on the same rack (single rack case)
    if (newRack.id === currentId) return;

    layoutStore.setActiveRack(newRack.id);
    selectionStore.selectRack(newRack.id);
    toastStore.showToast(`Active: ${newRack.name}`, "info");
  }

  /**
   * Duplicate the currently selected item (device or rack)
   * If a device is selected, duplicates the device
   * If only a rack is selected, duplicates the rack
   */
  function duplicateSelected() {
    // Priority 1: Duplicate selected device
    if (
      selectionStore.isDeviceSelected &&
      selectionStore.selectedRackId &&
      selectionStore.selectedDeviceId
    ) {
      duplicateSelectedDevice();
      return;
    }

    // Priority 2: Duplicate selected rack
    if (selectionStore.isRackSelected && selectionStore.selectedRackId) {
      duplicateSelectedRack();
      return;
    }
  }

  /**
   * Duplicate the selected device
   */
  function duplicateSelectedDevice() {
    if (!selectionStore.selectedRackId || !selectionStore.selectedDeviceId)
      return;

    // Get the rack containing the selected device
    const rack = layoutStore.getRackById(selectionStore.selectedRackId);
    if (!rack) return;

    // Get device index from ID (UUID-based tracking)
    const deviceIndex = selectionStore.getSelectedDeviceIndex(rack.devices);
    if (deviceIndex === null) return;

    const result = layoutStore.duplicateDevice(
      selectionStore.selectedRackId,
      deviceIndex,
    );
    if (result.error) {
      toastStore.showToast(result.error, "error");
    } else if (result.device) {
      // Select the newly duplicated device
      selectionStore.selectDevice(
        selectionStore.selectedRackId,
        result.device.id,
      );
      toastStore.showToast("Device duplicated", "success");
    }
  }

  /**
   * Duplicate the selected rack
   */
  function duplicateSelectedRack() {
    if (!selectionStore.selectedRackId) return;

    const result = layoutStore.duplicateRack(selectionStore.selectedRackId);
    if (result.error) {
      toastStore.showToast(result.error, "error");
    } else if (result.rack) {
      toastStore.showToast("Rack duplicated", "success");
    }
  }

  /**
   * Format a shortcut for analytics tracking
   */
  function formatShortcutName(shortcut: ShortcutHandler): string {
    const parts: string[] = [];
    if (shortcut.ctrl || shortcut.meta) parts.push("Ctrl");
    if (shortcut.shift) parts.push("Shift");
    parts.push(shortcut.key.toUpperCase());
    return parts.join("+");
  }

  function handleKeyDown(event: KeyboardEvent) {
    // Ignore if in input field
    if (shouldIgnoreKeyboard(event)) return;

    const shortcuts = getShortcuts();

    for (const shortcut of shortcuts) {
      if (matchesShortcut(event, shortcut)) {
        event.preventDefault();
        shortcut.action();

        // Track shortcut usage (only for meaningful actions)
        const shortcutName = formatShortcutName(shortcut);
        analytics.trackKeyboardShortcut(shortcutName);

        return;
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />
