<!--
  RackDualView Component
  Renders front and rear views of a rack side-by-side
  Replaces single-view Rack with toggle
-->
<script lang="ts">
  import type { Rack as RackType, DeviceType, DisplayMode } from "$lib/types";
  import Rack from "./Rack.svelte";

  // Synthetic rack ID for single-rack mode
  const RACK_ID = "rack-0";

  interface Props {
    rack: RackType;
    deviceLibrary: DeviceType[];
    selected: boolean;
    /** ID of the selected device (UUID-based tracking) */
    selectedDeviceId?: string | null;
    displayMode?: DisplayMode;
    showLabelsOnImages?: boolean;
    /** Party mode visual effects active */
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
  }

  let {
    rack,
    deviceLibrary,
    selected,
    selectedDeviceId = null,
    displayMode = "label",
    showLabelsOnImages = false,
    partyMode = false,
    onselect,
    ondeviceselect,
    ondevicedrop,
    ondevicemove,
    ondevicemoverack,
    onplacementtap,
  }: Props = $props();

  // Now using faceFilter prop instead of virtual racks

  function handleSelect() {
    onselect?.(new CustomEvent("select", { detail: { rackId: RACK_ID } }));
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

<div
  class="rack-dual-view"
  class:selected
  tabindex="0"
  role="option"
  aria-selected={selected}
  aria-label="{rack.name}, {rack.height}U rack, {rack.show_rear
    ? 'front and rear view'
    : 'front view only'}{selected ? ', selected' : ''}"
  onkeydown={handleKeyDown}
>
  <!-- Rack name centered above both views -->
  <div class="rack-dual-view-name">{rack.name}</div>

  <div class="rack-dual-view-container" class:single-view={!rack.show_rear}>
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
      </div>
    {/if}
  </div>
</div>

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
</style>
