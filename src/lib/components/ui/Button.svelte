<!--
  Button Component
  Shared dialog CTA button routed through the dedicated button colour tokens
  (--colour-button-primary / --colour-button-destructive / --colour-button-bg),
  replacing the local .btn-* declarations each dialog component used to carry
  on its own, several of them painting CTAs with raw bright
  --colour-selection / --colour-error tokens instead of the muted dedicated
  ones (#3008).
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    /** Visual style. "primary" and "destructive" use the muted CTA tokens; "secondary" is the neutral/cancel style. */
    variant?: "primary" | "secondary" | "destructive";
    type?: "button" | "submit";
    disabled?: boolean;
    onclick?: (event: MouseEvent) => void;
    /** Test ID for end-to-end/unit test selectors. */
    "data-testid"?: string;
    /** Marks the dialog's safe/cancel action so Dialog's type="confirm" autofocus rule can find it. */
    "data-dialog-safe-action"?: boolean;
    title?: string;
    /** Underlying button element, for callers that need to focus() it programmatically. */
    ref?: HTMLButtonElement | null;
    /** Extra caller-supplied class(es), e.g. for one-off layout tweaks (align-self, etc). */
    class?: string;
    children?: Snippet;
  }

  let {
    variant = "secondary",
    type = "button",
    disabled = false,
    onclick,
    "data-testid": testid,
    "data-dialog-safe-action": safeAction,
    title,
    ref = $bindable(null),
    class: className = "",
    children,
  }: Props = $props();
</script>

<button
  bind:this={ref}
  {type}
  class="btn btn-{variant} {className}"
  {disabled}
  {onclick}
  {title}
  data-testid={testid}
  data-dialog-safe-action={safeAction ? "" : undefined}
>
  {@render children?.()}
</button>

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-1-5);
    padding: var(--space-2) var(--space-5);
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all var(--duration-fast);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn:focus-visible {
    outline: 2px solid var(--colour-focus-ring);
    outline-offset: 2px;
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

  .btn-destructive {
    background: var(--colour-button-destructive);
    color: var(--colour-text-on-primary);
  }

  .btn-destructive:hover:not(:disabled) {
    background: var(--colour-button-destructive-hover);
  }
</style>
