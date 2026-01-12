<!--
  Dialog Component
  Modal dialog using bits-ui for accessibility, focus trap, and keyboard handling
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { Dialog } from "bits-ui";

  interface Props {
    open: boolean;
    title: string;
    width?: string;
    showClose?: boolean;
    onclose?: () => void;
    children?: Snippet;
  }

  let {
    open = $bindable(),
    title,
    width = "400px",
    showClose = true,
    onclose,
    children,
  }: Props = $props();

  function handleOpenChange(newOpen: boolean) {
    open = newOpen;
    if (!newOpen) {
      onclose?.();
    }
  }
</script>

<Dialog.Root {open} onOpenChange={handleOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay class="dialog-backdrop" data-testid="dialog-backdrop" />
    <Dialog.Content
      class="dialog"
      style="width: {width}; max-width: 90vw; max-height: 90vh;"
    >
      <div class="dialog-header">
        <Dialog.Title class="dialog-title">{title}</Dialog.Title>
        {#if showClose}
          <Dialog.Close class="dialog-close" aria-label="Close dialog">
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M15 5L5 15M5 5L15 15"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              />
            </svg>
          </Dialog.Close>
        {/if}
      </div>
      <div class="dialog-content">
        {#if children}
          {@render children()}
        {/if}
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  :global(.dialog-backdrop) {
    position: fixed;
    inset: 0;
    background: var(--colour-backdrop, rgba(0, 0, 0, 0.6));
    z-index: var(--z-modal, 200);
  }

  :global(.dialog) {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    background: var(--colour-dialog-bg, var(--colour-bg));
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    display: flex;
    flex-direction: column;
    z-index: calc(var(--z-modal, 200) + 1);
  }

  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--colour-border);
  }

  :global(.dialog-title) {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: 600;
    color: var(--colour-text);
  }

  :global(.dialog-close) {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--colour-text-muted);
    cursor: pointer;
    transition: all var(--duration-fast);
  }

  :global(.dialog-close:hover) {
    background: var(--colour-surface-hover);
    color: var(--colour-text);
  }

  :global(.dialog-close:focus-visible) {
    outline: 2px solid var(--colour-selection);
    outline-offset: 2px;
  }

  .dialog-content {
    padding: var(--space-5);
    overflow-y: auto;
  }
</style>
