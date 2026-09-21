<!--
  ImageUpload Component (v0.1.0)
  Component for uploading device images (front/rear)
-->
<script lang="ts">
  import type { ImageData } from "$lib/types/images";
  import { validateImageFile, fileToImageData } from "$lib/utils/imageUpload";
  import { SUPPORTED_IMAGE_FORMATS } from "$lib/types/constants";
  import { getDeviceImageAspect } from "$lib/utils/image-crop";
  import ImageCropDialog from "./ImageCropDialog.svelte";

  interface Props {
    face: "front" | "rear";
    currentImage?: ImageData;
    /** Device name, used to name the device and face in the preview alt text. */
    deviceName?: string;
    /** Device height in U, sets the crop frame shape. */
    uHeight: number;
    /** Nominal rack width in inches, sets the crop frame shape. */
    rackWidth?: number;
    /** Other rack widths the image is also drawn in, shown as crop guides. */
    guideRackWidths?: number[];
    /** The device's share of the rack interior. */
    widthFraction?: number;
    /** How the frame width was decided, for the crop hint. */
    widthLabel?: string;
    onupload?: (data: ImageData) => void;
    onremove?: () => void;
  }

  let {
    face,
    currentImage,
    deviceName,
    uHeight,
    rackWidth,
    guideRackWidths,
    widthFraction,
    widthLabel,
    onupload,
    onremove,
  }: Props = $props();

  // Local state
  let error = $state<string | null>(null);
  let fileInputRef: HTMLInputElement | null = $state(null);
  // Original file kept so the crop can be adjusted after upload.
  let sourceFile = $state<File | null>(null);
  let cropFile = $state<File | null>(null);
  // Frame aspect the current image was cropped to.
  let croppedAspect = $state<number | null>(null);

  const aspect = $derived(
    getDeviceImageAspect(uHeight, rackWidth, widthFraction),
  );
  const cropStale = $derived(
    currentImage !== undefined &&
      sourceFile !== null &&
      croppedAspect !== null &&
      Math.abs(croppedAspect - aspect) > 1e-9,
  );

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

  function handleFileChange(event: Event) {
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

    // Only the crop dialog gets the new file: sourceFile keeps backing the
    // image on screen until the crop is confirmed, so cancelling leaves the
    // current image and its Crop button pointing at the file it came from.
    cropFile = file;

    // Reset input for re-selection of same file
    input.value = "";
  }

  async function handleCropConfirm(cropped: File) {
    // A failed conversion leaves its alert on screen; the Crop button reopens
    // the dialog without passing through handleFileChange, so clear it here or
    // a successful re-crop still reads as failed.
    error = null;
    const source = cropFile;
    const framedAspect = aspect;
    cropFile = null;
    try {
      const imageData = await fileToImageData(cropped, "device", face);
      onupload?.(imageData);
      // Only now does this file back the visible image: recording the frame
      // before the conversion would mark a failed re-crop as up to date while
      // the previous image is still on screen.
      sourceFile = source;
      croppedAspect = framedAspect;
    } catch {
      error = "Failed to process image";
    }
  }

  function handleRemove() {
    sourceFile = null;
    croppedAspect = null;
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
      {#if sourceFile}
        <button
          type="button"
          class="btn btn-choose"
          onclick={() => (cropFile = sourceFile)}
          aria-label={`Adjust ${faceLabel.toLowerCase()} crop`}
        >
          Crop
        </button>
      {/if}
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

  {#if cropStale}
    <span class="crop-stale" role="status">
      The device shape changed since this image was cropped. Crop it again to
      fit.
    </span>
  {/if}

  {#if error}
    <span class="error-message" role="alert">{error}</span>
  {/if}
</div>

<ImageCropDialog
  file={cropFile}
  {face}
  {uHeight}
  {rackWidth}
  {guideRackWidths}
  {widthFraction}
  {widthLabel}
  onconfirm={handleCropConfirm}
  oncancel={() => (cropFile = null)}
/>

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
    flex-wrap: wrap;
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

  .crop-stale {
    font-size: var(--font-size-sm);
    color: var(--colour-warning);
  }

  .error-message {
    font-size: var(--font-size-sm);
    color: var(--colour-error);
  }
</style>
