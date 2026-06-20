<!--
  EditPanelMetadata Component
  Edit panel section: descriptive properties for the selected device, grouped
  by meaning. Identity (name, colour), Device type details (read-only facts:
  type, brand, height, category, power ratings, device-type notes), Placement
  (mounted face), Network (IP/hostname), and Notes (placement notes).
-->
<script lang="ts">
  import { onDestroy } from "svelte";
  import ColourSwatch from "./ColourSwatch.svelte";
  import ColourPicker from "./ColourPicker.svelte";
  import BrandIcon from "./BrandIcon.svelte";
  import MarkdownPreview from "./MarkdownPreview.svelte";
  import Tooltip from "./Tooltip.svelte";
  import { IconEdit, IconChevronDown } from "./icons";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getToastStore } from "$lib/stores/toast.svelte";
  import { getUIStore } from "$lib/stores/ui.svelte";
  import { getCategoryDisplayName } from "$lib/utils/deviceFilters";
  import { findDeviceType } from "$lib/utils/device-lookup";
  import { getBrandIconSlug } from "$lib/data/brandPacks";
  import { ICON_SIZE } from "$lib/constants/sizing";
  import { canPlaceDevice, findCollisions } from "$lib/utils/collision";
  import { getDeviceDisplayName } from "$lib/utils/device";
  import type { SelectedDeviceInfo, DeviceFace } from "$lib/types";

  interface Props {
    selectedDeviceInfo: SelectedDeviceInfo;
  }

  let { selectedDeviceInfo }: Props = $props();

  const layoutStore = getLayoutStore();
  const toastStore = getToastStore();
  const uiStore = getUIStore();

  // Count of device type facts shown in the collapsible block, so the header can
  // report how many are hidden when collapsed. Type, Brand, Height, Depth, Width
  // and Category always show; outlet count, VA rating and device-type notes are
  // conditional.
  const deviceTypeFactCount = $derived.by(() => {
    const device = selectedDeviceInfo.device;
    let count = 6; // Type, Brand, Height, Depth, Width, Category
    if (device.category === "power" && device.outlet_count) count += 1;
    if (device.category === "power" && device.va_rating) count += 1;
    if (device.notes) count += 1;
    return count;
  });

  // Authoritative device definition from the starter/brand library, falling back
  // to the layout copy. The layout copy can be stale (e.g. a device placed before
  // its library definition gained a manufacturer), so brand and full-depth display
  // resolve against the current library value.
  const authoritativeDevice = $derived(
    findDeviceType(selectedDeviceInfo.device.slug) ?? selectedDeviceInfo.device,
  );

  // State for device name editing. editingDeviceId pins the edit to the device
  // it started on; the editor is only open while the current selection still
  // matches it, so a pending edit never lands on a different placement when the
  // selection changes mid-edit (#2223).
  let editingDeviceId = $state<string | null>(null);
  let deviceNameInput = $state("");
  const editingDeviceName = $derived(
    editingDeviceId !== null &&
      selectedDeviceInfo.placedDevice.id === editingDeviceId,
  );

  // Notes and IP mirror the placement and are edited via bind:value.
  // Writable derived: resets to the placement value when the selection changes.
  let deviceNotes = $derived(selectedDeviceInfo.placedDevice.notes ?? "");
  let deviceIp = $derived.by(() => {
    const ip = selectedDeviceInfo.placedDevice.custom_fields?.ip;
    return typeof ip === "string" ? ip : "";
  });

  // State for colour picker visibility
  let showColourPicker = $state(false);

  // State for save feedback indicators
  let notesSaved = $state(false);
  let notesSavedTimeout: ReturnType<typeof setTimeout> | undefined;
  let ipSaved = $state(false);
  let ipSavedTimeout: ReturnType<typeof setTimeout> | undefined;

  // Cleanup timeouts on component destroy
  onDestroy(() => {
    if (notesSavedTimeout) {
      clearTimeout(notesSavedTimeout);
      notesSavedTimeout = undefined;
    }
    if (ipSavedTimeout) {
      clearTimeout(ipSavedTimeout);
      ipSavedTimeout = undefined;
    }
  });

  // Check if selected device is full-depth (determines if face can be changed).
  // is_full_depth undefined or true means full-depth.
  const isFullDepthDevice = $derived(
    authoritativeDevice.is_full_depth !== false,
  );

  // Read-only depth fact label. Resolves against the authoritative library value
  // first, falling back to the layout copy. is_full_depth undefined or true means
  // full-depth; false means half-depth.
  const depthLabel = $derived(
    (authoritativeDevice.is_full_depth ??
      selectedDeviceInfo.device.is_full_depth) === false
      ? "Half"
      : "Full",
  );

  // Read-only width fact label. slot_width 2 (or undefined) means full-width;
  // 1 means half-width.
  const widthLabel = $derived(
    (authoritativeDevice.slot_width ?? selectedDeviceInfo.device.slot_width) ===
      1
      ? "Half"
      : "Full",
  );

  // Resolved colour shown by the swatch button: placement override wins over the
  // device-type default.
  const resolvedColour = $derived(
    selectedDeviceInfo.placedDevice.colour_override ??
      selectedDeviceInfo.device.colour,
  );

  // Start editing device name
  function startEditingDeviceName() {
    const deviceName =
      selectedDeviceInfo.device.model ?? selectedDeviceInfo.device.slug;
    deviceNameInput = selectedDeviceInfo.placedDevice.name ?? deviceName;
    editingDeviceId = selectedDeviceInfo.placedDevice.id;
  }

  // Save device name
  function saveDeviceName() {
    // Guard against a selection switch landing the edit on the wrong device.
    // A blur can fire after the selection (and thus selectedDeviceInfo) has
    // already advanced to another placement (#2223).
    if (selectedDeviceInfo.placedDevice.id !== editingDeviceId) {
      editingDeviceId = null;
      return;
    }
    const newName = deviceNameInput.trim();
    const deviceName =
      selectedDeviceInfo.device.model ?? selectedDeviceInfo.device.slug;
    // If same as device type name, clear the custom name
    const nameToSave =
      newName === deviceName || newName === "" ? undefined : newName;
    layoutStore.updateDeviceName(
      selectedDeviceInfo.rack.id,
      selectedDeviceInfo.deviceIndex,
      nameToSave,
    );
    editingDeviceId = null;
  }

  // Handle device name input keydown
  function handleDeviceNameKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      saveDeviceName();
    } else if (event.key === "Escape") {
      editingDeviceId = null;
    }
  }

  // Update device notes
  function handleDeviceNotesBlur() {
    const trimmedNotes = deviceNotes.trim();
    const notesToSave = trimmedNotes === "" ? undefined : trimmedNotes;
    const existingNotes = selectedDeviceInfo.placedDevice.notes;

    // Only update if value changed to avoid no-op history entries
    if (notesToSave === existingNotes) return;

    // Use the dedicated function with undo/redo support
    layoutStore.updateDeviceNotes(
      selectedDeviceInfo.rack.id,
      selectedDeviceInfo.deviceIndex,
      notesToSave,
    );

    // Show saved indicator
    clearTimeout(notesSavedTimeout);
    notesSaved = true;
    notesSavedTimeout = setTimeout(() => {
      notesSaved = false;
    }, 2000);
  }

  // Update device IP address
  function handleDeviceIpBlur() {
    const trimmedIp = deviceIp.trim();
    const ipToSave = trimmedIp === "" ? undefined : trimmedIp;
    const existingIp = selectedDeviceInfo.placedDevice.custom_fields?.ip;

    // Only update if value changed to avoid no-op history entries
    if (ipToSave === existingIp) return;

    // Use the dedicated function with undo/redo support
    layoutStore.updateDeviceIp(
      selectedDeviceInfo.rack.id,
      selectedDeviceInfo.deviceIndex,
      ipToSave,
    );

    // Show saved indicator
    clearTimeout(ipSavedTimeout);
    ipSaved = true;
    ipSavedTimeout = setTimeout(() => {
      ipSaved = false;
    }, 2000);
  }

  // Update device face (with collision detection)
  function handleFaceChange(face: DeviceFace) {
    const { device, placedDevice, rack, deviceIndex } = selectedDeviceInfo;

    // Check for collision at the new face position
    const canPlace = canPlaceDevice(
      rack,
      layoutStore.device_types,
      device.u_height,
      placedDevice.position,
      deviceIndex, // exclude self from collision check
      face,
    );

    if (!canPlace) {
      // Find blocking devices for descriptive error message
      const collisions = findCollisions(
        rack,
        layoutStore.device_types,
        device.u_height,
        placedDevice.position,
        deviceIndex,
        face,
      );

      if (collisions.length > 0) {
        const blockingNames = collisions.map((placed) =>
          getDeviceDisplayName(placed, layoutStore.device_types),
        );
        const faceLabel = face === "both" ? "full-depth" : face;
        const message =
          blockingNames.length === 1
            ? `Cannot change to ${faceLabel}: blocked by ${blockingNames[0]}`
            : `Cannot change to ${faceLabel}: blocked by ${blockingNames.join(", ")}`;
        toastStore.showToast(message, "warning", 3000);
      }
      return; // Don't update face - collision would occur
    }

    // No collision, proceed with the face update
    layoutStore.updateDeviceFace(rack.id, deviceIndex, face);
  }
</script>

<!-- Identity: editable name and colour -->
<section class="field-group">
  <h3 class="group-header">Identity</h3>

  <!-- Display Name (click-to-edit) -->
  <div class="form-group">
    <label for="device-display-name">Name</label>
    {#if editingDeviceName}
      <input
        id="device-display-name"
        type="text"
        class="input-field"
        bind:value={deviceNameInput}
        onblur={saveDeviceName}
        onkeydown={handleDeviceNameKeydown}
      />
    {:else}
      <button
        id="device-display-name"
        type="button"
        class="display-name-display"
        onclick={startEditingDeviceName}
        aria-label="Edit display name"
      >
        <span class="display-name-text">
          {selectedDeviceInfo.placedDevice.name ??
            selectedDeviceInfo.device.model ??
            selectedDeviceInfo.device.slug}
        </span>
        <span class="edit-icon-wrapper"><IconEdit /></span>
      </button>
    {/if}
  </div>

  <!-- Colour (click-to-edit swatch button, opens picker) -->
  <div class="form-group">
    <span class="field-label" id="device-colour-label">Colour</span>
    <button
      type="button"
      class="colour-swatch-btn"
      onclick={() => (showColourPicker = !showColourPicker)}
      aria-expanded={showColourPicker}
      aria-labelledby="device-colour-label"
    >
      <ColourSwatch colour={resolvedColour} size={ICON_SIZE.sm} />
      <span class="colour-value">
        {resolvedColour}
        {#if selectedDeviceInfo.placedDevice.colour_override}
          <span class="colour-badge">custom</span>
        {/if}
      </span>
      <span class="edit-icon-wrapper"><IconEdit /></span>
    </button>
    {#if showColourPicker}
      <div class="colour-picker-container">
        <ColourPicker
          value={resolvedColour}
          defaultValue={selectedDeviceInfo.device.colour}
          onchange={(colour) =>
            layoutStore.updateDeviceColour(
              selectedDeviceInfo.rack.id,
              selectedDeviceInfo.deviceIndex,
              colour,
            )}
          onreset={() =>
            layoutStore.updateDeviceColour(
              selectedDeviceInfo.rack.id,
              selectedDeviceInfo.deviceIndex,
              undefined,
            )}
        />
      </div>
    {/if}
  </div>
</section>

<!-- Device type details: read-only reference facts (muted, non-interactive),
     collapsible behind a disclosure toggle. The expanded flag is shared across
     device selections, not stored per device. -->
<section class="field-group">
  <h3 class="group-header-heading">
    <button
      type="button"
      class="group-header group-toggle"
      aria-expanded={uiStore.deviceTypeDetailsExpanded}
      aria-controls={uiStore.deviceTypeDetailsExpanded
        ? "device-type-details-facts"
        : undefined}
      onclick={uiStore.toggleDeviceTypeDetailsExpanded}
    >
      <span
        class="group-chevron"
        class:group-chevron-collapsed={!uiStore.deviceTypeDetailsExpanded}
        aria-hidden="true"
      >
        <IconChevronDown size={ICON_SIZE.sm} />
      </span>
      <span>Device type details</span>
      {#if !uiStore.deviceTypeDetailsExpanded}
        <span class="group-count">({deviceTypeFactCount})</span>
      {/if}
    </button>
  </h3>
  {#if uiStore.deviceTypeDetailsExpanded}
    <div class="facts" id="device-type-details-facts">
      <div class="fact-row">
        <span class="fact-label">Type</span>
        <span class="fact-value fact-value-icon">
          <ColourSwatch
            colour={selectedDeviceInfo.device.colour}
            size={ICON_SIZE.sm}
          />
          {selectedDeviceInfo.device.model ?? selectedDeviceInfo.device.slug}
        </span>
      </div>
      <div class="fact-row">
        <span class="fact-label">Brand</span>
        <span class="fact-value fact-value-icon">
          <BrandIcon
            slug={getBrandIconSlug(authoritativeDevice.slug)}
            size={ICON_SIZE.sm}
          />
          {authoritativeDevice.manufacturer ??
            selectedDeviceInfo.device.manufacturer ??
            "Generic"}
        </span>
      </div>
      <div class="fact-row">
        <span class="fact-label">Height</span>
        <span class="fact-value">{selectedDeviceInfo.device.u_height}U</span>
      </div>
      <div class="fact-row">
        <span class="fact-label">Depth</span>
        <span class="fact-value">{depthLabel}</span>
      </div>
      <div class="fact-row">
        <span class="fact-label">Width</span>
        <span class="fact-value">{widthLabel}</span>
      </div>
      <div class="fact-row">
        <span class="fact-label">Category</span>
        <span class="fact-value"
          >{getCategoryDisplayName(selectedDeviceInfo.device.category)}</span
        >
      </div>
      {#if selectedDeviceInfo.device.category === "power" && selectedDeviceInfo.device.outlet_count}
        <div class="fact-row">
          <span class="fact-label">Outlets</span>
          <span class="fact-value"
            >{selectedDeviceInfo.device.outlet_count}</span
          >
        </div>
      {/if}
      {#if selectedDeviceInfo.device.category === "power" && selectedDeviceInfo.device.va_rating}
        <div class="fact-row">
          <span class="fact-label">VA Rating</span>
          <span class="fact-value">{selectedDeviceInfo.device.va_rating}</span>
        </div>
      {/if}
      {#if selectedDeviceInfo.device.notes}
        <div class="fact-notes">
          <span class="fact-label">Device type notes</span>
          <p class="fact-notes-text">{selectedDeviceInfo.device.notes}</p>
        </div>
      {/if}
    </div>
  {/if}
</section>

<!-- Placement: editable mounted face -->
<section class="field-group">
  <h3 class="group-header">Placement</h3>
  <div class="form-group">
    <label for="device-face">Mounted Face</label>
    <select
      id="device-face"
      class="input-field"
      value={selectedDeviceInfo.placedDevice.face}
      onchange={(e) =>
        handleFaceChange((e.target as HTMLSelectElement).value as DeviceFace)}
    >
      <option value="front">Front</option>
      <option value="rear">Rear</option>
      <option value="both">Both (full-depth)</option>
    </select>
    {#if isFullDepthDevice && selectedDeviceInfo.placedDevice.face !== "both"}
      <p class="helper-text">Overriding default full-depth setting</p>
    {/if}
  </div>
</section>

<!-- Network: editable IP/hostname -->
<section class="field-group">
  <h3 class="group-header">Network</h3>
  <div class="form-group">
    <label for="device-ip">
      IP Address/Hostname
      {#if ipSaved}
        <Tooltip text="Saved">
          <span class="saved-indicator" data-testid="saved-indicator-ip">✓</span
          >
        </Tooltip>
      {/if}
    </label>
    <input
      type="text"
      id="device-ip"
      class="input-field"
      bind:value={deviceIp}
      onblur={handleDeviceIpBlur}
      placeholder="e.g., 192.168.1.100"
    />
  </div>
</section>

<!-- Notes: editable placement notes -->
<section class="field-group">
  <h3 class="group-header">Notes</h3>
  <div class="form-group">
    <label for="device-notes">
      Notes
      {#if notesSaved}
        <Tooltip text="Saved">
          <span class="saved-indicator" data-testid="saved-indicator-notes"
            >✓</span
          >
        </Tooltip>
      {/if}
    </label>
    <textarea
      id="device-notes"
      class="input-field textarea"
      bind:value={deviceNotes}
      onblur={handleDeviceNotesBlur}
      rows="4"
      placeholder="Add notes about this device placement..."></textarea>
    {#if deviceNotes.trim()}
      <div class="notes-preview">
        <span class="preview-label">Preview</span>
        <MarkdownPreview content={deviceNotes} />
      </div>
    {/if}
  </div>
</section>

<style>
  /* Section wrapper grouping related fields under a header. */
  .field-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .group-header {
    margin: 0;
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    color: var(--colour-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  /* Heading wrapper keeps the section landmark while the toggle does the work. */
  .group-header-heading {
    margin: 0;
  }

  /* Disclosure toggle for Device type details: a real button that keeps the
     muted group-header look, full-width so the whole row is the hit target. */
  .group-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    width: 100%;
    padding: 0;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
  }

  .group-toggle:hover {
    color: var(--colour-text);
  }

  .group-toggle:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: 2px;
    border-radius: var(--radius-xs);
  }

  .group-count {
    color: var(--colour-text-muted);
  }

  .group-chevron {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    transition: transform var(--duration-fast) ease;
  }

  .group-chevron-collapsed {
    transform: rotate(-90deg);
  }

  @media (prefers-reduced-motion: reduce) {
    .group-chevron {
      transition: none;
    }
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-1-5);
  }

  .form-group label,
  .field-label {
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    color: var(--colour-text);
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .saved-indicator {
    color: var(--colour-success);
    font-size: var(--font-size-sm);
    animation: fade-in var(--duration-fast) ease-out;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .form-group input {
    padding: var(--space-2) var(--space-3);
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    border-radius: var(--radius-sm);
    color: var(--colour-text);
    font-size: var(--font-size-base);
  }

  .form-group input:focus {
    outline: none;
    border-color: var(--colour-selection);
  }

  .form-group select {
    padding: var(--space-2) var(--space-3);
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    border-radius: var(--radius-sm);
    color: var(--colour-text);
    font-size: var(--font-size-base);
    cursor: pointer;
  }

  .form-group select:focus {
    outline: none;
    border-color: var(--colour-selection);
  }

  .form-group textarea {
    padding: var(--space-2) var(--space-3);
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    border-radius: var(--radius-sm);
    color: var(--colour-text);
    font-size: var(--font-size-base);
    font-family: inherit;
    resize: vertical;
    min-height: 80px;
  }

  .form-group textarea:focus {
    outline: none;
    border-color: var(--colour-selection);
  }

  .helper-text {
    font-size: var(--font-size-sm);
    margin: 0;
    color: var(--colour-text-muted);
  }

  /* Device type details: borderless, muted, non-interactive facts. */
  .facts {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .fact-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-2);
  }

  .fact-label {
    font-size: var(--font-size-sm);
    color: var(--colour-text-muted);
  }

  .fact-value {
    font-size: var(--font-size-base);
    color: var(--colour-text-muted);
    text-align: right;
  }

  .fact-value-icon {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .fact-notes {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .fact-notes-text {
    font-size: var(--font-size-base);
    color: var(--colour-text-muted);
    margin: 0;
    white-space: pre-wrap;
    line-height: 1.5;
  }

  /* Colour swatch button: a real interactive control with form-control
     affordance (border, hover, focus), distinct from the muted facts. */
  .colour-swatch-btn {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-2) var(--space-3);
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    text-align: left;
    color: var(--colour-text);
    font-size: var(--font-size-base);
    transition: border-color 0.15s ease;
  }

  .colour-swatch-btn:hover {
    border-color: var(--colour-selection);
  }

  .colour-swatch-btn:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: 2px;
  }

  .colour-value {
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-family: monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .colour-badge {
    font-size: var(--font-size-xs);
    padding: 0 var(--space-1);
    background: var(--dracula-purple);
    color: var(--dracula-bg);
    border-radius: var(--radius-xs);
    text-transform: uppercase;
    font-weight: var(--font-weight-medium);
  }

  .colour-picker-container {
    margin-top: var(--space-2);
    margin-bottom: var(--space-2);
  }

  .display-name-display {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-2) var(--space-3);
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    text-align: left;
    color: var(--colour-text);
    font-size: var(--font-size-base);
    transition: border-color 0.15s ease;
  }

  .display-name-display:hover {
    border-color: var(--colour-selection);
  }

  .display-name-display:focus {
    outline: 2px solid var(--colour-selection);
    outline-offset: 2px;
  }

  .display-name-text {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .edit-icon-wrapper {
    flex-shrink: 0;
    opacity: 0.6;
    display: flex;
    align-items: center;
  }

  .edit-icon-wrapper :global(svg) {
    width: var(--icon-size-xs);
    height: var(--icon-size-xs);
  }

  .display-name-display:hover .edit-icon-wrapper,
  .colour-swatch-btn:hover .edit-icon-wrapper {
    opacity: 1;
  }

  /* Markdown preview for notes */
  .notes-preview {
    margin-top: var(--space-2);
    padding: var(--space-2);
    background: var(--colour-surface-secondary);
    border-radius: var(--radius-md);
    border: 1px solid var(--colour-border);
  }

  .preview-label {
    display: block;
    font-size: var(--font-size-xs);
    font-weight: 500;
    color: var(--colour-text-muted);
    margin-bottom: var(--space-1);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
</style>
