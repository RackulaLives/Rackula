<!--
  CleanupPromptDialog Component
  Prompts user to clean up unused custom device types before export/save
-->
<script lang="ts">
  import Dialog from "./Dialog.svelte";

  interface Props {
    open: boolean;
    unusedCount: number;
    onreview?: () => void;
    onkeepall?: () => void;
    oncancel?: () => void;
    ondontaskagain?: () => void;
  }

  let {
    open,
    unusedCount,
    onreview,
    onkeepall,
    oncancel,
    ondontaskagain,
  }: Props = $props();

  let dontAskAgain = $state(false);

  // Reset checkbox state when dialog opens
  $effect(() => {
    if (open) {
      dontAskAgain = false;
    }
  });

  function handleReview() {
    if (dontAskAgain) {
      ondontaskagain?.();
    }
    onreview?.();
  }

  function handleKeepAll() {
    if (dontAskAgain) {
      ondontaskagain?.();
    }
    onkeepall?.();
  }

  function handleCancel() {
    oncancel?.();
  }
</script>

<Dialog
  {open}
  title="Clean Up Device Library?"
  onclose={handleCancel}
  width="420px"
>
  <div class="cleanup-prompt-dialog">
    <p class="message">
      You have {unusedCount} unused custom device {unusedCount === 1
        ? "type"
        : "types"}. Would you like to remove {unusedCount === 1 ? "it" : "them"} before
      saving?
    </p>

    <div class="dont-ask-again">
      <input
        type="checkbox"
        id="dont-ask-again-checkbox"
        bind:checked={dontAskAgain}
      />
      <label for="dont-ask-again-checkbox">Don't ask again</label>
    </div>

    <div class="actions">
      <button type="button" class="btn btn-secondary" onclick={handleCancel}>
        Cancel
      </button>
      <button type="button" class="btn btn-secondary" onclick={handleKeepAll} autofocus>
        Keep All
      </button>
      <button type="button" class="btn btn-primary" onclick={handleReview}>
        Review & Clean Up
      </button>
    </div>
  </div>
</Dialog>

<style>
  .cleanup-prompt-dialog {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .message {
    margin: 0;
    font-size: var(--font-size-base);
    line-height: 1.5;
    color: var(--colour-text);
  }

  .dont-ask-again {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--font-size-sm);
    color: var(--colour-text-muted);
  }

  .dont-ask-again label {
    cursor: pointer;
  }

  .dont-ask-again input[type="checkbox"] {
    width: 16px;
    height: 16px;
    margin: 0;
    cursor: pointer;
    accent-color: var(--colour-selection);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
  }

  .btn {
    padding: var(--space-2) var(--space-5);
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .btn-secondary {
    background: var(--colour-button-bg);
    color: var(--colour-text);
  }

  .btn-secondary:hover {
    background: var(--colour-button-hover);
  }

  .btn-primary {
    background: var(--colour-selection);
    color: var(--colour-text-on-primary);
  }

  .btn-primary:hover {
    background: var(--colour-selection-hover);
  }

  .btn:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: 2px;
  }
</style>
