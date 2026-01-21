<!--
  Checkbox Component
  Reusable checkbox using bits-ui Checkbox primitive
  Consistent styling and accessibility across the application
-->
<script lang="ts">
  import { Checkbox } from "bits-ui";
  import { IconSquare, IconSquareFilled } from "./icons";

  interface Props {
    /** Current checked state */
    checked?: boolean;
    /** Whether the checkbox is disabled */
    disabled?: boolean;
    /** ID for form labeling */
    id?: string;
    /** Label text to display next to checkbox */
    label?: string;
    /** Callback when checked state changes */
    onchange?: (checked: boolean) => void;
  }

  let {
    checked = $bindable(false),
    disabled = false,
    id: providedId,
    label,
    onchange,
  }: Props = $props();

  // Generate a stable fallback ID if none provided
  const fallbackId = `checkbox-${Math.random().toString(36).slice(2, 9)}`;
  const id = $derived(providedId || fallbackId);

  function handleCheckedChange(newChecked: boolean | "indeterminate") {
    if (newChecked !== "indeterminate") {
      checked = newChecked;
      onchange?.(newChecked);
    }
  }
</script>

<div class="checkbox-wrapper">
  <Checkbox.Root
    {id}
    {disabled}
    {checked}
    onCheckedChange={handleCheckedChange}
  >
    {#snippet children({ checked: isChecked })}
      <span class="checkbox-indicator">
        {#if isChecked}
          <IconSquareFilled size={16} />
        {:else}
          <IconSquare size={16} />
        {/if}
      </span>
    {/snippet}
  </Checkbox.Root>
  {#if label}
    <label for={id} class="checkbox-label" class:disabled>{label}</label>
  {/if}
</div>

<style>
  .checkbox-wrapper {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  /* Style bits-ui Checkbox.Root rendered element */
  .checkbox-wrapper :global(button) {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--colour-text);
    transition: color var(--duration-fast) var(--ease-out);
  }

  .checkbox-wrapper :global(button:hover:not([data-disabled])) {
    color: var(--colour-selection);
  }

  .checkbox-wrapper :global(button:focus-visible) {
    outline: 2px solid var(--colour-focus-ring);
    outline-offset: 2px;
    border-radius: var(--radius-sm);
  }

  .checkbox-wrapper :global(button[data-disabled]) {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .checkbox-wrapper :global(button[data-state="checked"]) {
    color: var(--colour-selection);
  }

  .checkbox-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .checkbox-label {
    font-size: var(--font-size-base);
    color: var(--colour-text);
    cursor: pointer;
    user-select: none;
  }

  .checkbox-label.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
