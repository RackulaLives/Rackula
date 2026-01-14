<!--
  RackDualView Component
  Renders front and rear views of a rack side-by-side
  Replaces single-view Rack with toggle
-->
<script lang="ts">
  import type {
    Rack as RackType,
    DeviceType,
    DisplayMode,
    AnnotationField,
  } from "$lib/types";
  import Rack from "./Rack.svelte";
  import AnnotationColumn from "./AnnotationColumn.svelte";
  import BananaForScale from "./BananaForScale.svelte";
  import RackContextMenu from "./RackContextMenu.svelte";
  import { useLongPress } from "$lib/utils/gestures";

  interface Props {
    rack: RackType;
    deviceLibrary: DeviceType[];
    selected: boolean;
    /** Whether this rack is the active rack (for editing) */
    isActive?: boolean;
    /** ID of the selected device (UUID-based tracking) */
    selectedDeviceId?: string | null;
    displayMode?: DisplayMode;
    showLabelsOnImages?: boolean;
    /** Party mode visual effects active */
    partyMode?: boolean;
    /** Show annotation column */
    showAnnotations?: boolean;
    /** Which field to display in annotation column */
    annotationField?: AnnotationField;
    /** Show banana for scale easter egg */
    showBanana?: boolean;
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
    onadddevice?: () => void;
    /** Context menu: edit rack callback */
    onedit?: () => void;
    /** Context menu: rename rack callback */
    onrename?: () => void;
    /** Context menu: duplicate rack callback */
    onduplicate?: () => void;
    /** Context menu: delete rack callback */
    ondelete?: () => void;
  }

  let {
    rack,
    deviceLibrary,
    selected,
    isActive = false,
    selectedDeviceId = null,
    displayMode = "label",
    showLabelsOnImages = false,
    partyMode = false,
    showAnnotations = false,
    annotationField = "name",
    showBanana = false,
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

  // Element reference for long press
  let containerElement: HTMLDivElement | null = $state(null);

  // Long press visual feedback state
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
        longPressActive = false;
        longPressProgress = 0;
        onlongpress(
          new CustomEvent("longpress", { detail: { rackId: rack.id } }),
        );
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

  // Now using faceFilter prop instead of virtual racks

  function handleSelect() {
    onselect?.(new CustomEvent("select", { detail: { rackId: rack.id } }));
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleSelect();
    }
  }

  // Note: Selection is handled by the Rack component's onselect callback
  // No need for separate click handlers on wrapper divs

  // Handle device drop on front view - add face: 'front' to the event
  function handleFrontDeviceDrop(
    event: CustomEvent<{ rackId: string; slug: string; position: number }>,
  ) {
    ondevicedrop?.(
      new CustomEvent("devicedrop", {
        detail: {
          ...event.detail,
          face: "front" as const,
        },
      }),
    );
  }

  // Handle device drop on rear view - add face: 'rear' to the event
  function handleRearDeviceDrop(
    event: CustomEvent<{ rackId: string; slug: string; position: number }>,
  ) {
    ondevicedrop?.(
      new CustomEvent("devicedrop", {
        detail: {
          ...event.detail,
          face: "rear" as const,
        },
      }),
    );
  }
</script>

<RackContextMenu {onadddevice} {onedit} {onrename} {onduplicate} {ondelete}>
  <div
    bind:this={containerElement}
    class="rack-dual-view"
    class:selected
    class:active={isActive}
    class:long-press-active={longPressActive}
    tabindex="0"
    role="option"
    aria-selected={selected}
    aria-current={isActive ? "location" : undefined}
    aria-label="{rack.name}, {rack.height}U rack, {rack.show_rear
      ? 'front and rear view'
      : 'front view only'}{isActive ? ', active' : ''}{selected
      ? ', selected'
      : ''}"
    onkeydown={handleKeyDown}
    style:--long-press-progress={longPressProgress}
  >
    <!-- Rack name centered above both views -->
    <div class="rack-dual-view-name">{rack.name}</div>

    <div class="rack-dual-view-container" class:single-view={!rack.show_rear}>
      <!-- Annotation column (left of front view) -->
      {#if showAnnotations}
        <AnnotationColumn {rack} {deviceLibrary} {annotationField} />
      {/if}

      <!-- Front view -->
      <div class="rack-front" role="presentation">
        <Rack
          {rack}
          {deviceLibrary}
          selected={false}
          {selectedDeviceId}
          {displayMode}
          {showLabelsOnImages}
          {partyMode}
          faceFilter="front"
          hideRackName={true}
          viewLabel={rack.show_rear ? "FRONT" : undefined}
          onselect={() => handleSelect()}
          {ondeviceselect}
          ondevicedrop={handleFrontDeviceDrop}
          {ondevicemove}
          {ondevicemoverack}
          {onplacementtap}
        />
        <!-- Banana for scale (single view - front panel only) -->
        {#if showBanana && !rack.show_rear}
          <div class="banana-container" aria-hidden="true">
            <BananaForScale />
          </div>
        {/if}
      </div>

      <!-- Rear view (conditionally shown based on rack.show_rear) -->
      {#if rack.show_rear}
        <div class="rack-rear" role="presentation">
          <Rack
            {rack}
            {deviceLibrary}
            selected={false}
            {selectedDeviceId}
            {displayMode}
            {showLabelsOnImages}
            {partyMode}
            faceFilter="rear"
            hideRackName={true}
            viewLabel="REAR"
            onselect={() => handleSelect()}
            {ondeviceselect}
            ondevicedrop={handleRearDeviceDrop}
            {ondevicemove}
            {ondevicemoverack}
            {onplacementtap}
          />
          <!-- Banana for scale (dual view - rear panel) -->
          {#if showBanana}
            <div class="banana-container" aria-hidden="true">
              <BananaForScale />
            </div>
          {/if}
        </div>
      {/if}

      <!-- Balancing spacer to keep rack centered when annotations are shown -->
      {#if showAnnotations}
        <div class="annotation-spacer" aria-hidden="true"></div>
      {/if}
    </div>
  </div>
</RackContextMenu>

<style>
  .rack-dual-view {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3);
    border-radius: var(--radius-md);
    background: transparent;
    cursor: inherit;
    position: relative; /* For banana positioning */
  }

  .rack-dual-view:focus {
    outline: 2px solid var(--colour-selection);
    outline-offset: 2px;
  }

  .rack-dual-view[aria-selected="true"],
  .rack-dual-view.selected {
    outline: 2px solid var(--colour-selection);
    outline-offset: 4px;
  }

  .rack-dual-view.active .rack-dual-view-name {
    color: var(--colour-selection);
  }

  /* Long press visual feedback */
  .rack-dual-view.long-press-active {
    outline: 3px solid var(--dracula-pink, #ff79c6);
    outline-offset: 2px;
    /* Progress indicator via box-shadow */
    box-shadow: inset 0 0 0 calc(var(--long-press-progress, 0) * 4px)
      rgba(255, 121, 198, 0.15);
  }

  @media (prefers-reduced-motion: reduce) {
    .rack-dual-view.long-press-active {
      /* Simpler feedback without animation */
      box-shadow: none;
      outline-width: 3px;
    }
  }

  .rack-dual-view-name {
    font-size: var(--font-size-xl);
    font-weight: 500;
    color: var(--colour-text);
    font-family: var(--font-family, system-ui, sans-serif);
    text-align: center;
    margin-bottom: var(--spacing-xs, 4px);
  }

  .rack-dual-view-container {
    display: flex;
    gap: var(--spacing-lg, 24px);
    align-items: flex-start;
  }

  .rack-front,
  .rack-rear {
    display: flex;
    flex-direction: column;
    align-items: center;
    position: relative; /* For banana positioning */
  }

  /* Remove individual rack selection styling since we handle it at container level */
  .rack-front :global(.rack-container),
  .rack-rear :global(.rack-container) {
    outline: none !important;
  }

  .rack-front :global(.rack-container:focus),
  .rack-rear :global(.rack-container:focus) {
    outline: none !important;
  }

  /* Balancing spacer matches annotation column width to keep rack centered */
  .annotation-spacer {
    width: 100px; /* Must match AnnotationColumn default width */
    flex-shrink: 0;
  }

  /* Banana for scale easter egg container */
  .banana-container {
    position: absolute;
    bottom: -10px;
    right: -75px;
    pointer-events: none;
  }
</style>
