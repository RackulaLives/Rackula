<!--
  ImageUpload Component (v0.1.0)
  Component for uploading device images (front/rear)
-->
<script lang="ts">
  import type { ImageData } from "$lib/types/images";
  import { validateImageFile, fileToImageData } from "$lib/utils/imageUpload";
  import { SUPPORTED_IMAGE_FORMATS } from "$lib/types/constants";

  interface Props {
    face: "front" | "rear";
    currentImage?: ImageData;
    /** Device name, used to name the device and face in the preview alt text. */
    deviceName?: string;
    onupload?: (data: ImageData) => void;
    onremove?: () => void;
  }

  let { face, currentImage, deviceName, onupload, onremove }: Props = $props();

  // Local state
  let error = $state<string | null>(null);
  let fileInputRef: HTMLInputElement | null = $state(null);

  // Computed label
  const faceLabel = $derived(face === "front" ? "Front Image" : "Rear Image");

  // Preview alt names the device (when known) and the face.
  const previewAlt = $derived(
    deviceName
      ? `${deviceName} ${face} image preview`
      : `${face} image preview`,
  );

  // Build accept string from supported formats
  const acceptTypes = SUPPORTED_IMAGE_FORMATS.join(",");

  function handleChooseClick() {
    fileInputRef?.click();
  }

  async function handleFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    // Clear previous error
    error = null;

    // Validate file
    const validation = validateImageFile(file);
    if (!validation.valid) {
      error = validation.error ?? "Invalid file";
      // Reset input
      input.value = "";
      return;
    }

    try {
      // Convert to ImageData
      const imageData = await fileToImageData(file, "device", face);
      onupload?.(imageData);
    } catch {
      error = "Failed to process image";
    }

    // Reset input for re-selection of same file
    input.value = "";
  }

  function handleRemove() {
    onremove?.();
  }
</script>

<div class="image-upload">
  <span class="image-upload-label">{faceLabel}</span>

  <input
    type="file"
    accept={acceptTypes}
    class="sr-only"
    aria-label={`Upload ${faceLabel.toLowerCase()}`}
    bind:this={fileInputRef}
    onchange={handleFileChange}
  />

  {#if currentImage}
    <div class="image-preview">
      <img src={currentImage.dataUrl} alt={previewAlt} class="preview-image" />
      <button
        type="button"
        class="btn btn-remove"
        onclick={handleRemove}
        aria-label="Remove image"
      >
        Remove
      </button>
    </div>
  {:else}
    <button type="button" class="btn btn-choose" onclick={handleChooseClick}>
      Choose File
    </button>
  {/if}

  {#if error}
    <span class="error-message" role="alert">{error}</span>
  {/if}
</div>

<style>
  .image-upload {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .image-upload-label {
    font-weight: 500;
    color: var(--colour-text);
    font-size: var(--font-size-base);
  }

  /* Visually hidden but accessible */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .image-preview {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .preview-image {
    width: 80px;
    height: 60px;
    object-fit: contain;
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    background: var(--colour-bg-secondary);
  }

  .btn {
    /* min-height meets the 44px touch target on mobile (a11y standards). */
    min-height: 44px;
    padding: var(--space-2) var(--space-4);
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .btn-choose {
    background: var(--button-bg);
    color: var(--colour-text);
  }

  .btn-choose:hover {
    background: var(--button-bg-hover);
  }

  .btn-remove {
    background: transparent;
    color: var(--colour-error);
    border: 1px solid var(--colour-error);
  }

  .btn-remove:hover {
    background: rgba(231, 76, 60, 0.1);
  }

  .btn:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: 2px;
  }

  .error-message {
    font-size: var(--font-size-sm);
    color: var(--colour-error);
  }
</style>
