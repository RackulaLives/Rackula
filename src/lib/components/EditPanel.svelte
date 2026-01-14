<!--
  EditPanel Component
  Right drawer for editing selected racks and viewing device info
-->
<script lang="ts">
  import Drawer from "./Drawer.svelte";
  import ColourSwatch from "./ColourSwatch.svelte";
  import ColourPicker from "./ColourPicker.svelte";
  import BrandIcon from "./BrandIcon.svelte";
  import ImageUpload from "./ImageUpload.svelte";
  import ConfirmDialog from "./ConfirmDialog.svelte";
  import SegmentedControl from "./SegmentedControl.svelte";
  import MarkdownPreview from "./MarkdownPreview.svelte";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getSelectionStore } from "$lib/stores/selection.svelte";
  import { getUIStore } from "$lib/stores/ui.svelte";
  import { getCanvasStore } from "$lib/stores/canvas.svelte";
  import { getImageStore } from "$lib/stores/images.svelte";
  import { getCategoryDisplayName } from "$lib/utils/deviceFilters";
  import { findDeviceType, isCustomDevice } from "$lib/utils/device-lookup";
  import {
    canResizeRackTo,
    getConflictDetails,
    formatConflictMessage,
  } from "$lib/utils/rack-resize";
  import { canPlaceDevice, findCollisions } from "$lib/utils/collision";
  import { getToastStore } from "$lib/stores/toast.svelte";
  import { getDeviceDisplayName } from "$lib/utils/device";
  import { COMMON_RACK_HEIGHTS } from "$lib/types/constants";
  import type {
    Rack,
    DeviceType,
    PlacedDevice,
    DeviceFace,
    AnnotationField,
  } from "$lib/types";
  import type { ImageData } from "$lib/types/images";

  // Use dynamic active rack ID from store
  const currentRackId = $derived(
    layoutStore.activeRackId ?? layoutStore.racks[0]?.id ?? null,
  );

  // Map manufacturer names to simple-icons slugs
  const manufacturerIconMap: Record<string, string> = {
    Ubiquiti: "ubiquiti",
    MikroTik: "mikrotik",
    "TP-Link": "tplink",
    Synology: "synology",
    APC: "schneiderelectric",
    Dell: "dell",
    Supermicro: "supermicro",
    HPE: "hp",
  };

  function getManufacturerIconSlug(manufacturer?: string): string | undefined {
    if (!manufacturer) return undefined;
    return manufacturerIconMap[manufacturer];
  }

  const layoutStore = getLayoutStore();
  const selectionStore = getSelectionStore();
  const uiStore = getUIStore();
  const toastStore = getToastStore();
  const canvasStore = getCanvasStore();
  const imageStore = getImageStore();

  // Local state for form fields
  let rackName = $state("");
  let rackHeight = $state(42);
  let rackNotes = $state("");

  // Resize validation error state
  let resizeError = $state<string | null>(null);

  // State for device name editing
  let editingDeviceName = $state(false);
  let deviceNameInput = $state("");
  let deviceNotes = $state("");
  let deviceIp = $state("");

  // State for colour picker visibility
  let showColourPicker = $state(false);

  // State for delete device type confirmation dialog
  let showDeleteConfirm = $state(false);

  // Get the selected rack if any (multi-rack mode)
  const selectedRack = $derived.by(() => {
    if (!selectionStore.isRackSelected || !currentRackId) return null;
    if (selectionStore.selectedRackId !== currentRackId) return null;
    return layoutStore.activeRack;
  });

  // Get the selected device info if any (multi-rack mode)
  const selectedDeviceInfo = $derived.by(
    (): {
      device: DeviceType;
      placedDevice: PlacedDevice;
      rack: Rack;
      deviceIndex: number;
    } | null => {
      if (!selectionStore.isDeviceSelected) return null;
      if (
        selectionStore.selectedRackId === null ||
        selectionStore.selectedDeviceId === null
      )
        return null;

      const rack = layoutStore.activeRack;
      if (!rack) return null;

      // Find device by ID (UUID-based tracking)
      const deviceIndex = selectionStore.getSelectedDeviceIndex(rack.devices);
      if (deviceIndex === null) return null;

      const placedDevice = rack.devices[deviceIndex];
      if (!placedDevice) return null;

      const device = layoutStore.device_types.find(
        (d) => d.slug === placedDevice.device_type,
      );
      if (!device) return null;

      return { device, placedDevice, rack, deviceIndex };
    },
  );

  // Get the current placement images (if any)
  const placementFrontImage = $derived.by(() => {
    if (!selectedDeviceInfo) return undefined;
    return imageStore.getDeviceImage(
      `placement-${selectedDeviceInfo.placedDevice.id}`,
      "front",
    );
  });

  const placementRearImage = $derived.by(() => {
    if (!selectedDeviceInfo) return undefined;
    return imageStore.getDeviceImage(
      `placement-${selectedDeviceInfo.placedDevice.id}`,
      "rear",
    );
  });

  // Handle placement image upload
  function handlePlacementImageUpload(face: "front" | "rear", data: ImageData) {
    if (!selectedDeviceInfo) return;
    const deviceId = selectedDeviceInfo.placedDevice.id;
    imageStore.setDeviceImage(`placement-${deviceId}`, face, data);
    layoutStore.updateDevicePlacementImage(
      selectionStore.selectedRackId!,
      selectedDeviceInfo.deviceIndex,
      face,
      data.filename,
    );
  }

  // Handle placement image removal
  function handlePlacementImageRemove(face: "front" | "rear") {
    if (!selectedDeviceInfo) return;
    const deviceId = selectedDeviceInfo.placedDevice.id;
    imageStore.removeDeviceImage(`placement-${deviceId}`, face);
    layoutStore.updateDevicePlacementImage(
      selectionStore.selectedRackId!,
      selectedDeviceInfo.deviceIndex,
      face,
      undefined,
    );
  }

  // Auto-open drawer on selection, close on deselection
  $effect(() => {
    if (selectionStore.hasSelection) {
      uiStore.openRightDrawer();
    } else {
      uiStore.closeRightDrawer();
    }
  });

  // Sync local state with selected rack and clear errors
  $effect(() => {
    if (selectedRack) {
      rackName = selectedRack.name;
      rackHeight = selectedRack.height;
      rackNotes = selectedRack.notes ?? "";
      resizeError = null; // Clear any previous resize error
    }
  });

  // Update rack name on blur
  function handleNameBlur() {
    if (selectedRack && rackName !== selectedRack.name) {
      layoutStore.updateRack(currentRackId!, { name: rackName });
    }
  }

  // Update rack name on Enter
  function handleNameKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      (event.target as HTMLInputElement).blur();
    }
  }

  // Update rack notes on blur
  function handleNotesBlur() {
    if (selectedRack) {
      const trimmedNotes = rackNotes.trim();
      const notesToSave = trimmedNotes === "" ? undefined : trimmedNotes;
      if (notesToSave !== selectedRack.notes) {
        layoutStore.updateRack(currentRackId!, { notes: notesToSave });
      }
    }
  }

  // Validate and apply height change
  function attemptHeightChange(newHeight: number): boolean {
    if (!selectedRack) return false;

    const result = canResizeRackTo(
      selectedRack,
      newHeight,
      layoutStore.device_types,
    );

    if (!result.allowed) {
      const conflictDetails = getConflictDetails(
        result.conflicts,
        layoutStore.device_types,
      );
      resizeError = formatConflictMessage(conflictDetails);
      // Revert local state to current rack height
      rackHeight = selectedRack.height;
      return false;
    }

    // Clear error and apply change
    resizeError = null;
    layoutStore.updateRack(currentRackId!, { height: newHeight });
    // Reset view to center the resized rack
    canvasStore.fitAll(layoutStore.activeRack ? [layoutStore.activeRack] : []);
    return true;
  }

  // Update rack height on input change
  function handleHeightChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const newHeight = parseInt(target.value, 10);
    if (newHeight >= 1 && newHeight <= 100) {
      attemptHeightChange(newHeight);
    }
  }

  // Handle preset button click
  function handlePresetClick(preset: number) {
    rackHeight = preset;
    attemptHeightChange(preset);
  }

  // Delete selected rack
  function handleDeleteRack() {
    if (selectedRack) {
      layoutStore.deleteRack(currentRackId!);
      selectionStore.clearSelection();
    }
  }

  // Remove device from rack
  function handleRemoveDevice() {
    if (selectedDeviceInfo) {
      layoutStore.removeDeviceFromRack(
        selectionStore.selectedRackId!,
        selectedDeviceInfo.deviceIndex,
      );
      selectionStore.clearSelection();
    }
  }

  // Update device face (with collision detection)
  function handleFaceChange(face: DeviceFace) {
    if (!selectedDeviceInfo) return;

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
    layoutStore.updateDeviceFace(
      selectionStore.selectedRackId!,
      deviceIndex,
      face,
    );
  }

  // Check if selected device is full-depth (determines if face can be changed)
  // Uses authoritative source (starter/brand library) to get current is_full_depth value
  const isFullDepthDevice = $derived.by(() => {
    if (!selectedDeviceInfo) return false;
    // Look up the authoritative device type definition (checks starter/brand packs)
    // This ensures we use the current library value, not a stale layout copy
    const authoritativeDevice = findDeviceType(selectedDeviceInfo.device.slug);
    const device = authoritativeDevice ?? selectedDeviceInfo.device;
    // is_full_depth undefined or true means full-depth
    return device.is_full_depth !== false;
  });

  // Check if selected device is a custom (user-created) device
  const isSelectedDeviceCustom = $derived.by(() => {
    if (!selectedDeviceInfo) return false;
    return isCustomDevice(selectedDeviceInfo.device.slug);
  });

  // Count how many times this device type is placed in the rack
  const deviceTypePlacementCount = $derived.by(() => {
    if (!selectedDeviceInfo) return 0;
    const slug = selectedDeviceInfo.device.slug;
    const activeRack = layoutStore.activeRack;
    return activeRack
      ? activeRack.devices.filter((d) => d.device_type === slug).length
      : 0;
  });

  // Sync device notes with selection
  $effect(() => {
    if (selectedDeviceInfo) {
      deviceNotes = selectedDeviceInfo.placedDevice.notes ?? "";
    }
  });

  // Sync device IP with selection
  $effect(() => {
    if (selectedDeviceInfo) {
      const ip = selectedDeviceInfo.placedDevice.custom_fields?.ip;
      deviceIp = typeof ip === "string" ? ip : "";
    }
  });

  // Start editing device name
  function startEditingDeviceName() {
    if (selectedDeviceInfo) {
      const deviceName =
        selectedDeviceInfo.device.model ?? selectedDeviceInfo.device.slug;
      deviceNameInput = selectedDeviceInfo.placedDevice.name ?? deviceName;
      editingDeviceName = true;
    }
  }

  // Save device name
  function saveDeviceName() {
    if (selectedDeviceInfo) {
      const newName = deviceNameInput.trim();
      const deviceName =
        selectedDeviceInfo.device.model ?? selectedDeviceInfo.device.slug;
      // If same as device type name, clear the custom name
      const nameToSave =
        newName === deviceName || newName === "" ? undefined : newName;
      layoutStore.updateDeviceName(
        selectionStore.selectedRackId!,
        selectedDeviceInfo.deviceIndex,
        nameToSave,
      );
    }
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
    if (selectedDeviceInfo) {
      const trimmedNotes = deviceNotes.trim();
      const notesToSave = trimmedNotes === "" ? undefined : trimmedNotes;
      // Update via updateRack - modify the device in the rack's devices array
      const activeRack = layoutStore.activeRack;
      if (!activeRack) return;
      const updatedDevices = [...activeRack.devices];
      updatedDevices[selectedDeviceInfo.deviceIndex] = {
        ...updatedDevices[selectedDeviceInfo.deviceIndex]!,
        notes: notesToSave,
      };
      layoutStore.updateRack(currentRackId!, { devices: updatedDevices });
    }
  }

  // Update device IP address
  function handleDeviceIpBlur() {
    if (selectedDeviceInfo) {
      const trimmedIp = deviceIp.trim();
      const activeRack = layoutStore.activeRack;
      if (!activeRack) return;
      const updatedDevices = [...activeRack.devices];
      const currentDevice = updatedDevices[selectedDeviceInfo.deviceIndex]!;
      const currentCustomFields = currentDevice.custom_fields ?? {};

      // Build new custom_fields object
      let newCustomFields: Record<string, unknown> | undefined;
      if (trimmedIp === "") {
        // Remove ip from custom_fields
        const { ip: _, ...rest } = currentCustomFields;
        void _; // Explicitly mark as intentionally unused
        newCustomFields = Object.keys(rest).length > 0 ? rest : undefined;
      } else {
        newCustomFields = { ...currentCustomFields, ip: trimmedIp };
      }

      updatedDevices[selectedDeviceInfo.deviceIndex] = {
        ...currentDevice,
        custom_fields: newCustomFields,
      };
      layoutStore.updateRack(currentRackId!, { devices: updatedDevices });
    }
  }

  // Handle delete device type from library
  function handleDeleteDeviceType() {
    showDeleteConfirm = true;
  }

  // Confirm delete device type
  function confirmDeleteDeviceType() {
    if (selectedDeviceInfo) {
      const slug = selectedDeviceInfo.device.slug;
      selectionStore.clearSelection();
      layoutStore.deleteDeviceType(slug);
    }
    showDeleteConfirm = false;
  }

  // Cancel delete device type
  function cancelDeleteDeviceType() {
    showDeleteConfirm = false;
  }

  // Close drawer
  function handleClose() {
    uiStore.closeRightDrawer();
    selectionStore.clearSelection();
  }

  /**
   * Move device up or down by specified step size
   * @param direction - 1 for up (higher U), -1 for down (lower U)
   * @param step - Step size in U (default 1, use 0.5 for fine movement)
   */
  function moveDevice(direction: number, step: number = 1) {
    if (!selectedDeviceInfo) return;

    const { device, placedDevice, rack, deviceIndex } = selectedDeviceInfo;

    // Calculate new position
    let newPosition = placedDevice.position + direction * step;

    // Clamp to valid range
    if (newPosition < 1) newPosition = 1;
    if (newPosition + device.u_height - 1 > rack.height) {
      newPosition = rack.height - device.u_height + 1;
    }

    // Check if new position is valid
    // Face is authoritative: the device's face value determines blocking
    const isValid = canPlaceDevice(
      rack,
      layoutStore.device_types,
      device.u_height,
      newPosition,
      deviceIndex,
      placedDevice.face,
    );

    if (isValid) {
      layoutStore.moveDevice(currentRackId!, deviceIndex, newPosition);
    }
  }

  // Check if device can move up
  const canMoveUp = $derived.by(() => {
    if (!selectedDeviceInfo) return false;
    const { device, placedDevice, rack, deviceIndex } = selectedDeviceInfo;
    const newPosition = placedDevice.position + 1;
    if (newPosition + device.u_height - 1 > rack.height) return false;
    return canPlaceDevice(
      rack,
      layoutStore.device_types,
      device.u_height,
      newPosition,
      deviceIndex,
      placedDevice.face,
    );
  });

  // Check if device can move down
  const canMoveDown = $derived.by(() => {
    if (!selectedDeviceInfo) return false;
    const { device, placedDevice, rack, deviceIndex } = selectedDeviceInfo;
    const newPosition = placedDevice.position - 1;
    if (newPosition < 1) return false;
    return canPlaceDevice(
      rack,
      layoutStore.device_types,
      device.u_height,
      newPosition,
      deviceIndex,
      placedDevice.face,
    );
  });

  // Transform internal position to display position (matches ruler labels)
  // Internal: position 1 = bottom of rack, position N = top
  // Display with desc_units=false: U1 at bottom (same as internal)
  // Display with desc_units=true: U1 at top (inverted)
  const displayPosition = $derived.by(() => {
    if (!selectedDeviceInfo) return null;
    const { placedDevice, rack } = selectedDeviceInfo;
    const pos = placedDevice.position;
    return rack.desc_units
      ? rack.height - pos + 1 // Inverted: bottom (pos=1) shows as highest U
      : pos; // Normal: position = display
  });
</script>

<Drawer
  side="right"
  open={uiStore.rightDrawerOpen}
  title="Edit"
  showClose={false}
  onclose={handleClose}
>
  {#if selectedRack}
    <!-- Rack editing form -->
    <div class="edit-form">
      <div class="form-group">
        <label for="rack-name">Name</label>
        <input
          type="text"
          id="rack-name"
          class="input-field"
          bind:value={rackName}
          onblur={handleNameBlur}
          onkeydown={handleNameKeydown}
        />
      </div>

      <div class="form-group">
        <label for="rack-height">Height</label>
        <input
          type="number"
          id="rack-height"
          class="input-field"
          class:error={resizeError !== null}
          bind:value={rackHeight}
          onchange={handleHeightChange}
          min="1"
          max="100"
        />
        {#if resizeError}
          <p class="helper-text error">Cannot resize: {resizeError}</p>
        {/if}
        <div class="height-presets">
          {#each COMMON_RACK_HEIGHTS as preset (preset)}
            <button
              type="button"
              class="preset-btn"
              class:active={rackHeight === preset}
              onclick={() => handlePresetClick(preset)}
            >
              {preset}U
            </button>
          {/each}
        </div>
      </div>

      <div class="form-group">
        <label for="rack-numbering">U Numbering</label>
        <SegmentedControl
          options={[
            { value: "bottom", label: "U1 at bottom" },
            { value: "top", label: "U1 at top" },
          ]}
          value={selectedRack.desc_units ? "top" : "bottom"}
          onchange={(value) =>
            layoutStore.updateRack(currentRackId!, {
              desc_units: value === "top",
            })}
          ariaLabel="U numbering direction"
        />
      </div>

      <div class="form-group">
        <label for="show-rear-view">Show Rear View</label>
        <SegmentedControl
          options={[
            { value: "show", label: "Show" },
            { value: "hide", label: "Hide" },
          ]}
          value={selectedRack.show_rear ? "show" : "hide"}
          onchange={(value) =>
            layoutStore.updateRack(currentRackId!, {
              show_rear: value === "show",
            })}
          ariaLabel="Show rear view on canvas"
        />
      </div>

      <div class="form-group">
        <label for="rack-notes">Notes</label>
        <textarea
          id="rack-notes"
          class="input-field textarea"
          bind:value={rackNotes}
          onblur={handleNotesBlur}
          rows="4"
          placeholder="Add notes about this rack..."
        ></textarea>
        {#if rackNotes.trim()}
          <div class="notes-preview">
            <span class="preview-label">Preview</span>
            <MarkdownPreview content={rackNotes} />
          </div>
        {/if}
      </div>

      <div class="form-group">
        <label for="annotation-field">Annotation Field</label>
        <select
          id="annotation-field"
          class="input-field"
          value={uiStore.annotationField}
          onchange={(e) =>
            uiStore.setAnnotationField(
              e.currentTarget.value as AnnotationField,
            )}
        >
          <option value="name">Name</option>
          <option value="ip">IP Address</option>
          <option value="notes">Notes</option>
          <option value="asset_tag">Asset Tag</option>
          <option value="serial">Serial Number</option>
          <option value="manufacturer">Manufacturer</option>
        </select>
        <p class="helper-text">
          Field shown in annotation column (press N to toggle)
        </p>
      </div>

      <div class="actions">
        <button
          type="button"
          class="btn-danger"
          onclick={handleDeleteRack}
          aria-label="Delete rack"
        >
          Delete Rack
        </button>
      </div>
    </div>
  {:else if selectedDeviceInfo}
    <!-- Device view -->
    <div class="device-view">
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
            <svg
              class="edit-icon"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
              />
              <path
                d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
              />
            </svg>
          </button>
        {/if}
      </div>

      <!-- Device Type (read-only) -->
      <div class="info-section">
        <div class="info-row">
          <span class="info-label">Device Type</span>
          <span class="info-value device-type">
            <ColourSwatch colour={selectedDeviceInfo.device.colour} size={16} />
            {selectedDeviceInfo.device.model ?? selectedDeviceInfo.device.slug}
          </span>
        </div>
        <div class="info-row">
          <span class="info-label">Brand</span>
          <span class="info-value brand-info">
            <BrandIcon
              slug={getManufacturerIconSlug(
                selectedDeviceInfo.device.manufacturer,
              )}
              size={16}
            />
            {selectedDeviceInfo.device.manufacturer ?? "Generic"}
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
        <div class="info-row position-row">
          <span class="info-label">Position</span>
          <div class="position-controls">
            <span class="info-value position-value">U{displayPosition}</span>
            <div class="position-buttons">
              <button
                type="button"
                class="position-btn"
                onclick={() => moveDevice(-1)}
                disabled={!canMoveDown}
                aria-label="Move down 1U"
                title="Move down 1U"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                >
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
              <button
                type="button"
                class="position-btn"
                onclick={() => moveDevice(1)}
                disabled={!canMoveUp}
                aria-label="Move up 1U"
                title="Move up 1U"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                >
                  <polyline points="18 15 12 9 6 15"></polyline>
                </svg>
              </button>
              <span class="position-divider"></span>
              <button
                type="button"
                class="position-btn position-btn-fine"
                onclick={() => moveDevice(-1, 0.5)}
                aria-label="Move down 0.5U"
                title="Move down 0.5U (fine)"
              >
                <span class="fine-label">-½</span>
              </button>
              <button
                type="button"
                class="position-btn position-btn-fine"
                onclick={() => moveDevice(1, 0.5)}
                aria-label="Move up 0.5U"
                title="Move up 0.5U (fine)"
              >
                <span class="fine-label">+½</span>
              </button>
            </div>
          </div>
        </div>
        <p class="helper-text position-hint">Use ↑↓ keys (Shift for 0.5U)</p>
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
              size={16}
            />
            {#if selectedDeviceInfo.placedDevice.colour_override}
              {selectedDeviceInfo.placedDevice.colour_override}
              <span class="colour-badge">custom</span>
            {:else}
              {selectedDeviceInfo.device.colour}
            {/if}
          </span>
        </button>
        {#if showColourPicker && selectedDeviceInfo}
          <div class="colour-picker-container">
            <ColourPicker
              value={selectedDeviceInfo.placedDevice.colour_override ??
                selectedDeviceInfo.device.colour}
              defaultValue={selectedDeviceInfo.device.colour}
              onchange={(colour) => {
                // Use rack from selectedDeviceInfo to avoid race condition
                const rackId = selectedDeviceInfo.rack.id;
                const deviceIndex = selectedDeviceInfo.rack.devices.findIndex(
                  (d) => d.id === selectedDeviceInfo.placedDevice.id,
                );
                if (deviceIndex >= 0) {
                  layoutStore.updateDeviceColour(rackId, deviceIndex, colour);
                }
              }}
              onreset={() => {
                // Use rack from selectedDeviceInfo to avoid race condition
                const rackId = selectedDeviceInfo.rack.id;
                const deviceIndex = selectedDeviceInfo.rack.devices.findIndex(
                  (d) => d.id === selectedDeviceInfo.placedDevice.id,
                );
                if (deviceIndex >= 0) {
                  layoutStore.updateDeviceColour(
                    rackId,
                    deviceIndex,
                    undefined,
                  );
                }
              }}
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
            handleFaceChange(
              (e.target as HTMLSelectElement).value as DeviceFace,
            )}
        >
          <option value="front">Front</option>
          <option value="rear">Rear</option>
          <option value="both">Both (full-depth)</option>
        </select>
        {#if isFullDepthDevice && selectedDeviceInfo.placedDevice.face !== "both"}
          <p class="helper-text">Overriding default full-depth setting</p>
        {/if}
      </div>

      <!-- Placement Image Overrides -->
      <div class="form-group">
        <ImageUpload
          face="front"
          currentImage={placementFrontImage}
          onupload={(data) => handlePlacementImageUpload("front", data)}
          onremove={() => handlePlacementImageRemove("front")}
        />
        <p class="helper-text">
          Override the device type front image for this placement
        </p>
      </div>

      <div class="form-group">
        <ImageUpload
          face="rear"
          currentImage={placementRearImage}
          onupload={(data) => handlePlacementImageUpload("rear", data)}
          onremove={() => handlePlacementImageRemove("rear")}
        />
        <p class="helper-text">
          Override the device type rear image for this placement
        </p>
      </div>

      <!-- Power device properties -->
      {#if selectedDeviceInfo.device.category === "power" && (selectedDeviceInfo.device.outlet_count || selectedDeviceInfo.device.va_rating)}
        <div class="info-section">
          {#if selectedDeviceInfo.device.outlet_count}
            <div class="info-row">
              <span class="info-label">Outlets</span>
              <span class="info-value"
                >{selectedDeviceInfo.device.outlet_count}</span
              >
            </div>
          {/if}
          {#if selectedDeviceInfo.device.va_rating}
            <div class="info-row">
              <span class="info-label">VA Rating</span>
              <span class="info-value"
                >{selectedDeviceInfo.device.va_rating}</span
              >
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

      <!-- IP Address (editable) -->
      <div class="form-group">
        <label for="device-ip">IP Address</label>
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
        <label for="device-notes">Notes</label>
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

      <div class="actions">
        <button
          type="button"
          class="btn-danger"
          onclick={handleRemoveDevice}
          aria-label="Remove from rack"
        >
          Remove from Rack
        </button>
        {#if isSelectedDeviceCustom}
          <button
            type="button"
            class="btn-danger btn-delete-type"
            onclick={handleDeleteDeviceType}
            aria-label="Delete from library"
          >
            Delete from Library
          </button>
        {/if}
      </div>
    </div>
  {/if}
</Drawer>

<!-- Delete device type confirmation dialog -->
<ConfirmDialog
  open={showDeleteConfirm}
  title="Delete Device Type"
  message={`Delete "${selectedDeviceInfo?.device.model ?? selectedDeviceInfo?.device.slug}"? ${deviceTypePlacementCount > 0 ? `This device is placed ${deviceTypePlacementCount} time${deviceTypePlacementCount === 1 ? "" : "s"}. All instances will be removed.` : "This will remove the device from your library."}`}
  confirmLabel="Delete"
  onconfirm={confirmDeleteDeviceType}
  oncancel={cancelDeleteDeviceType}
/>

<style>
  .edit-form,
  .device-view {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-1-5);
  }

  .form-group label {
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    color: var(--colour-text);
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

  .form-group input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
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

  .form-group select:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background: var(--colour-surface);
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

  .helper-text.error {
    color: var(--colour-error);
  }

  .input-field.error {
    border-color: var(--colour-error);
  }

  .height-presets {
    display: flex;
    gap: var(--space-2);
    margin-top: 4px;
  }

  .preset-btn {
    padding: 4px var(--space-2);
    background: var(--button-bg);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    color: var(--colour-text);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: background-color var(--duration-fast);
  }

  .preset-btn:hover {
    background: var(--button-bg-hover);
  }

  .preset-btn.active {
    background: var(--colour-selection);
    border-color: var(--colour-selection);
    color: white;
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

  .edit-icon {
    flex-shrink: 0;
    opacity: 0.6;
  }

  .display-name-display:hover .edit-icon {
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

  .actions {
    margin-top: var(--space-6);
  }

  .btn-danger {
    width: 100%;
    padding: 10px var(--space-4);
    background: var(--colour-error);
    border: none;
    border-radius: var(--radius-sm);
    color: white;
    font-size: var(--font-size-base);
    font-weight: 500;
    cursor: pointer;
    transition: background-color var(--duration-fast);
  }

  .btn-danger:hover {
    background: var(--colour-error-hover);
  }

  .btn-delete-type {
    margin-top: var(--space-2);
  }

  /* Position controls */
  .position-row {
    align-items: flex-start;
  }

  .position-controls {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .position-value {
    min-width: 2.5em;
    font-variant-numeric: tabular-nums;
  }

  .position-buttons {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .position-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    background: var(--button-bg);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    color: var(--colour-text);
    cursor: pointer;
    transition:
      background-color var(--duration-fast),
      border-color var(--duration-fast);
  }

  .position-btn:hover:not(:disabled) {
    background: var(--button-bg-hover);
    border-color: var(--colour-selection);
  }

  .position-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .position-btn:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: 1px;
  }

  .position-btn-fine {
    background: var(--colour-surface);
  }

  .position-btn-fine:hover:not(:disabled) {
    background: var(--colour-selection);
    color: white;
    border-color: var(--colour-selection);
  }

  .fine-label {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
  }

  .position-divider {
    width: 1px;
    height: 16px;
    background: var(--colour-border);
    margin: 0 var(--space-1);
  }

  .position-hint {
    margin-top: var(--space-1);
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
