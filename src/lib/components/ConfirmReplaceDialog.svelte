<!--
  ConfirmReplaceDialog Component
  Confirmation dialog for replacing unsaved rack data
  Uses bits-ui Dialog primitives for accessibility and focus management
-->
<script lang="ts">
  import { Dialog } from "bits-ui";
  import { getLayoutStore } from "$lib/stores/layout.svelte";

  interface Props {
    open: boolean;
    onSaveFirst: () => void;
    onReplace: () => void;
    onCancel: () => void;
  }

  let {
    open = $bindable(),
    onSaveFirst,
    onReplace,
    onCancel,
  }: Props = $props();

  const layoutStore = getLayoutStore();

  const rackName = $derived(layoutStore.rack?.name || "Untitled Rack");
  const deviceCount = $derived(layoutStore.rack?.devices.length ?? 0);
  const deviceWord = $derived(deviceCount === 1 ? "device" : "devices");
  const message = $derived(
    `"${rackName}" has ${deviceCount} ${deviceWord} placed. Save your layout first?`,
  );

  function handleOpenChange(newOpen: boolean) {
    open = newOpen;
    if (!newOpen) {
      onCancel();
    }
  }
</script>

<Dialog.Root {open} onOpenChange={handleOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay class="dialog-backdrop" />
    <Dialog.Content class="dialog" style="width: 420px; max-width: 90vw;">
      <Dialog.Title class="dialog-title">Replace Current Rack?</Dialog.Title>
      <Dialog.Description class="message">{message}</Dialog.Description>

      <div class="actions">
        <button type="button" class="btn btn-secondary" onclick={onCancel}>
          Cancel
        </button>
        <button type="button" class="btn btn-primary" onclick={onSaveFirst}>
          Save First
        </button>
        <button type="button" class="btn btn-destructive" onclick={onReplace}>
          Replace
        </button>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  /* Base dialog styles (.dialog-backdrop, .dialog, .dialog-title, .dialog-close)
     are defined in src/lib/styles/dialogs.css and imported globally */

  /* Component-specific overrides */
  :global(.dialog) {
    padding: var(--space-5);
  }

  :global(.dialog-title) {
    margin-bottom: var(--space-3);
  }

  :global(.message) {
    margin: 0 0 var(--space-5) 0;
    color: var(--colour-text-muted);
    line-height: 1.5;
  }

  .actions {
    display: flex;
    gap: var(--space-3);
    justify-content: flex-end;
  }

  .btn {
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-md);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    border: none;
    transition: opacity 0.15s;
  }

  .btn:hover {
    opacity: 0.9;
  }

  .btn:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: 2px;
  }

  .btn-primary {
    background: var(--colour-button-primary);
    color: var(--colour-text-on-primary);
  }

  .btn-primary:hover {
    background: var(--colour-button-primary-hover);
  }

  .btn-destructive {
    background: var(--colour-button-destructive);
    color: var(--colour-text-on-primary);
  }

  .btn-destructive:hover {
    background: var(--colour-button-destructive-hover);
  }

  .btn-secondary {
    background: transparent;
    border: 1px solid var(--colour-border);
    color: var(--colour-text);
  }

  .btn-secondary:hover {
    background: var(--colour-surface-hover);
  }
</style>
