<!--
  ConfirmDialog Component
  Reusable confirmation dialog for destructive actions
-->
<script lang="ts">
  import Dialog from "./Dialog.svelte";
  import Button from "./ui/Button.svelte";

  interface Props {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
    onconfirm?: () => void;
    oncancel?: () => void;
  }

  let {
    open,
    title,
    message,
    confirmLabel = "Delete",
    cancelLabel = "Cancel",
    destructive = true,
    onconfirm,
    oncancel,
  }: Props = $props();

  function handleConfirm() {
    onconfirm?.();
  }

  function handleCancel() {
    oncancel?.();
  }

  // Enter confirms as a convenience shortcut, but only when focus isn't
  // already on a button within the dialog (Cancel, Confirm, or the Dialog's
  // own close/X control). When a button is focused, native button activation
  // (Enter -> click) decides which action fires; intercepting unconditionally
  // here suppressed that native activation and always confirmed, even with
  // Cancel or the close button focused (#2919, #2975).
  function handleKeyDown(event: KeyboardEvent) {
    if (event.key !== "Enter") return;
    const active = document.activeElement;
    if (active instanceof HTMLButtonElement) return;

    event.preventDefault();
    handleConfirm();
  }

  // Listen only while open. DevicePaletteItem renders one ConfirmDialog per
  // deletable custom device, so an unconditional listener accumulated one
  // idle document keydown listener per instance regardless of `open`.
  $effect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("keydown", handleKeyDown);
      };
    }
  });
</script>

<Dialog {open} {title} onclose={handleCancel} size="S" type="confirm">
  <div class="confirm-dialog">
    <p class="message">{message}</p>

    <div class="actions">
      <Button
        variant="secondary"
        data-testid="btn-cancel-confirm"
        data-dialog-safe-action
        onclick={handleCancel}
      >
        {cancelLabel}
      </Button>
      <Button
        variant={destructive ? "destructive" : "primary"}
        data-testid="btn-confirm-action"
        onclick={handleConfirm}
      >
        {confirmLabel}
      </Button>
    </div>
  </div>
</Dialog>

<style>
  .confirm-dialog {
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

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
  }
</style>
