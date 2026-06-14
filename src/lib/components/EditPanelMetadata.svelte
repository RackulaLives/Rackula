<!--
  EditPanelMetadata Component
  Edit panel section: descriptive properties for the selected device:
  name, device type/brand, height, category, colour, mounted face, power
  ratings, device-type notes, IP/hostname, and placement notes.
-->
<script lang="ts">
  import { onDestroy } from "svelte";
  import ColourSwatch from "./ColourSwatch.svelte";
  import ColourPicker from "./ColourPicker.svelte";
  import BrandIcon from "./BrandIcon.svelte";
  import MarkdownPreview from "./MarkdownPreview.svelte";
  import Tooltip from "./Tooltip.svelte";
  import { IconEdit } from "./icons";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getToastStore } from "$lib/stores/toast.svelte";
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

  // Authoritative device definition from the starter/brand library, falling back
  // to the layout copy. The layout copy can be stale (e.g. a device placed before
  // its library definition gained a manufacturer), so brand and full-depth display
  // resolve against the current library value.
  const authoritativeDevice = $derived(
    findDeviceType(selectedDeviceInfo.device.slug) ?? selectedDeviceInfo.device,
  );

  // State for device name editing
  let editingDeviceName = $state(false);
  let deviceNameInput = $state("");

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

  // Start editing device name
  function startEditingDeviceName() {
    const deviceName =
      selectedDeviceInfo.device.model ?? selectedDeviceInfo.device.slug;
    deviceNameInput = selectedDeviceInfo.placedDevice.name ?? deviceName;
    editingDeviceName = true;
  }

  // Save device name
  function saveDeviceName() {
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
    editingDeviceName = false;
  }

  // Handle device name input keydown
  function handleDeviceNameKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      saveDeviceName();
    } else if (event.key === "Escape") {
      editingDeviceName = false;
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
      placedDevice.slot_position ?? "full",
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
        placedDevice.slot_position ?? "full",
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

<!-- Display Name at top (click-to-edit) -->
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

<!-- Device Type (read-only) -->
<div class="info-section">
  <div class="info-row">
    <span class="info-label">Device Type</span>
    <span class="info-value device-type">
      <ColourSwatch
        colour={selectedDeviceInfo.device.colour}
        size={ICON_SIZE.sm}
      />
      {selectedDeviceInfo.device.model ?? selectedDeviceInfo.device.slug}
    </span>
  </div>
  <div class="info-row">
    <span class="info-label">Brand</span>
    <span class="info-value brand-info">
      <BrandIcon
        slug={getBrandIconSlug(authoritativeDevice.slug)}
        size={ICON_SIZE.sm}
      />
      {authoritativeDevice.manufacturer ??
        selectedDeviceInfo.device.manufacturer ??
        "Generic"}
    </span>
  </div>
</div>

<div class="info-section">
  <div class="info-row">
    <span class="info-label">Height</span>
    <span class="info-value">{selectedDeviceInfo.device.u_height}U</span>
  </div>
  <div class="info-row">
    <span class="info-label">Category</span>
    <span class="info-value"
      >{getCategoryDisplayName(selectedDeviceInfo.device.category)}</span
    >
  </div>
  <!-- Colour row - clickable to open picker -->
  <button
    type="button"
    class="info-row colour-row-btn"
    onclick={() => (showColourPicker = !showColourPicker)}
    aria-expanded={showColourPicker}
    aria-label="Edit device colour"
  >
    <span class="info-label">Colour</span>
    <span class="info-value colour-info">
      <ColourSwatch
        colour={selectedDeviceInfo.placedDevice.colour_override ??
          selectedDeviceInfo.device.colour}
        size={ICON_SIZE.sm}
      />
      {#if selectedDeviceInfo.placedDevice.colour_override}
        {selectedDeviceInfo.placedDevice.colour_override}
        <span class="colour-badge">custom</span>
      {:else}
        {selectedDeviceInfo.device.colour}
      {/if}
    </span>
  </button>
  {#if showColourPicker}
    <div class="colour-picker-container">
      <ColourPicker
        value={selectedDeviceInfo.placedDevice.colour_override ??
          selectedDeviceInfo.device.colour}
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

<!-- Face selector (dropdown) - enabled for all devices per issue #144 -->
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

<!-- Power device properties -->
{#if selectedDeviceInfo.device.category === "power" && (selectedDeviceInfo.device.outlet_count || selectedDeviceInfo.device.va_rating)}
  <div class="info-section">
    {#if selectedDeviceInfo.device.outlet_count}
      <div class="info-row">
        <span class="info-label">Outlets</span>
        <span class="info-value">{selectedDeviceInfo.device.outlet_count}</span>
      </div>
    {/if}
    {#if selectedDeviceInfo.device.va_rating}
      <div class="info-row">
        <span class="info-label">VA Rating</span>
        <span class="info-value">{selectedDeviceInfo.device.va_rating}</span>
      </div>
    {/if}
  </div>
{/if}

<!-- Device Type Notes (read-only) -->
{#if selectedDeviceInfo.device.notes}
  <div class="notes-section">
    <span class="info-label">Device Type Notes</span>
    <p class="notes-text">{selectedDeviceInfo.device.notes}</p>
  </div>
{/if}

<!-- IP Address/Hostname (editable) -->
<div class="form-group">
  <label for="device-ip">
    IP Address/Hostname
    {#if ipSaved}
      <Tooltip text="Saved">
        <span class="saved-indicator">✓</span>
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

<!-- Placement Notes (editable) -->
<div class="form-group">
  <label for="device-notes">
    Notes
    {#if notesSaved}
      <Tooltip text="Saved">
        <span class="saved-indicator">✓</span>
      </Tooltip>
    {/if}
  </label>
  <textarea
    id="device-notes"
    class="input-field textarea"
    bind:value={deviceNotes}
    onblur={handleDeviceNotesBlur}
    rows="4"
    placeholder="Add notes about this device placement..."
  ></textarea>
  {#if deviceNotes.trim()}
    <div class="notes-preview">
      <span class="preview-label">Preview</span>
      <MarkdownPreview content={deviceNotes} />
    </div>
  {/if}
</div>

<style>
  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-1-5);
  }

  .form-group label {
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

  .info-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .info-label {
    font-size: var(--font-size-sm);
    color: var(--colour-text-muted);
  }

  .info-value {
    font-size: var(--font-size-base);
    color: var(--colour-text);
  }

  .colour-info {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-family: monospace;
  }

  .colour-row-btn {
    width: 100%;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    padding: var(--space-1) 0;
    border-radius: var(--radius-sm);
    transition: background-color var(--duration-fast);
  }

  .colour-row-btn:hover {
    background: var(--colour-surface-hover);
  }

  .colour-row-btn:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: 2px;
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

  .device-type {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .brand-info {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .display-name-display {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-2) var(--space-3);
    background: var(--colour-surface);
    border: 1px solid var(--colour-border);
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

  .display-name-display:hover .edit-icon-wrapper {
    opacity: 1;
  }

  .notes-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-1-5);
  }

  .notes-text {
    font-size: var(--font-size-base);
    color: var(--colour-text-muted);
    margin: 0;
    white-space: pre-wrap;
    line-height: 1.5;
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
