<!--
  SegmentedControl Component
  A group of connected buttons for selecting between options
-->
<script lang="ts" generics="T extends string">
  interface Option {
    value: T;
    label: string;
  }

  type ControlSize = "default" | "small";

  interface Props {
    /** Available options to select from */
    options: Option[];
    /** Currently selected value */
    value: T;
    /** Callback when selection changes */
    onchange?: (value: T) => void;
    /** Accessible label for the control group */
    ariaLabel?: string;
    /** Size variant */
    size?: ControlSize;
  }

  let {
    options,
    value,
    onchange,
    ariaLabel,
    size = "default",
  }: Props = $props();

  function handleClick(optionValue: T) {
    onchange?.(optionValue);
  }
</script>

<div
  class="segmented-control"
  class:small={size === "small"}
  role="group"
  aria-label={ariaLabel}
>
  {#each options as option, i (option.value)}
    <button
      type="button"
      class="segment"
      class:selected={option.value === value}
      class:first={i === 0}
      class:last={i === options.length - 1}
      aria-pressed={option.value === value}
      onclick={() => handleClick(option.value)}
    >
      {option.label}
    </button>
  {/each}
</div>

<style>
  .segmented-control {
    display: flex;
    gap: 0;
    width: 100%;
  }

  /* Small variant: auto width, doesn't stretch */
  .segmented-control.small {
    width: auto;
  }

  .segmented-control.small .segment {
    flex: 0 0 auto;
    padding: var(--space-1) var(--space-2);
    min-width: 28px;
  }

  .segment {
    flex: 1;
    padding: var(--space-1) var(--space-2);
    font-size: var(--font-size-xs);
    font-family: inherit;
    background: transparent;
    border: 1px solid var(--colour-border);
    color: var(--colour-text-muted);
    cursor: pointer;
    transition:
      background-color var(--duration-fast),
      color var(--duration-fast);
    /* Remove gap between buttons by collapsing borders */
    margin-left: -1px;
    /* Ensure clickable in all browsers */
    position: relative;
  }

  .segment.first {
    border-radius: var(--radius-sm) 0 0 var(--radius-sm);
  }

  .segment.last {
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  }

  .segment:not(.first):not(.last) {
    border-radius: 0;
  }

  .segment:hover:not(.selected) {
    background: var(--colour-surface-hover);
    color: var(--colour-text);
  }

  .segment.selected {
    background: color-mix(in srgb, var(--colour-selection) 20%, transparent);
    border-color: var(--colour-selection);
    color: var(--colour-text);
    position: relative;
    z-index: 1;
  }

  .segment:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: 2px;
    z-index: 2;
  }
</style>
