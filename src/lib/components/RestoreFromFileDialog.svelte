<!--
  RestoreFromFileDialog Component
  Owns the "Restore from file" flow moved out of the storage chip (#2446). The
  app menu's Restore action dispatches through restore-file-trigger, which this
  component registers on mount. Restoring replaces the working copy; when there
  are changes not yet in any exported file, a confirm-replace dialog offers to
  export first (turning the dangerous moment into the backup moment), otherwise
  the file picker opens straight away.

  Self-contained: this owns its own confirm-replace state and does not touch the
  shared dialogStore "confirmReplace" flow, which is the separate new-layout
  replace path.
-->
<script lang="ts">
  import ConfirmReplaceDialog from "./ConfirmReplaceDialog.svelte";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { loadFromFile, handleSaveAsArchive } from "$lib/storage";
  import { shouldShowCleanupPrompt } from "$lib/utils/app-actions";
  import { registerRestoreFromFileTrigger } from "$lib/actions/restore-file-trigger";

  const layoutStore = getLayoutStore();

  let confirmOpen = $state(false);

  function startRestore() {
    // Restoring replaces the working copy. Confirm first only when there are
    // changes not yet in any exported file; a fully backed-up copy goes straight
    // to the picker.
    if (layoutStore.changesSinceExport > 0) {
      confirmOpen = true;
    } else {
      void loadFromFile();
    }
  }

  function handleCancel() {
    confirmOpen = false;
  }

  function handleReplace() {
    confirmOpen = false;
    void loadFromFile();
  }

  async function handleExportFirst() {
    confirmOpen = false;
    // Route through the same cleanup-prompt contract as the other save-as paths:
    // when unused custom device types exist, the prompt is shown and the export
    // is deferred into the cleanup dialog. The restore does not chain in that
    // case (the user is now in the cleanup flow), matching maybeSaveAs's
    // fire-and-forget contract.
    if (shouldShowCleanupPrompt("saveAs")) return;
    // Turn the dangerous moment into the backup moment: export, then restore only
    // if the export actually succeeded (not cancelled or failed).
    const exported = await handleSaveAsArchive();
    if (exported) {
      await loadFromFile();
    }
  }

  $effect(() => registerRestoreFromFileTrigger(startRestore));
</script>

<ConfirmReplaceDialog
  open={confirmOpen}
  title="Replace this layout?"
  message="This layout has changes that are not in any exported file. Restoring replaces it with the file you choose."
  saveFirstLabel="Export first"
  onSaveFirst={handleExportFirst}
  onReplace={handleReplace}
  onCancel={handleCancel}
/>
