<!--
  EditPanelImage Component
  Edit panel section: front/rear placement image overrides for the selected device.
-->
<script lang="ts">
  import ImageUpload from "./ImageUpload.svelte";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getImageStore } from "$lib/stores/images.svelte";
  import { placementKey } from "$lib/utils/placement-key";
  import type { SelectedDeviceInfo } from "$lib/types";
  import type { ImageData } from "$lib/types/images";

  interface Props {
    selectedDeviceInfo: SelectedDeviceInfo;
  }

  let { selectedDeviceInfo }: Props = $props();

  const layoutStore = getLayoutStore();
  const imageStore = getImageStore();

  const layoutId = $derived(layoutStore.layout.metadata?.id ?? "");

  // Get the current placement images (if any)
  const placementFrontImage = $derived.by(() =>
    imageStore.getDeviceImage(
      placementKey(layoutId, selectedDeviceInfo.placedDevice.id),
      "front",
    ),
  );

  const placementRearImage = $derived.by(() =>
    imageStore.getDeviceImage(
      placementKey(layoutId, selectedDeviceInfo.placedDevice.id),
      "rear",
    ),
  );

  // Handle placement image upload
  function handlePlacementImageUpload(face: "front" | "rear", data: ImageData) {
    const deviceId = selectedDeviceInfo.placedDevice.id;
    imageStore.setDeviceImage(placementKey(layoutId, deviceId), face, data);
    layoutStore.updateDevicePlacementImage(
      selectedDeviceInfo.rack.id,
      selectedDeviceInfo.deviceIndex,
      face,
      data.filename,
    );
  }

  // Handle placement image removal
  function handlePlacementImageRemove(face: "front" | "rear") {
    const deviceId = selectedDeviceInfo.placedDevice.id;
    imageStore.removeDeviceImage(placementKey(layoutId, deviceId), face);
    layoutStore.updateDevicePlacementImage(
      selectedDeviceInfo.rack.id,
      selectedDeviceInfo.deviceIndex,
      face,
      undefined,
    );
  }
</script>

<!-- Placement Image Overrides -->
<div class="form-group">
  <ImageUpload
    face="front"
    currentImage={placementFrontImage}
    onupload={(data) => handlePlacementImageUpload("front", data)}
    onremove={() => handlePlacementImageRemove("front")}
  />
  <p class="helper-text">
    Override the device type front image for this placement
  </p>
</div>

<div class="form-group">
  <ImageUpload
    face="rear"
    currentImage={placementRearImage}
    onupload={(data) => handlePlacementImageUpload("rear", data)}
    onremove={() => handlePlacementImageRemove("rear")}
  />
  <p class="helper-text">
    Override the device type rear image for this placement
  </p>
</div>

<style>
  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-1-5);
  }

  .helper-text {
    font-size: var(--font-size-sm);
    margin: 0;
    color: var(--colour-text-muted);
  }
</style>
