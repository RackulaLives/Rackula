<!--
  Share Dialog Component
  Generates shareable URL and QR code for current layout
-->
<script lang="ts">
  import Dialog from "./Dialog.svelte";
  import { IconCopy, IconDownload } from "./icons";
  import { generateShareUrl, encodeLayout } from "$lib/utils/share";
  import {
    generateQRCode,
    canFitInQR,
    QR_MIN_PRINT_CM,
  } from "$lib/utils/qrcode";
  import { getToastStore } from "$lib/stores/toast.svelte";
  import { analytics } from "$lib/utils/analytics";
  import type { Layout } from "$lib/types";

  interface Props {
    open: boolean;
    layout: Layout;
    onclose?: () => void;
  }

  let { open, layout, onclose }: Props = $props();

  function handleClose() {
    analytics.trackPanelClose("share");
    onclose?.();
  }

  const toastStore = getToastStore();

  // Generate share URL
  const shareUrl = $derived(generateShareUrl(layout));
  const encodedLength = $derived(encodeLayout(layout).length);
  const fitsInQR = $derived(canFitInQR(shareUrl));

  // QR code generation state
  let qrDataUrl = $state<string | null>(null);
  let qrError = $state<string | null>(null);
  let isGeneratingQR = $state(false);

  // Generate QR code when dialog opens and track panel open
  $effect(() => {
    if (open) {
      analytics.trackPanelOpen("share");
      if (fitsInQR) {
        generateQR();
      }
    } else {
      qrDataUrl = null;
      qrError = null;
    }
  });

  async function generateQR() {
    if (!fitsInQR) {
      qrError = "Layout too large for QR code";
      return;
    }

    isGeneratingQR = true;
    qrError = null;

    try {
      qrDataUrl = await generateQRCode(shareUrl, { width: 444 });
    } catch (error) {
      qrError = "Failed to generate QR code";
      console.error("QR generation failed:", error);
    } finally {
      isGeneratingQR = false;
    }
  }

  async function copyToClipboard() {
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
</script>

<Dialog {open} title="Share Layout" width="420px" showClose={false} onclose={handleClose}>
  <div class="share-dialog">
    <!-- URL Section -->
    <div class="share-section">
      <label class="share-label" for="share-url">Share Link</label>
      <div class="url-container">
        <input
          id="share-url"
          type="text"
          readonly
          value={shareUrl}
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
          <IconCopy size={16} />
        </button>
      </div>
      <p class="url-info">
        {encodedLength} characters
        {#if encodedLength > 2000}
          <span class="warning"> (may be too long for some browsers)</span>
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
      {#if qrDataUrl}
        <button
          type="button"
          class="btn btn-primary"
          onclick={downloadQR}
          title="Recommended print size: {QR_MIN_PRINT_CM}cm minimum"
          data-testid="qr-download-btn"
        >
          <IconDownload size={16} />
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
    padding: var(--space-4);
    background: white;
    border-radius: var(--radius-md);
  }

  .qr-image {
    width: 280px;
    height: 280px;
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
</style>
