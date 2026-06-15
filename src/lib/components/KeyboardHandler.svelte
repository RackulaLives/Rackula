<!--
  KeyboardHandler component
  Handles global keyboard shortcuts for the application
-->
<script lang="ts">
  import { shouldIgnoreKeyboard } from "$lib/utils/keyboard";
  import { findActionForEvent, type ActionId } from "$lib/actions/registry";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getWorkspaceStore } from "$lib/stores/workspace.svelte";
  import { getSelectionStore } from "$lib/stores/selection.svelte";
  import { getUIStore } from "$lib/stores/ui.svelte";
  import { getToastStore } from "$lib/stores/toast.svelte";
  import { getPlacementStore } from "$lib/stores/placement.svelte";
  import { findNextValidPosition } from "$lib/utils/device-movement";
  import { isContainerChild } from "$lib/utils/collision";
  import { toHumanUnits } from "$lib/utils/position";

  interface Props {
    onsave?: () => void;
    onsaveas?: () => void;
    onload?: () => void;
    onexport?: () => void;
    onshare?: () => void;
    ondelete?: () => void;
    onfitall?: () => void;
    onhelp?: () => void;
    ontoggledisplaymode?: () => void;
    ontoggleannotations?: () => void;
  }

  let {
    onsave,
    onsaveas,
    onload,
    onexport,
    onshare,
    ondelete,
    onfitall,
    onhelp,
    ontoggledisplaymode,
    ontoggleannotations,
  }: Props = $props();

  const layoutStore = getLayoutStore();
  const workspace = getWorkspaceStore();
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

  /**
   * Escape - cancel placement mode, or clear selection and close drawers.
   */
  function handleEscape() {
    // Priority: cancel placement mode first
    if (placementStore.isPlacing) {
      placementStore.cancelPlacement();
      // Reset view to show full rack after placement is cancelled
      onfitall?.();
      return;
    }
    // Otherwise clear selection, active rack, and close drawers
    selectionStore.clearSelection();
    layoutStore.setActiveRack(null);
    uiStore.closeLeftDrawer();
    uiStore.closeRightDrawer();
  }

  /**
   * Dispatch map from registry action id to its runtime handler. The actions
   * registry owns command metadata and keybindings; this map binds each
   * command id to the closure that runs it in this app context.
   */
  const dispatch: Record<ActionId, () => void> = {
    escape: handleEscape,
    "move-device-up": () => moveSelectedDevice(1),
    "move-device-down": () => moveSelectedDevice(-1),
    "delete-selection": () => ondelete?.(),
    "fit-all": () => onfitall?.(),
    "toggle-sidebar": () => uiStore.toggleLeftDrawer(),
    "toggle-annotations": () => ontoggleannotations?.(),
    "cycle-rack-prev": () => cycleActiveRack(-1),
    "cycle-rack-next": () => cycleActiveRack(1),
    undo: performUndo,
    redo: performRedo,
    save: () => onsave?.(),
    "save-as": () => onsaveas?.(),
    load: () => onload?.(),
    export: () => onexport?.(),
    share: () => onshare?.(),
    "duplicate-selection": () => duplicateSelected(),
    "show-help": () => onhelp?.(),
    "toggle-display-mode": () => ontoggledisplaymode?.(),
  };

  /**
   * Move the selected device up or down, using shared movement utility.
   * Leapfrogs over blocking devices to find valid positions.
   * @param direction - 1 for up (higher U), -1 for down (lower U)
   */
  function moveSelectedDevice(direction: 1 | -1) {
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

    // Contained children use container-relative positions; nudging them with
    // arrow keys would compute a rack-level U and eject them from the
    // container. Block this at the keyboard entry point only — the store-level
    // moveDevice path (used by drag-out) intentionally detaches.
    const placedDevice = rack.devices[deviceIndex];
    if (placedDevice && isContainerChild(placedDevice)) return;

    // Use shared utility to find next valid position
    const result = findNextValidPosition(
      rack,
      layoutStore.device_types,
      deviceIndex,
      direction,
    );

    if (result.success && result.newPosition !== null) {
      // Convert internal units back to human units for the store API
      const humanPosition = toHumanUnits(result.newPosition);
      layoutStore.moveDevice(
        selectionStore.selectedRackId!,
        deviceIndex,
        humanPosition,
      );
    }
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
    // Ignore if in input field
    if (shouldIgnoreKeyboard(event)) return;

    // Workspace tab jumps (Alt+1-9) are dynamic, not fixed registry actions, so
    // they take precedence over the action registry.
    if (handleTabJump(event)) return;

    const action = findActionForEvent(event);
    if (!action) return;

    event.preventDefault();
    dispatch[action.id]();
  }
</script>

<svelte:window onkeydown={handleKeyDown} />
