<!--
  Rack SVG Component
  Orchestrates sub-components for rack visualisation and interaction.

  Sub-components:
  - RackFrame: static frame (rails, grid, labels, blocked slots)
  - RackDropZone: drop preview indicator
  - RackPlacementHeader: mobile placement header overlay
  - RackChristmasHat: seasonal easter egg

  Logic modules:
  - rack-drop-coordinator: drop target resolution pipeline
  - rack-drop-handlers: drop action event dispatch
  - rack-interaction-handlers: native DnD + touch event handlers
  - rack-pointer-drag: custom pointer drag listeners (Safari fix)
  - rack-context-actions: device context menu actions
  - rack-context-menu-handlers: context menu UI delegation
-->
<script lang="ts">
  // @ts-nocheck
  import type {
    Rack as RackType,
    DeviceType,
    DeviceFace,
    DisplayMode,
    PlacedDevice,
    SlotPosition,
  } from "$lib/types";
  import RackDevice from "./RackDevice.svelte";
  import RackFrame from "./RackFrame.svelte";
  import RackDropZone from "./RackDropZone.svelte";
  import RackPlacementHeader from "./RackPlacementHeader.svelte";
  import RackChristmasHat from "./RackChristmasHat.svelte";
  import DeviceContextMenu from "./DeviceContextMenu.svelte";
  import {
    getDropFeedback,
    type ContainerHoverInfo,
  } from "$lib/utils/dragdrop";
  import { getToastStore } from "$lib/stores/toast.svelte";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getSelectionStore } from "$lib/stores/selection.svelte";
  import { getCanvasStore } from "$lib/stores/canvas.svelte";
  import { getBlockedSlots } from "$lib/utils/blocked-slots";
  import { isChristmas } from "$lib/utils/christmas";
  import { getViewportStore } from "$lib/utils/viewport.svelte";
  import { getPlacementStore } from "$lib/stores/placement.svelte";
  import { hapticCancel } from "$lib/utils/haptics";
  import { SvelteSet, SvelteMap } from "svelte/reactivity";
  import { toHumanUnits } from "$lib/utils/position";
  import {
    U_HEIGHT_PX,
    RAIL_WIDTH as RAIL_WIDTH_CONST,
    BASE_RACK_WIDTH,
    BASE_RACK_PADDING as BASE_RACK_PADDING_CONST,
    RACK_PADDING_HIDDEN,
    NAME_Y_OFFSET as NAME_Y_OFFSET_CONST,
  } from "$lib/constants/layout";
  import { type RackDimensions } from "$lib/utils/rack-drop-coordinator";
  import { createContextMenuActions } from "$lib/utils/rack-context-actions";
  import { type RackEventCallbacks } from "$lib/utils/rack-drop-handlers";
  import {
    handleDragOver as onDragOver,
    handleDragEnter as onDragEnter,
    handleDragLeave as onDragLeave,
    handleDrop as onDrop,
    handleTouchEnd as onTouchEnd,
    type RackHandlerContext,
    type DropPreviewState,
  } from "$lib/utils/rack-interaction-handlers";
  import { attachPointerDragListeners } from "$lib/utils/rack-pointer-drag";
  import { createContextMenuHandlers } from "$lib/utils/rack-context-menu-handlers";

  const canvasStore = getCanvasStore();
  const viewportStore = getViewportStore();
  const placementStore = getPlacementStore();
  const toastStore = getToastStore();
  const layoutStore = getLayoutStore();
  const selectionStore = getSelectionStore();

  const showChristmasHats = isChristmas();
  const DRAG_CLICK_DEBOUNCE_MS = 100;

  interface Props {
    rack: RackType;
    deviceLibrary: DeviceType[];
    selected: boolean;
    selectedDeviceId?: string | null;
    displayMode?: DisplayMode;
    showLabelsOnImages?: boolean;
    faceFilter?: "front" | "rear";
    viewLabel?: string;
    hideRackName?: boolean;
    hideULabels?: boolean;
    partyMode?: boolean;
    onselect?: (event: CustomEvent<{ rackId: string }>) => void;
    ondeviceselect?: (
      event: CustomEvent<{ slug: string; position: number }>,
    ) => void;
    ondevicedrop?: (
      event: CustomEvent<{
        rackId: string;
        slug: string;
        position: number;
        slot_position?: SlotPosition;
      }>,
    ) => void;
    ondevicemove?: (
      event: CustomEvent<{
        rackId: string;
        deviceIndex: number;
        newPosition: number;
        slot_position?: SlotPosition;
      }>,
    ) => void;
    ondevicemoverack?: (
      event: CustomEvent<{
        sourceRackId: string;
        sourceIndex: number;
        targetRackId: string;
        targetPosition: number;
        face: DeviceFace;
        slot_position?: SlotPosition;
      }>,
    ) => void;
    onplacementtap?: (
      event: CustomEvent<{ position: number; face: "front" | "rear" }>,
    ) => void;
  }

  let {
    rack,
    deviceLibrary,
    selected,
    selectedDeviceId = null,
    displayMode = "label",
    showLabelsOnImages = false,
    faceFilter,
    viewLabel,
    hideRackName = false,
    hideULabels = false,
    partyMode = false,
    onselect,
    ondeviceselect,
    ondevicedrop,
    ondevicemove,
    ondevicemoverack,
    onplacementtap,
  }: Props = $props();

  // --- Drag state ---
  let _draggingDeviceIndex = $state<number | null>(null);
  let justFinishedDrag = $state(false);
  let dragDebounceTimeout: ReturnType<typeof setTimeout> | null = null;
  let shiftKeyHeld = $state(false);
  let svgElement: SVGSVGElement | null = $state(null);
  let dropPreview = $state<DropPreviewState | null>(null);
  let containerHoverInfo = $state<ContainerHoverInfo | null>(null);

  // --- Context menu state ---
  let contextMenuOpen = $state(false);
  let contextMenuTarget = $state<{
    rackId: string;
    deviceIndex: number;
    x: number;
    y: number;
  } | null>(null);

  // Cleanup timeout on unmount
  $effect(() => {
    return () => {
      if (dragDebounceTimeout) {
        clearTimeout(dragDebounceTimeout);
        dragDebounceTimeout = null;
      }
    };
  });

  // --- Utility lookups ---
  function getDeviceBySlug(slug: string): DeviceType | undefined {
    return deviceLibrary.find((d) => d.slug === slug);
  }

  function getContainerContext(childDevice: PlacedDevice) {
    if (!childDevice.container_id) return undefined;
    const container = rack.devices.find(
      (d) => d.id === childDevice.container_id,
    );
    if (!container) return undefined;
    const containerType = getDeviceBySlug(container.device_type);
    if (!containerType) return undefined;
    const slot = containerType.slots?.find((s) => s.id === childDevice.slot_id);
    return {
      containerName: containerType.model ?? containerType.slug,
      containerPosition: toHumanUnits(container.position),
      slotName: slot?.name ?? childDevice.slot_id ?? "Unknown",
    };
  }

  // --- Layout constants & derived dimensions ---
  const U_HEIGHT = U_HEIGHT_PX;
  const RAIL_WIDTH = RAIL_WIDTH_CONST;
  const NAME_Y_OFFSET = NAME_Y_OFFSET_CONST;

  const RACK_WIDTH = $derived(Math.round((BASE_RACK_WIDTH * rack.width) / 19));
  const RACK_PADDING = $derived(
    hideRackName ? RACK_PADDING_HIDDEN : BASE_RACK_PADDING_CONST,
  );
  const viewBoxYOffset = $derived(hideRackName ? 0 : NAME_Y_OFFSET);
  const totalHeight = $derived(rack.height * U_HEIGHT);
  const viewBoxHeight = $derived(RACK_PADDING + RAIL_WIDTH * 2 + totalHeight);
  const interiorWidth = $derived(RACK_WIDTH - RAIL_WIDTH * 2);
  const effectiveFaceFilter = $derived(faceFilter ?? rack.view);

  const rackDims = $derived<RackDimensions>({
    rackHeight: rack.height,
    rackWidth: RACK_WIDTH,
    interiorWidth,
    uHeight: U_HEIGHT,
    rackPadding: RACK_PADDING,
    railWidth: RAIL_WIDTH,
  });

  const eventCallbacks = $derived<RackEventCallbacks>({
    ondevicemove,
    ondevicemoverack,
    ondevicedrop,
  });

  // --- Context menu & action helpers ---
  const contextActions = createContextMenuActions(
    layoutStore,
    selectionStore,
    toastStore,
  );

  const ctxMenu = createContextMenuHandlers(
    contextActions,
    () => ({ open: contextMenuOpen, target: contextMenuTarget }),
    (s) => {
      contextMenuOpen = s.open;
      contextMenuTarget = s.target;
    },
  );

  // --- Derived data for rendering ---
  const uLabels = $derived(
    Array.from({ length: rack.height }, (_, i) => {
      const startUnit = rack.starting_unit ?? 1;
      const uNumber = rack.desc_units
        ? startUnit + i
        : startUnit + (rack.height - 1) - i;
      const yPosition = i * U_HEIGHT + U_HEIGHT / 2 + RACK_PADDING + RAIL_WIDTH;
      return { uNumber, yPosition };
    }),
  );

  const visibleDevices = $derived(
    rack.devices
      .map((placedDevice, originalIndex) => ({ placedDevice, originalIndex }))
      .filter(({ placedDevice }) => {
        if (placedDevice.container_id) return false;
        return (
          placedDevice.face === "both" ||
          placedDevice.face === effectiveFaceFilter
        );
      }),
  );

  const containerChildren = $derived.by(() => {
    const map = new SvelteMap<
      string,
      Array<{ placedDevice: PlacedDevice; originalIndex: number }>
    >();
    rack.devices.forEach((pd, idx) => {
      if (!pd.container_id) return;
      if (pd.face !== "both" && pd.face !== effectiveFaceFilter) return;
      const children = map.get(pd.container_id) ?? [];
      children.push({ placedDevice: pd, originalIndex: idx });
      map.set(pd.container_id, children);
    });
    return map;
  });

  const blockedSlots = $derived(
    faceFilter ? getBlockedSlots(rack, faceFilter, deviceLibrary) : [],
  );
  const isPlacementMode = $derived(
    viewportStore.isMobile && placementStore.isPlacing,
  );

  const validPlacementSlots = $derived.by(() => {
    if (!isPlacementMode || !placementStore.pendingDevice)
      return new SvelteSet<number>();
    const { u_height: deviceHeight } = placementStore.pendingDevice;
    const validSlots = new SvelteSet<number>();
    for (let startU = 1; startU <= rack.height - deviceHeight + 1; startU++) {
      if (
        getDropFeedback(
          rack,
          deviceLibrary,
          deviceHeight,
          startU,
          undefined,
          effectiveFaceFilter,
        ) === "valid"
      ) {
        for (let u = startU; u < startU + deviceHeight; u++) validSlots.add(u);
      }
    }
    return validSlots;
  });

  // --- Handler context for extracted interaction handlers ---
  const handlerCtx = $derived<RackHandlerContext>({
    getRack: () => rack,
    getDeviceLibrary: () => deviceLibrary,
    getRackDims: () => rackDims,
    getFaceFilter: () => effectiveFaceFilter,
    getSelectedDeviceId: () => selectedDeviceId,
    getEventCallbacks: () => eventCallbacks,
    setDropPreview: (p) => {
      dropPreview = p;
    },
    setContainerHoverInfo: (i) => {
      containerHoverInfo = i;
    },
    layoutStore,
    toastStore,
  });

  // --- Drag debounce helper ---
  function setDragFinished() {
    justFinishedDrag = true;
    if (dragDebounceTimeout) clearTimeout(dragDebounceTimeout);
    dragDebounceTimeout = setTimeout(() => {
      justFinishedDrag = false;
      dragDebounceTimeout = null;
    }, DRAG_CLICK_DEBOUNCE_MS);
  }

  // --- Custom pointer drag listeners (Safari #397 fix) ---
  $effect(() => {
    return attachPointerDragListeners({
      getSvgElement: () => svgElement,
      getRack: () => rack,
      getDeviceLibrary: () => deviceLibrary,
      getRackDims: () => rackDims,
      getFaceFilter: () => effectiveFaceFilter,
      getSelectedDeviceId: () => selectedDeviceId,
      getEventCallbacks: () => eventCallbacks,
      setDropPreview: (p) => {
        dropPreview = p;
      },
      setContainerHoverInfo: (i) => {
        containerHoverInfo = i;
      },
      clearDraggingIndex: () => {
        _draggingDeviceIndex = null;
      },
      onDragFinished: setDragFinished,
      layoutStore,
      toastStore,
    });
  });

  // --- Simple interaction handlers ---
  function handleCancelPlacement() {
    hapticCancel();
    placementStore.cancelPlacement();
    canvasStore.fitAll(layoutStore.racks, layoutStore.rack_groups);
  }

  function handleClick() {
    if (canvasStore.isPanning) return;
    if (justFinishedDrag) {
      justFinishedDrag = false;
      return;
    }
    onselect?.(new CustomEvent("select", { detail: { rackId: rack.id } }));
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onselect?.(new CustomEvent("select", { detail: { rackId: rack.id } }));
    }
  }

  function handleShiftDown(event: KeyboardEvent) {
    if (event.key === "Shift") shiftKeyHeld = true;
  }
  function handleShiftUp(event: KeyboardEvent) {
    if (event.key === "Shift") shiftKeyHeld = false;
  }
</script>

<svelte:window onkeydown={handleShiftDown} onkeyup={handleShiftUp} />

<div
  class="rack-container"
  class:selected
  class:party-mode={partyMode}
  class:placement-mode={isPlacementMode}
  tabindex="0"
  aria-selected={selected}
  role="option"
  onkeydown={handleKeyDown}
  onclick={handleClick}
>
  <svg
    bind:this={svgElement}
    class="rack-svg"
    width={RACK_WIDTH}
    height={viewBoxHeight + viewBoxYOffset}
    viewBox="0 -{viewBoxYOffset} {RACK_WIDTH} {viewBoxHeight + viewBoxYOffset}"
    role="img"
    aria-label="{rack.name}, {rack.height}U rack{selected ? ', selected' : ''}"
    ondragover={(e) => onDragOver(e, handlerCtx)}
    ondragenter={onDragEnter}
    ondragleave={(e) => onDragLeave(e, handlerCtx)}
    ondrop={(e) => {
      onDrop(e, handlerCtx);
      _draggingDeviceIndex = null;
    }}
    ontouchend={(e) => {
      if (!viewportStore.isMobile || !placementStore.isPlacing) return;
      const device = placementStore.pendingDevice;
      if (!device) return;
      onTouchEnd(e, handlerCtx, device, onplacementtap);
    }}
    style="overflow: visible"
  >
    <!-- Layer 1: Static rack frame -->
    <RackFrame
      rackId={rack.id}
      rackWidth={RACK_WIDTH}
      {interiorWidth}
      railWidth={RAIL_WIDTH}
      rackPadding={RACK_PADDING}
      uHeight={U_HEIGHT}
      {totalHeight}
      rackHeight={rack.height}
      {uLabels}
      {hideULabels}
      {hideRackName}
      rackName={rack.name}
      {viewLabel}
      nameYOffset={NAME_Y_OFFSET}
      {shiftKeyHeld}
      {blockedSlots}
      {dropPreview}
      {isPlacementMode}
      {validPlacementSlots}
    />

    <!-- Layer 2: Devices -->
    <g transform="translate(0, {RACK_PADDING + RAIL_WIDTH})">
      {#each visibleDevices as { placedDevice, originalIndex } (placedDevice.id)}
        {@const device = getDeviceBySlug(placedDevice.device_type)}
        {@const containerCtx = placedDevice.container_id
          ? getContainerContext(placedDevice)
          : undefined}
        {@const children = containerChildren.get(placedDevice.id) ?? []}
        {#if device}
          {@const isHoveredContainer =
            containerHoverInfo?.containerId === placedDevice.id}
          <RackDevice
            {device}
            position={placedDevice.position}
            rackHeight={rack.height}
            rackId={rack.id}
            deviceIndex={originalIndex}
            selected={selectedDeviceId === placedDevice.id}
            uHeight={U_HEIGHT}
            rackWidth={RACK_WIDTH}
            rackPhysicalWidth={rack.width}
            {displayMode}
            rackView={effectiveFaceFilter}
            {showLabelsOnImages}
            placedDeviceName={placedDevice.name}
            placedDeviceId={placedDevice.id}
            colourOverride={placedDevice.colour_override}
            slotPosition={placedDevice.slot_position}
            containerContext={containerCtx}
            {deviceLibrary}
            containerChildDevices={children}
            selectedChildId={selectedDeviceId}
            isDragOverContainer={isHoveredContainer}
            dragTargetSlotId={isHoveredContainer
              ? containerHoverInfo.targetSlotId
              : null}
            isDragTargetValid={isHoveredContainer &&
              containerHoverInfo.isValidTarget}
            onselect={ondeviceselect}
            ondragstart={() => {
              _draggingDeviceIndex = originalIndex;
            }}
            ondragend={() => {
              _draggingDeviceIndex = null;
              setDragFinished();
            }}
            onduplicate={(e) =>
              contextActions.handleDuplicate(rack, { ...e.detail, x: 0, y: 0 })}
            oncontextmenuopen={ctxMenu.handleOpen}
          />
        {/if}
      {/each}
    </g>

    <!-- Layer 3: Drop preview -->
    {#if dropPreview}
      <RackDropZone
        position={dropPreview.position}
        height={dropPreview.height}
        feedback={dropPreview.feedback}
        slotPosition={dropPreview.slotPosition}
        isHalfWidth={dropPreview.isHalfWidth}
        railWidth={RAIL_WIDTH}
        {interiorWidth}
        uHeight={U_HEIGHT}
        rackHeight={rack.height}
        rackPadding={RACK_PADDING}
      />
    {/if}

    <!-- Layer 4: Placement header (mobile) -->
    {#if isPlacementMode && placementStore.pendingDevice}
      <RackPlacementHeader
        rackWidth={RACK_WIDTH}
        rackPadding={RACK_PADDING}
        deviceModel={placementStore.pendingDevice.model}
        oncancel={handleCancelPlacement}
      />
    {/if}

    <!-- Layer 5: Christmas hat (front view only) -->
    {#if showChristmasHats && effectiveFaceFilter === "front"}
      <RackChristmasHat rackPadding={RACK_PADDING} />
    {/if}
  </svg>
</div>

<!-- Device context menu (rendered outside SVG for proper DOM layering) -->
{#if contextMenuOpen && contextMenuTarget}
  <DeviceContextMenu
    open={contextMenuOpen}
    x={contextMenuTarget.x}
    y={contextMenuTarget.y}
    onedit={() => ctxMenu.handleEdit(rack)}
    onduplicate={() => ctxMenu.handleDuplicate(rack)}
    onmoveup={() => ctxMenu.handleMoveUp(rack, deviceLibrary)}
    onmovedown={() => ctxMenu.handleMoveDown(rack)}
    ondelete={() => ctxMenu.handleDelete()}
    canMoveUp={contextActions.getCanMoveUp(
      rack,
      deviceLibrary,
      contextMenuTarget.deviceIndex,
    )}
    canMoveDown={contextActions.getCanMoveDown(
      rack,
      deviceLibrary,
      contextMenuTarget.deviceIndex,
    )}
    onOpenChange={(open) => {
      if (!open) ctxMenu.close();
    }}
  />
{/if}

<style>
  .rack-container {
    display: inline-block;
    position: relative;
    cursor: inherit;
    touch-action: inherit;
  }

  .rack-container:focus {
    outline: 2px solid var(--colour-selection);
    outline-offset: 2px;
  }

  .rack-container[aria-selected="true"],
  .rack-container.selected {
    outline: 2px solid var(--colour-selection);
    outline-offset: 4px;
  }

  svg {
    pointer-events: auto;
    touch-action: inherit;
  }

  @keyframes party-glow {
    0% {
      filter: drop-shadow(0 0 8px hsl(0, 100%, 50%));
    }
    25% {
      filter: drop-shadow(0 0 8px hsl(90, 100%, 50%));
    }
    50% {
      filter: drop-shadow(0 0 8px hsl(180, 100%, 50%));
    }
    75% {
      filter: drop-shadow(0 0 8px hsl(270, 100%, 50%));
    }
    100% {
      filter: drop-shadow(0 0 8px hsl(360, 100%, 50%));
    }
  }

  .rack-container.party-mode .rack-svg {
    animation: party-glow 3s linear infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    .rack-container.party-mode .rack-svg {
      animation: none;
      filter: drop-shadow(0 0 8px hsl(300, 100%, 50%));
    }
  }

  .rack-container.placement-mode {
    outline: 2px solid var(--dracula-pink, #ff79c6);
    outline-offset: 4px;
    border-radius: var(--radius-md, 6px);
    box-shadow: 0 0 20px rgba(255, 121, 198, 0.3);
    transition:
      outline var(--duration-fast, 150ms) var(--ease-out),
      box-shadow var(--duration-fast, 150ms) var(--ease-out);
  }

  @media (prefers-reduced-motion: reduce) {
    .rack-container.placement-mode {
      transition: none;
    }
  }
</style>
