<!--
  New Rack Wizard Component
  Multi-step wizard for creating column (single) or bayed (grouped) racks.

  Column racks (2 steps):
    Step 1: Rack Details - Name and layout type selection
    Step 2: Size - Width (vertical list with descriptions) and Height on same view

  Bayed racks (3 steps):
    Step 1: Rack Details - Name and layout type selection
    Step 2: Width - Locked to 19" standard
    Step 3: Dimensions - Bay count and height
-->
<script lang="ts">
  import Dialog from "$lib/components/Dialog.svelte";
  import LayoutTypeCard from "./LayoutTypeCard.svelte";
  import {
    COMMON_RACK_HEIGHTS,
    MIN_RACK_HEIGHT,
    MAX_RACK_HEIGHT,
    STANDARD_RACK_WIDTH,
    MAX_RACKS,
  } from "$lib/types/constants";

  // Height options for 10" racks (smaller form factor)
  const SMALL_RACK_HEIGHTS = [4, 6, 8, 12];

  // Width options with descriptive labels for vertical list display
  const WIDTH_OPTIONS = [
    {
      value: 10 as const,
      label: "Half-Width",
      size: '10"',
      description: "Compact racks for small setups",
    },
    {
      value: 19 as const,
      label: "Standard",
      size: '19"',
      description: "Industry standard, universal compatibility",
    },
    {
      value: 21 as const,
      label: "Broadcast",
      size: '21"',
      description: "Audio/video production equipment",
    },
    {
      value: 23 as const,
      label: "Telecom",
      size: '23"',
      description: "Telecommunications equipment",
    },
  ] as const;

  // Bayed rack constraints
  const BAYED_MIN_HEIGHT = 10;
  const BAYED_MAX_HEIGHT = 24;
  const BAYED_DEFAULT_HEIGHT = 12;

  type LayoutType = "column" | "bayed";
  type BayCount = 2 | 3;

  interface WizardConfig {
    name: string;
    width: 10 | 19 | 21 | 23;
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
    width: 10 | 19 | 21 | 23;
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

  // Total steps depends on layout type: column = 2, bayed = 3
  const totalSteps = $derived(config.layoutType === "column" ? 2 : 3);

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
    // Column racks use standard heights (10" gets small heights, others get common)
    return config.width === 10 ? SMALL_RACK_HEIGHTS : COMMON_RACK_HEIGHTS;
  });

  // Max bay count based on remaining capacity (clamped to valid range 2-3)
  const maxBayCount = $derived(
    Math.max(2, Math.min(3, remainingCapacity)) as 2 | 3,
  );

  // Can proceed to next step (or create)?
  const canProceed = $derived.by(() => {
    switch (currentStep) {
      case 1:
        // Step 1: Name must be filled and layout type selected
        return config.name.trim().length > 0 && config.layoutType !== undefined;
      case 2: {
        if (config.layoutType === "column") {
          // Column Step 2: Width + Height combined - validate height
          const height = config.isCustomHeight
            ? config.customHeight
            : config.height;
          return height >= MIN_RACK_HEIGHT && height <= MAX_RACK_HEIGHT;
        }
        // Bayed Step 2: Width - always valid (locked to 19")
        return true;
      }
      case 3: {
        // Bayed Step 3: Height must be in valid range
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

  // Reset height, width, and name when layout type changes
  $effect(() => {
    if (config.layoutType === "bayed") {
      config.height = BAYED_DEFAULT_HEIGHT;
      config.isCustomHeight = false;
      // Bayed racks are always 19" standard width
      config.width = 19;
      // Use fun default name for bayed racks
      config.name = "Bayoncé";
    } else {
      config.height = 42;
      // Use fun default name for column racks
      config.name = "Racky McRackface";
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

      case 2: {
        // Column: Step 2 has both width and height
        if (config.layoutType === "column") {
          const height = getCurrentHeight();
          if (height < MIN_RACK_HEIGHT || height > MAX_RACK_HEIGHT) {
            heightError = `Height must be between ${MIN_RACK_HEIGHT} and ${MAX_RACK_HEIGHT}U`;
            return false;
          }
        }
        // Bayed: Step 2 is just width (locked), always valid
        return true;
      }

      case 3: {
        // Bayed: Step 3 has height
        const height = getCurrentHeight();
        if (height < BAYED_MIN_HEIGHT || height > BAYED_MAX_HEIGHT) {
          heightError = `Bayed rack height must be between ${BAYED_MIN_HEIGHT} and ${BAYED_MAX_HEIGHT}U`;
          return false;
        }
        return true;
      }

      default:
        return true;
    }
  }

  function nextStep() {
    if (!validateStep()) return;

    if (currentStep < totalSteps) {
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
      aria-valuemax={totalSteps}
    >
      <span class="step-text">Step {currentStep} of {totalSteps}</span>
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
            maxlength="50"
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

    <!-- Step 2: Width (bayed) or Width+Height combined (column) -->
    {#if currentStep === 2}
      <div class="step-content">
        {#if config.layoutType === "bayed"}
          <!-- Bayed: Just show locked width -->
          <div class="form-group">
            <span class="form-label">Rack Width</span>
            <div class="width-locked">
              <span class="width-value">19"</span>
              <span class="width-note">Standard width for bayed racks</span>
            </div>
          </div>
        {:else}
          <!-- Column: Width (vertical list) + Height (with animation) -->
          <div class="form-group">
            <span class="form-label">Rack Width</span>
            <div
              class="width-options-vertical"
              role="radiogroup"
              aria-label="Rack width"
            >
              {#each WIDTH_OPTIONS as option (option.value)}
                <label
                  class="width-card"
                  class:selected={config.width === option.value}
                >
                  <input
                    type="radio"
                    name="rack-width"
                    value={option.value}
                    checked={config.width === option.value}
                    onchange={() => (config.width = option.value)}
                  />
                  <div class="width-card-content">
                    <div class="width-card-header">
                      <span class="width-card-label">{option.label}</span>
                      <span class="width-card-size">{option.size}</span>
                    </div>
                    <span class="width-card-description"
                      >{option.description}</span
                    >
                  </div>
                </label>
              {/each}
            </div>
          </div>

          <!-- Height section with fade+slide animation -->
          <div class="form-group height-section">
            <span class="form-label">Height</span>
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
              <button
                type="button"
                class="height-btn"
                class:selected={config.isCustomHeight}
                onclick={selectCustomHeight}
              >
                Custom
              </button>
            </div>

            {#if config.isCustomHeight}
              <div class="custom-height-input">
                <label for="custom-height" class="sr-only">Custom Height</label>
                <input
                  type="number"
                  id="custom-height"
                  class="input-field"
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
        {/if}
      </div>
    {/if}

    <!-- Step 3: Bayed rack dimensions (bay count + height) -->
    {#if currentStep === 3 && config.layoutType === "bayed"}
      <div class="step-content">
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

        <div class="form-group">
          <span class="form-label">Height (per bay)</span>
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
          </div>

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
        {#if currentStep === totalSteps}
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

  /* Width options (vertical card list) */
  .width-options-vertical {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .width-card {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3);
    background: var(--colour-button-bg);
    border: 2px solid var(--colour-border);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .width-card:hover {
    background: var(--colour-button-hover);
    border-color: var(--colour-border-hover, var(--colour-border));
  }

  .width-card.selected {
    background: color-mix(in srgb, var(--colour-selection) 15%, transparent);
    border-color: var(--colour-selection);
  }

  .width-card input[type="radio"] {
    width: 18px;
    height: 18px;
    accent-color: var(--colour-selection);
    cursor: pointer;
    flex-shrink: 0;
  }

  .width-card-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .width-card-header {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
  }

  .width-card-label {
    font-weight: var(--font-weight-medium);
    color: var(--colour-text);
    font-size: var(--font-size-base);
  }

  .width-card-size {
    font-size: var(--font-size-sm);
    color: var(--colour-text-muted);
  }

  .width-card-description {
    font-size: var(--font-size-sm);
    color: var(--colour-text-muted);
  }

  /* Height section with fade+slide animation */
  .height-section {
    animation: fadeSlideIn 0.3s ease-out;
  }

  @keyframes fadeSlideIn {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
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
