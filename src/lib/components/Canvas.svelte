<!--
  Canvas Component
  Main content area displaying racks
  Multi-rack mode: displays all racks with active selection indicator
  Uses panzoom for zoom and pan functionality
-->
<script lang="ts">
  import { onMount } from "svelte";
  import panzoom from "panzoom";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getSelectionStore } from "$lib/stores/selection.svelte";
  import {
    getCanvasStore,
    ZOOM_MIN,
    ZOOM_MAX,
  } from "$lib/stores/canvas.svelte";
  import { getUIStore } from "$lib/stores/ui.svelte";
  import { debug } from "$lib/utils/debug";
  import { getPlacementStore } from "$lib/stores/placement.svelte";
  // Note: getViewportStore removed - was only used for PlacementIndicator condition
  import { hapticSuccess } from "$lib/utils/haptics";
  import { toHumanUnits } from "$lib/utils/position";
  import RackDualView from "./RackDualView.svelte";
  import BayedRackView from "./BayedRackView.svelte";
  import WelcomeScreen from "./WelcomeScreen.svelte";
  import CanvasContextMenu from "./CanvasContextMenu.svelte";
  // Note: PlacementIndicator removed - placement UI now integrated into Rack.svelte

  // Multi-rack mode: use active rack ID from store

  interface Props {
    partyMode?: boolean;
    /** Enable long press gesture for mobile rack editing */
    enableLongPress?: boolean;
    onnewrack?: () => void;
    onload?: () => void;
    onfitall?: () => void;
    onresetzoom?: () => void;
    ontoggletheme?: () => void;
    onrackselect?: (event: CustomEvent<{ rackId: string }>) => void;
    ondeviceselect?: (
      event: CustomEvent<{ slug: string; position: number }>,
    ) => void;
    ondevicedrop?: (
      event: CustomEvent<{
        rackId: string;
        slug: string;
        position: number;
        face: "front" | "rear";
        slot_position?: import("$lib/types").SlotPosition;
      }>,
    ) => void;
    ondevicemove?: (
      event: CustomEvent<{
        rackId: string;
        deviceIndex: number;
        newPosition: number;
      }>,
    ) => void;
    ondevicemoverack?: (
      event: CustomEvent<{
        sourceRackId: string;
        sourceIndex: number;
        targetRackId: string;
        targetPosition: number;
      }>,
    ) => void;
    /** Mobile long press for rack editing */
    onracklongpress?: (event: CustomEvent<{ rackId: string }>) => void;
    /** Rack context menu: edit rack callback */
    onrackedit?: (rackId: string) => void;
    /** Rack context menu: rename rack callback */
    onrackrename?: (rackId: string) => void;
    /** Rack context menu: duplicate rack callback */
    onrackduplicate?: (rackId: string) => void;
    /** Rack context menu: delete rack callback */
    onrackdelete?: (rackId: string) => void;
    /** Rack context menu: export rack callback */
    onrackexport?: (rackIds: string[]) => void;
    /** Rack context menu: focus rack callback (pans and zooms canvas to fit the rack) */
    onrackfocus?: (rackIds: string[]) => void;
  }

  let {
    partyMode = false,
    enableLongPress = false,
    onnewrack,
    onload: _onload,
    onfitall,
    onresetzoom,
    ontoggletheme,
    onrackselect,
    ondeviceselect,
    ondevicedrop,
    ondevicemove,
    ondevicemoverack,
    onracklongpress,
    onrackedit,
    onrackrename,
    onrackduplicate,
    onrackdelete,
    onrackexport,
    onrackfocus,
  }: Props = $props();

  const layoutStore = getLayoutStore();
  const selectionStore = getSelectionStore();
  const canvasStore = getCanvasStore();
  const uiStore = getUIStore();
  // Note: viewportStore removed - was only used for PlacementIndicator condition
  const placementStore = getPlacementStore();

  // Note: handlePlacementCancel removed - now handled in Rack.svelte

  // Handle mobile tap-to-place (uses active rack)
  function handlePlacementTap(
    rackId: string,
    event: CustomEvent<{ position: number; face: "front" | "rear" }>,
  ) {
    const device = placementStore.pendingDevice;
    if (!device) return;

    const { position, face } = event.detail;
    const success = layoutStore.placeDevice(
      rackId,
      device.slug,
      position,
      face,
    );

    if (success) {
      hapticSuccess();
      placementStore.completePlacement();
      // Reset view to show full rack after placement completes
      canvasStore.fitAll(layoutStore.racks, layoutStore.rack_groups);
    }
  }

  // Multi-rack mode: access all racks
  const racks = $derived(layoutStore.racks);
  const activeRackId = $derived(layoutStore.activeRackId);
  const hasRacks = $derived(layoutStore.rackCount > 0);
  const rackGroups = $derived(layoutStore.rack_groups);

  // Organize racks: grouped racks in their groups, then ungrouped racks
  const organizedRacks = $derived.by(() => {
    const groupedRackIds = new Set(rackGroups.flatMap((g) => g.rack_ids));
    const ungroupedRacks = racks.filter((r) => !groupedRackIds.has(r.id));

    // Build group entries with their racks
    const groupEntries = rackGroups
      .map((group) => ({
        group,
        racks: group.rack_ids
          .map((id) => racks.find((r) => r.id === id))
          .filter((r): r is (typeof racks)[0] => r !== undefined),
      }))
      .filter((entry) => entry.racks.length > 0);

    return { groupEntries, ungroupedRacks };
  });

  // Determine the rightmost rack ID for "banana for scale" display
  // Visual layout: groups render left-to-right, then ungrouped racks
  const rightmostRackId = $derived.by(() => {
    const { groupEntries, ungroupedRacks } = organizedRacks;

    // Ungrouped racks appear after groups, so rightmost is last ungrouped rack
    if (ungroupedRacks.length > 0) {
      return ungroupedRacks[ungroupedRacks.length - 1].id;
    }

    // No ungrouped racks - check last group entry
    if (groupEntries.length > 0) {
      const lastGroup = groupEntries[groupEntries.length - 1];
      // For bayed groups, banana isn't supported (BayedRackView doesn't render it)
      // For non-bayed groups, rightmost is the last rack in the group
      if (
        lastGroup.group.layout_preset !== "bayed" &&
        lastGroup.racks.length > 0
      ) {
        return lastGroup.racks[lastGroup.racks.length - 1].id;
      }
    }

    return null;
  });

  // Panzoom container reference
  let panzoomContainer: HTMLDivElement | null = $state(null);
  let canvasContainer: HTMLDivElement | null = $state(null);

  // Set canvas element for viewport measurements
  onMount(() => {
    if (canvasContainer) {
      canvasStore.setCanvasElement(canvasContainer);
    }
  });

  // Initialize panzoom reactively when container becomes available
  $effect(() => {
    if (panzoomContainer) {
      const instance = panzoom(panzoomContainer, {
        minZoom: ZOOM_MIN,
        maxZoom: ZOOM_MAX,
        smoothScroll: false,
        // Disable default zoom on double-click (we handle zoom via toolbar)
        zoomDoubleClickSpeed: 1,
        // Handle wheel events for zoom and Shift+scroll for horizontal pan
        beforeWheel: (e: WheelEvent) => {
          // Shift+scroll = horizontal pan instead of zoom
          if (e.shiftKey) {
            debug.log("beforeWheel: Shift+scroll, performing horizontal pan");
            // Panzoom will handle this as pan when we return true (ignore zoom)
            // We need to manually pan since panzoom doesn't do Shift+scroll pan
            const panAmount = e.deltaY; // Use deltaY (vertical scroll) as horizontal pan
            const transform = instance.getTransform();
            instance.moveTo(transform.x - panAmount, transform.y);
            e.preventDefault();
            return true; // Tell panzoom to ignore this wheel event (we handled it)
          }
          // Normal scroll = zoom centered on cursor (panzoom default behavior)
          debug.log("beforeWheel: zoom at cursor position");
          return false; // Let panzoom handle zoom
        },
        // Allow panning only when not interacting with drag targets
        beforeMouseDown: (e: MouseEvent) => {
          const target = e.target as HTMLElement;

          // Priority 1: Check if target or any parent is draggable (device drag-drop)
          // For SVGElements, we need to check the draggable attribute differently
          const isDraggableElement =
            (target as HTMLElement).draggable === true ||
            target.getAttribute?.("draggable") === "true" ||
            target.closest?.('[draggable="true"]') !== null;

          if (isDraggableElement) {
            debug.log("beforeMouseDown: blocking pan for draggable element");
            return true; // Block panning, let drag-drop work
          }

          // Priority 2: Check if target is within a rack area
          // This includes: rack-dual-view, rack-container, rack-svg, and all children
          // Clicking anywhere in rack should select it, not pan
          const isWithinRack = target.closest?.(".rack-dual-view") !== null;

          if (isWithinRack) {
            debug.log("beforeMouseDown: blocking pan for rack area element");
            return true; // Block panning, let rack selection work
          }

          // Priority 3: Allow panning only on canvas background outside racks
          debug.log("beforeMouseDown: allowing pan on canvas background");
          return false;
        },
        // Filter out drag events from panzoom handling
        filterKey: () => true,
      });

      debug.log("Panzoom initialized on container:", panzoomContainer);
      canvasStore.setPanzoomInstance(instance);

      // Center content on initial load
      requestAnimationFrame(() => {
        canvasStore.fitAll(racks, rackGroups);
      });

      // Set up ResizeObserver to auto-fit when viewport changes (sidebar collapse, etc.)
      let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
      let initialLoadComplete = false;

      // Mark initial load as complete after a short delay
      const initTimeout = setTimeout(() => {
        initialLoadComplete = true;
      }, 100);

      const resizeObserver = new ResizeObserver(() => {
        // Skip if initial load hasn't completed (fitAll already called above)
        if (!initialLoadComplete) return;

        // Debounce resize events (300ms)
        if (resizeTimeout) clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          debug.log("ResizeObserver: viewport changed, calling fitAll");
          canvasStore.fitAll(layoutStore.racks, layoutStore.rack_groups);
        }, 300);
      });

      if (canvasContainer) {
        resizeObserver.observe(canvasContainer);
      }

      return () => {
        debug.log("Disposing panzoom");
        canvasStore.disposePanzoom();
        if (resizeTimeout) clearTimeout(resizeTimeout);
        clearTimeout(initTimeout);
        resizeObserver.disconnect();
      };
    }
  });

  function handleCanvasClick(event: MouseEvent) {
    // Only clear selection if clicking directly on the canvas (not on a rack)
    if (event.target === event.currentTarget) {
      selectionStore.clearSelection();
      layoutStore.setActiveRack(null);
    }
  }

  function handleRackSelect(event: CustomEvent<{ rackId: string }>) {
    const { rackId } = event.detail;
    layoutStore.setActiveRack(rackId);
    selectionStore.selectRack(rackId);
    onrackselect?.(event);
  }

  function handleGroupSelect(event: CustomEvent<{ groupId: string }>) {
    const { groupId } = event.detail;
    // Find the first rack in the group to set as active (for device operations)
    const group = layoutStore.rack_groups.find((g) => g.id === groupId);
    let firstRackId: string | undefined;
    if (group && group.rack_ids.length > 0) {
      // Find the first rack in the group
      const firstRack = racks.find((r) => r.id === group.rack_ids[0]);
      if (firstRack) {
        firstRackId = firstRack.id;
        layoutStore.setActiveRack(firstRackId);
      }
    }
    selectionStore.selectGroup(groupId, firstRackId);
  }

  function handleDeviceSelect(
    rackId: string,
    event: CustomEvent<{ slug: string; position: number }>,
  ) {
    // Find the device by slug and position, then select by ID (UUID-based tracking)
    const targetRack = layoutStore.getRackById(rackId);
    if (targetRack) {
      const device = targetRack.devices.find(
        (d) =>
          d.device_type === event.detail.slug &&
          d.position === event.detail.position,
      );
      if (device) {
        layoutStore.setActiveRack(rackId);
        selectionStore.selectDevice(rackId, device.id);
      }
    }
    ondeviceselect?.(event);
  }

  function handleNewRack() {
    onnewrack?.();
  }

  function handleDeviceDrop(
    event: CustomEvent<{
      rackId: string;
      slug: string;
      position: number;
      face: "front" | "rear";
      slot_position?: import("$lib/types").SlotPosition;
    }>,
  ) {
    const { rackId, slug, position, face, slot_position } = event.detail;
    layoutStore.placeDevice(rackId, slug, position, face, slot_position);
    ondevicedrop?.(event);
  }

  function handleDeviceMove(
    event: CustomEvent<{
      rackId: string;
      deviceIndex: number;
      newPosition: number;
    }>,
  ) {
    const { rackId, deviceIndex, newPosition } = event.detail;
    layoutStore.moveDevice(rackId, deviceIndex, newPosition);
    ondevicemove?.(event);
  }

  function handleDeviceMoveRack(
    event: CustomEvent<{
      sourceRackId: string;
      sourceIndex: number;
      targetRackId: string;
      targetPosition: number;
    }>,
  ) {
    const { sourceRackId, sourceIndex, targetRackId, targetPosition } =
      event.detail;
    layoutStore.moveDeviceToRack(
      sourceRackId,
      sourceIndex,
      targetRackId,
      targetPosition,
    );
    ondevicemoverack?.(event);
  }

  // NOTE: handleRackViewChange removed in v0.4 (dual-view mode - always show both)

  // Screen reader accessible description of rack contents
  const rackDescription = $derived.by(() => {
    if (racks.length === 0) return "No racks configured";
    const rackWord = racks.length === 1 ? "rack" : "racks";
    const totalDevices = racks.reduce((sum, r) => sum + r.devices.length, 0);
    const deviceWord = totalDevices === 1 ? "device" : "devices";
    return `${racks.length} ${rackWord} with ${totalDevices} ${deviceWord} total`;
  });

  const deviceListDescription = $derived.by(() => {
    const activeRack = layoutStore.activeRack;
    if (!activeRack || activeRack.devices.length === 0) return "";
    const deviceNames = [...activeRack.devices]
      .sort((a, b) => b.position - a.position) // Top to bottom (internal units preserve order)
      .map((d) => {
        const deviceType = layoutStore.device_types.find(
          (dt) => dt.slug === d.device_type,
        );
        const name = d.label || deviceType?.model || d.device_type;
        // Convert internal units to human U for display
        return `U${toHumanUnits(d.position)}: ${name}`;
      });
    return `Active rack devices from top to bottom: ${deviceNames.join(", ")}`;
  });

  function handleCanvasKeydown(event: KeyboardEvent) {
    // Handle Enter/Space as click for accessibility
    if (event.key === "Enter" || event.key === " ") {
      selectionStore.clearSelection();
    }
  }
</script>

<!-- eslint-disable-next-line svelte/no-unused-svelte-ignore -- these warnings appear in Vite build but not ESLint -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (role="application" makes this interactive per WAI-ARIA) -->
<CanvasContextMenu
  onnewrack={handleNewRack}
  onfitall={() => onfitall?.() ?? canvasStore.fitAll(racks, rackGroups)}
  onresetzoom={() => onresetzoom?.() ?? canvasStore.resetZoom()}
  {ontoggletheme}
  theme={uiStore.theme}
>
  <div
    class="canvas"
    class:party-mode={partyMode}
    role="application"
    aria-label={rackDescription}
    aria-describedby={deviceListDescription ? "canvas-device-list" : undefined}
    tabindex="0"
    bind:this={canvasContainer}
    onclick={handleCanvasClick}
    onkeydown={handleCanvasKeydown}
  >
    <!-- Note: Mobile placement indicator now integrated into Rack.svelte -->

    <!-- Hidden description for screen readers -->
    {#if deviceListDescription}
      <p id="canvas-device-list" class="sr-only">{deviceListDescription}</p>
    {/if}
    {#if hasRacks}
      <div class="panzoom-container" bind:this={panzoomContainer}>
        <!-- Multi-rack mode: render racks with visual grouping -->
        <div class="racks-wrapper">
          <!-- Render grouped racks with group labels -->
          {#each organizedRacks.groupEntries as { group, racks: groupRacks } (group.id)}
            {#if group.layout_preset === "bayed"}
              <!-- Bayed/touring racks use special stacked view -->
              <!-- showRear derived from first rack in group (all bays share the same setting) -->
              <BayedRackView
                {group}
                racks={groupRacks}
                deviceLibrary={layoutStore.device_types}
                {activeRackId}
                selectedDeviceId={selectionStore.selectedType === "device"
                  ? selectionStore.selectedDeviceId
                  : null}
                selectedRackId={selectionStore.selectedType === "rack" ||
                selectionStore.selectedType === "group"
                  ? selectionStore.selectedRackId
                  : null}
                selectedGroupId={selectionStore.selectedType === "group"
                  ? selectionStore.selectedGroupId
                  : null}
                displayMode={uiStore.displayMode}
                showLabelsOnImages={uiStore.showLabelsOnImages}
                showRear={groupRacks[0]?.show_rear ?? true}
                showAnnotations={uiStore.showAnnotations}
                annotationField={uiStore.annotationField}
                {partyMode}
                {enableLongPress}
                ongroupselect={handleGroupSelect}
                ondeviceselect={(e) => {
                  const rackId = activeRackId ?? groupRacks[0]?.id;
                  if (rackId) handleDeviceSelect(rackId, e);
                }}
                ondevicedrop={(e) => handleDeviceDrop(e)}
                ondevicemove={(e) => handleDeviceMove(e)}
                ondevicemoverack={(e) => handleDeviceMoveRack(e)}
                onplacementtap={(e) => {
                  const rackId = activeRackId ?? groupRacks[0]?.id;
                  if (rackId) handlePlacementTap(rackId, e);
                }}
                onlongpress={(e) => onracklongpress?.(e)}
                onexport={(rackIds) => onrackexport?.(rackIds)}
                onfocus={onrackfocus}
                onedit={(rackId) => onrackedit?.(rackId)}
                onrename={(rackId) => onrackrename?.(rackId)}
                onduplicate={(rackId) => onrackduplicate?.(rackId)}
                ondelete={(rackId) => onrackdelete?.(rackId)}
              />
            {:else}
              <!-- Standard row layout for non-bayed groups -->
              <div class="rack-group">
                <div class="group-label">{group.name ?? "Group"}</div>
                <div class="group-racks">
                  {#each groupRacks as rack (rack.id)}
                    {@const isActive = rack.id === activeRackId}
                    {@const isSelected =
                      selectionStore.selectedType === "rack" &&
                      selectionStore.selectedRackId === rack.id}
                    <div class="rack-wrapper" class:active={isActive}>
                      <RackDualView
                        {rack}
                        deviceLibrary={layoutStore.device_types}
                        selected={isSelected}
                        {isActive}
                        selectedDeviceId={selectionStore.selectedType ===
                          "device" && selectionStore.selectedRackId === rack.id
                          ? selectionStore.selectedDeviceId
                          : null}
                        displayMode={uiStore.displayMode}
                        showLabelsOnImages={uiStore.showLabelsOnImages}
                        showAnnotations={uiStore.showAnnotations}
                        annotationField={uiStore.annotationField}
                        showBanana={uiStore.showBanana &&
                          rack.id === rightmostRackId}
                        {partyMode}
                        {enableLongPress}
                        onselect={(e) => handleRackSelect(e)}
                        ondeviceselect={(e) => handleDeviceSelect(rack.id, e)}
                        ondevicedrop={(e) => handleDeviceDrop(e)}
                        ondevicemove={(e) => handleDeviceMove(e)}
                        ondevicemoverack={(e) => handleDeviceMoveRack(e)}
                        onplacementtap={(e) => handlePlacementTap(rack.id, e)}
                        onlongpress={(e) => onracklongpress?.(e)}
                        onexport={() => onrackexport?.([rack.id])}
                        onfocus={onrackfocus
                          ? () => onrackfocus([rack.id])
                          : undefined}
                        onedit={() => onrackedit?.(rack.id)}
                        onrename={() => onrackrename?.(rack.id)}
                        onduplicate={() => onrackduplicate?.(rack.id)}
                        ondelete={() => onrackdelete?.(rack.id)}
                      />
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          {/each}

          <!-- Render ungrouped racks -->
          {#each organizedRacks.ungroupedRacks as rack (rack.id)}
            {@const isActive = rack.id === activeRackId}
            {@const isSelected =
              selectionStore.selectedType === "rack" &&
              selectionStore.selectedRackId === rack.id}
            <div class="rack-wrapper" class:active={isActive}>
              <RackDualView
                {rack}
                deviceLibrary={layoutStore.device_types}
                selected={isSelected}
                {isActive}
                selectedDeviceId={selectionStore.selectedType === "device" &&
                selectionStore.selectedRackId === rack.id
                  ? selectionStore.selectedDeviceId
                  : null}
                displayMode={uiStore.displayMode}
                showLabelsOnImages={uiStore.showLabelsOnImages}
                showAnnotations={uiStore.showAnnotations}
                annotationField={uiStore.annotationField}
                showBanana={uiStore.showBanana && rack.id === rightmostRackId}
                {partyMode}
                {enableLongPress}
                onselect={(e) => handleRackSelect(e)}
                ondeviceselect={(e) => handleDeviceSelect(rack.id, e)}
                ondevicedrop={(e) => handleDeviceDrop(e)}
                ondevicemove={(e) => handleDeviceMove(e)}
                ondevicemoverack={(e) => handleDeviceMoveRack(e)}
                onplacementtap={(e) => handlePlacementTap(rack.id, e)}
                onlongpress={(e) => onracklongpress?.(e)}
                onexport={() => onrackexport?.([rack.id])}
                onfocus={onrackfocus ? () => onrackfocus([rack.id]) : undefined}
                onedit={() => onrackedit?.(rack.id)}
                onrename={() => onrackrename?.(rack.id)}
                onduplicate={() => onrackduplicate?.(rack.id)}
                ondelete={() => onrackdelete?.(rack.id)}
              />
            </div>
          {/each}
        </div>
      </div>
    {:else}
      <WelcomeScreen onclick={handleNewRack} />
    {/if}
  </div>
</CanvasContextMenu>

<style>
  .canvas {
    flex: 1;
    overflow: hidden;
    background-color: var(--canvas-bg);
    min-height: 0;
    position: relative;
  }

  .panzoom-container {
    /* No flexbox centering - panzoom controls all positioning */
    /* fitAll() centers content on load and when toolbar button clicked */
    min-width: 100%;
    min-height: 100%;
    transform-origin: 0 0;
    touch-action: none;
    cursor: grab;
  }

  .panzoom-container:active {
    cursor: grabbing;
  }

  .racks-wrapper {
    /* Multi-rack mode: horizontal layout of all racks */
    display: flex;
    flex-direction: row;
    gap: var(--space-6);
    padding: var(--space-4);
  }

  .rack-wrapper {
    /* Individual rack container with active indicator */
    display: inline-block;
    border-radius: var(--radius-lg);
    transition: box-shadow var(--duration-fast) var(--ease-out);
  }

  /* NOTE: .rack-wrapper.active box-shadow removed - selection outline in
     RackDualView/BayedRackView now handles visual feedback to avoid double rings */

  /* Rack group visual container (for non-bayed groups; bayed uses BayedRackView) */
  .rack-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 2px dashed var(--colour-border);
    border-radius: var(--radius-lg);
    background: var(--colour-surface-overlay, rgba(40, 42, 54, 0.3));
  }

  .group-label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold, 600);
    color: var(--colour-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0 var(--space-1);
  }

  .group-racks {
    display: flex;
    flex-direction: row;
    gap: var(--space-4);
  }

  /* Party mode: animated gradient background */
  @keyframes party-bg {
    0% {
      background-color: hsl(0, 30%, 12%);
    }
    33% {
      background-color: hsl(120, 30%, 12%);
    }
    66% {
      background-color: hsl(240, 30%, 12%);
    }
    100% {
      background-color: hsl(360, 30%, 12%);
    }
  }

  .canvas.party-mode {
    animation: party-bg 4s linear infinite;
  }

  /* Respect reduced motion preference */
  @media (prefers-reduced-motion: reduce) {
    .canvas.party-mode {
      animation: none;
    }
  }
</style>
