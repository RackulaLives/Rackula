<!--
  CleanupPromptDialog Component
  Prompts user to clean up unused custom device types before export/save
-->
<script lang="ts">
  import Dialog from "./Dialog.svelte";
  import Button from "./ui/Button.svelte";

  interface Props {
    open: boolean;
    operation?: "save" | "saveAs" | "export" | null;
    unusedCount: number;
    onreview?: () => void;
    onkeepall?: () => void;
    oncancel?: () => void;
    ondontaskagain?: () => void;
  }

  let {
    open,
    operation = null,
    unusedCount,
    onreview,
    onkeepall,
    oncancel,
    ondontaskagain,
  }: Props = $props();

  let dontAskAgain = $state(false);
  let keepAllButton: HTMLButtonElement | null = $state(null);

  // Reset checkbox state when dialog opens
  $effect(() => {
    if (open) {
      dontAskAgain = false;
    }
  });

  // Focus the first non-destructive action when the dialog opens.
  $effect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      keepAllButton?.focus();
    });

    return () => {
      cancelAnimationFrame(frame);
    };
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

  const operationAction = $derived(
    operation === "export"
      ? "exporting"
      : operation === "save" || operation === "saveAs"
        ? "saving"
        : "continuing",
  );
</script>

<Dialog {open} title="Clean Up Device Library?" onclose={handleCancel} size="S">
  <div class="cleanup-prompt-dialog">
    <p class="message">
      You have {unusedCount} unused custom device {unusedCount === 1
        ? "type"
        : "types"}. Would you like to remove {unusedCount === 1 ? "it" : "them"} before
      {operationAction}?
    </p>

    <p class="message hint">
      Review & Clean Up opens a checklist where you can choose which unused
      types to delete first.
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
      <Button variant="secondary" onclick={handleCancel}>Cancel</Button>
      <Button
        variant="secondary"
        bind:ref={keepAllButton}
        onclick={handleKeepAll}
      >
        Keep All
      </Button>
      <Button variant="primary" onclick={handleReview}>
        Review & Clean Up
      </Button>
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

  .hint {
    font-size: var(--font-size-sm);
    color: var(--colour-text-muted);
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
</style>
