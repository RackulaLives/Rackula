<!--
  Switch Component
  Reusable toggle switch using bits-ui Switch primitive
  Consistent styling and accessibility across the application
-->
<script lang="ts">
  import { Switch } from "bits-ui";

  interface Props {
    /** Current checked state */
    checked?: boolean;
    /** Whether the switch is disabled */
    disabled?: boolean;
    /** ID for form labeling */
    id?: string;
    /** Label text to display next to switch */
    label?: string;
    /** Helper text displayed below the switch */
    helperText?: string;
    /** Accessible label when no visible label is provided */
    ariaLabel?: string;
    /** ID of element that describes this switch */
    ariaDescribedby?: string;
    /** Callback when checked state changes */
    onchange?: (checked: boolean) => void;
  }

  let {
    checked = $bindable(false),
    disabled = false,
    id: providedId,
    label,
    helperText,
    ariaLabel,
    ariaDescribedby,
    onchange,
  }: Props = $props();

  // Generate a stable fallback ID if none provided
  const fallbackId = `switch-${Math.random().toString(36).slice(2, 9)}`;
  const id = $derived(providedId || fallbackId);

  // Generate unique ID for helper text element
  const helperTextId = $derived(helperText ? `${id}-helper` : undefined);

  // Combine ariaDescribedby and helperTextId when helper text present
  const describedBy = $derived(
    [ariaDescribedby, helperTextId].filter(Boolean).join(" ") || undefined,
  );

  // Only use aria-label when no visible label is provided
  const computedAriaLabel = $derived(label ? undefined : ariaLabel);

  function handleCheckedChange(newChecked: boolean) {
    checked = newChecked;
    onchange?.(newChecked);
  }
</script>

<div class="switch-group">
  <div class="switch-row">
    <Switch.Root
      {id}
      {disabled}
      {checked}
      onCheckedChange={handleCheckedChange}
      class="switch-root"
      aria-label={computedAriaLabel}
      aria-describedby={describedBy}
    >
      <Switch.Thumb class="switch-thumb" />
    </Switch.Root>
    {#if label}
      <label for={id} class="switch-label" class:disabled>{label}</label>
    {/if}
  </div>
  {#if helperText}
    <span class="helper-text" id={helperTextId}>{helperText}</span>
  {/if}
</div>

<style>
  .switch-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .switch-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  /* Style bits-ui Switch.Root rendered element */
  .switch-group :global(.switch-root) {
    position: relative;
    width: 40px;
    height: 22px;
    background: var(--colour-surface-active);
    border-radius: var(--radius-full);
    border: none;
    padding: 0;
    cursor: pointer;
    flex-shrink: 0;
    transition: background var(--duration-fast) var(--ease-out);
  }

  .switch-group :global(.switch-root:focus-visible) {
    outline: 2px solid var(--colour-focus-ring);
    outline-offset: 2px;
  }

  .switch-group :global(.switch-root[data-disabled]) {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .switch-group :global(.switch-root[data-state="checked"]) {
    background: var(--colour-selection);
  }

  /* Style bits-ui Switch.Thumb rendered element */
  .switch-group :global(.switch-thumb) {
    display: block;
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    background: var(--colour-text-muted);
    border-radius: 50%;
    transition: all var(--duration-fast) var(--ease-out);
  }

  .switch-group :global(.switch-root[data-state="checked"] .switch-thumb) {
    transform: translateX(18px);
    background: var(--colour-text-inverse);
  }

  .switch-label {
    font-weight: var(--font-weight-medium);
    color: var(--colour-text);
    font-size: var(--font-size-base);
    cursor: pointer;
    user-select: none;
  }

  .switch-label.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .helper-text {
    font-size: var(--font-size-sm);
    color: var(--colour-text-muted);
    margin-left: calc(40px + var(--space-2));
  }
</style>
