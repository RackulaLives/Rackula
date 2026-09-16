<!--
  ImageCropDialog Component
  Pan and zoom a device image behind a fixed crop frame, then export the framed
  area. The frame takes the drawn shape of the device image: its U height by the
  rack interior width plus the image overflow.
-->
<script lang="ts">
  import Dialog from "./Dialog.svelte";
  import Button from "./ui/Button.svelte";
  import { STANDARD_RACK_WIDTH } from "$lib/types/constants";
  import { validateImageFile } from "$lib/utils/imageUpload";
  import {
    MAX_CROP_ZOOM,
    cropImageToFile,
    fitFrame,
    getCoverScale,
    getCropRect,
    getCropUnitHeight,
    getDeviceImageAspect,
    getVisibleFraction,
    panView,
    wheelDeltaPixels,
    zoomView,
    type CropView,
    type Size,
  } from "$lib/utils/image-crop";

  interface Props {
    /** Image to crop. The dialog is open while this is set. */
    file: File | null;
    face: "front" | "rear";
    uHeight: number;
    /** Nominal rack width in inches. */
    rackWidth?: number;
    /** Other rack widths the image is also drawn in, shown as guides. */
    guideRackWidths?: number[];
    /** The device's share of the rack interior: 1 spans the rails, 0.5 is half. */
    widthFraction?: number;
    /** How the frame width was decided, for the hint under the title. */
    widthLabel?: string;
    onconfirm?: (file: File) => void;
    oncancel?: () => void;
  }

  let {
    file,
    face,
    uHeight,
    rackWidth = STANDARD_RACK_WIDTH,
    guideRackWidths = [],
    widthFraction = 1,
    widthLabel,
    onconfirm,
    oncancel,
  }: Props = $props();

  const STAGE_HEIGHT = 300;
  const STAGE_PADDING = 24;
  const KEY_PAN_STEP = 10;
  const KEY_PAN_STEP_LARGE = 50;
  const KEY_ZOOM_FACTOR = 1.1;

  const units = $derived(getCropUnitHeight(uHeight));
  const aspect = $derived(
    getDeviceImageAspect(units, rackWidth, widthFraction),
  );

  // What the frame is shaped for, for the hint under the title.
  const frameDescription = $derived(
    widthLabel ?? `a ${units}U device in a ${rackWidth} inch rack`,
  );

  // Part of the frame still visible where the image is drawn at another width
  const guides = $derived(
    guideRackWidths
      .filter((width) => width !== rackWidth)
      .map((width) => {
        const visible = getVisibleFraction(
          aspect,
          getDeviceImageAspect(units, width, widthFraction),
        );
        const left = ((1 - visible.width) / 2) * 100;
        const top = ((1 - visible.height) / 2) * 100;
        return {
          width,
          style: `left: ${left}%; top: ${top}%; width: ${visible.width * 100}%; height: ${visible.height * 100}%;`,
        };
      }),
  );

  const uLines = $derived(
    Array.from({ length: Math.max(0, Math.ceil(units) - 1) }, (_, i) => i + 1),
  );

  let stageEl = $state<HTMLDivElement | null>(null);
  let stageWidth = $state(0);
  let imageEl = $state<HTMLImageElement | null>(null);
  let imageUrl = $state<string | null>(null);
  let natural = $state<Size | null>(null);
  let loadError = $state<string | null>(null);
  let applying = $state(false);
  // Bumped each time the dialog opens, so an Apply that finishes after the
  // dialog closed or reopened is dropped.
  let session = 0;

  // View kept in image terms so it survives a stage resize: zoom is a multiple
  // of the cover scale, (centreX, centreY) is the natural image point at the
  // frame centre.
  let zoom = $state(1);
  let centreX = $state(0);
  let centreY = $state(0);

  const frame = $derived<Size>(
    fitFrame(aspect, {
      width: Math.max(1, stageWidth - STAGE_PADDING * 2),
      height: STAGE_HEIGHT - STAGE_PADDING * 2,
    }),
  );
  const frameLeft = $derived((stageWidth - frame.width) / 2);
  const frameTop = $derived((STAGE_HEIGHT - frame.height) / 2);

  const view = $derived.by<CropView | null>(() => {
    if (!natural) return null;
    const scale = getCoverScale(natural, frame) * zoom;
    return {
      x: frame.width / 2 - centreX * scale,
      y: frame.height / 2 - centreY * scale,
      scale,
    };
  });

  function setView(next: CropView) {
    if (!natural) return;
    zoom = next.scale / getCoverScale(natural, frame);
    centreX = (frame.width / 2 - next.x) / next.scale;
    centreY = (frame.height / 2 - next.y) / next.scale;
  }

  function resetView() {
    if (!natural) return;
    zoom = 1;
    centreX = natural.width / 2;
    centreY = natural.height / 2;
  }

  // Load the chosen file each time the dialog opens. On close the URL is
  // released but the loaded image stays on screen for the exit transition.
  $effect(() => {
    const current = file;
    pointers.clear();
    if (!current) return;
    session += 1;
    natural = null;
    loadError = null;
    applying = false;
    const url = URL.createObjectURL(current);
    imageUrl = url;
    return () => URL.revokeObjectURL(url);
  });

  function handleImageLoad() {
    if (!imageEl) return;
    natural = { width: imageEl.naturalWidth, height: imageEl.naturalHeight };
    resetView();
  }

  function handleImageError() {
    loadError = "Failed to load image";
  }

  function zoomTo(nextZoom: number, anchorX: number, anchorY: number) {
    if (!natural || !view) return;
    const nextScale = getCoverScale(natural, frame) * nextZoom;
    setView(zoomView(view, nextScale, anchorX, anchorY, natural, frame));
  }

  function zoomAtCentre(nextZoom: number) {
    zoomTo(nextZoom, frame.width / 2, frame.height / 2);
  }

  function pan(dx: number, dy: number) {
    if (!natural || !view) return;
    setView(panView(view, dx, dy, natural, frame));
  }

  /** Pointer position relative to the frame's top-left corner. */
  function toFramePoint(clientX: number, clientY: number) {
    const rect = stageEl?.getBoundingClientRect();
    return {
      x: clientX - (rect?.left ?? 0) - frameLeft,
      y: clientY - (rect?.top ?? 0) - frameTop,
    };
  }

  type Point = { x: number; y: number };

  // Active pointers for drag (one) and pinch (two). Cleared whenever the dialog
  // opens or closes, so a pointer lifted after the stage unmounted cannot linger.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- gesture bookkeeping, never rendered
  const pointers = new Map<number, Point>();

  function pinchState() {
    const [a, b] = [...pointers.values()] as [Point, Point];
    return {
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
    };
  }

  function handlePointerDown(event: PointerEvent) {
    if (!natural || event.button > 0) return;
    stageEl?.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  }

  function handlePointerMove(event: PointerEvent) {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;

    if (pointers.size === 1) {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      pan(event.clientX - previous.x, event.clientY - previous.y);
      return;
    }

    if (pointers.size === 2 && view) {
      const before = pinchState();
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const after = pinchState();
      // Pan to the new midpoint first, then zoom about it. The two do not
      // commute: zooming first leaves the anchor short by (midDelta * (1 - r))
      // each frame, which drifts visibly over a fast pinch-and-drag.
      pan(after.midX - before.midX, after.midY - before.midY);
      if (before.distance > 0) {
        const anchor = toFramePoint(after.midX, after.midY);
        zoomTo(zoom * (after.distance / before.distance), anchor.x, anchor.y);
      }
    }
  }

  function handlePointerEnd(event: PointerEvent) {
    pointers.delete(event.pointerId);
    if (stageEl?.hasPointerCapture(event.pointerId)) {
      stageEl.releasePointerCapture(event.pointerId);
    }
  }

  // Wheel zoom needs a non-passive listener so the dialog does not scroll.
  $effect(() => {
    const el = stageEl;
    if (!el) return;
    function handleWheel(event: WheelEvent) {
      if (!natural) return;
      event.preventDefault();
      const anchor = toFramePoint(event.clientX, event.clientY);
      // Normalise the delta unit first: Firefox reports lines, not pixels, and
      // reading 3 lines as 3 pixels makes the wheel look dead (#3311).
      const deltaY = wheelDeltaPixels(
        event.deltaY,
        event.deltaMode,
        window.innerHeight,
      );
      zoomTo(zoom * Math.exp(-deltaY * 0.0015), anchor.x, anchor.y);
    }
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  });

  function handleKeyDown(event: KeyboardEvent) {
    // Keep stage keys away from the app's global shortcuts, which would move or
    // delete the selected device. Escape and Tab still reach the dialog.
    if (event.key !== "Escape" && event.key !== "Tab") {
      event.stopPropagation();
    }
    const step = event.shiftKey ? KEY_PAN_STEP_LARGE : KEY_PAN_STEP;
    switch (event.key) {
      case "ArrowLeft":
        pan(-step, 0);
        break;
      case "ArrowRight":
        pan(step, 0);
        break;
      case "ArrowUp":
        pan(0, -step);
        break;
      case "ArrowDown":
        pan(0, step);
        break;
      case "+":
      case "=":
        zoomAtCentre(zoom * KEY_ZOOM_FACTOR);
        break;
      case "-":
        zoomAtCentre(zoom / KEY_ZOOM_FACTOR);
        break;
      case "0":
        resetView();
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  async function handleApply() {
    if (!file || !imageEl || !natural || !view) return;
    const started = session;
    applying = true;
    loadError = null;
    try {
      const crop = getCropRect(view, natural, frame);
      const cropped = await cropImageToFile(imageEl, crop, aspect, file);
      if (started !== session || !file) return;
      const validation = validateImageFile(cropped);
      if (!validation.valid) {
        loadError = validation.error ?? "Failed to crop image";
        return;
      }
      onconfirm?.(cropped);
    } catch {
      if (started === session) loadError = "Failed to crop image";
    } finally {
      if (started === session) applying = false;
    }
  }
</script>

<Dialog
  open={file !== null}
  title="Crop {face} image"
  size="L"
  testid="image-crop-dialog"
  onclose={() => oncancel?.()}
>
  <div class="crop">
    <p class="crop-hint">
      Drag to move the image. Scroll, pinch, or use the slider to zoom. The
      frame matches {frameDescription}.
      {#each guides as guide (guide.width)}
        The dashed box shows the part visible in a {guide.width} inch rack.
      {/each}
    </p>

    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (role="application" makes this interactive per WAI-ARIA) -->
    <div
      class="crop-stage"
      class:ready={natural !== null}
      role="application"
      tabindex="0"
      aria-label="Image crop area. Arrow keys move the image, plus and minus zoom, 0 resets."
      style="height: {STAGE_HEIGHT}px"
      bind:this={stageEl}
      bind:clientWidth={stageWidth}
      onpointerdown={handlePointerDown}
      onpointermove={handlePointerMove}
      onpointerup={handlePointerEnd}
      onpointercancel={handlePointerEnd}
      onlostpointercapture={handlePointerEnd}
      onkeydown={handleKeyDown}
    >
      {#if imageUrl}
        <img
          bind:this={imageEl}
          class="crop-image"
          src={imageUrl}
          alt=""
          draggable="false"
          onload={handleImageLoad}
          onerror={handleImageError}
          style={view && natural
            ? `width: ${natural.width * view.scale}px; height: ${natural.height * view.scale}px; transform: translate(${frameLeft + view.x}px, ${frameTop + view.y}px);`
            : "visibility: hidden;"}
        />
      {/if}
      <div
        class="crop-frame"
        aria-hidden="true"
        style="left: {frameLeft}px; top: {frameTop}px; width: {frame.width}px; height: {frame.height}px;"
      >
        <!-- Dashed line at each U boundary inside the frame -->
        {#each uLines as u (u)}
          <span class="crop-u-line" style="top: {(u / units) * 100}%"></span>
        {/each}
        {#each guides as guide (guide.width)}
          <span class="crop-guide" style={guide.style}></span>
        {/each}
      </div>
    </div>

    <div class="crop-zoom">
      <button
        type="button"
        class="zoom-step"
        aria-label="Zoom out"
        disabled={!natural || zoom <= 1}
        onclick={() => zoomAtCentre(zoom / KEY_ZOOM_FACTOR)}>-</button
      >
      <input
        type="range"
        class="zoom-slider"
        aria-label="Zoom"
        aria-valuetext="{zoom.toFixed(1)} times"
        min="1"
        max={MAX_CROP_ZOOM}
        step="0.01"
        value={zoom}
        disabled={!natural}
        oninput={(event) =>
          zoomAtCentre(parseFloat((event.target as HTMLInputElement).value))}
      />
      <button
        type="button"
        class="zoom-step"
        aria-label="Zoom in"
        disabled={!natural || zoom >= MAX_CROP_ZOOM}
        onclick={() => zoomAtCentre(zoom * KEY_ZOOM_FACTOR)}>+</button
      >
    </div>

    {#if loadError}
      <span class="error-message" role="alert">{loadError}</span>
    {/if}

    <div class="crop-actions">
      <Button variant="secondary" disabled={!natural} onclick={resetView}>
        Reset
      </Button>
      <span class="crop-actions-spacer"></span>
      <Button variant="secondary" onclick={() => oncancel?.()}>Cancel</Button>
      <Button
        variant="primary"
        data-testid="btn-apply-crop"
        disabled={!natural || applying}
        onclick={handleApply}
      >
        Apply
      </Button>
    </div>
  </div>
</Dialog>

<style>
  .crop {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .crop-hint {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--colour-text-muted);
  }

  .crop-stage {
    position: relative;
    overflow: hidden;
    border-radius: var(--radius-md);
    background: var(--colour-bg-darker);
    touch-action: none;
    user-select: none;
    cursor: default;
  }

  .crop-stage.ready {
    cursor: grab;
  }

  .crop-stage.ready:active {
    cursor: grabbing;
  }

  .crop-stage:focus-visible {
    outline: 2px solid var(--colour-focus-ring);
    outline-offset: 2px;
  }

  .crop-image {
    position: absolute;
    top: 0;
    left: 0;
    max-width: none;
    transform-origin: 0 0;
    pointer-events: none;
  }

  /* The shadow dims everything outside the frame. */
  .crop-frame {
    position: absolute;
    box-sizing: border-box;
    border: 2px solid var(--colour-selection);
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.55);
    pointer-events: none;
  }

  .crop-u-line {
    position: absolute;
    left: 0;
    right: 0;
    border-top: 1px dashed rgba(255, 255, 255, 0.5);
  }

  .crop-guide {
    position: absolute;
    box-sizing: border-box;
    border: 1px dashed var(--colour-warning);
  }

  .crop-zoom {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .zoom-slider {
    flex: 1;
    /* A range input drags from anywhere in its box, so a 44px height gives the
       control the same touch target as the zoom buttons beside it. The native
       thumb alone is about 16px, short of the gate. Sizing the box rather than
       the thumb keeps the platform appearance. */
    height: 44px;
    accent-color: var(--colour-selection);
  }

  .zoom-step {
    min-width: 44px;
    min-height: 44px;
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-md);
    background: var(--colour-button-bg);
    color: var(--colour-text);
    font-size: var(--font-size-lg);
    cursor: pointer;
  }

  .zoom-step:hover:not(:disabled) {
    background: var(--colour-button-hover);
  }

  .zoom-step:disabled {
    color: var(--colour-text-disabled);
    cursor: not-allowed;
  }

  .zoom-step:focus-visible {
    outline: 2px solid var(--colour-focus-ring);
    outline-offset: 2px;
  }

  .error-message {
    font-size: var(--font-size-sm);
    color: var(--colour-error);
  }

  .crop-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  .crop-actions-spacer {
    flex: 1;
  }
</style>
