<!--
  ColourPicker Component
  Inline colour picker with preset Dracula colours and custom hex input
-->
<script lang="ts">
  import ColourSwatch from "./ColourSwatch.svelte";
  import { ICON_SIZE } from "$lib/constants/sizing";
  import { COLOUR_PRESETS } from "$lib/constants/colourPresets";

  interface Props {
    /** Currently selected colour (hex format) */
    value: string;
    /** Default colour to show reset option */
    defaultValue?: string;
    /** Callback when colour is selected */
    onchange?: (colour: string) => void;
    /** Callback when reset to default is clicked */
    onreset?: () => void;
  }

  let { value, defaultValue, onchange, onreset }: Props = $props();

  // Muted device-fill palette for presets (#3005): raw bright Dracula accents
  // put white device labels under WCAG AA. Hex entry below still accepts the
  // brighter values for anyone who wants them.
  const presetColours = COLOUR_PRESETS;

  // Track pending (possibly invalid) input value - undefined means use prop value
  let pendingInput: string | undefined = $state(undefined);

  // Display value: use pending input if typing, otherwise prop value
  const displayValue = $derived(pendingInput ?? value);

  // Track if current value matches default (for showing reset button)
  const isDefault = $derived(
    defaultValue && value.toUpperCase() === defaultValue.toUpperCase(),
  );

  function selectColour(hex: string) {
    pendingInput = undefined; // Clear any pending input
    onchange?.(hex);
  }

  function handleCustomInput(event: Event) {
    const input = event.target as HTMLInputElement;
    const newValue = input.value;

    // Only emit if valid hex colour, otherwise store as pending
    if (/^#[0-9A-Fa-f]{6}$/.test(newValue)) {
      pendingInput = undefined;
      onchange?.(newValue);
    } else {
      pendingInput = newValue;
    }
  }

  function handleReset() {
    if (defaultValue) {
      pendingInput = undefined;
      onreset?.();
    }
  }
</script>

<div class="colour-picker">
  <!-- Preset colours grid -->
  <div class="presets-grid">
    {#each presetColours as preset (preset.hex)}
      <button
        type="button"
        class="preset-btn"
        class:selected={preset.hex.toUpperCase() === value.toUpperCase()}
        title={preset.name}
        onclick={() => selectColour(preset.hex)}
        aria-label="Select {preset.name} colour"
      >
        <ColourSwatch colour={preset.hex} size={ICON_SIZE.lg} />
      </button>
    {/each}
  </div>

  <!-- Custom hex input -->
  <div class="custom-input">
    <label for="custom-colour">Custom:</label>
    <input
      id="custom-colour"
      type="text"
      class="hex-input"
      value={displayValue}
      oninput={handleCustomInput}
      placeholder="#FF5555"
      maxlength="7"
      aria-label="Custom hex colour"
    />
    <ColourSwatch
      colour={/^#[0-9A-Fa-f]{6}$/.test(displayValue) ? displayValue : "#808080"}
      size={ICON_SIZE.md}
    />
  </div>

  <!-- Reset button (only shown if there's a default and current differs) -->
  {#if defaultValue && !isDefault}
    <button
      type="button"
      class="reset-btn"
      onclick={handleReset}
      aria-label="Reset to default colour"
    >
      Reset to default
    </button>
  {/if}
</div>

<style>
  .colour-picker {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-3);
    background: var(--colour-surface);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-md);
  }

  .presets-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: var(--space-2);
  }

  .preset-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-1);
    background: transparent;
    border: 2px solid transparent;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      border-color var(--duration-fast),
      transform var(--duration-fast);
  }

  .preset-btn:hover {
    border-color: var(--colour-border);
    transform: scale(1.1);
  }

  .preset-btn.selected {
    border-color: var(--colour-text);
  }

  .preset-btn:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: 2px;
  }

  .custom-input {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .custom-input label {
    font-size: var(--font-size-sm);
    color: var(--colour-text-muted);
    min-width: 60px;
  }

  .hex-input {
    flex: 1;
    padding: var(--space-1-5) var(--space-2);
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    background: var(--input-bg);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    color: var(--colour-text);
    text-transform: uppercase;
  }

  .hex-input:focus {
    outline: 2px solid var(--colour-selection);
    outline-offset: 1px;
  }

  .reset-btn {
    padding: var(--space-1-5) var(--space-3);
    font-size: var(--font-size-sm);
    background: transparent;
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    color: var(--colour-text-muted);
    cursor: pointer;
    transition: background-color var(--duration-fast);
  }

  .reset-btn:hover {
    background: var(--colour-surface-hover);
    color: var(--colour-text);
  }

  .reset-btn:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: 2px;
  }
</style>
