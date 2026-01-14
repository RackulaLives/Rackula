<!--
  Layout Type Card Component
  Visual selection card for column vs bayed layout in the New Rack wizard.
  Uses SVG rack icons and displays type metadata.
-->
<script lang="ts">
  import { ColumnRackIcon, BayedRackIcon } from "$lib/components/icons";

  type LayoutType = "column" | "bayed";

  interface Props {
    /** The layout type this card represents */
    type: LayoutType;
    /** Whether this card is selected */
    selected?: boolean;
    /** Whether this card is disabled (e.g., insufficient capacity) */
    disabled?: boolean;
    /** Message to show when disabled */
    disabledMessage?: string;
    /** Click handler */
    onclick?: () => void;
  }

  let {
    type,
    selected = false,
    disabled = false,
    disabledMessage,
    onclick,
  }: Props = $props();

  const config = $derived(
    type === "column"
      ? {
          title: "Column",
          subtitle: "Single rack",
          description: "1-42U (custom up to 100U)",
        }
      : {
          title: "Bayed",
          subtitle: "2-3 racks side-by-side",
          description: "10-24U each",
        },
  );

  function handleClick() {
    if (!disabled) {
      onclick?.();
    }
  }
</script>

<button
  type="button"
  class="layout-card"
  class:selected
  class:disabled
  onclick={handleClick}
  aria-pressed={selected}
  aria-disabled={disabled}
>
  <div class="icon-container">
    {#if type === "column"}
      <ColumnRackIcon width={60} {selected} />
    {:else}
      <BayedRackIcon bays={2} width={70} {selected} />
    {/if}
  </div>

  <div class="card-text">
    <span class="card-title">{config.title}</span>
    <span class="card-subtitle">{config.subtitle}</span>
    <span class="card-description">{config.description}</span>
  </div>

  {#if disabled && disabledMessage}
    <span class="disabled-message">{disabledMessage}</span>
  {/if}
</button>

<style>
  .layout-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4);
    min-width: 140px;
    background: var(--colour-button-bg);
    border: 2px solid var(--colour-border);
    border-radius: var(--radius-lg, 8px);
    cursor: pointer;
    transition: all var(--transition-fast);
    text-align: center;
  }

  .layout-card:hover:not(.disabled) {
    background: var(--colour-button-hover);
    border-color: var(--colour-text-muted);
  }

  .layout-card:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring-glow);
  }

  .layout-card.selected {
    border-color: var(--colour-selection);
    background: color-mix(in srgb, var(--colour-selection) 10%, transparent);
  }

  .layout-card.selected:hover {
    background: color-mix(in srgb, var(--colour-selection) 15%, transparent);
  }

  .layout-card.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .icon-container {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 80px;
  }

  .card-text {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .card-title {
    font-weight: var(--font-weight-semibold, 600);
    font-size: var(--font-size-base);
    color: var(--colour-text);
  }

  .card-subtitle {
    font-size: var(--font-size-sm);
    color: var(--colour-text-muted);
  }

  .card-description {
    font-size: var(--font-size-xs, 0.75rem);
    color: var(--colour-text-muted);
    opacity: 0.8;
  }

  .disabled-message {
    font-size: var(--font-size-xs, 0.75rem);
    color: var(--colour-warning);
    margin-top: var(--space-1);
  }
</style>
