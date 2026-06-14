<!--
  Share Dialog Component
  Generates shareable URL and QR code for current layout
-->
<script lang="ts">
  import Dialog from "./Dialog.svelte";
  import { IconCopy, IconDownload } from "./icons";
  import { ICON_SIZE } from "$lib/constants/sizing";
  import { generateShareUrl } from "$lib/utils/share";
  import {
    generateQRCode,
    canFitInQR,
    QR_MIN_PRINT_CM,
  } from "$lib/utils/qrcode";
  import { serializeLayoutToYaml } from "$lib/utils/yaml";
  import { downloadBlob } from "$lib/utils/export";
  import { buildYamlFilename } from "$lib/utils/folder-structure";
  import { getToastStore } from "$lib/stores/toast.svelte";
  import type { Layout } from "$lib/types";

  // Threshold is checked against the full URL (encoded payload + ~30-char static prefix),
  // consistent with how canFitInQR() measures the share URL.
  const URL_LENGTH_WARNING = 1800;

  interface Props {
    open: boolean;
    layout: Layout;
    onclose?: () => void;
  }

  let { open, layout, onclose }: Props = $props();

  function handleClose() {
    onclose?.();
  }

  const toastStore = getToastStore();

  // Generate share URL
  const shareUrl = $derived(generateShareUrl(layout));
  const urlLength = $derived(shareUrl?.length ?? 0);
  const isTooLong = $derived(urlLength > URL_LENGTH_WARNING);
  const fitsInQR = $derived(shareUrl ? canFitInQR(shareUrl) : false);

  // QR code generation state
  let qrDataUrl = $state<string | null>(null);
  let qrError = $state<string | null>(null);
  let isGeneratingQR = $state(false);

  // Generate QR code when dialog opens
  $effect(() => {
    if (open) {
      if (fitsInQR) {
        generateQR();
      }
    } else {
      qrDataUrl = null;
      qrError = null;
    }
  });

  // Clear stale QR image if layout grows too large while dialog is open
  $effect(() => {
    if (isTooLong) {
      qrDataUrl = null;
    }
  });

  async function generateQR() {
    if (!fitsInQR || !shareUrl) {
      qrError = "Layout too large for QR code";
      return;
    }

    isGeneratingQR = true;
    qrError = null;

    try {
      qrDataUrl = await generateQRCode(shareUrl!, { width: 444 });
    } catch (error) {
      qrError =
        error instanceof Error
          ? `QR generation failed: ${error.message}`
          : "Failed to generate QR code";
      console.error("QR generation failed:", error);
    } finally {
      isGeneratingQR = false;
    }
  }

  async function copyToClipboard() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toastStore.showToast("Link copied to clipboard", "success", 3000);
    } catch {
      toastStore.showToast("Failed to copy link", "error");
    }
  }

  function downloadQR() {
    if (!qrDataUrl) return;

    const link = document.createElement("a");
    link.href = qrDataUrl;
    link.download = `${layout.name.replace(/[^a-zA-Z0-9]/g, "-")}-qr.png`;
    link.click();
  }

  async function downloadLayoutFile() {
    try {
      const yaml = await serializeLayoutToYaml(layout);
      const blob = new Blob([yaml], { type: "text/yaml" });
      downloadBlob(blob, buildYamlFilename(layout.name));
      toastStore.showToast("Layout file downloaded", "success", 3000);
    } catch {
      toastStore.showToast("Failed to download layout", "error");
    }
  }
</script>

<Dialog
  {open}
  title="Share Layout"
  size="S"
  showClose={false}
  onclose={handleClose}
>
  <div class="share-dialog">
    <!-- URL Section -->
    <div class="share-section">
      <label class="share-label" for="share-url">Share Link</label>
      <div class="url-container">
        <input
          id="share-url"
          type="text"
          readonly
          value={shareUrl ?? "Unable to encode layout"}
          class="url-input"
          onclick={(e) => e.currentTarget.select()}
          data-testid="share-url-input"
        />
        <button
          type="button"
          class="icon-btn"
          onclick={copyToClipboard}
          aria-label="Copy link to clipboard"
          data-testid="share-copy-btn"
        >
          <IconCopy size={ICON_SIZE.sm} />
        </button>
      </div>
      <p class="url-info">
        {urlLength} characters
        {#if isTooLong}
          <span class="warning">
            &mdash; too long for some browsers; download the file instead</span
          >
        {/if}
      </p>
    </div>

    <!-- QR Code Section -->
    <div class="share-section">
      <span class="share-label">QR Code</span>

      {#if !fitsInQR}
        <div class="qr-message qr-error" data-testid="qr-error">
          <p>Layout too large for QR code</p>
          <p class="hint">Try removing some devices to reduce size</p>
        </div>
      {:else if isGeneratingQR}
        <div class="qr-message" data-testid="qr-loading">
          Generating QR code...
        </div>
      {:else if qrError}
        <div class="qr-message qr-error" data-testid="qr-error">{qrError}</div>
      {:else if qrDataUrl}
        <div class="qr-container" data-testid="qr-container">
          <p class="qr-scan-label">
            Scan to open in <span class="brand">Rackula</span>
          </p>
          <img src={qrDataUrl} alt="QR code for layout" class="qr-image" />
        </div>
      {/if}
    </div>

    <!-- Info Section -->
    <div class="share-info">
      <p>
        <strong>Note:</strong> Shared layouts include rack configuration and device
        placements. Device images are not included.
      </p>
    </div>

    <!-- Action Buttons -->
    <div class="actions">
      <button type="button" class="btn btn-secondary" onclick={onclose}>
        Cancel
      </button>
      {#if isTooLong}
        <button
          type="button"
          class="btn btn-primary"
          onclick={downloadLayoutFile}
          data-testid="layout-download-btn"
        >
          <IconDownload size={ICON_SIZE.sm} />
          Download Layout File
        </button>
      {:else if qrDataUrl}
        <button
          type="button"
          class="btn btn-primary"
          onclick={downloadQR}
          title="Recommended print size: {QR_MIN_PRINT_CM}cm minimum"
          data-testid="qr-download-btn"
        >
          <IconDownload size={ICON_SIZE.sm} />
          Download QR
        </button>
      {/if}
    </div>
  </div>
</Dialog>

<style>
  .share-dialog {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    width: 100%;
    min-width: 0;
  }

  .share-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .share-label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--colour-text-muted);
  }

  .url-container {
    display: flex;
    gap: var(--space-2);
  }

  .url-input {
    flex: 1;
    min-width: 0;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    background: var(--input-bg);
    color: var(--colour-text);
    font-size: var(--font-size-sm);
    font-family: var(--font-mono);
  }

  .url-input:focus {
    outline: 2px solid var(--colour-selection);
    outline-offset: 1px;
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-2);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--colour-text);
    cursor: pointer;
    transition: background-color var(--duration-fast) ease;
  }

  .icon-btn:hover {
    background: var(--colour-surface-hover);
  }

  .icon-btn:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: 1px;
  }

  .url-info {
    font-size: var(--font-size-xs);
    color: var(--colour-text-muted);
    margin: 0;
  }

  .url-info .warning {
    color: var(--colour-warning, #f59e0b);
  }

  .qr-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    max-width: 100%;
    padding: var(--space-4);
    box-sizing: border-box;
    background: white;
    border-radius: var(--radius-md);
  }

  .qr-image {
    width: min(280px, 100%);
    max-width: 100%;
    height: auto;
    image-rendering: pixelated;
  }

  .qr-scan-label {
    margin: 0;
    font-size: var(--font-size-sm);
    color: #333;
  }

  .qr-scan-label .brand {
    color: var(--dracula-purple);
    font-weight: var(--font-weight-semibold);
  }

  .qr-message {
    padding: var(--space-4);
    text-align: center;
    color: var(--colour-text-muted);
    font-size: var(--font-size-sm);
  }

  .qr-error {
    color: var(--colour-error, #ef4444);
  }

  .qr-error .hint {
    color: var(--colour-text-muted);
    margin-top: var(--space-1);
  }

  .share-info {
    padding: var(--space-3);
    background: var(--colour-surface);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
    color: var(--colour-text-muted);
  }

  .share-info p {
    margin: 0;
  }

  /* Action Buttons */
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    justify-content: flex-end;
    margin-top: var(--space-2);
  }

  .btn {
    display: flex;
    align-items: center;
    gap: var(--space-1-5);
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
    font-weight: 500;
    cursor: pointer;
    border: none;
    transition: background-color var(--duration-fast);
  }

  .btn-primary {
    background: var(--colour-button-primary);
    color: var(--colour-text-on-primary);
  }

  .btn-primary:hover {
    background: var(--colour-button-primary-hover);
  }

  .btn-secondary {
    background: transparent;
    border: 1px solid var(--colour-border);
    color: var(--colour-text);
  }

  .btn-secondary:hover {
    background: var(--colour-surface-hover);
  }

  @media (max-width: 480px) {
    .btn {
      flex: 1 1 140px;
      justify-content: center;
    }
  }
</style>
