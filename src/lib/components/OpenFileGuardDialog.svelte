<!--
  OpenFileGuardDialog Component
  Owns the "Open layout" (Ctrl+O, browser mode) replace-guard flow (#2987).
  Opening a local file replaces the working copy. handleLoad checks
  changesSinceExport and only invokes the registered trigger (opening this
  dialog) when there are changes not yet in any exported file; a fully
  backed-up copy goes straight to the file picker without ever touching this
  component.

  Self-contained: this owns its own confirm-replace state and does not touch
  the shared dialogStore "confirmReplace" flow, which is the separate
  new-layout replace path. Mirrors RestoreFromFileDialog, which uses the same
  pattern for the sibling "Restore from backup (.zip)" command.
-->
<script lang="ts">
  import ConfirmReplaceDialog from "./ConfirmReplaceDialog.svelte";
  import { loadFromFile, handleSaveAsArchive } from "$lib/storage";
  import { shouldShowCleanupPrompt } from "$lib/utils/app-actions";
  import { registerOpenFileTrigger } from "$lib/actions/open-file-trigger";

  let confirmOpen = $state(false);

  function handleCancel() {
    confirmOpen = false;
  }

  function handleReplace() {
    confirmOpen = false;
    // Name what became of the previous layout instead of a generic success
    // toast that implies nothing happened to it (#2987 AC2).
    void loadFromFile(undefined, {
      successMessage: "Previous layout kept in Layouts",
    });
  }

  async function handleExportFirst() {
    confirmOpen = false;
    // Route through the same cleanup-prompt contract as the other save-as
    // paths: when unused custom device types exist, the prompt is shown and
    // the export is deferred into the cleanup dialog. The open does not chain
    // in that case (the user is now in the cleanup flow), matching
    // RestoreFromFileDialog's fire-and-forget contract.
    if (shouldShowCleanupPrompt("saveAs")) return;
    // Turn the dangerous moment into the backup moment: export, then open only
    // if the export actually succeeded (not cancelled or failed).
    const exported = await handleSaveAsArchive();
    if (exported) {
      await loadFromFile();
    }
  }

  $effect(() => registerOpenFileTrigger(() => (confirmOpen = true)));
</script>

<ConfirmReplaceDialog
  open={confirmOpen}
  title="Replace this layout?"
  message="This layout has changes that are not in any exported file. Opening a file replaces it. Your current layout stays available in Layouts."
  saveFirstLabel="Export first"
  onSaveFirst={handleExportFirst}
  onReplace={handleReplace}
  onCancel={handleCancel}
/>
