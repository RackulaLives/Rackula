<!--
  RackCanvasView
  Renders all racks inside the panzoom viewport: grouped racks (standard or
  bayed) and ungrouped racks. Owns the device drop/move/select handlers that
  delegate to the layout store and bubble events up to the host. Extracted from
  Canvas.svelte (#1610) so Canvas just owns the viewport shell.
-->
<script lang="ts">
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getSelectionStore } from "$lib/stores/selection.svelte";
  import { getCanvasStore } from "$lib/stores/canvas.svelte";
  import { getUIStore } from "$lib/stores/ui.svelte";
  import { getPlacementStore } from "$lib/stores/placement.svelte";
  import { getToastStore } from "$lib/stores/toast.svelte";
  import { hapticSuccess, hapticError } from "$lib/utils/haptics";
  import { resolveSelectedDevice } from "$lib/utils/device-selection";
  import type { RackSwipeDirection } from "$lib/utils/gestures";
  import type { DeviceFace } from "$lib/types";
  import RackDualView from "./RackDualView.svelte";
  import BayedRackView from "./BayedRackView.svelte";

  interface Props {
    partyMode?: boolean;
    enableLongPress?: boolean;
    /** Active slide animation while switching racks via swipe. */
    swipeAnimationDirection?: RackSwipeDirection | null;
    onrackselect?: (event: CustomEvent<{ rackId: string }>) => void;
    ondeviceselect?: (
      event: CustomEvent<{ deviceId?: string; slug: string; position: number }>,
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
    onracklongpress?: (event: CustomEvent<{ rackId: string }>) => void;
    onrackfocus?: (rackIds: string[]) => void;
    onrackexport?: (rackIds: string[]) => void;
    onrackedit?: (rackId: string) => void;
    onrackrename?: (rackId: string) => void;
    onrackduplicate?: (rackId: string) => void;
    onrackdelete?: (rackId: string) => void;
  }

  let {
    partyMode = false,
    enableLongPress = false,
    swipeAnimationDirection = null,
    onrackselect,
    ondeviceselect,
    ondevicedrop,
    ondevicemove,
    ondevicemoverack,
    onracklongpress,
    onrackfocus,
    onrackexport,
    onrackedit,
    onrackrename,
    onrackduplicate,
    onrackdelete,
  }: Props = $props();

  const layoutStore = getLayoutStore();
  const selectionStore = getSelectionStore();
  const canvasStore = getCanvasStore();
  const uiStore = getUIStore();
  const placementStore = getPlacementStore();
  const toastStore = getToastStore();

  const racks = $derived(layoutStore.racks);
  const activeRackId = $derived(layoutStore.activeRackId);
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

  // Handle mobile tap-to-place (uses active rack)
  function handlePlacementTap(
    rackId: string,
    event: CustomEvent<{ position: number; face: "front" | "rear" }>,
  ) {
    const device = placementStore.pendingDevice;
    if (!device) return;

    const { position, face } = event.detail;
    // Carrier-first: a sub-U / half-width device synthesises (or fills) a
    // carrier; whole-U full-width gear mounts directly to the rails.
    const success = layoutStore.placeDeviceSmart(
      rackId,
      device.slug,
      position,
      face,
    );

    if (success) {
      hapticSuccess();
      placementStore.completePlacement();
      // Reset view to show full rack after placement completes
      canvasStore.fitAll(layoutStore.racks);
    } else {
      // Block-live UX (D5): the placement was refused (carrier-required,
      // collision, or out of bounds); tell the user rather than fail silently.
      hapticError();
      toastStore.showToast("Can't place device here", "warning", 3000);
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
    const group = layoutStore.getRackGroupById(groupId);
    if (!group || group.rack_ids.length === 0) return;
    const activeRackInGroup =
      activeRackId && group.rack_ids.includes(activeRackId)
        ? activeRackId
        : group.rack_ids[0];
    layoutStore.setActiveRack(activeRackInGroup ?? null);
    selectionStore.selectGroup(groupId, activeRackInGroup);
  }

  function handleDeviceSelect(
    rackId: string,
    event: CustomEvent<{ deviceId?: string; slug: string; position: number }>,
  ) {
    // Resolve the placed device by its UUID when available. The legacy
    // (slug, position) fallback is ambiguous for two half-width devices sharing
    // the same U (#1680), where it always resolved to the left device and left
    // the right one unselectable.
    const targetRack = layoutStore.getRackById(rackId);
    if (targetRack) {
      const device = resolveSelectedDevice(targetRack, event.detail);
      if (device) {
        layoutStore.setActiveRack(rackId);
        selectionStore.selectDevice(rackId, device.id);
      }
    }
    ondeviceselect?.(event);
  }

  function handleDeviceDrop(
    event: CustomEvent<{
      rackId: string;
      slug: string;
      position: number;
      face: "front" | "rear";
    }>,
  ) {
    const { rackId, slug, position, face } = event.detail;
    const placed = layoutStore.placeDevice(rackId, slug, position, face);
    // Block-live UX (D5): the store refuses an invalid rail placement (a
    // carrier-requiring device, a collision, or out of bounds). Tell the user
    // rather than fail silently, and do not signal a drop that did not happen.
    if (!placed) {
      hapticError();
      toastStore.showToast("Can't place device here", "warning", 3000);
      return;
    }
    // A completed drag-and-drop is an unambiguous choice of the DnD path, so
    // abandon any placement armed via the command palette "Add device" flow
    // (#2352). Without this the desktop click-to-place stays armed and the next
    // rack click would silently place the still-pending device.
    if (placementStore.isPlacing) placementStore.abandonPlacement();
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
      face: DeviceFace;
    }>,
  ) {
    const { sourceRackId, sourceIndex, targetRackId, targetPosition, face } =
      event.detail;
    layoutStore.moveDeviceToRack(
      sourceRackId,
      sourceIndex,
      targetRackId,
      targetPosition,
      face,
    );
    ondevicemoverack?.(event);
  }
</script>

<!-- Multi-rack mode: render racks with visual grouping -->
<div
  class="racks-wrapper"
  class:swipe-next={swipeAnimationDirection === "next"}
  class:swipe-previous={swipeAnimationDirection === "previous"}
>
  <!-- Render grouped racks with group labels -->
  {#each organizedRacks.groupEntries as { group, racks: groupRacks } (group.id)}
    {#if group.layout_preset === "bayed"}
      <!-- Bayed/touring racks use special stacked view -->
      <BayedRackView
        {group}
        racks={groupRacks}
        deviceLibrary={layoutStore.device_types}
        {activeRackId}
        selectedDeviceId={selectionStore.selectedType === "device"
          ? selectionStore.selectedDeviceId
          : null}
        selectedRackId={selectionStore.selectedType === "rack"
          ? selectionStore.selectedRackId
          : null}
        displayMode={uiStore.displayMode}
        showLabelsOnImages={uiStore.showLabelsOnImages}
        showAnnotations={uiStore.showAnnotations}
        annotationField={uiStore.annotationField}
        {partyMode}
        {enableLongPress}
        ongroupselect={(e) => handleGroupSelect(e)}
        ondeviceselect={(e) => handleDeviceSelect(e.detail.rackId, e)}
        ondevicedrop={(e) => handleDeviceDrop(e)}
        ondevicemove={(e) => handleDeviceMove(e)}
        ondevicemoverack={(e) => handleDeviceMoveRack(e)}
        onplacementtap={(e) => handlePlacementTap(e.detail.rackId, e)}
        onlongpress={(e) => onracklongpress?.(e)}
        onfocus={(rackIds) => onrackfocus?.(rackIds)}
        onexport={(rackIds) => onrackexport?.(rackIds)}
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
                selectedDeviceId={selectionStore.selectedType === "device" &&
                selectionStore.selectedRackId === rack.id
                  ? selectionStore.selectedDeviceId
                  : null}
                displayMode={uiStore.displayMode}
                showLabelsOnImages={uiStore.showLabelsOnImages}
                showAnnotations={uiStore.showAnnotations}
                annotationField={uiStore.annotationField}
                showBanana={uiStore.showBanana}
                {partyMode}
                {enableLongPress}
                onselect={(e) => handleRackSelect(e)}
                ondeviceselect={(e) => handleDeviceSelect(rack.id, e)}
                ondevicedrop={(e) => handleDeviceDrop(e)}
                ondevicemove={(e) => handleDeviceMove(e)}
                ondevicemoverack={(e) => handleDeviceMoveRack(e)}
                onplacementtap={(e) => handlePlacementTap(rack.id, e)}
                onlongpress={(e) => onracklongpress?.(e)}
                onfocus={() => onrackfocus?.([rack.id])}
                onexport={() => onrackexport?.([rack.id])}
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
        showBanana={uiStore.showBanana}
        {partyMode}
        {enableLongPress}
        onselect={(e) => handleRackSelect(e)}
        ondeviceselect={(e) => handleDeviceSelect(rack.id, e)}
        ondevicedrop={(e) => handleDeviceDrop(e)}
        ondevicemove={(e) => handleDeviceMove(e)}
        ondevicemoverack={(e) => handleDeviceMoveRack(e)}
        onplacementtap={(e) => handlePlacementTap(rack.id, e)}
        onlongpress={(e) => onracklongpress?.(e)}
        onfocus={() => onrackfocus?.([rack.id])}
        onexport={() => onrackexport?.([rack.id])}
        onedit={() => onrackedit?.(rack.id)}
        onrename={() => onrackrename?.(rack.id)}
        onduplicate={() => onrackduplicate?.(rack.id)}
        ondelete={() => onrackdelete?.(rack.id)}
      />
    </div>
  {/each}
</div>

<style>
  .racks-wrapper {
    /* Multi-rack mode: horizontal layout of all racks */
    display: flex;
    flex-direction: row;
    align-items: flex-start; /* Prevent shorter racks from stretching to match tallest */
    gap: var(--space-6);
    padding: var(--space-4);
  }

  .racks-wrapper.swipe-next {
    animation: rack-swipe-next 200ms var(--ease-out, ease-out);
  }

  .racks-wrapper.swipe-previous {
    animation: rack-swipe-previous 200ms var(--ease-out, ease-out);
  }

  @keyframes rack-swipe-next {
    0% {
      opacity: 1;
      transform: translateX(0);
    }
    50% {
      opacity: 0.9;
      transform: translateX(-18px);
    }
    100% {
      opacity: 1;
      transform: translateX(0);
    }
  }

  @keyframes rack-swipe-previous {
    0% {
      opacity: 1;
      transform: translateX(0);
    }
    50% {
      opacity: 0.9;
      transform: translateX(18px);
    }
    100% {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .rack-wrapper {
    /* Individual rack container - selection styling handled by RackDualView */
    display: inline-block;
    border-radius: var(--radius-lg);
  }

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
    align-items: flex-start; /* Prevent shorter racks from stretching */
    gap: var(--space-4);
  }

  /* Respect reduced motion preference */
  @media (prefers-reduced-motion: reduce) {
    .racks-wrapper.swipe-next,
    .racks-wrapper.swipe-previous {
      animation: none;
    }
  }
</style>
