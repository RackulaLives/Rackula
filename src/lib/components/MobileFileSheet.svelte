<!--
  MobileFileSheet Component
  Mobile-first action list for file operations
-->
<script lang="ts">
  import { ICON_SIZE } from "$lib/constants/sizing";
  import {
    IconUpload,
    IconDownload,
    IconDownloadBold,
    IconShareBold,
  } from "./icons";

  interface Props {
    onload?: () => void;
    onsave?: () => void;
    onexport?: () => void;
    onshare?: () => void;
    onclose?: () => void;
  }

  let { onload, onsave, onexport, onshare, onclose }: Props = $props();

  function handleAction(action?: () => void) {
    action?.();
    onclose?.();
  }
</script>

<div class="file-sheet-actions" role="group" aria-label="File actions">
  <button
    type="button"
    class="file-action"
    onclick={() => handleAction(onload)}
    aria-label="Load Layout"
  >
    <span class="action-icon"><IconUpload size={ICON_SIZE.md} /></span>
    <span class="action-label">Load Layout</span>
  </button>

  <button
    type="button"
    class="file-action"
    onclick={() => handleAction(onsave)}
    aria-label="Save Layout"
  >
    <span class="action-icon"><IconDownload size={ICON_SIZE.md} /></span>
    <span class="action-label">Save Layout</span>
  </button>

  <button
    type="button"
    class="file-action"
    onclick={() => handleAction(onexport)}
    aria-label="Export Image"
  >
    <span class="action-icon"><IconDownloadBold size={ICON_SIZE.md} /></span>
    <span class="action-label">Export Image</span>
  </button>

  <button
    type="button"
    class="file-action"
    onclick={() => handleAction(onshare)}
    aria-label="Share Link"
  >
    <span class="action-icon"><IconShareBold size={ICON_SIZE.md} /></span>
    <span class="action-label">Share Link</span>
  </button>
</div>

<style>
  .file-sheet-actions {
    display: flex;
    flex-direction: column;
    width: 100%;
    padding: var(--space-1) 0 var(--space-4);
  }

  .file-action {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    min-height: var(--touch-target-comfortable);
    padding: var(--space-3) var(--space-4);
    border: none;
    border-bottom: 1px solid var(--colour-border);
    background: transparent;
    color: var(--colour-text);
    text-align: left;
    cursor: pointer;
    transition:
      background-color var(--duration-fast) var(--ease-out),
      color var(--duration-fast) var(--ease-out);
  }

  .file-action:first-child {
    border-top: 1px solid var(--colour-border);
  }

  .file-action:hover {
    background: var(--colour-surface-hover);
    color: var(--colour-primary);
  }

  .file-action:focus-visible {
    outline: 2px solid var(--colour-focus-ring);
    outline-offset: -2px;
  }

  .file-action:active {
    background: var(--colour-surface-active);
  }

  .action-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: inherit;
  }

  .action-label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    line-height: var(--line-height-tight);
  }
</style>
