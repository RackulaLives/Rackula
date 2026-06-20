<!--
  DeviceFilterPopover Component
  Filter button with an active-count badge that opens a popover holding
  height buckets, half/full-width toggles, "Has image", and "Custom only".
  Binds to a DeviceAttributeFilters state owned by the parent palette.
-->
<script lang="ts">
  import { Popover } from "$lib/components/ui/Popover";
  import Checkbox from "./Checkbox.svelte";
  import { IconFilter } from "./icons";
  import { ICON_SIZE } from "$lib/constants/sizing";
  import type {
    DeviceAttributeFilters,
    HeightBucket,
  } from "$lib/utils/deviceFilters";

  interface Props {
    /** Active attribute filters, owned by the parent palette. */
    filters: DeviceAttributeFilters;
  }

  let { filters = $bindable() }: Props = $props();

  const heightOptions: { value: HeightBucket; label: string }[] = [
    { value: "0.5", label: "1/2U" },
    { value: "1", label: "1U" },
    { value: "2", label: "2U" },
    { value: "3", label: "3U" },
    { value: "4plus", label: "4U+" },
  ];

  // Count of active filter groups: heights, width, has-image, custom-only.
  // Width counts only when exactly one of half/full is set (both or neither
  // is a no-op in the predicate), matching the active-filter semantics.
  const activeFilterCount = $derived(
    (filters.heights.size > 0 ? 1 : 0) +
      (filters.halfWidth !== filters.fullWidth ? 1 : 0) +
      (filters.hasImage ? 1 : 0) +
      (filters.customOnly ? 1 : 0),
  );

  const hasActiveFilters = $derived(activeFilterCount > 0);

  function toggleHeight(bucket: HeightBucket) {
    if (filters.heights.has(bucket)) {
      filters.heights.delete(bucket);
    } else {
      filters.heights.add(bucket);
    }
  }

  function clearFilters() {
    filters.heights.clear();
    filters.halfWidth = false;
    filters.fullWidth = false;
    filters.hasImage = false;
    filters.customOnly = false;
  }
</script>

<Popover.Root>
  <Popover.Trigger
    class="filter-trigger"
    aria-label={hasActiveFilters
      ? `Filter devices (${activeFilterCount} active)`
      : "Filter devices"}
    data-testid="btn-device-filter"
  >
    <IconFilter size={ICON_SIZE.sm} />
    {#if hasActiveFilters}
      <span class="filter-badge" aria-hidden="true">{activeFilterCount}</span>
    {/if}
  </Popover.Trigger>
  <Popover.Portal>
    <Popover.Content
      class="filter-content"
      side="bottom"
      align="end"
      sideOffset={8}
    >
      <div class="filter-panel">
        <fieldset class="filter-group">
          <legend class="filter-legend">Height</legend>
          <div class="chip-group" role="group" aria-label="Height">
            {#each heightOptions as option (option.value)}
              <button
                type="button"
                class="chip"
                class:selected={filters.heights.has(option.value)}
                aria-pressed={filters.heights.has(option.value)}
                onclick={() => toggleHeight(option.value)}
              >
                {option.label}
              </button>
            {/each}
          </div>
        </fieldset>

        <fieldset class="filter-group">
          <legend class="filter-legend">Width</legend>
          <div class="chip-group" role="group" aria-label="Width">
            <button
              type="button"
              class="chip"
              class:selected={filters.halfWidth}
              aria-pressed={filters.halfWidth}
              onclick={() => (filters.halfWidth = !filters.halfWidth)}
            >
              Half
            </button>
            <button
              type="button"
              class="chip"
              class:selected={filters.fullWidth}
              aria-pressed={filters.fullWidth}
              onclick={() => (filters.fullWidth = !filters.fullWidth)}
            >
              Full
            </button>
          </div>
        </fieldset>

        <div class="filter-toggles">
          <Checkbox
            label="Has image"
            checked={filters.hasImage}
            onchange={(checked) => (filters.hasImage = checked === true)}
            data-testid="filter-has-image"
          />
          <Checkbox
            label="Custom only"
            checked={filters.customOnly}
            onchange={(checked) => (filters.customOnly = checked === true)}
            data-testid="filter-custom-only"
          />
        </div>

        <button
          type="button"
          class="clear-filters"
          disabled={!hasActiveFilters}
          onclick={clearFilters}
          data-testid="btn-clear-filters"
        >
          Clear filters
        </button>
      </div>
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>

<style>
  /* Neutral form-control vocabulary shared with the edit panel's colour swatch
     and the palette create button (#2524): input-bg fill, input-border,
     selection border on hover and focus. 44px square keeps the touch standard
     (#2397). */
  :global(.filter-trigger) {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    padding: 0;
    color: var(--colour-text-muted);
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    flex-shrink: 0;
    transition:
      background-color var(--duration-fast) ease,
      color var(--duration-fast) ease,
      border-color var(--duration-fast) ease;
  }

  :global(.filter-trigger:hover) {
    color: var(--colour-text);
    border-color: var(--colour-selection);
  }

  :global(.filter-trigger:focus-visible) {
    outline: 2px solid var(--colour-selection);
    outline-offset: 2px;
  }

  :global(.filter-trigger[data-state="open"]) {
    color: var(--colour-text);
    background: var(--colour-surface-active);
    border-color: var(--colour-selection);
  }

  .filter-badge {
    position: absolute;
    top: 2px;
    right: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    font-size: var(--font-size-xs);
    font-weight: 600;
    line-height: 1;
    color: var(--colour-bg);
    background: var(--colour-selection);
    border-radius: var(--radius-full);
  }

  :global(.filter-content) {
    /* Portalled to body, so it must clear the mobile drawer (--z-drawer: 100);
       --z-dropdown matches the app's other floating menus. */
    z-index: var(--z-dropdown);
    /* Fits the 320px mobile drawer: 320 minus padding either side. */
    width: min(280px, calc(100vw - 2 * var(--space-4)));
    padding: var(--space-3);
    background: var(--colour-surface);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
  }

  .filter-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .filter-group {
    margin: 0;
    padding: 0;
    border: none;
  }

  .filter-legend {
    padding: 0;
    margin-bottom: var(--space-2);
    font-size: var(--font-size-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--colour-text-muted);
  }

  .chip-group {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .chip {
    padding: var(--space-1) var(--space-3);
    font-size: var(--font-size-sm);
    font-family: inherit;
    color: var(--colour-text-muted);
    background: transparent;
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-full);
    cursor: pointer;
    transition:
      background-color var(--duration-fast) ease,
      color var(--duration-fast) ease,
      border-color var(--duration-fast) ease;
  }

  .chip:hover:not(.selected) {
    color: var(--colour-text);
    background: var(--colour-surface-hover);
  }

  .chip.selected {
    color: var(--colour-text);
    background: color-mix(in srgb, var(--colour-selection) 20%, transparent);
    border-color: var(--colour-selection);
  }

  .chip:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: 2px;
  }

  .filter-toggles {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .clear-filters {
    padding: var(--space-2);
    font-size: var(--font-size-sm);
    font-family: inherit;
    color: var(--colour-text);
    background: var(--colour-surface-secondary);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      background-color var(--duration-fast) ease,
      border-color var(--duration-fast) ease;
  }

  .clear-filters:hover:not(:disabled) {
    background: var(--colour-surface-hover);
    border-color: var(--colour-border-hover);
  }

  .clear-filters:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: 2px;
  }

  .clear-filters:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
