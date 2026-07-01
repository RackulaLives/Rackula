<!--
  SettingsDialog Component
  Sectioned settings surface (Appearance, Behaviour, Data) on the unified
  Dialog primitive. Single canonical home for app preferences; reads and
  writes the UI store directly, so settings persist exactly as before.
-->
<script lang="ts">
  import Dialog from "./Dialog.svelte";
  import Switch from "./Switch.svelte";
  import { IconTrash, IconUndo } from "./icons";
  import { ICON_SIZE } from "$lib/constants/sizing";
  import { getUIStore } from "$lib/stores/ui.svelte";
  import { getLayoutStore } from "$lib/stores/layout.svelte";

  interface Props {
    open: boolean;
    onclose?: () => void;
    /** Open the cleanup checklist dialog (handled by DialogOrchestrator). */
    onopencleanup?: () => void;
  }

  let { open, onclose, onopencleanup }: Props = $props();

  const uiStore = getUIStore();
  const layoutStore = getLayoutStore();

  let unusedCount = $derived(
    open ? layoutStore.getUnusedCustomDeviceTypes().length : 0,
  );
  let promptDismissed = $derived(!uiStore.promptCleanupOnSave);

  function handleCleanup() {
    onopencleanup?.();
  }

  function handleResetPrompts() {
    uiStore.setPromptCleanupOnSave(true);
  }
</script>

<Dialog {open} title="Settings" size="S" testid="settings-dialog" {onclose}>
  <div class="settings-dialog">
    <section class="settings-section" aria-labelledby="settings-appearance">
      <h3 class="settings-section-title" id="settings-appearance">
        Appearance
      </h3>
      <div class="settings-row">
        <Switch
          checked={uiStore.showBanana}
          label="Banana for scale"
          helperText="Show a banana beside racks for a sense of size."
          onchange={() => uiStore.toggleBanana()}
        />
      </div>
    </section>

    <section class="settings-section" aria-labelledby="settings-behaviour">
      <h3 class="settings-section-title" id="settings-behaviour">Behaviour</h3>
      <div class="settings-row">
        <Switch
          checked={uiStore.compatibleOnly}
          label="Compatible devices only"
          helperText="Hide devices that do not fit the active rack width."
          onchange={() => uiStore.toggleCompatibleOnly()}
        />
      </div>
      <div class="settings-row">
        <Switch
          checked={uiStore.enableBayedRacks}
          label="Enable bayed racks"
          helperText="Show the controls for baying racks together. Existing bays stay put when off."
          onchange={() => uiStore.toggleEnableBayedRacks()}
        />
      </div>
      <div class="settings-row">
        <Switch
          checked={uiStore.warnOnUnsavedChanges}
          label="Warn on unsaved changes"
          helperText="Confirm before leaving with unsaved work."
          onchange={() => uiStore.toggleWarnOnUnsavedChanges()}
        />
      </div>
      <div class="settings-row">
        <Switch
          checked={uiStore.promptCleanupOnSave}
          label="Prompt to clean up unused types"
          helperText="Offer to remove unused custom device types before saving or exporting."
          onchange={() => uiStore.togglePromptCleanupOnSave()}
        />
      </div>
    </section>

    <section class="settings-section" aria-labelledby="settings-data">
      <h3 class="settings-section-title" id="settings-data">Data</h3>
      <div class="settings-action-row">
        <div class="settings-action-text">
          <span class="settings-action-label">Clean up unused device types</span
          >
          <span class="settings-action-help">
            {unusedCount === 0
              ? "No unused custom device types right now."
              : `${unusedCount} unused custom device ${unusedCount === 1 ? "type" : "types"} can be removed.`}
          </span>
        </div>
        <button
          type="button"
          class="btn btn-secondary"
          onclick={handleCleanup}
          disabled={unusedCount === 0}
        >
          <IconTrash size={ICON_SIZE.sm} />
          <span>Review</span>
        </button>
      </div>
      <div class="settings-action-row">
        <div class="settings-action-text">
          <span class="settings-action-label">Reset dismissed prompts</span>
          <span class="settings-action-help">
            {promptDismissed
              ? "The clean-up prompt is currently dismissed."
              : "No prompts are dismissed."}
          </span>
        </div>
        <button
          type="button"
          class="btn btn-secondary"
          onclick={handleResetPrompts}
          disabled={!promptDismissed}
        >
          <IconUndo size={ICON_SIZE.sm} />
          <span>Reset</span>
        </button>
      </div>
    </section>
  </div>
</Dialog>

<style>
  .settings-dialog {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .settings-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .settings-section-title {
    margin: 0;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--colour-text-muted);
  }

  .settings-row {
    display: flex;
    align-items: center;
    min-height: 44px;
  }

  .settings-action-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    min-height: 44px;
  }

  .settings-action-text {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .settings-action-label {
    font-weight: var(--font-weight-medium);
    color: var(--colour-text);
    font-size: var(--font-size-base);
  }

  .settings-action-help {
    font-size: var(--font-size-sm);
    color: var(--colour-text-muted);
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 0;
    min-height: 44px;
    padding: var(--space-2) var(--space-4);
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: background var(--duration-fast) var(--ease-out);
  }

  .btn-secondary {
    background: var(--colour-button-bg);
    color: var(--colour-text);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--colour-button-hover);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn:focus-visible {
    outline: 2px solid var(--colour-focus-ring);
    outline-offset: 2px;
  }
</style>
