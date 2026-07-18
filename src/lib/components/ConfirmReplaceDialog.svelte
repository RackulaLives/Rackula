<!--
  ConfirmReplaceDialog Component
  Confirmation dialog for replacing unsaved data: cancel / save-first / replace.
  Built on the unified Dialog primitive (#2092).

  The default copy describes replacing the current rack on a new-rack action.
  Callers that replace something else (e.g. restore-from-file) override title,
  message, and the save-first label.

  Shares its spec with ConfirmDialog (#3008): both route CTAs through the
  shared Button component and its dedicated colour tokens, both show the
  header close affordance, and both confirm on Enter (guarded so a focused
  button's own native activation wins) rather than diverging on these details
  case by case.
-->
<script lang="ts">
  import Dialog from "./Dialog.svelte";
  import Button from "./ui/Button.svelte";
  import { getLayoutStore } from "$lib/stores/layout.svelte";

  interface Props {
    open: boolean;
    onSaveFirst: () => void;
    onReplace: () => void;
    onCancel: () => void;
    title?: string;
    message?: string;
    saveFirstLabel?: string;
  }

  let {
    open,
    onSaveFirst,
    onReplace,
    onCancel,
    title = "Replace Current Rack?",
    message,
    saveFirstLabel = "Save First",
  }: Props = $props();

  const layoutStore = getLayoutStore();

  const rackName = $derived(layoutStore.rack?.name || "Untitled Rack");
  const deviceCount = $derived(layoutStore.rack?.devices.length ?? 0);
  const deviceWord = $derived(deviceCount === 1 ? "device" : "devices");
  const defaultMessage = $derived(
    `"${rackName}" has ${deviceCount} ${deviceWord} placed. Save your layout first?`,
  );
  const resolvedMessage = $derived(message ?? defaultMessage);

  // Enter confirms the destructive action (Replace), mirroring ConfirmDialog,
  // but only when focus isn't already on a button within the dialog (Cancel,
  // Save First, Replace, or the Dialog's own close/X control). When a button
  // is focused, native button activation (Enter -> click) decides which
  // action fires (#2919, #2975 pattern, shared spec per #3008).
  function handleKeyDown(event: KeyboardEvent) {
    if (event.key !== "Enter") return;
    const active = document.activeElement;
    if (active instanceof HTMLButtonElement) return;

    event.preventDefault();
    onReplace();
  }

  // Listen only while open, mirroring ConfirmDialog's lifecycle-scoped
  // listener.
  $effect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("keydown", handleKeyDown);
      };
    }
  });
</script>

<Dialog {open} {title} size="S" type="confirm" onclose={onCancel}>
  <div class="confirm-replace-dialog">
    <p class="message">{resolvedMessage}</p>

    <div class="actions">
      <Button
        variant="secondary"
        data-testid="btn-cancel-replace"
        data-dialog-safe-action
        onclick={onCancel}
      >
        Cancel
      </Button>
      <Button
        variant="primary"
        data-testid="btn-save-first"
        onclick={onSaveFirst}
      >
        {saveFirstLabel}
      </Button>
      <Button
        variant="destructive"
        data-testid="btn-replace-rack"
        onclick={onReplace}
      >
        Replace
      </Button>
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
</style>
