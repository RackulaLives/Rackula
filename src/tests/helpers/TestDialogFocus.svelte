<!--
  Test harness for Dialog's initial-focus rule (#3000). Renders the shared
  Dialog wrapper with a close button (from Dialog itself), a safe/destructive
  action pair, and a form field, so a single component can exercise all three
  `type` categories against realistic DOM order.
-->
<script lang="ts">
  import Dialog from "$lib/components/Dialog.svelte";

  type DialogType = "confirm" | "form" | "info";

  interface Props {
    open: boolean;
    type?: DialogType;
  }

  let { open, type = "info" }: Props = $props();
</script>

<Dialog {open} title="Test Dialog" {type}>
  <button type="button" data-dialog-safe-action data-testid="safe-action">
    Cancel
  </button>
  <button type="button" data-testid="danger-action">Delete</button>
  <input type="text" data-testid="first-field" />
</Dialog>
