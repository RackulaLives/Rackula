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
    headerActions?: Snippet;
  }

  let {
    open = $bindable(),
    title,
    width = "400px",
    showClose = true,
    onclose,
    children,
    headerActions,
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
        <div class="dialog-header-actions">
          {#if headerActions}
            {@render headerActions()}
          {/if}
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
  /* Base dialog styles (.dialog-backdrop, .dialog, .dialog-title, .dialog-close)
     are defined in src/lib/styles/dialogs.css and imported globally */

  /* Dialog-specific layout: adds flex column for header/content structure */
  :global(.dialog) {
    display: flex;
    flex-direction: column;
  }

  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) var(--space-5);
  }

  .dialog-header-actions {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .dialog-content {
    padding: var(--space-5);
    overflow-y: auto;
  }
</style>
