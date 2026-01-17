<!--
  BayedRackView Component
  Renders bayed/touring racks in stacked layout:
  - Front row on top: [U-labels] [Bay 1] [Bay 2] [Bay 3] (left to right)
  - Rear row below: [Bay 3] [Bay 2] [Bay 1] [U-labels] (mirrored, U-labels on right)
  U-labels flank each row for easy slot reference.
-->
<script lang="ts">
  import type {
    Rack as RackType,
    RackGroup,
    DeviceType,
    DisplayMode,
    AnnotationField,
  } from "$lib/types";
  import Rack from "./Rack.svelte";
  import RackContextMenu from "./RackContextMenu.svelte";
  import ULabels from "./ULabels.svelte";
  import AnnotationColumn from "./AnnotationColumn.svelte";
  import { useLongPress } from "$lib/utils/gestures";

  interface Props {
    group: RackGroup;
    racks: RackType[];
    deviceLibrary: DeviceType[];
    /** ID of the currently active rack */
    activeRackId?: string | null;
    /** ID of the selected device (UUID-based tracking) */
    selectedDeviceId?: string | null;
    /** ID of the selected rack */
    selectedRackId?: string | null;
    displayMode?: DisplayMode;
    showLabelsOnImages?: boolean;
    /** Party mode visual effects active */
    partyMode?: boolean;
    /** Show annotation column */
    showAnnotations?: boolean;
    /** Which field to display in annotation column */
    annotationField?: AnnotationField;
    /** Enable long press gesture for mobile rack editing */
    enableLongPress?: boolean;
    onselect?: (event: CustomEvent<{ rackId: string }>) => void;
    ondeviceselect?: (
      event: CustomEvent<{ slug: string; position: number }>,
    ) => void;
    ondevicedrop?: (
      event: CustomEvent<{
        rackId: string;
        slug: string;
        position: number;
        face: "front" | "rear";
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
    /** Mobile tap-to-place event */
    onplacementtap?: (
      event: CustomEvent<{ position: number; face: "front" | "rear" }>,
    ) => void;
    /** Mobile long press for rack editing */
    onlongpress?: (event: CustomEvent<{ rackId: string }>) => void;
    /** Context menu: add device callback */
    onadddevice?: (rackId: string) => void;
    /** Context menu: edit rack callback */
    onedit?: (rackId: string) => void;
    /** Context menu: rename rack callback */
    onrename?: (rackId: string) => void;
    /** Context menu: duplicate rack callback */
    onduplicate?: (rackId: string) => void;
    /** Context menu: delete rack callback */
    ondelete?: (rackId: string) => void;
  }

  let {
    group,
    racks,
    deviceLibrary,
    activeRackId = null,
    selectedDeviceId = null,
    selectedRackId = null,
    displayMode = "label",
    showLabelsOnImages = false,
    partyMode = false,
    showAnnotations = false,
    annotationField = "name",
    enableLongPress = false,
    onselect,
    ondeviceselect,
    ondevicedrop,
    ondevicemove,
    ondevicemoverack,
    onplacementtap,
    onlongpress,
    onadddevice,
    onedit,
    onrename,
    onduplicate,
    ondelete,
  }: Props = $props();

  // Calculate max height for U-label column (use tallest rack)
  const maxHeight = $derived(Math.max(...racks.map((r) => r.height), 0));

  // Generate U labels for center column (ascending: U1 at bottom)
  const U_HEIGHT = 22;
  const RAIL_WIDTH = 17;

  const uLabels = $derived(
    Array.from({ length: maxHeight }, (_, i) => {
      const uNumber = maxHeight - i;
      const yPosition = i * U_HEIGHT + U_HEIGHT / 2 + RAIL_WIDTH;
      return { uNumber, yPosition };
    }),
  );

  const uColumnHeight = $derived(maxHeight * U_HEIGHT + RAIL_WIDTH * 2);

  // Reversed racks for rear row (mirrored layout)
  const reversedRacks = $derived([...racks].reverse());

  // Compute if ANY bay in the group is active/selected (for whole-group highlighting)
  const isGroupActive = $derived(racks.some((r) => r.id === activeRackId));
  const isGroupSelected = $derived(racks.some((r) => r.id === selectedRackId));

  // Element reference for long press
  let containerElement: HTMLDivElement | null = $state(null);

  // Long press state (per-rack)
  let longPressRackId = $state<string | null>(null);
  let longPressProgress = $state(0);
  let longPressActive = $state(false);

  // Attach long press gesture when enabled
  $effect(() => {
    if (!enableLongPress || !containerElement || !onlongpress) {
      longPressActive = false;
      longPressProgress = 0;
      return;
    }

    const cleanup = useLongPress(
      containerElement,
      () => {
        if (longPressRackId) {
          longPressActive = false;
          longPressProgress = 0;
          onlongpress(
            new CustomEvent("longpress", {
              detail: { rackId: longPressRackId },
            }),
          );
        }
      },
      {
        onProgress: (progress) => {
          longPressProgress = progress;
        },
        onStart: () => {
          longPressActive = true;
        },
        onCancel: () => {
          longPressActive = false;
          longPressProgress = 0;
        },
      },
    );

    return cleanup;
  });

  // Handle device drop on front view - add face: 'front' to the event
  function handleFrontDeviceDrop(
    rackId: string,
    event: CustomEvent<{ rackId: string; slug: string; position: number }>,
  ) {
    ondevicedrop?.(
      new CustomEvent("devicedrop", {
        detail: {
          rackId,
          slug: event.detail.slug,
          position: event.detail.position,
          face: "front" as const,
        },
      }),
    );
  }

  // Handle device drop on rear view - add face: 'rear' to the event
  function handleRearDeviceDrop(
    rackId: string,
    event: CustomEvent<{ rackId: string; slug: string; position: number }>,
  ) {
    ondevicedrop?.(
      new CustomEvent("devicedrop", {
        detail: {
          rackId,
          slug: event.detail.slug,
          position: event.detail.position,
          face: "rear" as const,
        },
      }),
    );
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      // Select first rack in group if none selected
      if (racks.length > 0 && !activeRackId) {
        onselect?.(
          new CustomEvent("select", { detail: { rackId: racks[0].id } }),
        );
      }
    }
  }
</script>

<!-- eslint-disable-next-line svelte/no-unused-svelte-ignore -- these warnings appear in Vite build but not ESLint -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (role="group" with tabindex is standard ARIA pattern for grouped interactive elements) -->
<div
  bind:this={containerElement}
  class="bayed-rack-view"
  class:long-press-active={longPressActive}
  class:active={isGroupActive}
  class:selected={isGroupSelected}
  tabindex="0"
  role="group"
  aria-label="{group.name ?? 'Bayed Rack Group'}, {racks.length} bays"
  onkeydown={handleKeyDown}
  style:--long-press-progress={longPressProgress}
>
  <!-- Group name header -->
  {#if group.name}
    <div class="bayed-group-name">{group.name}</div>
  {/if}

  <!-- Front row label -->
  <div class="row-label">FRONT</div>

  <!-- Front row: U-labels on left, then racks left-to-right -->
  <div class="bayed-row front-row">
    <!-- U-labels column (left side of front row) -->
    <div class="u-labels-column">
      <ULabels {uLabels} {uColumnHeight} railWidth={RAIL_WIDTH} />
    </div>
    {#each racks as rack, bayIndex (rack.id)}
      {@const isActive = rack.id === activeRackId}
      {@const isSelected = rack.id === selectedRackId}
      <!-- Annotation column LEFT of front bay -->
      {#if showAnnotations}
        <div class="annotation-wrapper">
          <AnnotationColumn
            {rack}
            {deviceLibrary}
            {annotationField}
            faceFilter="front"
          />
        </div>
      {/if}
      <RackContextMenu
        onadddevice={() => onadddevice?.(rack.id)}
        onedit={() => onedit?.(rack.id)}
        onrename={() => onrename?.(rack.id)}
        onduplicate={() => onduplicate?.(rack.id)}
        ondelete={() => ondelete?.(rack.id)}
      >
        <div
          class="bay-container"
          class:active={isActive}
          class:selected={isSelected}
          role="presentation"
          onpointerdown={() => (longPressRackId = rack.id)}
        >
          <div class="bay-label">Bay {bayIndex + 1}</div>
          <Rack
            {rack}
            {deviceLibrary}
            selected={false}
            selectedDeviceId={isActive ? selectedDeviceId : null}
            {displayMode}
            {showLabelsOnImages}
            {partyMode}
            faceFilter="front"
            hideRackName={true}
            hideULabels={true}
            onselect={() =>
              onselect?.(
                new CustomEvent("select", { detail: { rackId: rack.id } }),
              )}
            {ondeviceselect}
            ondevicedrop={(e) => handleFrontDeviceDrop(rack.id, e)}
            {ondevicemove}
            {ondevicemoverack}
            {onplacementtap}
          />
        </div>
      </RackContextMenu>
    {/each}
  </div>

  <!-- Rear row label -->
  <div class="row-label">REAR</div>

  <!-- Rear row: racks right-to-left (mirrored: Bay 1 on right) -->
  <div class="bayed-row rear-row">
    {#each reversedRacks as rack, reversedIndex (rack.id)}
      {@const bayIndex = racks.length - 1 - reversedIndex}
      {@const isActive = rack.id === activeRackId}
      {@const isSelected = rack.id === selectedRackId}
      <RackContextMenu
        onadddevice={() => onadddevice?.(rack.id)}
        onedit={() => onedit?.(rack.id)}
        onrename={() => onrename?.(rack.id)}
        onduplicate={() => onduplicate?.(rack.id)}
        ondelete={() => ondelete?.(rack.id)}
      >
        <div
          class="bay-container"
          class:active={isActive}
          class:selected={isSelected}
          role="presentation"
          onpointerdown={() => (longPressRackId = rack.id)}
        >
          <div class="bay-label">Bay {bayIndex + 1}</div>
          <Rack
            {rack}
            {deviceLibrary}
            selected={false}
            selectedDeviceId={isActive ? selectedDeviceId : null}
            {displayMode}
            {showLabelsOnImages}
            {partyMode}
            faceFilter="rear"
            hideRackName={true}
            hideULabels={true}
            onselect={() =>
              onselect?.(
                new CustomEvent("select", { detail: { rackId: rack.id } }),
              )}
            {ondeviceselect}
            ondevicedrop={(e) => handleRearDeviceDrop(rack.id, e)}
            {ondevicemove}
            {ondevicemoverack}
            {onplacementtap}
          />
        </div>
      </RackContextMenu>
      <!-- Annotation column RIGHT of rear bay (mirrored) -->
      {#if showAnnotations}
        <div class="annotation-wrapper">
          <AnnotationColumn
            {rack}
            {deviceLibrary}
            {annotationField}
            faceFilter="rear"
          />
        </div>
      {/if}
    {/each}
    <!-- U-labels column (right side of rear row) -->
    <div class="u-labels-column">
      <ULabels {uLabels} {uColumnHeight} railWidth={RAIL_WIDTH} />
    </div>
  </div>
</div>

<style>
  .bayed-rack-view {
    /* Shared variable for bay-label and u-labels-column alignment */
    --bay-label-block-height: calc(var(--font-size-xs) + var(--space-1) * 2);

    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3);
    border-radius: var(--radius-md);
    background: transparent;
    position: relative;
  }

  .bayed-rack-view:focus {
    outline: 2px solid var(--colour-selection);
    outline-offset: 2px;
  }

  /* Selection highlight for entire bayed rack group */
  .bayed-rack-view.active {
    box-shadow: 0 0 0 2px var(--colour-selection);
  }

  .bayed-rack-view.selected {
    outline: 2px solid var(--colour-selection);
    outline-offset: 2px;
  }

  /* Long press visual feedback */
  .bayed-rack-view.long-press-active {
    outline: 3px solid var(--dracula-pink, #ff79c6);
    outline-offset: 2px;
    box-shadow: inset 0 0 0 calc(var(--long-press-progress, 0) * 4px)
      rgba(255, 121, 198, 0.15);
  }

  @media (prefers-reduced-motion: reduce) {
    .bayed-rack-view.long-press-active {
      box-shadow: none;
      outline-width: 3px;
    }
  }

  .bayed-group-name {
    font-size: var(--font-size-xl);
    font-weight: 600;
    color: var(--colour-text);
    font-family: var(--font-family, system-ui, sans-serif);
    text-align: center;
    margin-bottom: var(--space-2);
  }

  .row-label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold, 600);
    color: var(--colour-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    text-align: center;
    padding: var(--space-1) 0;
  }

  .bayed-row {
    display: flex;
    flex-direction: row;
    gap: 0; /* No gap - bayed racks touch */
    align-items: flex-start;
  }

  .bay-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    border-radius: var(--radius-sm);
  }

  /* Per-bay active/selected classes kept for device selection context,
     but visual highlight is applied to the whole bayed-rack-view */

  .bay-label {
    font-size: var(--font-size-xs);
    font-weight: 500;
    color: var(--colour-text-muted);
    text-align: center;
    padding: var(--space-1) var(--space-2);
    white-space: nowrap;
  }

  /* Remove individual rack selection styling since we handle it at bay level */
  .bay-container :global(.rack-container) {
    outline: none !important;
  }

  .bay-container :global(.rack-container:focus) {
    outline: none !important;
  }

  /* U-labels flanking columns (left of front row, right of rear row) */
  .u-labels-column {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    /* Match bay-label height so U-labels align with rack content */
    padding-top: var(--bay-label-block-height);
  }

  /* Annotation column wrapper - align with rack content below bay label */
  .annotation-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    /* Match bay-label height so annotations align with rack content */
    padding-top: var(--bay-label-block-height);
  }
</style>
