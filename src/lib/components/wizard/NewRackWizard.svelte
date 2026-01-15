<!--
  New Rack Wizard Component
  3-step wizard for creating column (single) or bayed (grouped) racks.

  Step 1: Rack Details - Name and layout type (column vs bayed) selection
  Step 2: Width - Selectable for column, locked to 19" for bayed
  Step 3: Dimensions - Height (column) or bay count + height (bayed)
-->
<script lang="ts">
  import Dialog from "$lib/components/Dialog.svelte";
  import LayoutTypeCard from "./LayoutTypeCard.svelte";
  import {
    COMMON_RACK_HEIGHTS,
    MIN_RACK_HEIGHT,
    MAX_RACK_HEIGHT,
    STANDARD_RACK_WIDTH,
    ALLOWED_RACK_WIDTHS,
    MAX_RACKS,
  } from "$lib/types/constants";

  // Height options for 10" racks (smaller form factor)
  const SMALL_RACK_HEIGHTS = [4, 6, 8, 12];

  // Bayed rack constraints
  const BAYED_MIN_HEIGHT = 10;
  const BAYED_MAX_HEIGHT = 24;
  const BAYED_DEFAULT_HEIGHT = 12;

  type LayoutType = "column" | "bayed";
  type BayCount = 2 | 3;

  interface WizardConfig {
    name: string;
    width: 10 | 19 | 23;
    layoutType: LayoutType;
    height: number;
    bayCount: BayCount;
    isCustomHeight: boolean;
    customHeight: number;
  }

  interface Props {
    /** Whether the wizard dialog is open */
    open: boolean;
    /** Current number of racks in layout (for capacity check) */
    rackCount?: number;
    /** Callback when rack(s) are created */
    oncreate?: (data: CreateRackData) => void;
    /** Callback when wizard is cancelled */
    oncancel?: () => void;
  }

  /** Data passed back on creation */
  export interface CreateRackData {
    /** Rack name (or group name for bayed) */
    name: string;
    /** Rack height in U */
    height: number;
    /** Rack width in inches */
    width: 10 | 19 | 23;
    /** Layout type selected */
    layoutType: LayoutType;
    /** Number of bays (only for bayed layout) */
    bayCount?: BayCount;
  }

  let { open, rackCount = 0, oncreate, oncancel }: Props = $props();

  // Wizard state
  let currentStep = $state(1);
  let config = $state<WizardConfig>({
    name: "",
    width: STANDARD_RACK_WIDTH as 10 | 19 | 23,
    layoutType: "column",
    height: 42,
    bayCount: 2,
    isCustomHeight: false,
    customHeight: 42,
  });

  // Validation errors
  let nameError = $state("");
  let heightError = $state("");

  // Capacity check for bayed option
  const remainingCapacity = $derived(MAX_RACKS - rackCount);
  const canCreateBayed = $derived(remainingCapacity >= 2);
  const bayedDisabledMessage = $derived(
    !canCreateBayed
      ? `Requires 2-3 rack slots (${remainingCapacity} remaining)`
      : undefined,
  );

  // Available heights based on rack width and layout type
  const availableHeights = $derived.by(() => {
    if (config.layoutType === "bayed") {
      // Bayed racks have fixed range
      const heights: number[] = [];
      for (let h = BAYED_MIN_HEIGHT; h <= BAYED_MAX_HEIGHT; h += 2) {
        heights.push(h);
      }
      return heights;
    }
    // Column racks use standard heights
    return config.width === 10 ? SMALL_RACK_HEIGHTS : COMMON_RACK_HEIGHTS;
  });

  // Max bay count based on remaining capacity (clamped to valid range 2-3)
  const maxBayCount = $derived(
    Math.max(2, Math.min(3, remainingCapacity)) as 2 | 3,
  );

  // Can proceed to next step?
  const canProceed = $derived.by(() => {
    switch (currentStep) {
      case 1:
        // Step 1: Name must be filled and layout type selected
        return config.name.trim().length > 0 && config.layoutType !== undefined;
      case 2:
        // Step 2: Width - always valid (bayed is locked, column has default)
        return true;
      case 3: {
        // Step 3: Height must be in valid range
        const height = config.isCustomHeight
          ? config.customHeight
          : config.height;
        return height >= MIN_RACK_HEIGHT && height <= MAX_RACK_HEIGHT;
      }
      default:
        return false;
    }
  });

  // Reset form when dialog opens
  $effect(() => {
    if (open) {
      currentStep = 1;
      config = {
        name: "Racky McRackface",
        width: STANDARD_RACK_WIDTH as 10 | 19 | 23,
        layoutType: "column",
        height: 42,
        bayCount: 2,
        isCustomHeight: false,
        customHeight: 42,
      };
      nameError = "";
      heightError = "";
    }
  });

  // Reset height and width when layout type changes
  $effect(() => {
    if (config.layoutType === "bayed") {
      config.height = BAYED_DEFAULT_HEIGHT;
      config.isCustomHeight = false;
      // Bayed racks are always 19" standard width
      config.width = 19;
    } else {
      config.height = 42;
    }
  });

  // Reset height when width changes (for column only)
  $effect(() => {
    if (config.layoutType === "column") {
      const heights =
        config.width === 10 ? SMALL_RACK_HEIGHTS : COMMON_RACK_HEIGHTS;
      if (!config.isCustomHeight && !heights.includes(config.height)) {
        config.height = heights[heights.length - 1]!;
      }
    }
  });

  function getCurrentHeight(): number {
    return config.isCustomHeight ? config.customHeight : config.height;
  }

  function validateStep(): boolean {
    nameError = "";
    heightError = "";

    switch (currentStep) {
      case 1:
        if (!config.name.trim()) {
          nameError = "Name is required";
          return false;
        }
        return true;

      case 3: {
        const height = getCurrentHeight();
        if (config.layoutType === "column") {
          if (height < MIN_RACK_HEIGHT || height > MAX_RACK_HEIGHT) {
            heightError = `Height must be between ${MIN_RACK_HEIGHT} and ${MAX_RACK_HEIGHT}U`;
            return false;
          }
        } else {
          if (height < BAYED_MIN_HEIGHT || height > BAYED_MAX_HEIGHT) {
            heightError = `Bayed rack height must be between ${BAYED_MIN_HEIGHT} and ${BAYED_MAX_HEIGHT}U`;
            return false;
          }
        }
        return true;
      }

      default:
        return true;
    }
  }

  function nextStep() {
    if (!validateStep()) return;

    if (currentStep < 3) {
      currentStep++;
    } else {
      handleCreate();
    }
  }

  function prevStep() {
    if (currentStep > 1) {
      currentStep--;
    }
  }

  function selectLayoutType(type: LayoutType) {
    if (type === "bayed" && !canCreateBayed) return;
    config.layoutType = type;
  }

  function selectPresetHeight(height: number) {
    config.isCustomHeight = false;
    config.height = height;
    heightError = "";
  }

  function selectCustomHeight() {
    config.isCustomHeight = true;
    config.customHeight = config.height;
    heightError = "";
  }

  function handleCreate() {
    if (!validateStep()) return;

    oncreate?.({
      name: config.name.trim(),
      height: getCurrentHeight(),
      width: config.width,
      layoutType: config.layoutType,
      bayCount: config.layoutType === "bayed" ? config.bayCount : undefined,
    });
  }

  function handleCancel() {
    oncancel?.();
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter" && canProceed) {
      event.preventDefault();
      nextStep();
    }
  }
</script>

<Dialog
  {open}
  title="New Rack"
  width="var(--dialog-width-lg, 520px)"
  showClose={false}
  onclose={oncancel}
>
  {#snippet headerActions()}
    <div
      class="step-indicator"
      role="progressbar"
      aria-valuenow={currentStep}
      aria-valuemin={1}
      aria-valuemax={3}
    >
      <span class="step-text">Step {currentStep} of 3</span>
    </div>
  {/snippet}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <form
    class="wizard-form"
    onsubmit={(e) => e.preventDefault()}
    onkeydown={handleKeyDown}
  >
    <!-- Step 1: Name and Layout Type -->
    {#if currentStep === 1}
      <div class="step-content">
        <div class="form-group">
          <label for="rack-name">Rack Name</label>
          <input
            type="text"
            id="rack-name"
            class="input-field"
            bind:value={config.name}
            placeholder="e.g., Main Server Rack"
            class:error={nameError}
          />
          {#if nameError}
            <span class="error-message">{nameError}</span>
          {/if}
        </div>

        <div class="form-group">
          <span class="form-label">Layout Type</span>
          <div class="layout-cards">
            <LayoutTypeCard
              type="column"
              selected={config.layoutType === "column"}
              onclick={() => selectLayoutType("column")}
            />
            <LayoutTypeCard
              type="bayed"
              selected={config.layoutType === "bayed"}
              disabled={!canCreateBayed}
              disabledMessage={bayedDisabledMessage}
              onclick={() => selectLayoutType("bayed")}
            />
          </div>
        </div>
      </div>
    {/if}

    <!-- Step 2: Rack Width -->
    {#if currentStep === 2}
      <div class="step-content">
        <div class="form-group">
          <span class="form-label">Rack Width</span>
          {#if config.layoutType === "bayed"}
            <div class="width-locked">
              <span class="width-value">19"</span>
              <span class="width-note">Standard width for bayed racks</span>
            </div>
          {:else}
            <div class="width-options" role="group" aria-label="Rack width">
              {#each ALLOWED_RACK_WIDTHS as width (width)}
                <label class="width-option">
                  <input
                    type="radio"
                    name="rack-width"
                    value={width}
                    checked={config.width === width}
                    onchange={() => (config.width = width)}
                  />
                  <span class="width-label">{width}"</span>
                </label>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Step 3: Dimensions -->
    {#if currentStep === 3}
      <div class="step-content">
        <!-- Bay count (bayed only) -->
        {#if config.layoutType === "bayed"}
          <div class="form-group">
            <span class="form-label">Number of Bays</span>
            <div class="bay-buttons" role="group" aria-label="Number of bays">
              <button
                type="button"
                class="bay-btn"
                class:selected={config.bayCount === 2}
                onclick={() => (config.bayCount = 2)}
              >
                2 Bays
              </button>
              {#if maxBayCount >= 3}
                <button
                  type="button"
                  class="bay-btn"
                  class:selected={config.bayCount === 3}
                  onclick={() => (config.bayCount = 3)}
                >
                  3 Bays
                </button>
              {/if}
            </div>
          </div>
        {/if}

        <!-- Height selection -->
        <div class="form-group">
          <span class="form-label">
            {config.layoutType === "bayed" ? "Height (per bay)" : "Height"}
          </span>
          <div class="height-buttons" role="group" aria-label="Rack height">
            {#each availableHeights as height (height)}
              <button
                type="button"
                class="height-btn"
                class:selected={!config.isCustomHeight &&
                  config.height === height}
                onclick={() => selectPresetHeight(height)}
              >
                {height}U
              </button>
            {/each}
            {#if config.layoutType === "column"}
              <button
                type="button"
                class="height-btn"
                class:selected={config.isCustomHeight}
                onclick={selectCustomHeight}
              >
                Custom
              </button>
            {/if}
          </div>

          {#if config.isCustomHeight && config.layoutType === "column"}
            <div class="custom-height-input">
              <label for="custom-height" class="sr-only">Custom Height</label>
              <input
                type="number"
                id="custom-height"
                class="input-field"
                aria-label="Custom height"
                bind:value={config.customHeight}
                min={MIN_RACK_HEIGHT}
                max={MAX_RACK_HEIGHT}
                class:error={heightError}
              />
              <span class="unit">U</span>
            </div>
          {/if}

          {#if heightError}
            <span class="error-message">{heightError}</span>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Navigation buttons -->
    <div class="form-actions">
      {#if currentStep > 1}
        <button type="button" class="btn btn-secondary" onclick={prevStep}>
          Back
        </button>
      {/if}
      <button type="button" class="btn btn-secondary" onclick={handleCancel}>
        Cancel
      </button>
      <button
        type="button"
        class="btn btn-primary"
        onclick={nextStep}
        disabled={!canProceed}
      >
        {#if currentStep === 3}
          {config.layoutType === "bayed" ? "Create Bayed Group" : "Create Rack"}
        {:else}
          Next
        {/if}
      </button>
    </div>
  </form>
</Dialog>

<style>
  .wizard-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .step-indicator {
    display: flex;
  }

  .step-text {
    font-size: var(--font-size-sm);
    color: var(--colour-text-muted);
  }

  /* Locked width display for bayed racks */
  .width-locked {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .width-value {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-medium);
    color: var(--colour-text);
  }

  .width-note {
    font-size: var(--font-size-sm);
    color: var(--colour-text-muted);
  }

  .step-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    min-height: 180px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .form-group label,
  .form-group .form-label {
    font-weight: var(--font-weight-medium);
    color: var(--colour-text);
  }

  .form-group input[type="text"],
  .form-group input[type="number"] {
    padding: var(--space-2) var(--space-3);
    background: var(--colour-input-bg, var(--colour-bg));
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-md);
    color: var(--colour-text);
    font-size: var(--font-size-base);
  }

  .form-group input:focus {
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

  /* Width options */
  .width-options {
    display: flex;
    gap: var(--space-4);
  }

  .width-option {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    cursor: pointer;
  }

  .width-option input[type="radio"] {
    width: 18px;
    height: 18px;
    accent-color: var(--colour-selection);
    cursor: pointer;
  }

  .width-label {
    font-size: var(--font-size-base);
    color: var(--colour-text);
  }

  /* Layout cards */
  .layout-cards {
    display: flex;
    gap: var(--space-4);
    justify-content: center;
  }

  /* Bay buttons */
  .bay-buttons {
    display: flex;
    gap: var(--space-2);
  }

  .bay-btn {
    padding: var(--space-2) var(--space-4);
    background: var(--colour-button-bg);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-md);
    color: var(--colour-text);
    font-size: var(--font-size-base);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .bay-btn:hover {
    background: var(--colour-button-hover);
  }

  .bay-btn.selected {
    background: var(--colour-selection);
    border-color: var(--colour-selection);
    color: var(--colour-text-on-primary);
  }

  /* Height buttons */
  .height-buttons {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .height-btn {
    padding: var(--space-2) var(--space-4);
    background: var(--colour-button-bg);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-md);
    color: var(--colour-text);
    font-size: var(--font-size-base);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .height-btn:hover {
    background: var(--colour-button-hover);
  }

  .height-btn.selected {
    background: var(--colour-selection);
    border-color: var(--colour-selection);
    color: var(--colour-text-on-primary);
  }

  /* Custom height input */
  .custom-height-input {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  .custom-height-input input {
    width: var(--input-width-custom, 100px);
    padding: var(--space-2) var(--space-3);
    background: var(--colour-input-bg, var(--colour-bg));
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-md);
    color: var(--colour-text);
    font-size: var(--font-size-base);
  }

  .custom-height-input .unit {
    color: var(--colour-text-muted);
    font-size: var(--font-size-base);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  /* Form actions */
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

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: var(--colour-button-bg);
    color: var(--colour-text);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--colour-button-hover);
  }

  .btn-primary {
    background: var(--colour-button-primary);
    color: var(--colour-text-on-primary);
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--colour-button-primary-hover);
  }
</style>
