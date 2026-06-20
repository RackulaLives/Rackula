<!--
  EditPanelImage Component
  Edit panel section: front/rear placement image overrides for the selected device.
  Each face shows a thumbnail when an override is set, with replace and clear
  actions. When no override is set, the device type image is used as the fallback.
-->
<script lang="ts">
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getImageStore } from "$lib/stores/images.svelte";
  import { placementKey } from "$lib/utils/placement-key";
  import { validateImageFile, fileToImageData } from "$lib/utils/imageUpload";
  import { SUPPORTED_IMAGE_FORMATS } from "$lib/types/constants";
  import type { SelectedDeviceInfo } from "$lib/types";
  import type { ImageData } from "$lib/types/images";

  interface Props {
    selectedDeviceInfo: SelectedDeviceInfo;
  }

  let { selectedDeviceInfo }: Props = $props();

  const layoutStore = getLayoutStore();
  const imageStore = getImageStore();

  const layoutId = $derived(layoutStore.layout.metadata?.id ?? "");

  // Human label for the selected device, for image alt text.
  const deviceLabel = $derived(
    selectedDeviceInfo.placedDevice.name ??
      selectedDeviceInfo.device.model ??
      selectedDeviceInfo.device.slug,
  );

  const acceptTypes = SUPPORTED_IMAGE_FORMATS.join(",");

  // Per-face validation errors and hidden file inputs
  let errors = $state<{ front: string | null; rear: string | null }>({
    front: null,
    rear: null,
  });
  let fileInputs = $state<{
    front: HTMLInputElement | null;
    rear: HTMLInputElement | null;
  }>({ front: null, rear: null });

  // Current placement overrides (if any)
  const placementFrontImage = $derived(
    imageStore.getDeviceImage(
      placementKey(layoutId, selectedDeviceInfo.placedDevice.id),
      "front",
    ),
  );
  const placementRearImage = $derived(
    imageStore.getDeviceImage(
      placementKey(layoutId, selectedDeviceInfo.placedDevice.id),
      "rear",
    ),
  );

  // Device type fallback images, keyed by slug in the image store
  const deviceTypeFrontImage = $derived(
    imageStore.getDeviceImage(selectedDeviceInfo.device.slug, "front"),
  );
  const deviceTypeRearImage = $derived(
    imageStore.getDeviceImage(selectedDeviceInfo.device.slug, "rear"),
  );

  function imageSrc(image: ImageData | undefined): string | undefined {
    return image?.url ?? image?.dataUrl;
  }

  function chooseFile(face: "front" | "rear") {
    fileInputs[face]?.click();
  }

  async function handleFileChange(face: "front" | "rear", event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    errors[face] = null;

    const validation = validateImageFile(file);
    if (!validation.valid) {
      errors[face] = validation.error ?? "Invalid file";
      input.value = "";
      return;
    }

    try {
      const data = await fileToImageData(
        file,
        selectedDeviceInfo.device.slug,
        face,
      );
      const deviceId = selectedDeviceInfo.placedDevice.id;
      imageStore.setDeviceImage(placementKey(layoutId, deviceId), face, data);
      layoutStore.updateDevicePlacementImage(
        selectedDeviceInfo.rack.id,
        selectedDeviceInfo.deviceIndex,
        face,
        data.filename,
      );
    } catch {
      errors[face] = "Failed to process image";
    }

    // Reset so the same file can be selected again
    input.value = "";
  }

  function clearOverride(face: "front" | "rear") {
    const deviceId = selectedDeviceInfo.placedDevice.id;
    imageStore.removeDeviceImage(placementKey(layoutId, deviceId), face);
    layoutStore.updateDevicePlacementImage(
      selectedDeviceInfo.rack.id,
      selectedDeviceInfo.deviceIndex,
      face,
      undefined,
    );
    errors[face] = null;
  }
</script>

{#snippet imageSlot(
  face: "front" | "rear",
  override: ImageData | undefined,
  deviceTypeImage: ImageData | undefined,
)}
  {@const label = face === "front" ? "Front Image" : "Rear Image"}
  {@const overrideSrc = imageSrc(override)}
  {@const fallbackSrc = imageSrc(deviceTypeImage)}
  <div class="slot">
    <span class="slot-label">{label}</span>

    <input
      type="file"
      accept={acceptTypes}
      class="sr-only"
      aria-label="Choose {label.toLowerCase()} override"
      bind:this={fileInputs[face]}
      onchange={(event) => handleFileChange(face, event)}
    />

    {#if overrideSrc}
      <div class="thumb-row">
        <img
          class="thumb"
          src={overrideSrc}
          alt="{deviceLabel} {face} image override preview"
        />
        <div class="slot-actions">
          <span class="slot-status">Override set</span>
          <div class="button-row">
            <button
              type="button"
              class="btn btn-secondary"
              onclick={() => chooseFile(face)}
            >
              Replace
            </button>
            <button
              type="button"
              class="btn btn-clear"
              onclick={() => clearOverride(face)}
            >
              Clear
            </button>
          </div>
        </div>
      </div>
    {:else}
      <div class="thumb-row">
        <div class="thumb thumb-empty" aria-hidden="true">
          {#if fallbackSrc}
            <img class="thumb-fallback" src={fallbackSrc} alt="" />
          {:else}
            <span class="thumb-placeholder">No image</span>
          {/if}
        </div>
        <div class="slot-actions">
          <span class="slot-status slot-status-muted">
            {fallbackSrc ? "Using device type image" : "No device type image"}
          </span>
          <div class="button-row">
            <button
              type="button"
              class="btn btn-secondary"
              onclick={() => chooseFile(face)}
            >
              Set override
            </button>
          </div>
        </div>
      </div>
    {/if}

    {#if errors[face]}
      <span class="error-message" role="alert">{errors[face]}</span>
    {/if}
  </div>
{/snippet}

<div class="image-overrides">
  {@render imageSlot("front", placementFrontImage, deviceTypeFrontImage)}
  {@render imageSlot("rear", placementRearImage, deviceTypeRearImage)}
</div>

<style>
  .image-overrides {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .slot {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .slot-label {
    font-weight: 500;
    color: var(--colour-text);
    font-size: var(--font-size-base);
  }

  .thumb-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .thumb {
    flex-shrink: 0;
    width: 80px;
    height: 60px;
    object-fit: contain;
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    background: var(--colour-surface-secondary);
  }

  .thumb-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    border-style: dashed;
    overflow: hidden;
  }

  .thumb-fallback {
    width: 100%;
    height: 100%;
    object-fit: contain;
    opacity: 0.55;
  }

  .thumb-placeholder {
    font-size: var(--font-size-2xs);
    color: var(--colour-text-muted);
    text-align: center;
    padding: var(--space-1);
  }

  .slot-actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-1-5);
    min-width: 0;
  }

  .slot-status {
    font-size: var(--font-size-sm);
    color: var(--colour-text);
  }

  .slot-status-muted {
    color: var(--colour-text-muted);
  }

  .button-row {
    display: flex;
    gap: var(--space-2);
  }

  .btn {
    /* min-height meets the 44px touch target on mobile (a11y standards). */
    min-height: 44px;
    padding: var(--space-1-5) var(--space-3);
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
    font-weight: 500;
    cursor: pointer;
    transition: background-color 120ms ease;
  }

  .btn-secondary {
    background: var(--button-bg);
    color: var(--colour-text);
    border-color: var(--button-border);
  }

  .btn-secondary:hover {
    background: var(--button-bg-hover);
  }

  .btn-clear {
    background: transparent;
    color: var(--colour-error);
    border-color: var(--colour-error);
  }

  .btn-clear:hover {
    background: var(--colour-error-bg);
  }

  .btn:focus-visible {
    outline: 2px solid var(--colour-focus-ring);
    outline-offset: 2px;
  }

  .error-message {
    font-size: var(--font-size-sm);
    color: var(--colour-error);
  }

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
</style>
