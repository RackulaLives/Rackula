<!--
  ViewControls Component

  The body of the side panel's View tab (#2078): the layout-scoped view toggles
  that are always reachable regardless of selection. Display mode, annotations,
  and rear view. Theme is an app preference and lives behind the Settings gear,
  not here.

  These controls mirror existing store state rather than forking a second source
  of truth. Display mode is the same state as the canvas lens (#2074) and the
  palette toggle (#2094); rear view is the active rack's per-rack show_rear, the
  same field the Edit tab's rack section edits.
-->
<script lang="ts">
  import SegmentedControl from "./SegmentedControl.svelte";
  import Switch from "./Switch.svelte";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getUIStore } from "$lib/stores/ui.svelte";
  import type { DisplayMode } from "$lib/types";

  const layoutStore = getLayoutStore();
  const uiStore = getUIStore();

  const displayModeOptions: Array<{ value: DisplayMode; label: string }> = [
    { value: "label", label: "Label" },
    { value: "image", label: "Image" },
    { value: "image-label", label: "Image + Label" },
  ];

  // The active rack scopes the per-rack rear-view toggle. With no rack the
  // control is disabled rather than hidden, so the View tab stays stable.
  const activeRack = $derived(layoutStore.activeRack);

  function handleDisplayModeChange(mode: DisplayMode) {
    if (uiStore.displayMode === mode) return;
    uiStore.setDisplayMode(mode);
    layoutStore.updateDisplayMode(uiStore.displayMode);
    layoutStore.updateShowLabelsOnImages(uiStore.showLabelsOnImages);
  }

  function handleAnnotationsChange(enabled: boolean) {
    uiStore.setAnnotations(enabled);
  }

  // Rear view is per-rack. Bayed racks share one physical front/rear view, so a
  // change fans out to every rack in the bay to keep it consistent. Row groups
  // are independent racks, so only the active rack changes.
  function handleRearViewChange(value: string) {
    const rack = activeRack;
    if (!rack) return;
    const showRear = value === "show";
    const group = layoutStore.getRackGroupForRack(rack.id);
    if (group?.layout_preset === "bayed") {
      for (const rackId of group.rack_ids) {
        layoutStore.updateRack(rackId, { show_rear: showRear });
      }
    } else {
      layoutStore.updateRack(rack.id, { show_rear: showRear });
    }
  }
</script>

<div class="view-controls">
  <section class="control-group">
    <h3 class="control-label">Display Mode</h3>
    <SegmentedControl
      options={displayModeOptions}
      value={uiStore.displayMode}
      onchange={handleDisplayModeChange}
      ariaLabel="Display mode"
    />
  </section>

  <section class="control-group">
    <Switch
      id="view-annotations"
      checked={uiStore.showAnnotations}
      label="Annotations"
      helperText="Show the annotation column beside each rack."
      onchange={handleAnnotationsChange}
    />
  </section>

  <section class="control-group">
    <h3 class="control-label">Rear View</h3>
    <SegmentedControl
      options={[
        { value: "show", label: "Show" },
        { value: "hide", label: "Hide" },
      ]}
      value={activeRack?.show_rear ? "show" : "hide"}
      onchange={handleRearViewChange}
      ariaLabel="Show rear view on canvas"
      disabled={!activeRack}
    />
    {#if !activeRack}
      <p class="control-helper">Add a rack to control its rear view.</p>
    {/if}
  </section>
</div>

<style>
  .view-controls {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .control-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .control-label {
    margin: 0;
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    color: var(--colour-text);
  }

  .control-helper {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--colour-text-muted);
  }
</style>
