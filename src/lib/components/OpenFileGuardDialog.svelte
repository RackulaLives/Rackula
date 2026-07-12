<!--
  OpenFileGuardDialog Component
  Owns the confirm-replace UI for the "Open layout" guard (#2987). Three entry
  points share this one dialog: Ctrl+O / the palette "Open layout" command
  (browser mode, via handleLoad), and LoadDialog's two server-mode sub-flows,
  "Import from local file" and clicking a saved-on-server row. Opening a file
  replaces the working copy. runOpenFileFlow checks changesSinceExport itself
  and only invokes the registered trigger (opening this dialog, with the
  caller's load action attached) when there are changes not yet in any
  exported file; a fully backed-up copy runs its load action immediately,
  never touching this component.

  Self-contained: this owns its own confirm-replace state and does not touch
  the shared dialogStore "confirmReplace" flow, which is the separate
  new-layout replace path. Mirrors RestoreFromFileDialog, which uses the same
  pattern for the sibling "Restore from backup (.zip)" command.
-->
<script lang="ts">
  import ConfirmReplaceDialog from "./ConfirmReplaceDialog.svelte";
  import { handleSaveAsArchive } from "$lib/storage";
  import { shouldShowCleanupPrompt } from "$lib/utils/app-actions";
  import {
    registerOpenFileTrigger,
    type OpenFileLoadAction,
  } from "$lib/actions/open-file-trigger";

  let confirmOpen = $state(false);
  let pendingLoad: OpenFileLoadAction | null = null;

  function handleCancel() {
    confirmOpen = false;
    pendingLoad = null;
  }

  function handleReplace() {
    confirmOpen = false;
    const loadAction = pendingLoad;
    pendingLoad = null;
    // Name what became of the previous layout instead of a generic success
    // toast that implies nothing happened to it (#2987 AC2): the caller's
    // load action is invoked with guarded=true.
    void loadAction?.(true);
  }

  async function handleExportFirst() {
    confirmOpen = false;
    const loadAction = pendingLoad;
    pendingLoad = null;
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
      await loadAction?.(true);
    }
  }

  $effect(() =>
    registerOpenFileTrigger((loadAction) => {
      pendingLoad = loadAction;
      confirmOpen = true;
    }),
  );
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
