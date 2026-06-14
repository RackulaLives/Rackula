<!--
  EditPanel Component
  Right drawer for editing selected racks and viewing device info
-->
<script lang="ts">
  import Drawer from "./Drawer.svelte";
  import EditPanelRack from "./EditPanelRack.svelte";
  import EditPanelMetadata from "./EditPanelMetadata.svelte";
  import EditPanelPosition from "./EditPanelPosition.svelte";
  import EditPanelImage from "./EditPanelImage.svelte";
  import EditPanelActions from "./EditPanelActions.svelte";
  import ConfirmDialog from "./ConfirmDialog.svelte";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getSelectionStore } from "$lib/stores/selection.svelte";
  import { getUIStore } from "$lib/stores/ui.svelte";
  import type { SelectedDeviceInfo } from "$lib/types";

  const layoutStore = getLayoutStore();
  const selectionStore = getSelectionStore();
  const uiStore = getUIStore();

  // Use dynamic active rack ID from store
  const currentRackId = $derived(
    layoutStore.activeRackId ?? layoutStore.racks[0]?.id ?? null,
  );

  // State for delete device type confirmation dialog
  let showDeleteConfirm = $state(false);

  // Get the selected group if a bayed rack is selected
  const selectedGroup = $derived.by(() => {
    if (!selectionStore.isGroupSelected || !selectionStore.selectedGroupId)
      return null;
    return (
      layoutStore.rack_groups.find(
        (g) => g.id === selectionStore.selectedGroupId,
      ) ?? null
    );
  });

  // Get the selected rack if any (multi-rack mode)
  // Also works when a group is selected (returns the active rack within the group)
  const selectedRack = $derived.by(() => {
    // For group selection, return the active rack
    if (selectionStore.isGroupSelected && currentRackId) {
      return layoutStore.activeRack;
    }
    // For individual rack selection
    if (!selectionStore.isRackSelected || !currentRackId) return null;
    if (selectionStore.selectedRackId !== currentRackId) return null;
    return layoutStore.activeRack;
  });

  // Get the selected device info if any (multi-rack mode)
  const selectedDeviceInfo = $derived.by((): SelectedDeviceInfo | null => {
    if (!selectionStore.isDeviceSelected) return null;
    if (
      selectionStore.selectedRackId === null ||
      selectionStore.selectedDeviceId === null
    )
      return null;

    const rack = layoutStore.activeRack;
    if (!rack) return null;

    // Find device by ID (UUID-based tracking)
    const deviceIndex = selectionStore.getSelectedDeviceIndex(rack.devices);
    if (deviceIndex === null) return null;

    const placedDevice = rack.devices[deviceIndex];
    if (!placedDevice) return null;

    const device = layoutStore.device_types.find(
      (d) => d.slug === placedDevice.device_type,
    );
    if (!device) return null;

    return { device, placedDevice, rack, deviceIndex };
  });

  // Auto-open drawer on selection, close on deselection
  $effect(() => {
    if (selectionStore.hasSelection) {
      uiStore.openRightDrawer();
    } else {
      uiStore.closeRightDrawer();
    }
  });

  // Count how many times this device type is placed in the rack
  const deviceTypePlacementCount = $derived.by(() => {
    if (!selectedDeviceInfo) return 0;
    const slug = selectedDeviceInfo.device.slug;
    const activeRack = layoutStore.activeRack;
    return activeRack
      ? activeRack.devices.filter((d) => d.device_type === slug).length
      : 0;
  });

  // Handle delete device type from library
  function handleDeleteDeviceType() {
    showDeleteConfirm = true;
  }

  // Confirm delete device type
  function confirmDeleteDeviceType() {
    if (selectedDeviceInfo) {
      const slug = selectedDeviceInfo.device.slug;
      selectionStore.clearSelection();
      layoutStore.deleteDeviceType(slug);
    }
    showDeleteConfirm = false;
  }

  // Cancel delete device type
  function cancelDeleteDeviceType() {
    showDeleteConfirm = false;
  }

  // Close drawer
  function handleClose() {
    uiStore.closeRightDrawer();
    selectionStore.clearSelection();
  }
</script>

<Drawer
  side="right"
  open={uiStore.rightDrawerOpen}
  title="Edit"
  testid="drawer-device-edit"
  showClose={false}
  onclose={handleClose}
>
  {#if selectedRack}
    <EditPanelRack {selectedRack} {selectedGroup} />
  {:else if selectedDeviceInfo}
    <!-- Device view -->
    <div class="device-view">
      <EditPanelMetadata {selectedDeviceInfo} />
      <EditPanelPosition {selectedDeviceInfo} />
      <EditPanelImage {selectedDeviceInfo} />
      <EditPanelActions
        {selectedDeviceInfo}
        ondeletetype={handleDeleteDeviceType}
      />
    </div>
  {/if}
</Drawer>

<!-- Delete device type confirmation dialog -->
<ConfirmDialog
  open={showDeleteConfirm}
  title="Delete Device Type"
  message={`Delete "${selectedDeviceInfo?.device.model ?? selectedDeviceInfo?.device.slug}"? ${deviceTypePlacementCount > 0 ? `This device is placed ${deviceTypePlacementCount} time${deviceTypePlacementCount === 1 ? "" : "s"}. All instances will be removed.` : "This will remove the device from your library."}`}
  confirmLabel="Delete"
  onconfirm={confirmDeleteDeviceType}
  oncancel={cancelDeleteDeviceType}
/>

<style>
  .device-view {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
</style>
