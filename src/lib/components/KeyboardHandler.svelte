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
  }

  let {
    onsave,
    onload,
    onexport,
    ondelete,
    onfitall,
    onhelp,
    ontoggledisplaymode,
  }: Props = $props();

  const layoutStore = getLayoutStore();
  const selectionStore = getSelectionStore();
  const uiStore = getUIStore();
  const toastStore = getToastStore();

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
      // Escape - clear selection and close drawers
      {
        key: "Escape",
        action: () => {
          selectionStore.clearSelection();
          uiStore.closeLeftDrawer();
          uiStore.closeRightDrawer();
        },
      },

      // Ctrl/Cmd+Z - undo
      {
        key: "z",
        ctrl: true,
        action: () => performUndo(),
      },
      {
        key: "z",
        meta: true,
        action: () => performUndo(),
      },

      // Ctrl/Cmd+Shift+Z or Ctrl+Y - redo
      {
        key: "z",
        ctrl: true,
        shift: true,
        action: () => performRedo(),
      },
      {
        key: "z",
        meta: true,
        shift: true,
        action: () => performRedo(),
      },
      {
        key: "y",
        ctrl: true,
        action: () => performRedo(),
      },
      {
        key: "y",
        meta: true,
        action: () => performRedo(),
      },

      // Delete / Backspace - delete selected item
      {
        key: "Delete",
        action: () => ondelete?.(),
      },
      {
        key: "Backspace",
        action: () => ondelete?.(),
      },

      // Arrow keys - device movement (1U or device height)
      {
        key: "ArrowUp",
        action: () => moveSelectedDevice(1),
      },
      {
        key: "ArrowDown",
        action: () => moveSelectedDevice(-1),
      },

      // Shift+Arrow keys - fine device movement (0.5U)
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

      // Arrow keys - rack reordering
      {
        key: "ArrowLeft",
        action: () => moveSelectedRack(-1),
      },
      {
        key: "ArrowRight",
        action: () => moveSelectedRack(1),
      },

      // D - toggle device palette
      {
        key: "d",
        action: () => uiStore.toggleLeftDrawer(),
      },

      // F - fit all
      {
        key: "f",
        action: () => onfitall?.(),
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

      // Ctrl/Cmd+D - duplicate rack
      {
        key: "d",
        ctrl: true,
        action: () => duplicateSelectedRack(),
      },
      {
        key: "d",
        meta: true,
        action: () => duplicateSelectedRack(),
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

    // Single-rack mode
    const rack = layoutStore.rack;
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
   * Move the selected rack left or right (disabled in single-rack mode)
   * @param _direction - -1 for left, 1 for right
   */
  function moveSelectedRack(_direction: number) {
    // Single-rack mode - rack reordering not applicable
    // Reserved for future multi-rack support
  }

  /**
   * Duplicate the selected rack
   */
  function duplicateSelectedRack() {
    if (!selectionStore.isRackSelected || !selectionStore.selectedRackId)
      return;

    const result = layoutStore.duplicateRack(selectionStore.selectedRackId);
    if (result.error) {
      toastStore.showToast(result.error, "error");
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

        // Track keyboard shortcut usage
        const shortcutName = formatShortcutName(shortcut);
        analytics.trackKeyboardShortcut(shortcutName);
        return;
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />
