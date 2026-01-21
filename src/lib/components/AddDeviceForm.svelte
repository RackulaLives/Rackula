<!--
  AddDeviceForm Component
  Form dialog for adding a new device to the library
-->
<script lang="ts">
  import Dialog from "./Dialog.svelte";
  import ImageUpload from "./ImageUpload.svelte";
  import Switch from "./Switch.svelte";
  import type { DeviceCategory } from "$lib/types";
  import type { ImageData } from "$lib/types/images";
  import {
    ALL_CATEGORIES,
    CATEGORY_COLOURS,
    MIN_DEVICE_HEIGHT,
    MAX_DEVICE_HEIGHT,
  } from "$lib/types/constants";
  import { getDefaultColour } from "$lib/utils/device";

  interface Props {
    open: boolean;
    onadd?: (data: {
      name: string;
      height: number;
      category: DeviceCategory;
      colour: string;
      notes: string;
      isFullDepth: boolean;
      isHalfWidth: boolean;
      frontImage?: ImageData;
      rearImage?: ImageData;
    }) => void;
    oncancel?: () => void;
  }

  let { open, onadd, oncancel }: Props = $props();

  // Form state
  let name = $state("");
  let height = $state(1);
  let category = $state<DeviceCategory>("server");
  let colour = $state(getDefaultColour("server"));
  let notes = $state("");
  let isFullDepth = $state(true);
  let isHalfWidth = $state(false);
  let userChangedColour = $state(false);

  // Image state (v0.1.0)
  let frontImage = $state<ImageData | undefined>(undefined);
  let rearImage = $state<ImageData | undefined>(undefined);

  // Validation errors
  let nameError = $state("");
  let heightError = $state("");

  // Reset form when dialog opens
  $effect(() => {
    if (open) {
      name = "";
      height = 1;
      category = "server";
      colour = getDefaultColour("server");
      notes = "";
      isFullDepth = true;
      isHalfWidth = false;
      userChangedColour = false;
      nameError = "";
      heightError = "";
      // Reset images (v0.1.0)
      frontImage = undefined;
      rearImage = undefined;
    }
  });

  // Update colour when category changes (unless user manually changed it)
  function handleCategoryChange(event: Event) {
    const newCategory = (event.target as HTMLSelectElement)
      .value as DeviceCategory;
    category = newCategory;
    if (!userChangedColour) {
      colour = getDefaultColour(newCategory);
    }
  }

  function handleColourChange(event: Event) {
    colour = (event.target as HTMLInputElement).value;
    userChangedColour = true;
  }

  function getCategoryLabel(cat: DeviceCategory): string {
    const labels: Record<DeviceCategory, string> = {
      server: "Server",
      network: "Network",
      "patch-panel": "Patch Panel",
      power: "Power",
      storage: "Storage",
      kvm: "KVM",
      "av-media": "AV/Media",
      cooling: "Cooling",
      shelf: "Shelf",
      blank: "Blank Panel",
      "cable-management": "Cable Management",
      other: "Other",
    };
    return labels[cat];
  }

  function validate(): boolean {
    let valid = true;
    nameError = "";
    heightError = "";

    if (!name.trim()) {
      nameError = "Name is required";
      valid = false;
    }

    if (height < MIN_DEVICE_HEIGHT || height > MAX_DEVICE_HEIGHT) {
      heightError = `Height must be between ${MIN_DEVICE_HEIGHT} and ${MAX_DEVICE_HEIGHT}`;
      valid = false;
    }

    return valid;
  }

  function handleSubmit() {
    if (validate()) {
      onadd?.({
        name: name.trim(),
        height,
        category,
        colour,
        notes: notes.trim(),
        isFullDepth,
        isHalfWidth,
        frontImage,
        rearImage,
      });
    }
  }

  function handleCancel() {
    oncancel?.();
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (
      event.key === "Enter" &&
      event.target instanceof HTMLTextAreaElement === false
    ) {
      event.preventDefault();
      handleSubmit();
    }
  }
</script>

<Dialog {open} title="Add Device" width="480px" onclose={handleCancel}>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <form
    class="add-device-form"
    onsubmit={(e) => e.preventDefault()}
    onkeydown={handleKeyDown}
  >
    <div class="form-group">
      <label for="device-name">Name</label>
      <input
        type="text"
        id="device-name"
        class="input-field"
        bind:value={name}
        placeholder="e.g., Dell PowerEdge R740"
        class:error={nameError}
      />
      {#if nameError}
        <span class="error-message">{nameError}</span>
      {/if}
    </div>

    <div class="form-row">
      <div class="form-group">
        <label for="device-height">Height (U)</label>
        <input
          type="number"
          id="device-height"
          class="input-field"
          bind:value={height}
          min={MIN_DEVICE_HEIGHT}
          max={MAX_DEVICE_HEIGHT}
          class:error={heightError}
        />
        {#if heightError}
          <span class="error-message">{heightError}</span>
        {/if}
      </div>

      <div class="form-group">
        <label for="device-category">Category</label>
        <select
          id="device-category"
          class="input-field"
          value={category}
          onchange={handleCategoryChange}
        >
          {#each ALL_CATEGORIES as cat (cat)}
            <option value={cat}>{getCategoryLabel(cat)}</option>
          {/each}
        </select>
      </div>
    </div>

    <div class="form-group">
      <label for="device-colour">Colour</label>
      <div class="colour-input-wrapper">
        <input
          type="color"
          id="device-colour"
          value={colour}
          onchange={handleColourChange}
          class="colour-input"
        />
        <span class="colour-hex">{colour}</span>
      </div>
      <div class="colour-presets">
        {#each ALL_CATEGORIES as cat (cat)}
          <button
            type="button"
            class="colour-preset"
            style="background-color: {CATEGORY_COLOURS[cat]}"
            title={getCategoryLabel(cat)}
            onclick={() => {
              colour = CATEGORY_COLOURS[cat];
              userChangedColour = true;
            }}
            aria-label="Use {getCategoryLabel(cat)} colour"
          ></button>
        {/each}
      </div>
    </div>

    <div class="form-group">
      <label for="device-notes">Notes (optional)</label>
      <textarea
        id="device-notes"
        class="input-field"
        bind:value={notes}
        placeholder="Additional notes about the device..."
        rows="3"
      ></textarea>
    </div>

    <!-- Depth toggle (#241) -->
    <div class="form-group">
      <Switch
        id="device-full-depth"
        bind:checked={isFullDepth}
        label="Full Depth"
        helperText="Occupies both front and rear rack faces"
      />
    </div>

    <!-- Half-width toggle (#833) -->
    <div class="form-group">
      <Switch
        id="device-half-width"
        bind:checked={isHalfWidth}
        label="Half Width"
        helperText="Occupies left or right half of rack width"
      />
    </div>

    <!-- Image uploads (v0.1.0) -->
    <div class="form-row form-row-symmetric">
      <ImageUpload
        face="front"
        currentImage={frontImage}
        onupload={(data) => (frontImage = data)}
        onremove={() => (frontImage = undefined)}
      />
      <ImageUpload
        face="rear"
        currentImage={rearImage}
        onupload={(data) => (rearImage = data)}
        onremove={() => (rearImage = undefined)}
      />
    </div>

    <div class="form-actions">
      <button type="button" class="btn btn-secondary" onclick={handleCancel}>
        Cancel
      </button>
      <button type="submit" class="btn btn-primary" onclick={handleSubmit}>
        Add
      </button>
    </div>
  </form>
</Dialog>

<style>
  .add-device-form {
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
    font-weight: var(--font-weight-medium);
    color: var(--colour-text);
    font-size: var(--font-size-base);
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: var(--space-4);
  }

  .form-row-symmetric {
    grid-template-columns: 1fr 1fr;
  }

  .form-group input[type="text"],
  .form-group input[type="number"],
  .form-group select,
  .form-group textarea {
    padding: var(--space-2) var(--space-3);
    background: var(--colour-input-bg, var(--colour-bg));
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-md);
    color: var(--colour-text);
    font-size: var(--font-size-base);
    font-family: inherit;
  }

  .form-group textarea {
    resize: vertical;
    min-height: 60px;
  }

  .form-group input:focus,
  .form-group select:focus,
  .form-group textarea:focus {
    outline: none;
    border-color: var(--colour-selection);
    box-shadow: var(--glow-pink-sm);
  }

  .form-group input.error {
    border-color: var(--colour-error);
  }

  .error-message {
    font-size: var(--font-size-sm);
    color: var(--colour-error);
  }

  .colour-input-wrapper {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .colour-input {
    width: 50px;
    height: 36px;
    padding: 2px;
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    background: transparent;
    cursor: pointer;
  }

  .colour-input::-webkit-color-swatch {
    border: none;
    border-radius: 2px;
  }

  .colour-hex {
    font-family: monospace;
    font-size: var(--font-size-base);
    color: var(--colour-text-muted);
  }

  .colour-presets {
    display: flex;
    gap: var(--space-1-5);
    flex-wrap: wrap;
    margin-top: var(--space-2);
  }

  .colour-preset {
    width: 24px;
    height: 24px;
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    padding: 0;
    transition: transform var(--transition-fast);
  }

  .colour-preset:hover {
    transform: scale(1.1);
  }

  .colour-preset:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: 2px;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
    margin-top: var(--space-2);
  }

  .btn {
    padding: var(--space-2) var(--space-5);
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .btn-secondary {
    background: var(--colour-button-bg);
    color: var(--colour-text);
  }

  .btn-secondary:hover {
    background: var(--colour-button-hover);
  }

  .btn-primary {
    background: var(--colour-selection);
    color: white;
  }

  .btn-primary:hover {
    background: var(--colour-selection-hover);
  }
</style>
