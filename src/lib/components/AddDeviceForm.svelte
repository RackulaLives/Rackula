<!--
  AddDeviceForm Component
  Form dialog for adding a new device to the library
-->
<script lang="ts">
  import Dialog from "./Dialog.svelte";
  import Button from "./ui/Button.svelte";
  import ImageUpload from "./ImageUpload.svelte";
  import Switch from "./Switch.svelte";
  import type { DeviceCategory, RackWidth } from "$lib/types";
  import type { ImageData } from "$lib/types/images";
  import {
    ALL_CATEGORIES,
    CATEGORY_COLOURS,
    MIN_DEVICE_HEIGHT,
    MAX_DEVICE_HEIGHT,
  } from "$lib/types/constants";
  import { getDefaultColour } from "$lib/utils/device";
  import { getCropUnitHeight } from "$lib/utils/image-crop";
  import {
    WIDTH_UNITS,
    getRackOpeningMm,
    toMillimetres,
    type WidthUnit,
  } from "$lib/utils/device-width";

  interface Props {
    open: boolean;
    /** Active rack width for smart defaulting (10, 19, 21, or 23) */
    activeRackWidth?: number;
    /** Pre-fills the name field when the dialog opens (#3007/R28a). */
    initialName?: string;
    onadd?: (data: {
      name: string;
      height: number;
      category: DeviceCategory;
      colour: string;
      notes: string;
      isFullDepth: boolean;
      isHalfWidth: boolean;
      widthMm?: number;
      rackWidths: RackWidth[];
      frontImage?: ImageData;
      rearImage?: ImageData;
    }) => void;
    oncancel?: () => void;
  }

  let { open, activeRackWidth, initialName, onadd, oncancel }: Props = $props();

  // Rack width options for selector
  type RackWidthOption = "10" | "19" | "both";
  const rackWidthOptions: { value: RackWidthOption; label: string }[] = [
    { value: "10", label: "10 inch" },
    { value: "19", label: "19 inch" },
    { value: "both", label: 'Both (10" & 19")' },
  ];

  // Get default rack width option based on active rack
  function getDefaultRackWidthOption(): RackWidthOption {
    if (activeRackWidth === 10) return "10";
    return "19"; // Default to 19" for 19/21/23" racks or no active rack
  }

  // Convert option to rack_widths array
  function optionToRackWidths(option: RackWidthOption): RackWidth[] {
    switch (option) {
      case "10":
        return [10];
      case "19":
        return [19];
      case "both":
        return [10, 19];
    }
  }

  // Rack width the crop frame is shaped for: the active rack when the device
  // fits it, otherwise the device's own width.
  function getCropRackWidth(option: RackWidthOption): number {
    const fits = optionToRackWidths(option);
    if (activeRackWidth === 10) return fits.includes(10) ? 10 : 19;
    if (option === "10") return 10;
    return activeRackWidth ?? 19;
  }

  // Narrowest rack the device is declared to fit. A measured width is checked
  // against this one, not the active rack: rack_widths travels with the device
  // type, so "Both" must fit a 10 inch opening and "19 inch" a 19 inch one even
  // when the rack in front of the user is wider.
  function getNarrowestTargetRackWidth(): number {
    return Math.min(...optionToRackWidths(rackWidthOption));
  }

  // Form state
  let name = $state("");
  let height = $state(1);
  let category = $state<DeviceCategory>("server");
  let colour = $state(getDefaultColour("server"));
  let notes = $state("");
  let isFullDepth = $state(true);
  let isHalfWidth = $state(false);
  // Optional measured width; an empty number input binds to null.
  let widthValue = $state<number | null>(null);
  let widthUnit = $state<WidthUnit>("mm");
  let rackWidthOption = $state<RackWidthOption>(getDefaultRackWidthOption());
  // The image is drawn in every rack width the device fits, so the crop shows
  // guides for the widths it is not framed for.
  const cropRackWidth = $derived(getCropRackWidth(rackWidthOption));
  // The crop frame follows the form: a half-width device is drawn in a carrier
  // cell half the interior wide, so it is framed that way rather than to the
  // full rails.
  const cropWidthFraction = $derived(isHalfWidth ? 0.5 : 1);
  const cropWidthLabel = $derived(
    isHalfWidth
      ? `a half-width ${getCropUnitHeight(height)}U device in a ${cropRackWidth} inch rack`
      : undefined,
  );
  const cropGuideRackWidths = $derived(optionToRackWidths(rackWidthOption));
  let userChangedColour = $state(false);

  // Image state (v0.1.0)
  let frontImage = $state<ImageData | undefined>(undefined);
  let rearImage = $state<ImageData | undefined>(undefined);

  // Validation errors
  let nameError = $state("");
  let heightError = $state("");
  let widthError = $state("");

  const hasWidth = $derived(widthValue !== null && widthValue !== undefined);

  // Reset form when dialog opens
  $effect(() => {
    if (open) {
      name = initialName ?? "";
      height = 1;
      category = "server";
      colour = getDefaultColour("server");
      notes = "";
      isFullDepth = true;
      isHalfWidth = false;
      widthValue = null;
      widthUnit = "mm";
      widthError = "";
      rackWidthOption = getDefaultRackWidthOption();
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
      firewall: "Firewall",
      "patch-panel": "Patch Panel",
      power: "Power",
      storage: "Storage",
      kvm: "KVM",
      "av-media": "AV/Media",
      cooling: "Cooling",
      shelf: "Shelf",
      blank: "Blank Panel",
      "cable-management": "Cable Management",
      chassis: "Chassis",
      other: "Other",
    };
    return labels[cat];
  }

  function validate(): boolean {
    let valid = true;
    nameError = "";
    heightError = "";
    widthError = "";

    if (!name.trim()) {
      nameError = "Name is required";
      valid = false;
    }

    if (height < MIN_DEVICE_HEIGHT || height > MAX_DEVICE_HEIGHT) {
      heightError = `Height must be between ${MIN_DEVICE_HEIGHT} and ${MAX_DEVICE_HEIGHT}`;
      valid = false;
    }

    if (hasWidth) {
      // Check the stored value: tiny inputs round to 0 mm.
      const widthMm = toMillimetres(widthValue!, widthUnit);
      const rackWidth = getNarrowestTargetRackWidth();
      const openingMm = getRackOpeningMm(rackWidth);
      if (!(widthMm > 0)) {
        widthError = "Width must be at least 0.1 mm";
        valid = false;
      } else if (widthMm > openingMm) {
        widthError = `Too wide for a shelf in a ${rackWidth} inch rack (up to ${Math.floor(openingMm)} mm). Leave width empty for rack-mount gear.`;
        valid = false;
      }
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
        // A measured width overrides Half Width, so submit the rendered state.
        isHalfWidth: isHalfWidth && !hasWidth,
        widthMm: hasWidth ? toMillimetres(widthValue!, widthUnit) : undefined,
        rackWidths: optionToRackWidths(rackWidthOption),
        frontImage,
        rearImage,
      });
    }
  }

  function handleCancel() {
    oncancel?.();
  }

  function handleKeyDown(event: KeyboardEvent) {
    // Buttons and text areas keep their own Enter behaviour
    if (
      event.key === "Enter" &&
      !(event.target instanceof HTMLTextAreaElement) &&
      !(event.target instanceof HTMLButtonElement)
    ) {
      event.preventDefault();
      handleSubmit();
    }
  }
</script>

<Dialog {open} title="Add Device" size="M" onclose={handleCancel}>
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
        oninput={(e: Event) => {
          const val = (e.target as HTMLInputElement).value;
          if (nameError && val.trim()) nameError = "";
        }}
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
          step="0.5"
          class:error={heightError}
          oninput={(e: Event) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            if (
              heightError &&
              !Number.isNaN(val) &&
              val >= MIN_DEVICE_HEIGHT &&
              val <= MAX_DEVICE_HEIGHT
            )
              heightError = "";
          }}
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
        rows="3"></textarea>
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

    <!-- Measured width (#3310) -->
    <div class="form-group">
      <label for="device-width">Width (optional)</label>
      <div class="width-input-wrapper">
        <input
          type="number"
          id="device-width"
          class="input-field"
          bind:value={widthValue}
          min="0"
          step="any"
          placeholder="e.g., 72"
          class:error={widthError}
          oninput={() => (widthError = "")}
        />
        <select
          id="device-width-unit"
          class="input-field"
          aria-label="Width unit"
          bind:value={widthUnit}
          onchange={() => (widthError = "")}
        >
          {#each WIDTH_UNITS as unit (unit)}
            <option value={unit}>{unit}</option>
          {/each}
        </select>
      </div>
      {#if widthError}
        <span class="error-message">{widthError}</span>
      {:else}
        <span class="helper-text"
          >For gear that sits on a shelf or carrier. Leave empty for rack-mount
          gear.</span
        >
      {/if}
    </div>

    <!-- Half-width toggle (#833) -->
    <div class="form-group">
      <Switch
        id="device-half-width"
        checked={isHalfWidth && !hasWidth}
        onchange={(checked) => (isHalfWidth = checked)}
        disabled={hasWidth}
        label="Half Width"
        helperText={hasWidth
          ? "Set by the measured width"
          : "Occupies left or right half of rack width"}
      />
    </div>

    <!-- Rack width selector (#970) -->
    <div class="form-group">
      <label for="device-rack-width">Rack Width</label>
      <select
        id="device-rack-width"
        class="input-field"
        bind:value={rackWidthOption}
      >
        {#each rackWidthOptions as option (option.value)}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
      <span class="helper-text">Which rack sizes this device fits</span>
    </div>

    <!-- Image uploads (v0.1.0) -->
    <div class="form-row form-row-symmetric">
      <ImageUpload
        face="front"
        currentImage={frontImage}
        deviceName={name}
        uHeight={height}
        rackWidth={cropRackWidth}
        guideRackWidths={cropGuideRackWidths}
        widthFraction={cropWidthFraction}
        widthLabel={cropWidthLabel}
        onupload={(data) => (frontImage = data)}
        onremove={() => (frontImage = undefined)}
      />
      <ImageUpload
        face="rear"
        currentImage={rearImage}
        deviceName={name}
        uHeight={height}
        rackWidth={cropRackWidth}
        guideRackWidths={cropGuideRackWidths}
        widthFraction={cropWidthFraction}
        widthLabel={cropWidthLabel}
        onupload={(data) => (rearImage = data)}
        onremove={() => (rearImage = undefined)}
      />
    </div>

    <div class="form-actions">
      <Button variant="secondary" onclick={handleCancel}>Cancel</Button>
      <Button
        type="submit"
        variant="primary"
        data-testid="btn-add-device"
        onclick={handleSubmit}
      >
        Add
      </Button>
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

  .width-input-wrapper {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: var(--space-2);
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
</style>
