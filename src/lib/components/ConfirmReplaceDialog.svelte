<!--
  ConfirmReplaceDialog Component
  Confirmation dialog for replacing unsaved rack data.
  Built on the unified Dialog primitive (#2092).
-->
<script lang="ts">
  import Dialog from "./Dialog.svelte";
  import { getLayoutStore } from "$lib/stores/layout.svelte";

  interface Props {
    open: boolean;
    onSaveFirst: () => void;
    onReplace: () => void;
    onCancel: () => void;
  }

  let { open, onSaveFirst, onReplace, onCancel }: Props = $props();

  const layoutStore = getLayoutStore();

  const rackName = $derived(layoutStore.rack?.name || "Untitled Rack");
  const deviceCount = $derived(layoutStore.rack?.devices.length ?? 0);
  const deviceWord = $derived(deviceCount === 1 ? "device" : "devices");
  const message = $derived(
    `"${rackName}" has ${deviceCount} ${deviceWord} placed. Save your layout first?`,
  );
</script>

<Dialog
  {open}
  title="Replace Current Rack?"
  size="S"
  showClose={false}
  onclose={onCancel}
>
  <div class="confirm-replace-dialog">
    <p class="message">{message}</p>

    <div class="actions">
      <button
        type="button"
        class="btn btn-secondary"
        data-testid="btn-cancel-replace"
        onclick={onCancel}
      >
        Cancel
      </button>
      <button
        type="button"
        class="btn btn-primary"
        data-testid="btn-save-first"
        onclick={onSaveFirst}
      >
        Save First
      </button>
      <button
        type="button"
        class="btn btn-destructive"
        data-testid="btn-replace-rack"
        onclick={onReplace}
      >
        Replace
      </button>
    </div>
  </div>
</Dialog>

<style>
  .confirm-replace-dialog {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .message {
    margin: 0;
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
