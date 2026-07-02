<!--
  BayedRackView Component
  Renders bayed/touring racks in stacked layout:
  - Front row on top: [Bay 1] [U-labels] [Bay 2] [U-labels] [Bay 3] (left to right)
  - Rear row below: [Bay 3] [U-labels] [Bay 2] [U-labels] [Bay 1] (mirrored)
  U-labels appear between adjacent bays for easy slot reference.
  For N bays, N-1 U-label columns are rendered.
-->
<script lang="ts">
  import type {
    Rack as RackType,
    RackGroup,
    DeviceType,
    DeviceFace,
    DisplayMode,
    AnnotationField,
  } from "$lib/types";
  import Rack from "./Rack.svelte";
  import RackContextMenu from "./RackContextMenu.svelte";
  import ULabels from "./ULabels.svelte";
  import AnnotationColumn from "./AnnotationColumn.svelte";
  import { useLongPress } from "$lib/utils/gestures";
  import { dispatchContextMenuAtPoint } from "$lib/utils/context-menu";
  import { appDebug } from "$lib/utils/debug";
  import { hapticTap } from "$lib/utils/haptics";
  import {
    RACK_PADDING_HIDDEN,
    ANNOTATION_WIDTH_COMPACT,
  } from "$lib/constants/layout";

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
    /** ID of the selected group (for bayed rack group selection) */
    selectedGroupId?: string | null;
    displayMode?: DisplayMode;
    showLabelsOnImages?: boolean;
    /** Party mode visual effects active */
    partyMode?: boolean;
    /** Show rear row of bayed rack group (controlled by Edit Panel toggle) */
    showRear?: boolean;
    /** Show annotation column */
    showAnnotations?: boolean;
    /** Which field to display in annotation column */
    annotationField?: AnnotationField;
    /** Enable long press gesture for mobile rack editing */
    enableLongPress?: boolean;
    /** Callback when the entire group is selected (bayed racks select as a unit) */
    ongroupselect?: (event: CustomEvent<{ groupId: string }>) => void;
    ondeviceselect?: (
      event: CustomEvent<{
        rackId: string;
        deviceId?: string;
        slug: string;
        position: number;
        face: "front" | "rear";
      }>,
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
        face: DeviceFace;
      }>,
    ) => void;
    /** Mobile tap-to-place event */
    onplacementtap?: (
      event: CustomEvent<{
        rackId: string;
        position: number;
        face: "front" | "rear";
      }>,
    ) => void;
    /** Mobile long press for rack editing */
    onlongpress?: (event: CustomEvent<{ rackId: string }>) => void;
    /** Context menu: export rack callback (passes all rack IDs in the group) */
    onexport?: (rackIds: string[]) => void;
    /** Context menu: focus rack callback (pans and zooms canvas to fit the group) */
    onfocus?: (rackIds: string[]) => void;
    /** Context menu: edit rack callback */
    onedit?: (rackId: string) => void;
    /** Context menu: rename rack callback */
    onrename?: (rackId: string) => void;
    /** Context menu: duplicate rack callback */
    onduplicate?: (rackId: string) => void;
    /** Context menu: delete rack callback */
    ondelete?: (rackId: string) => void;
    /**
     * Show the resistant right-edge bay-drag grip on each empty member (#2740).
     * True when the bay is selected and the bayed-racks setting is on (#2742);
     * the grip is still gated per member on the member having no devices.
     */
    enableBayDrag?: boolean;
    /** Live rubber-band ghost for the bay-drag, keyed by the dragged member id. */
    bayGhost?: { rackId: string; widthPx: number; armed: boolean } | null;
    /** Bay-drag pointer handlers, owned by the parent so all baying shares one path. */
    onbaydragstart?: (rackId: string, event: PointerEvent) => void;
    onbaydragmove?: (event: PointerEvent) => void;
    onbaydragend?: (event: PointerEvent) => void;
    onbaydragcancel?: (event: PointerEvent) => void;
  }

  let {
    group,
    racks,
    deviceLibrary,
    activeRackId = null,
    selectedDeviceId = null,
    selectedRackId = null,
    selectedGroupId = null,
    displayMode = "label",
    showLabelsOnImages = false,
    partyMode = false,
    showRear = true,
    showAnnotations = false,
    annotationField = "name",
    enableLongPress = false,
    ongroupselect,
    ondeviceselect,
    ondevicedrop,
    ondevicemove,
    ondevicemoverack,
    onplacementtap,
    onlongpress,
    onexport,
    onfocus,
    onedit,
    onrename,
    onduplicate,
    ondelete,
    enableBayDrag = false,
    bayGhost = null,
    onbaydragstart,
    onbaydragmove,
    onbaydragend,
    onbaydragcancel,
  }: Props = $props();

  // Calculate max height for U-label column (use tallest rack)
  const maxHeight = $derived(Math.max(...racks.map((r) => r.height), 0));

  // Generate U labels for center column.
  // Use the primary (first) rack's desc_units and starting_unit so the shared
  // labels respond to per-rack U-numbering edits (#1520). Mirrors the formula
  // in Rack.svelte.
  const U_HEIGHT = 22;
  const RAIL_WIDTH = 17;

  const uLabels = $derived(
    Array.from({ length: maxHeight }, (_, i) => {
      const primary = racks[0];
      const startUnit = primary?.starting_unit ?? 1;
      const descUnits = primary?.desc_units ?? false;
      const uNumber = descUnits
        ? startUnit + i
        : startUnit + (maxHeight - 1) - i;
      // Match Rack.svelte yPosition: includes RACK_PADDING_HIDDEN to align with hidden rack name mode
      const yPosition =
        i * U_HEIGHT + U_HEIGHT / 2 + RACK_PADDING_HIDDEN + RAIL_WIDTH;
      return { uNumber, yPosition };
    }),
  );

  // Column height must match Rack.svelte viewBoxHeight when hideRackName=true
  const uColumnHeight = $derived(
    RACK_PADDING_HIDDEN + maxHeight * U_HEIGHT + RAIL_WIDTH * 2,
  );

  // Reversed racks for rear row (mirrored layout)
  const reversedRacks = $derived([...racks].reverse());

  // Compute if ANY bay in the group is active/selected (for whole-group highlighting)
  const isGroupActive = $derived(racks.some((r) => r.id === activeRackId));
  // Group is selected when the group ID matches OR any individual rack in the group is selected
  const isGroupSelected = $derived(
    selectedGroupId === group.id || racks.some((r) => r.id === selectedRackId),
  );

  // Element reference for long press
  let containerElement: HTMLDivElement | null = $state(null);
  const bayedLongPressDebug = appDebug.mobile.extend("bayed-rack-view");

  // Long press state (per-rack)
  let longPressRackId = $state<string | null>(null);
  let longPressProgress = $state(0);
  let longPressActive = $state(false);
  let longPressPoint = $state<{ x: number; y: number } | null>(null);
  let longPressTarget = $state<Element | null>(null);
  let longPressTriggerElement = $state<HTMLElement | null>(null);

  // Attach long press gesture when enabled
  $effect(() => {
    if (!enableLongPress || !containerElement) {
      longPressActive = false;
      longPressProgress = 0;
      longPressPoint = null;
      longPressTarget = null;
      longPressRackId = null;
      longPressTriggerElement = null;
      return;
    }

    const cleanup = useLongPress(
      containerElement,
      () => {
        const rackId = longPressRackId;
        const point = longPressPoint;
        const target = longPressTarget;
        const triggerElement = longPressTriggerElement;

        longPressActive = false;
        longPressProgress = 0;
        longPressPoint = null;
        longPressTarget = null;
        longPressRackId = null;
        longPressTriggerElement = null;

        if (!rackId) return;

        if (!point) {
          onlongpress?.(
            new CustomEvent("longpress", {
              detail: { rackId },
            }),
          );
          return;
        }

        // Device long-press has its own context menu behavior.
        if (target?.closest(".rack-device")) {
          bayedLongPressDebug(
            "skip rack context menu: device target rackId=%s point=%o",
            rackId,
            point,
          );
          return;
        }

        hapticTap();
        const fallbackTarget =
          triggerElement ?? containerElement ?? document.body;
        bayedLongPressDebug(
          "dispatch rack context menu rackId=%s point=%o hasTarget=%s",
          rackId,
          point,
          Boolean(target),
        );
        dispatchContextMenuAtPoint(point.x, point.y, fallbackTarget);
      },
      {
        onProgress: (progress) => {
          longPressProgress = progress;
        },
        onStart: (x, y) => {
          longPressActive = true;
          longPressPoint = { x, y };
          longPressTarget = document.elementFromPoint(x, y);
        },
        onCancel: () => {
          longPressActive = false;
          longPressProgress = 0;
          longPressPoint = null;
          longPressTarget = null;
          longPressRackId = null;
          longPressTriggerElement = null;
        },
      },
    );

    return cleanup;
  });

  function handleBayPointerDown(event: PointerEvent, rackId: string) {
    longPressRackId = rackId;
    longPressTriggerElement = event.currentTarget as HTMLElement;
  }

  // Handle device drop on front view - add face: 'front' to the event
  function handleFrontDeviceDrop(
    rackId: string,
    event: CustomEvent<{
      rackId: string;
      slug: string;
      position: number;
    }>,
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
    event: CustomEvent<{
      rackId: string;
      slug: string;
      position: number;
    }>,
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

  // Handle device select - inject the correct rackId into the event
  function handleDeviceSelect(
    rackId: string,
    event: CustomEvent<{
      deviceId?: string;
      slug: string;
      position: number;
      face: "front" | "rear";
    }>,
  ) {
    ondeviceselect?.(
      new CustomEvent("deviceselect", {
        detail: {
          rackId,
          deviceId: event.detail.deviceId,
          slug: event.detail.slug,
          position: event.detail.position,
          face: event.detail.face,
        },
      }),
    );
  }

  // Handle placement tap - inject the correct rackId into the event
  function handlePlacementTap(
    rackId: string,
    event: CustomEvent<{ position: number; face: "front" | "rear" }>,
  ) {
    onplacementtap?.(
      new CustomEvent("placementtap", {
        detail: {
          rackId,
          position: event.detail.position,
          face: event.detail.face,
        },
      }),
    );
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      // Select the entire group
      ongroupselect?.(
        new CustomEvent("groupselect", { detail: { groupId: group.id } }),
      );
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

  <!-- Front row: racks left-to-right with U-labels between adjacent bays -->
  <div class="bayed-row front-row">
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
            width={ANNOTATION_WIDTH_COMPACT}
            faceFilter="front"
          />
        </div>
      {/if}
      <RackContextMenu
        onexport={() => onexport?.(racks.map((r) => r.id))}
        onfocus={() => onfocus?.(racks.map((r) => r.id))}
        onedit={() => onedit?.(rack.id)}
        onrename={() => onrename?.(rack.id)}
        onduplicate={() => onduplicate?.(rack.id)}
        ondelete={() => ondelete?.(rack.id)}
      >
        <div
          class="bay-container"
          data-rack-id={rack.id}
          class:active={isActive}
          class:selected={isSelected}
          role="presentation"
          onpointerdown={(event) => handleBayPointerDown(event, rack.id)}
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
              ongroupselect?.(
                new CustomEvent("groupselect", {
                  detail: { groupId: group.id },
                }),
              )}
            ondeviceselect={(e) => handleDeviceSelect(rack.id, e)}
            ondevicedrop={(e) => handleFrontDeviceDrop(rack.id, e)}
            {ondevicemove}
            {ondevicemoverack}
            onplacementtap={(e) => handlePlacementTap(rack.id, e)}
          />
          <!-- Resistant right-edge drag on the group's right edge (#2823): a
               bay group always extends, whatever its members contain, so the one
               grip sits on the last member and pulls right past the snap
               threshold to append a new empty member at group height. Same
               affordance and handlers as a standalone empty rack. enableBayDrag
               already encodes selection, the bayed-racks setting, and read-only. -->
          {#if enableBayDrag && bayIndex === racks.length - 1}
            <button
              type="button"
              class="bay-edge-grip"
              aria-label="Drag right to bay a new rack"
              title="Drag right to create a bayed rack"
              tabindex="-1"
              onpointerdown={(e) => onbaydragstart?.(rack.id, e)}
              onpointermove={(e) => onbaydragmove?.(e)}
              onpointerup={(e) => onbaydragend?.(e)}
              onpointercancel={(e) => onbaydragcancel?.(e)}
              onmousedown={(e) => e.stopPropagation()}
              ontouchstart={(e) => e.stopPropagation()}
            >
              <span class="edge-grip-bar" aria-hidden="true"></span>
            </button>
            {#if bayGhost && bayGhost.rackId === rack.id}
              <div
                class="bay-ghost"
                class:armed={bayGhost.armed}
                style:width="{bayGhost.widthPx}px"
                aria-hidden="true"
              ></div>
              <div class="bay-drag-readout" role="status" aria-live="polite">
                {bayGhost.armed ? "Release to bay" : "Pull to bay"}
              </div>
            {/if}
          {/if}
        </div>
      </RackContextMenu>
      <!-- U-labels column between adjacent bays (not after last bay) -->
      {#if bayIndex < racks.length - 1}
        <div class="u-labels-column">
          <ULabels
            {uLabels}
            {uColumnHeight}
            railWidth={RAIL_WIDTH}
            topPadding={RACK_PADDING_HIDDEN}
          />
        </div>
      {/if}
    {/each}
  </div>

  <!-- Rear row (conditionally rendered based on showRear toggle) -->
  {#if showRear}
    <!-- Rear row label -->
    <div class="row-label">REAR</div>

    <!-- Rear row: racks right-to-left with U-labels between adjacent bays (mirrored: Bay 1 on right) -->
    <div class="bayed-row rear-row">
      {#each reversedRacks as rack, reversedIndex (rack.id)}
        {@const bayIndex = racks.length - 1 - reversedIndex}
        {@const isActive = rack.id === activeRackId}
        {@const isSelected = rack.id === selectedRackId}
        <!-- U-labels column between adjacent bays (not before first bay in reversed order) -->
        {#if reversedIndex > 0}
          <div class="u-labels-column">
            <ULabels
              {uLabels}
              {uColumnHeight}
              railWidth={RAIL_WIDTH}
              topPadding={RACK_PADDING_HIDDEN}
            />
          </div>
        {/if}
        <RackContextMenu
          onexport={() => onexport?.(racks.map((r) => r.id))}
          onfocus={() => onfocus?.(racks.map((r) => r.id))}
          onedit={() => onedit?.(rack.id)}
          onrename={() => onrename?.(rack.id)}
          onduplicate={() => onduplicate?.(rack.id)}
          ondelete={() => ondelete?.(rack.id)}
        >
          <div
            class="bay-container"
            data-rack-id={rack.id}
            class:active={isActive}
            class:selected={isSelected}
            role="presentation"
            onpointerdown={(event) => handleBayPointerDown(event, rack.id)}
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
                ongroupselect?.(
                  new CustomEvent("groupselect", {
                    detail: { groupId: group.id },
                  }),
                )}
              ondeviceselect={(e) => handleDeviceSelect(rack.id, e)}
              ondevicedrop={(e) => handleRearDeviceDrop(rack.id, e)}
              {ondevicemove}
              {ondevicemoverack}
              onplacementtap={(e) => handlePlacementTap(rack.id, e)}
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
              width={ANNOTATION_WIDTH_COMPACT}
              faceFilter="rear"
            />
          </div>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .bayed-rack-view {
    /* Shared variable for bay-label and u-labels-column alignment */
    --bay-label-block-height: calc(var(--font-size-xs) + var(--space-1) * 2);

    display: flex;
    flex-direction: column;
    align-items: center;
    /* Prevent stretching to match taller siblings in flex parent */
    align-self: flex-start;
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
  /* Active state only shows when NOT selected (to avoid double highlight) */
  .bayed-rack-view.active:not(.selected) {
    box-shadow: 0 0 0 2px var(--colour-selection);
  }

  .bayed-rack-view.selected {
    outline: 2px solid var(--colour-selection);
    outline-offset: 4px;
  }

  /* Long press visual feedback */
  .bayed-rack-view.long-press-active {
    outline: 3px solid var(--colour-selection);
    outline-offset: 2px;
    box-shadow: inset 0 0 0 calc(var(--long-press-progress, 0) * 4px)
      color-mix(in srgb, var(--colour-selection) 15%, transparent);
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
    position: relative;
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
    /* Explicit line-height ensures --bay-label-block-height calculation is accurate */
    line-height: 1;
  }

  /* Remove individual rack selection styling since we handle it at bay level */
  .bay-container :global(.rack-container) {
    outline: none !important;
  }

  .bay-container :global(.rack-container:focus) {
    outline: none !important;
  }

  .bay-container :global(.rack-container.selected) {
    outline: none !important;
  }

  .bay-container :global(.rack-container[aria-current="true"]) {
    outline: none !important;
  }

  /* U-labels columns between adjacent bays */
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

  /* Resistant right-edge bay-drag grip on an empty member (#2740). Hugs the
     member's right edge; the bar reads as a rail you pull rightward to insert a
     new bay. Mirrors the standalone-rack grip in RackCanvasView. */
  .bay-edge-grip {
    position: absolute;
    top: 50%;
    right: 0;
    z-index: 4;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 56px;
    padding: 0;
    border: none;
    background: transparent;
    cursor: ew-resize;
    touch-action: none;
    transform: translate(50%, -50%);
    -webkit-tap-highlight-color: transparent;
  }

  .edge-grip-bar {
    width: 6px;
    height: 40px;
    border-radius: var(--radius-full);
    background: var(--colour-border);
    box-shadow: 0 0 0 4px var(--colour-surface-overlay, rgba(40, 42, 54, 0.6));
  }

  .bay-edge-grip:hover .edge-grip-bar,
  .bay-edge-grip:focus-visible .edge-grip-bar {
    background: var(--colour-selection);
  }

  .bay-edge-grip:focus-visible {
    outline: none;
  }

  @media (prefers-reduced-motion: no-preference) {
    .edge-grip-bar {
      transition: background-color var(--duration-fast) var(--ease-out);
    }
  }

  /* Ghost preview of the bay the drag would insert: a dashed phantom to the
     right of the dragged member that snaps solid once armed. */
  .bay-ghost {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 100%;
    z-index: 3;
    border: 2px dashed var(--colour-border);
    border-radius: var(--radius-md);
    background: var(--colour-surface-overlay, rgba(40, 42, 54, 0.35));
    pointer-events: none;
  }

  .bay-ghost.armed {
    border-style: solid;
    border-color: var(--colour-selection);
    background: var(--colour-overlay-hover, rgba(80, 250, 123, 0.12));
  }

  .bay-drag-readout {
    position: absolute;
    top: 0;
    left: 100%;
    z-index: 5;
    margin-left: var(--space-2);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-full);
    background: var(--colour-selection);
    color: var(--colour-text-inverse);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold, 600);
    white-space: nowrap;
    pointer-events: none;
    box-shadow: var(--shadow-md, 0 4px 12px rgba(0, 0, 0, 0.4));
  }
</style>
