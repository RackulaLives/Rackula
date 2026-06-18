<!--
  SidePanelContent Component

  Extractable tab content for the right side panel: the Edit and View tabpanels
  plus their tablist. This is the seam the persistent rail (SidePanel) wraps and
  that a phone bottom-sheet host can compose directly (mobile spike #2097). It owns
  empty-state orchestration and selection resolution; it does not know about the
  collapse-to-rail chrome.

  The Edit tab hosts the decomposed EditPanel sections (#1398). The View tab hosts
  the layout-scoped view toggles (ViewControls, #2078).
-->
<script lang="ts">
  import { Tabs } from "$lib/components/ui/Tabs";
  import { IconChevronRight } from "./icons";
  import { ICON_SIZE } from "$lib/constants/sizing";
  import EditPanelRack from "./EditPanelRack.svelte";
  import EditPanelMetadata from "./EditPanelMetadata.svelte";
  import EditPanelPosition from "./EditPanelPosition.svelte";
  import EditPanelImage from "./EditPanelImage.svelte";
  import EditPanelActions from "./EditPanelActions.svelte";
  import ViewControls from "./ViewControls.svelte";
  import ConfirmDialog from "./ConfirmDialog.svelte";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getSelectionStore } from "$lib/stores/selection.svelte";
  import type { SidePanelTab } from "$lib/stores/ui.svelte";
  import type { SelectedDeviceInfo } from "$lib/types";
  import "$lib/styles/tabs.css";

  interface Props {
    /** Active tab. Controlled by the host (rail or sheet). */
    activeTab: SidePanelTab;
    /** Notifies the host when the user switches tabs. */
    onTabChange: (tab: SidePanelTab) => void;
    /**
     * Optional id for the Edit tabpanel's heading, so a host can move focus to it
     * after a tab switch or expand (focus management, issue #2076 a11y AC).
     */
    editHeadingId?: string;
    /** Optional id for the View tabpanel's heading. */
    viewHeadingId?: string;
    /**
     * Collapse the panel rightward to its strip. Provided by the desktop rail
     * host (SidePanel); omitted by the phone bottom-sheet host, where the row
     * has no collapse chevron (#2397).
     */
    oncollapse?: () => void;
  }

  let {
    activeTab,
    onTabChange,
    editHeadingId = "side-panel-edit-heading",
    viewHeadingId = "side-panel-view-heading",
    oncollapse,
  }: Props = $props();

  const layoutStore = getLayoutStore();
  const selectionStore = getSelectionStore();

  // Dynamic active rack id from the store
  const currentRackId = $derived(
    layoutStore.activeRackId ?? layoutStore.racks[0]?.id ?? null,
  );

  // The selected group if a bayed rack is selected
  const selectedGroup = $derived.by(() => {
    if (!selectionStore.isGroupSelected || !selectionStore.selectedGroupId)
      return null;
    return (
      layoutStore.rack_groups.find(
        (g) => g.id === selectionStore.selectedGroupId,
      ) ?? null
    );
  });

  // The selected rack (also resolves the active rack within a selected group)
  const selectedRack = $derived.by(() => {
    if (selectionStore.isGroupSelected && currentRackId) {
      return layoutStore.activeRack;
    }
    if (!selectionStore.isRackSelected || !currentRackId) return null;
    if (selectionStore.selectedRackId !== currentRackId) return null;
    return layoutStore.activeRack;
  });

  // The selected device info, if a device is selected
  const selectedDeviceInfo = $derived.by((): SelectedDeviceInfo | null => {
    if (!selectionStore.isDeviceSelected) return null;
    if (
      selectionStore.selectedRackId === null ||
      selectionStore.selectedDeviceId === null
    )
      return null;

    const rack = layoutStore.activeRack;
    if (!rack) return null;

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

  // Whether the Edit tab has a selection to show, or should render its empty state.
  const hasEditSelection = $derived(
    selectedRack !== null || selectedDeviceInfo !== null,
  );

  // Contextual heading naming the current selection kind. The branches mirror the
  // tabpanel's render order (rack/group first, then device) so the heading never
  // diverges from the body. A bayed rack group is the multi-rack selection the
  // model supports; it reads as "Bayed Rack". With nothing selected the heading
  // stays the neutral tab name and the empty state shows.
  const editHeadingLabel = $derived.by(() => {
    if (selectedRack) return selectedGroup ? "Bayed Rack" : "Rack";
    if (selectedDeviceInfo) return "Device";
    return "Edit";
  });

  // Delete-device-type confirmation lives at the host level (per #1398 contract).
  let showDeleteConfirm = $state(false);

  const deviceTypePlacementCount = $derived.by(() => {
    if (!selectedDeviceInfo) return 0;
    const slug = selectedDeviceInfo.device.slug;
    const activeRack = layoutStore.activeRack;
    return activeRack
      ? activeRack.devices.filter((d) => d.device_type === slug).length
      : 0;
  });

  function handleDeleteDeviceType() {
    showDeleteConfirm = true;
  }

  function confirmDeleteDeviceType() {
    if (selectedDeviceInfo) {
      const slug = selectedDeviceInfo.device.slug;
      selectionStore.clearSelection();
      layoutStore.deleteDeviceType(slug);
    }
    showDeleteConfirm = false;
  }

  function cancelDeleteDeviceType() {
    showDeleteConfirm = false;
  }

  function handleValueChange(value: string | undefined) {
    if (value === "edit" || value === "view") {
      onTabChange(value);
    }
  }
</script>

<Tabs.Root
  value={activeTab}
  onValueChange={handleValueChange}
  orientation="horizontal"
  loop={true}
  class="side-panel-tabs"
>
  <div class="side-panel-tablist-row">
    <Tabs.List class="side-panel-tablist" aria-label="Panel sections">
      <Tabs.Trigger
        value="edit"
        class="side-panel-tab"
        data-testid="side-panel-tab-edit"
      >
        Edit
      </Tabs.Trigger>
      <Tabs.Trigger
        value="view"
        class="side-panel-tab"
        data-testid="side-panel-tab-view"
      >
        View
      </Tabs.Trigger>
    </Tabs.List>

    {#if oncollapse}
      <button
        type="button"
        class="side-panel-collapse-btn"
        aria-label="Collapse panel"
        aria-expanded="true"
        onclick={oncollapse}
        data-testid="side-panel-collapse"
      >
        <IconChevronRight size={ICON_SIZE.md} />
      </button>
    {/if}
  </div>

  <Tabs.Content
    value="edit"
    class="side-panel-tabpanel"
    data-testid="side-panel-panel-edit"
  >
    <h2 id={editHeadingId} class="side-panel-heading" tabindex="-1">
      {editHeadingLabel}
    </h2>
    {#if selectedRack}
      <EditPanelRack {selectedRack} {selectedGroup} />
    {:else if selectedDeviceInfo}
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
    {#if !hasEditSelection}
      <p class="side-panel-empty" data-testid="side-panel-edit-empty">
        Select a rack or device to edit its properties.
      </p>
    {/if}
  </Tabs.Content>

  <Tabs.Content
    value="view"
    class="side-panel-tabpanel"
    data-testid="side-panel-panel-view"
  >
    <h2 id={viewHeadingId} class="side-panel-heading" tabindex="-1">View</h2>
    <ViewControls />
  </Tabs.Content>
</Tabs.Root>

<ConfirmDialog
  open={showDeleteConfirm}
  title="Delete Device Type"
  message={`Delete "${selectedDeviceInfo?.device.model ?? selectedDeviceInfo?.device.slug}"? ${deviceTypePlacementCount > 0 ? `This device is placed ${deviceTypePlacementCount} time${deviceTypePlacementCount === 1 ? "" : "s"}. All instances will be removed.` : "This will remove the device from your library."}`}
  confirmLabel="Delete"
  onconfirm={confirmDeleteDeviceType}
  oncancel={cancelDeleteDeviceType}
/>

<style>
  :global(.side-panel-tabs) {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .side-panel-tablist-row {
    display: flex;
    align-items: stretch;
    gap: var(--space-1);
    padding: var(--space-2);
    border-bottom: 1px solid var(--colour-border);
    background: var(--drawer-bg);
    flex-shrink: 0;
  }

  :global(.side-panel-tablist) {
    display: flex;
    flex: 1;
    gap: var(--space-1);
    min-width: 0;
  }

  /* 44px-square collapse control on the panel's outer edge (issue #2397),
     matching the tab height and the left panel's collapse chevron. */
  .side-panel-collapse-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--panel-collapsed-strip-width, 44px);
    height: var(--panel-collapsed-strip-width, 44px);
    flex-shrink: 0;
    padding: 0;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    color: var(--colour-text-muted);
    cursor: pointer;
    transition:
      background-color var(--duration-fast) var(--ease-out),
      color var(--duration-fast) var(--ease-out);
  }

  .side-panel-collapse-btn:hover {
    background: var(--colour-surface-hover);
    color: var(--colour-text);
  }

  .side-panel-collapse-btn:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: -2px;
  }

  /* Layout-only rules. The raised "layered sheet" look (background, colour, top
     accent, rounded top corners, active merge) is shared via tabs.css. */
  :global(.side-panel-tab) {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    /* 44px minimum touch target (mobile spike #2097 / a11y guard rail) */
    min-height: 44px;
    padding: var(--space-2) var(--space-3);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-out),
      color var(--duration-fast) var(--ease-out);
  }

  :global(.side-panel-tab:focus-visible) {
    outline: 2px solid var(--colour-selection);
    outline-offset: -2px;
  }

  :global(.side-panel-tabpanel) {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: var(--space-4);
  }

  :global(.side-panel-tabpanel:focus-visible) {
    outline: 2px solid var(--colour-selection);
    outline-offset: -2px;
  }

  .side-panel-heading {
    margin: 0 0 var(--space-4);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-semibold);
    color: var(--colour-text);
  }

  /* Heading is a programmatic focus target (tabindex -1) after expand/tab switch. */
  .side-panel-heading:focus {
    outline: none;
  }

  .side-panel-heading:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: 2px;
    border-radius: var(--radius-sm);
  }

  .device-view {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .side-panel-empty {
    margin: 0;
    color: var(--colour-text-muted);
    font-size: var(--font-size-sm);
    line-height: var(--line-height-relaxed, 1.6);
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.side-panel-tab),
    .side-panel-collapse-btn {
      transition: none;
    }
  }
</style>
