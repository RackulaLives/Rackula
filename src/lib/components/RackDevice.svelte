<!--
  RackDevice SVG Component
  Renders a device within a rack at the specified U position
-->
<script lang="ts">
  import type {
    DeviceType,
    DisplayMode,
    PlacedDevice,
    PlacedPort,
    PortClickInfo,
    RackView,
  } from "$lib/types";
  import { getChildYInSlot, getSlotRects } from "$lib/utils/slot-geometry";
  import PortIndicators from "./PortIndicators.svelte";
  import ContainerSlots from "./ContainerSlots.svelte";
  import {
    colAtX,
    createRackDeviceDragData,
    rowAtY,
    setCurrentDragData,
  } from "$lib/utils/dragdrop";
  import {
    showDragTooltip,
    updateDragTooltipPosition,
    hideDragTooltip,
  } from "$lib/stores/dragTooltip.svelte";
  import CategoryIconSVG from "./CategoryIconSVG.svelte";
  import LabelOverlaySVG from "./LabelOverlaySVG.svelte";
  import { getImageStore } from "$lib/stores/images.svelte";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getCanvasStore } from "$lib/stores/canvas.svelte";
  import { getPlacementStore } from "$lib/stores/placement.svelte";
  import { getConnectionCreationStore } from "$lib/stores/connection-creation.svelte";
  import { placementKey } from "$lib/utils/placement-key";
  import { getViewportStore } from "$lib/utils/viewport.svelte";
  import { useLongPress } from "$lib/utils/gestures";
  import { hapticTap } from "$lib/utils/haptics";
  import { DEVICE_IMAGE_OVERFLOW, RAIL_WIDTH } from "$lib/constants/layout";
  import {
    fitTextToWidth,
    DEVICE_LABEL_MAX_FONT,
    DEVICE_LABEL_MIN_FONT,
    DEVICE_LABEL_IMAGE_MAX_FONT,
    DEVICE_LABEL_ICON_SPACE_LEFT,
    DEVICE_LABEL_ICON_SPACE_RIGHT,
  } from "$lib/utils/text-sizing";
  import { toHumanUnits } from "$lib/utils/position";
  import { Tween, prefersReducedMotion } from "svelte/motion";
  import { cubicOut } from "svelte/easing";

  interface Props {
    device: DeviceType;
    position: number;
    rackHeight: number;
    rackId: string;
    deviceIndex: number;
    selected: boolean;
    uHeight: number;
    rackWidth: number;
    displayMode?: DisplayMode;
    rackView?: RackView;
    showLabelsOnImages?: boolean;
    placedDeviceName?: string;
    placedDeviceId?: string;
    /** This placement's custom front image reference, if it sets one. */
    frontImageRef?: string;
    /** This placement's custom rear image reference, if it sets one. */
    rearImageRef?: string;
    /** Custom colour override for this placement (overrides device type colour) */
    colourOverride?: string;
    /** Device library for looking up child device types */
    deviceLibrary?: DeviceType[];
    /** Child devices placed inside this container (if container) */
    containerChildDevices?: Array<{
      placedDevice: PlacedDevice;
      originalIndex: number;
    }>;
    /** ID of currently selected child device (for highlighting) */
    selectedChildId?: string | null;
    /** Instantiated port instances for this placement (PlacedDevice.ports), passed alongside device.interfaces (#3089) */
    ports?: PlacedPort[];
    /** Whether a device is being dragged over this container (shows slot overlay) */
    isDragOverContainer?: boolean;
    /** The slot ID currently targeted during drag (null if none) */
    dragTargetSlotId?: string | null;
    /** Whether the current drag target slot is valid for the dragged device */
    isDragTargetValid?: boolean;
    onselect?: (
      event: CustomEvent<{
        deviceId?: string;
        slug: string;
        position: number;
        face: "front" | "rear";
      }>,
    ) => void;
    ondragstart?: (
      event: CustomEvent<{ rackId: string; deviceIndex: number }>,
    ) => void;
    ondragend?: () => void;
    onduplicate?: (
      event: CustomEvent<{ rackId: string; deviceIndex: number }>,
    ) => void;
    /** Context menu event with coordinates and device info */
    oncontextmenuopen?: (
      event: CustomEvent<{
        rackId: string;
        deviceIndex: number;
        x: number;
        y: number;
      }>,
    ) => void;
    onPortClick?: (info: PortClickInfo) => void;
  }

  let {
    device,
    position,
    rackHeight,
    rackId,
    deviceIndex,
    selected,
    uHeight,
    rackWidth,
    displayMode = "label",
    rackView = "front",
    showLabelsOnImages = false,
    placedDeviceName,
    placedDeviceId,
    frontImageRef,
    rearImageRef,
    colourOverride,
    deviceLibrary = [],
    containerChildDevices = [],
    selectedChildId = null,
    ports = [],
    isDragOverContainer = false,
    dragTargetSlotId = null,
    isDragTargetValid = false,
    onselect,
    ondragstart: ondragstartProp,
    ondragend: ondragendProp,
    onduplicate,
    oncontextmenuopen,
    onPortClick,
  }: Props = $props();

  // Device display name: model or slug
  const deviceName = $derived(device.model ?? device.slug);

  // Display name: custom name if set, otherwise device type name
  const displayName = $derived(placedDeviceName ?? deviceName);

  // Effective colour: placement override or device type colour
  const effectiveColour = $derived(colourOverride ?? device.colour);

  const imageStore = getImageStore();
  const layoutStore = getLayoutStore();
  const placementStore = getPlacementStore();
  const connectionCreationStore = getConnectionCreationStore();

  // Check if display mode shows images (either 'image' or 'image-label')
  const isImageMode = $derived(
    displayMode === "image" || displayMode === "image-label",
  );

  // The physical face currently in view.
  const currentFace = $derived(rackView === "rear" ? "rear" : "front");

  // The back of a full-depth device gets a distinct treatment in the rear view.
  // Keyed on full-depth, so a rear-mounted half-depth device (whose real front
  // you see from the back) is not differentiated.
  const isRearTreatment = $derived(
    currentFace === "rear" && device.is_full_depth !== false,
  );

  // The placement-specific custom image URL for the current face, if present in
  // the store. Kept separate from the device-type fallback so that a missing or
  // failed placement image surfaces as a placeholder instead of silently showing
  // the device-type image in its place.
  const placementImageUrl = $derived.by(() => {
    if (!isImageMode || !placedDeviceId) return null;
    const layoutId = layoutStore.layout.metadata?.id;
    if (!layoutId) return null;
    return (
      imageStore.getImageUrl(
        placementKey(layoutId, placedDeviceId),
        currentFace,
      ) ?? null
    );
  });

  // This placement references a custom image for the face in view.
  const hasImageRefForFace = $derived(
    currentFace === "rear" ? !!rearImageRef : !!frontImageRef,
  );

  // Image to render for the current view.
  // - If the placement references a custom image for this face, that image wins;
  //   while it is absent (loading or failed) we render a placeholder rather than
  //   the device-type image, so the user sees the load state of their own image.
  // - Otherwise fall back to the device-type image (or null, which shows a label).
  const deviceImageUrl = $derived.by(() => {
    if (!isImageMode) return null;
    if (placementImageUrl) return placementImageUrl;
    if (hasImageRefForFace) return null;
    return imageStore.getImageUrl(device.slug, currentFace);
  });

  // Should show image or fall back to label
  const showImage = $derived(isImageMode && deviceImageUrl);

  // Mute the colour body only when no real rear image is shown; the image
  // already differentiates the back, so it stays at full fidelity.
  const isRearMuted = $derived(isRearTreatment && !showImage);

  // The face is expected to carry an image but none is in the store yet: it is
  // still being fetched, or its fetch failed and will retry on the next reopen.
  // Show a graceful placeholder rather than a blank cell or a broken image.
  const showImagePlaceholder = $derived(
    isImageMode && hasImageRefForFace && !placementImageUrl,
  );

  // Accessible name for the device image, naming the device and the face shown.
  const imageAccessibleName = $derived(`${displayName}, ${currentFace} image`);

  // Track dragging state for visual feedback
  let isDragging = $state(false);

  // Viewport detection for mobile-specific interactions
  const viewportStore = getViewportStore();
  const canvasStore = getCanvasStore();

  // SVG group element ref for long-press gesture
  let groupElement: SVGGElement | null = $state(null);
  let longPressPoint = $state<{ x: number; y: number } | null>(null);

  // Rect element ref for pointer capture (Safari 18.x fix #411)
  let rectElement: SVGRectElement | null = $state(null);

  // Pointer tracking for click vs drag detection
  const DRAG_THRESHOLD = 3; // pixels - movement beyond this initiates drag
  type PointerState = "idle" | "pressing" | "dragging";
  let pointerState: PointerState = $state("idle");
  // Tracks whether the long-press gesture fired for the current pointer
  // interaction, so pointerup does not emit a second tap haptic on top of the
  // long-press haptic.
  let longPressFired = $state(false);
  let pointerStartPos: { x: number; y: number } | null = $state(null);
  let activePointerId: number | null = $state(null);

  // A press that starts on a carrier child acts on that child, not on this
  // carrier (#3340): a tap selects the child and a drag moves it through the
  // same drop paths as a rack-level device. Null for a press on this device.
  type PressedChild = {
    placedDevice: PlacedDevice;
    originalIndex: number;
    deviceType: DeviceType;
  };
  let pressedChild = $state.raw<PressedChild | null>(null);
  // Element holding pointer capture for the current press: this device's
  // hitbox rect, or the rect of the pressed child.
  let captureElement: Element | null = null;

  // What the current press acts on: the pressed child, or this device.
  function pressSubject() {
    if (pressedChild) {
      return {
        device: pressedChild.deviceType,
        deviceIndex: pressedChild.originalIndex,
        deviceId: pressedChild.placedDevice.id,
        position: pressedChild.placedDevice.position,
      };
    }
    return { device, deviceIndex, deviceId: placedDeviceId, position };
  }

  // Whether the pointer is over a given cell of this container on screen.
  // The cell under the pointer is resolved with the same colAtX / rowAtY and
  // slot lookup as drop targeting (detectContainerDropTarget), so the two
  // cannot disagree. Covers the whole cell, not only the child in it, since a
  // child can be shorter than its cell.
  function isPointerOverCell(
    slotId: string | undefined,
    event: PointerEvent,
  ): boolean {
    if (!slotId || !rectElement) return false;
    const rect = rectElement.getBoundingClientRect();
    if (
      rect.width === 0 ||
      rect.height === 0 ||
      event.clientX < rect.left ||
      event.clientX >= rect.right ||
      event.clientY < rect.top ||
      event.clientY >= rect.bottom
    ) {
      return false;
    }

    // The pointer in rack units: x across the interior (this device's width),
    // y from the top of the rack (this device's top edge is yPosition).
    const x = ((event.clientX - rect.left) / rect.width) * deviceWidth;
    const y =
      yPosition + ((event.clientY - rect.top) / rect.height) * deviceHeight;
    const slots = device.slots ?? [];
    const col = colAtX(slots, x, deviceWidth);
    const row = rowAtY(
      slots,
      y,
      rackHeight,
      uHeight,
      positionHuman,
      device.u_height,
    );
    const aimed =
      col === null
        ? undefined
        : slots.find((s) => s.position.col === col && s.position.row === row);
    return aimed?.id === slotId;
  }

  // Convert position from internal units (1/6U) to human U units for rendering
  // PlacedDevice.position is stored in internal units (e.g., 6 = U1, 252 = U42)
  const positionHuman = $derived(toHumanUnits(position));

  // Position calculation (SVG y-coordinate, origin at top)
  // y = (rackHeight - positionHuman - device.u_height + 1) * uHeight
  const yPosition = $derived(
    (rackHeight - positionHuman - device.u_height + 1) * uHeight,
  );

  // Settle committed moves (drop, keyboard nudge, undo). Positions are
  // whole-U integers that change only on commit, never per-frame during a
  // drag, so the tween never fights the pointer.
  const yMotion = Tween.of(() => yPosition, {
    duration: 120,
    easing: cubicOut,
  });
  const deviceHeight = $derived(device.u_height * uHeight);
  // Full interior width (between rails)
  const fullWidth = $derived(rackWidth - RAIL_WIDTH * 2);

  // Carrier-first: a rail-mounted device always spans the full interior width.
  // Sub-U / half-width gear mounts inside a carrier (a full-width container);
  // its children are sized by slotGeometry relative to this full width.
  const deviceWidth = $derived(fullWidth);
  const slotXOffset = 0;

  // Container helper: each slot's cell rectangle, placed by row and column
  const slotGeometry = $derived(
    getSlotRects(device.slots ?? [], deviceWidth, deviceHeight),
  );

  // Helper to get child device type from library
  function getChildDeviceType(slug: string): DeviceType | undefined {
    return deviceLibrary.find((d) => d.slug === slug);
  }

  /**
   * Image for a container child, on the same precedence as the parent's own:
   * a placement override for this face wins, otherwise the device-type image.
   * A child that references an override still missing from the store draws no
   * image, so its load state is not masked by the device-type one.
   */
  function getChildImageUrl(
    child: PlacedDevice,
    childType: DeviceType,
  ): string | null {
    if (!isImageMode) return null;
    const layoutId = layoutStore.layout.metadata?.id;
    const override = layoutId
      ? imageStore.getImageUrl(placementKey(layoutId, child.id), currentFace)
      : undefined;
    if (override) return override;
    const referencesOverride =
      currentFace === "rear" ? !!child.rear_image : !!child.front_image;
    if (referencesOverride) return null;
    return imageStore.getImageUrl(childType.slug, currentFace) ?? null;
  }

  // Slot display name for a container child, falling back to the raw slot id
  // when the slot has no display name (mirrors EditPanelPosition's
  // containerContext.slotName precedence).
  function getSlotName(slotId: string | undefined): string {
    const slot = device.slots?.find((s) => s.id === slotId);
    return slot?.name ?? slotId ?? "Unknown";
  }

  // Calculate available width for centered text (accounting for icon areas)
  // Uses shared constants from text-sizing.ts for consistency with exports
  const textAvailableWidth = $derived(
    deviceWidth - DEVICE_LABEL_ICON_SPACE_LEFT - DEVICE_LABEL_ICON_SPACE_RIGHT,
  );

  // Fit display name to available width with auto-sizing
  const fittedLabel = $derived(
    fitTextToWidth(displayName, {
      maxFontSize: DEVICE_LABEL_MAX_FONT,
      minFontSize: DEVICE_LABEL_MIN_FONT,
      availableWidth: textAvailableWidth,
    }),
  );

  // Image overlay uses slightly smaller max font and full width (no icons in image mode)
  const fittedImageLabel = $derived(
    fitTextToWidth(displayName, {
      maxFontSize: DEVICE_LABEL_IMAGE_MAX_FONT,
      minFontSize: DEVICE_LABEL_MIN_FONT,
      availableWidth: deviceWidth - 16, // Small padding on edges
    }),
  );

  // Image dimensions extend past device rect for realistic appearance
  const imageX = $derived(showImage ? -DEVICE_IMAGE_OVERFLOW : 0);
  const imageWidth = $derived(
    showImage ? deviceWidth + DEVICE_IMAGE_OVERFLOW * 2 : deviceWidth,
  );

  // Unique clipPath ID for this device instance. $props.id() is per component
  // instance, so dual-view front/rear renders and same-type-same-U devices in
  // different racks can never collide (duplicate SVG ids clip with the wrong
  // geometry).
  const uid = $props.id();
  const clipId = `clip-${uid}`;

  // Detect if this device is a container (has slots)
  const isContainer = $derived(
    Array.isArray(device.slots) && device.slots.length > 0,
  );

  // Aria label for accessibility - includes container hierarchy for child devices
  const ariaLabel = $derived.by(() => {
    const base = `${displayName}, ${device.u_height}U ${device.category}`;

    // Convey the device image and the face shown: the SVG <image> has no native
    // accessible name, so the device button announces it instead.
    const imageState = showImage
      ? `, showing ${currentFace} image`
      : showImagePlaceholder
        ? `, ${currentFace} image loading`
        : "";

    const rearState =
      isRearTreatment && !showImage && !showImagePlaceholder ? ", rear" : "";

    // Rack-level device: standard announcement
    return `${base} at U${positionHuman}${imageState}${rearState}${selected ? ", selected" : ""}`;
  });

  // Handle keyboard activation (Enter/Space to select, Tab to enter container)
  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      onselect?.(
        new CustomEvent("select", {
          detail: {
            deviceId: placedDeviceId,
            slug: device.slug,
            position,
            face: currentFace,
          },
        }),
      );
    }

    // Tab into container slots when container is selected. Only from the
    // container itself: a Tab from a slot or child inside it moves on rather
    // than jumping back to the first slot (#3340).
    if (
      event.key === "Tab" &&
      !event.shiftKey &&
      isContainer &&
      selected &&
      event.target === event.currentTarget
    ) {
      // Focus first slot within this device group
      const firstSlot = groupElement?.querySelector("[data-slot-id]");
      if (firstSlot instanceof SVGElement) {
        // Only prevent default if we found a focusable slot to avoid keyboard trap
        event.preventDefault();
        (firstSlot as unknown as HTMLElement).focus();
      }
    }
  }

  // Enter/Space on a focused carrier child selects the child (#3340). Stop
  // propagation so the carrier and the rack do not also select themselves.
  function handleChildKeyDown(
    event: KeyboardEvent,
    child: PlacedDevice,
    childType: DeviceType,
  ) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    onselect?.(
      new CustomEvent("select", {
        detail: {
          deviceId: child.id,
          slug: childType.slug,
          position: child.position,
          face: currentFace,
        },
      }),
    );
  }

  // Pointer Events for unified mouse/touch handling (fixes Safari foreignObject bug #397)
  function handlePointerDown(
    event: PointerEvent,
    child: PressedChild | null = null,
  ) {
    // Only handle primary pointer (left mouse button or first touch)
    if (!event.isPrimary) return;

    // Don't interfere with port clicks
    const target = event.target as Element;
    if (target.closest(".port-indicators")) return;

    event.stopPropagation();
    event.preventDefault(); // Prevent Safari text selection during drag

    // Record starting position for click vs drag detection
    pointerStartPos = { x: event.clientX, y: event.clientY };
    pointerState = "pressing";
    activePointerId = event.pointerId;
    longPressFired = false;
    pressedChild = child;

    // Capture pointer to receive events even if cursor leaves element
    // Note: setPointerCapture may not exist in test environments (happy-dom)
    // Safari 18.x fix #411: Capture on the rect element (has explicit geometry).
    // A child's rect is the only part of it that takes pointers, so it is the
    // target here.
    captureElement = child ? target : rectElement;
    if (captureElement?.setPointerCapture) {
      captureElement.setPointerCapture(event.pointerId);
    }
  }

  function handlePointerMove(event: PointerEvent) {
    // Only track the pointer we started with
    if (event.pointerId !== activePointerId) return;
    if (!pointerStartPos) return;
    const subject = pressSubject();

    if (pointerState === "pressing") {
      // Check if we've moved beyond the drag threshold
      const distance = Math.hypot(
        event.clientX - pointerStartPos.x,
        event.clientY - pointerStartPos.y,
      );

      if (distance >= DRAG_THRESHOLD) {
        // Transition to dragging state
        pointerState = "dragging";
        isDragging = true;

        // Set up drag data for drop handling
        const dragData = createRackDeviceDragData(
          subject.device,
          rackId,
          subject.deviceIndex,
        );
        setCurrentDragData(dragData);

        // Show drag tooltip at cursor position
        showDragTooltip(subject.device, event.clientX, event.clientY);

        ondragstartProp?.(
          new CustomEvent("dragstart", {
            detail: { rackId, deviceIndex: subject.deviceIndex },
          }),
        );
      }
    }

    if (pointerState === "dragging") {
      // Update drag tooltip position
      updateDragTooltipPosition(event.clientX, event.clientY);

      // Dispatch pointermove to document for Rack to track drop position
      // The Rack listens for this via document-level handler
      document.dispatchEvent(
        new CustomEvent("rackula:dragmove", {
          detail: {
            clientX: event.clientX,
            clientY: event.clientY,
            device: subject.device,
            rackId,
            deviceIndex: subject.deviceIndex,
          },
        }),
      );
    }
  }

  function handlePointerUp(event: PointerEvent) {
    if (event.pointerId !== activePointerId) return;
    const subject = pressSubject();

    // Release pointer capture (may not exist in test environments)
    // Exception is safe to ignore: releasePointerCapture throws if the pointer
    // was already released (e.g., by pointercancel or browser gesture handling).
    // This is a normal race condition, not an error condition.
    // Safari 18.x fix #411: Release on the rect element (has explicit geometry)
    if (captureElement?.releasePointerCapture && activePointerId !== null) {
      try {
        captureElement.releasePointerCapture(activePointerId);
      } catch {
        // Already released - safe to ignore
      }
    }

    if (pointerState === "pressing") {
      // No significant movement - this is a click
      event.stopPropagation();
      // Long-press already fired its own haptic, so skip the tap haptic to
      // avoid a double vibration when the press completes as a long-press.
      if (event.pointerType === "touch" && !longPressFired) {
        hapticTap();
      }
      // Placement mode owns this gesture (#2990): a tap while a device is
      // armed for placement completes/attempts placement via the rack-level
      // handler, so selecting the tapped device (and opening its editor)
      // here would contradict the still-armed "Placing" banner.
      if (!placementStore.isPlacing) {
        onselect?.(
          new CustomEvent("select", {
            detail: {
              deviceId: subject.deviceId,
              slug: subject.device.slug,
              position: subject.position,
              face: currentFace,
            },
          }),
        );
      }
    } else if (pointerState === "dragging") {
      // A child released over its own cell stays put (#3340). Resolving it as
      // a drop would move it to another free cell or report the cell blocked.
      if (
        pressedChild &&
        isPointerOverCell(pressedChild.placedDevice.slot_id, event)
      ) {
        cancelActiveDrag();
        return;
      }

      // Complete the drag operation
      document.dispatchEvent(
        new CustomEvent("rackula:dragend", {
          detail: {
            clientX: event.clientX,
            clientY: event.clientY,
            device: subject.device,
            rackId,
            deviceIndex: subject.deviceIndex,
          },
        }),
      );

      setCurrentDragData(null);
      isDragging = false;
      hideDragTooltip();
      ondragendProp?.();
    }

    // Reset state
    pointerState = "idle";
    pointerStartPos = null;
    activePointerId = null;
    pressedChild = null;
    captureElement = null;
  }

  function handlePointerCancel(event: PointerEvent) {
    if (event.pointerId !== activePointerId) return;
    cancelActiveDrag();
  }

  // Shared reset path for a pointercancel and an Escape-cancel (#2935): both
  // abort an in-progress drag the same way, restoring pre-drag state without
  // committing a move. Escape can fire while the pointer is still physically
  // down, so it also releases capture that a real pointercancel/pointerup
  // would already have released.
  function cancelActiveDrag() {
    if (captureElement?.releasePointerCapture && activePointerId !== null) {
      try {
        captureElement.releasePointerCapture(activePointerId);
      } catch {
        // Already released - safe to ignore
      }
    }

    if (pointerState === "dragging") {
      // Tell every Rack listening for the pointer-drag events (Safari #397
      // workaround, see rack-pointer-drag.ts) to drop its local preview/hover
      // state without resolving a drop (#2935).
      document.dispatchEvent(new CustomEvent("rackula:dragcancel"));
      setCurrentDragData(null);
      isDragging = false;
      hideDragTooltip();
      ondragendProp?.();
    }

    // Reset state
    pointerState = "idle";
    pointerStartPos = null;
    activePointerId = null;
    pressedChild = null;
    captureElement = null;
  }

  // Escape-to-cancel (#2935): a window Escape handler active only while this
  // device is being dragged, so it does not interfere with unrelated Escape
  // presses (e.g. clearing selection).
  $effect(() => {
    if (!isDragging) return;

    function handleWindowKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      cancelActiveDrag();
    }

    window.addEventListener("keydown", handleWindowKeyDown);
    return () => window.removeEventListener("keydown", handleWindowKeyDown);
  });

  function openDeviceContextMenu(x: number, y: number) {
    // If context menu handler is provided, use it; otherwise fall back to duplicate
    if (oncontextmenuopen) {
      oncontextmenuopen(
        new CustomEvent("contextmenuopen", {
          detail: {
            rackId,
            deviceIndex,
            x,
            y,
          },
        }),
      );
      return;
    }

    // Fallback to legacy duplicate behavior
    onduplicate?.(
      new CustomEvent("duplicate", { detail: { rackId, deviceIndex } }),
    );
  }

  // Long-press handler for mobile/tablet (zooms view to the pressed device)
  function handleLongPress() {
    if (!longPressPoint) return;

    longPressFired = true;
    hapticTap();
    longPressPoint = null;

    const rack = layoutStore.getRackById(rackId);
    if (rack) {
      canvasStore.zoomToDevice(rack, deviceIndex, layoutStore.device_types);
    }
  }

  // A context menu on a child is the carrier's (#3340). Select the carrier
  // before opening it so the selection matches what the menu acts on, also
  // when the menu comes from the keyboard with no pointer press before it.
  // Like a pointer tap, it selects nothing while placing, and while creating
  // a connection handleContextMenu only cancels that mode.
  function handleChildContextMenu(event: MouseEvent) {
    // A press still pending on the child (Ctrl+click on macOS opens the menu
    // before the release) must not then select the child.
    if (pressedChild) cancelActiveDrag();
    if (!placementStore.isPlacing && !connectionCreationStore.isCreating) {
      onselect?.(
        new CustomEvent("select", {
          detail: {
            deviceId: placedDeviceId,
            slug: device.slug,
            position,
            face: currentFace,
          },
        }),
      );
    }
    handleContextMenu(event);
  }

  // Placement mode owns this gesture (#2990 follow-up): stopping propagation
  // unconditionally here swallowed the click before it ever reached
  // Rack.svelte's rack-level handleClick -> handlePlacementClick path, so a
  // click on an occupied device's body while armed for placement was a silent
  // no-op (no "Can't place device here" toast, no retry cue). Outside
  // placement mode, keep stopping propagation so a device click doesn't also
  // bubble into rack-level selection.
  function handleClick(event: MouseEvent) {
    if (!placementStore.isPlacing) event.stopPropagation();
  }

  // Context menu handler (right-click) - opens device context menu, unless
  // connection-creation mode is armed (#1932), in which case right-click
  // cancels the mode instead (mirrors Escape). Ports render inside this
  // device's own <g>, so a right-click on a port also reaches this handler.
  function handleContextMenu(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (connectionCreationStore.isCreating) {
      connectionCreationStore.cancelConnection();
      return;
    }
    // Use element bounds as fallback when clientX/Y are outside the device
    // (panzoom transforms can distort coordinates for half-width devices)
    let x = event.clientX;
    let y = event.clientY;
    if (groupElement) {
      const rect = groupElement.getBoundingClientRect();
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
        x = rect.left + rect.width / 2;
        y = rect.top + rect.height / 2;
      }
    }
    openDeviceContextMenu(x, y);
  }

  // Set up long-press gesture on mobile (reactive to viewport changes)
  $effect(() => {
    if (viewportStore.isMobile && groupElement) {
      const cleanup = useLongPress(groupElement, handleLongPress, {
        onStart: (x, y) => {
          longPressPoint = { x, y };
        },
        onCancel: () => {
          longPressPoint = null;
        },
      });
      return cleanup;
    }
  });
</script>

<!-- The positioned wrapper holds the device's own button and, for a container,
     its children as a sibling after it: a child control inside the device's
     role="button" would be presentational to assistive technology (#3340).
     DOM order keeps the focus order: the device, then its children. -->
<g
  bind:this={groupElement}
  class="rack-device-wrapper"
  class:dragging={isDragging && !pressedChild}
  transform="translate({RAIL_WIDTH + slotXOffset}, {prefersReducedMotion.current
    ? yPosition
    : yMotion.current})"
>
  <g
    data-device-id={device.slug}
    data-device-uuid={placedDeviceId}
    data-device-face={currentFace}
    data-device-position={position}
    data-testid="rack-device"
    class="rack-device"
    class:selected
    role="button"
    tabindex="0"
    aria-label={ariaLabel}
    aria-pressed={selected}
    onclick={handleClick}
    oncontextmenu={handleContextMenu}
    onkeydown={handleKeyDown}
  >
    <!-- Device rectangle with pointer events (Safari 18.x fix #411)
       Using explicit geometry rect for pointer events instead of <g> element
       because Safari 18.x doesn't properly compute hit areas on transformed <g> elements -->
    <rect
      bind:this={rectElement}
      data-testid="rack-device-hitbox"
      class="device-rect"
      class:rear-muted={isRearMuted}
      x="0"
      y="0"
      width={deviceWidth}
      height={deviceHeight}
      fill={effectiveColour}
      rx="2"
      ry="2"
      role="presentation"
      aria-hidden="true"
      onpointerdown={handlePointerDown}
      onpointermove={handlePointerMove}
      onpointerup={handlePointerUp}
      onpointercancel={handlePointerCancel}
    />

    <!-- Selection outline -->
    {#if selected}
      <rect
        class="device-selection"
        x="1"
        y="1"
        width={deviceWidth - 2}
        height={deviceHeight - 2}
        rx="2"
        ry="2"
      />
    {/if}

    <!-- Device content: Image, loading placeholder, or Label -->
    {#if showImage}
      <!-- ClipPath for rounded corners on device image -->
      <defs>
        <clipPath id={clipId}>
          <rect
            x={imageX}
            y="0"
            width={imageWidth}
            height={deviceHeight}
            rx="2"
            ry="2"
          />
        </clipPath>
      </defs>
      <!-- Device image: extends past rack rails for realistic front-mounting
         appearance. Keyed on the URL so the fade-in animation re-fires when a
         freshly fetched image replaces a placeholder. The fade is a CSS
         animation, so the global prefers-reduced-motion reset disables it. -->
      {#key deviceImageUrl}
        <image
          class="device-image"
          x={imageX}
          y="0"
          width={imageWidth}
          height={deviceHeight}
          href={deviceImageUrl}
          preserveAspectRatio="xMidYMid slice"
          clip-path="url(#{clipId})"
          role="img"
          aria-label={imageAccessibleName}
        />
      {/key}
      <!-- Label overlay when showLabelsOnImages is true
         Safari 18.x fix #420: Use SVG-native component instead of foreignObject
         to avoid transform inheritance bug -->
      {#if showLabelsOnImages}
        <LabelOverlaySVG
          text={fittedImageLabel.text}
          fontSize={fittedImageLabel.fontSize}
          width={deviceWidth}
          height={deviceHeight}
        />
      {/if}
    {:else if showImagePlaceholder}
      <!-- A custom image is expected here but not yet in the store (still loading,
         or its fetch failed and will retry on the next reopen). Show a quiet
         placeholder over the device rect rather than a blank cell or a broken
         image. The device button's aria-label announces the loading state. -->
      <rect
        class="device-image-placeholder"
        x="0"
        y="0"
        width={deviceWidth}
        height={deviceHeight}
        rx="2"
        ry="2"
        role="presentation"
        aria-hidden="true"
      />
      {#if deviceHeight >= 22}
        <CategoryIconSVG
          category={device.category}
          size={14}
          x={(deviceWidth - 14) / 2}
          y={(deviceHeight - 14) / 2}
        />
      {/if}
    {:else}
      <!-- Device name (centered, auto-sized) -->
      <text
        class="device-name"
        x={deviceWidth / 2}
        y={deviceHeight / 2}
        dominant-baseline="middle"
        text-anchor="middle"
        style="font-size: {fittedLabel.fontSize}px"
      >
        {fittedLabel.text}
      </text>

      <!-- Category icon (vertically centered)
         Safari 18.x fix #411: Use SVG-native component instead of foreignObject
         to avoid transform inheritance bug -->
      {#if deviceHeight >= 22}
        <CategoryIconSVG
          category={device.category}
          size={14}
          x={8}
          y={(deviceHeight - 14) / 2}
        />
      {/if}
    {/if}

    <!-- Rear affordance: marks this as the back of a full-depth device. -->
    {#if isRearTreatment}
      <text
        class="rear-badge"
        x={deviceWidth - 4}
        y="10"
        text-anchor="end"
        aria-hidden="true"
      >
        REAR
      </text>
    {/if}

    <!-- Port indicators (rendered after device content) -->
    {#if device.interfaces?.length}
      <PortIndicators
        interfaces={device.interfaces}
        {ports}
        {deviceWidth}
        {deviceHeight}
        {rackView}
        {onPortClick}
      />
    {/if}

    <!-- Container slot grid (shown when selected OR during drag-over) -->
    {#if isContainer && (selected || isDragOverContainer)}
      <ContainerSlots
        containerType={device}
        slotRects={slotGeometry}
        selectedSlotId={null}
        dropTargetSlotId={isDragOverContainer ? dragTargetSlotId : null}
        isValidDropTarget={isDragTargetValid}
      />
    {/if}
  </g>

  <!-- Container children: devices placed inside this container's slots -->
  {#if isContainer && containerChildDevices.length > 0}
    <g class="container-children">
      {#each containerChildDevices as { placedDevice: child, originalIndex: childIndex } (child.id)}
        {@const childType = getChildDeviceType(child.device_type)}
        {@const slotGeo = child.slot_id
          ? slotGeometry.get(child.slot_id)
          : undefined}
        {#if childType && slotGeo}
          {@const childHeight = childType.u_height * uHeight}
          {@const childY = getChildYInSlot(
            slotGeo,
            deviceHeight,
            // Container-relative whole U (0-indexed), not internal units:
            // migrateDevicePositions skips container children.
            child.position,
            childType.u_height,
            uHeight,
          )}
          {@const childWidth = slotGeo.width}
          {@const childX = slotGeo.x}
          {@const childImageUrl = getChildImageUrl(child, childType)}
          {@const childColour =
            child.colour_override ??
            childType.colour ??
            "var(--colour-device-default)"}
          {@const childName = child.name ?? childType.model ?? childType.slug}
          {@const isChildSelected = selectedChildId === child.id}
          {@const slotName = getSlotName(child.slot_id)}
          {@const childAriaLabel = `${childName}, ${childType.u_height}U ${childType.category} in ${slotName} of ${displayName} at U${positionHuman}`}
          <g
            class="container-child"
            class:selected={isChildSelected}
            class:dragging={isDragging &&
              pressedChild?.placedDevice.id === child.id}
            transform="translate({childX}, {childY})"
            role="button"
            tabindex="0"
            aria-label={isChildSelected
              ? `${childAriaLabel}, selected`
              : childAriaLabel}
            aria-pressed={isChildSelected}
            onpointerdown={(e) => {
              // Only the main button presses a child. A secondary press
              // leaves it to handleChildContextMenu, which selects the
              // carrier whose menu it opens.
              if (e.button !== 0) return;
              handlePointerDown(e, {
                placedDevice: child,
                originalIndex: childIndex,
                deviceType: childType,
              });
            }}
            onpointermove={handlePointerMove}
            onpointerup={handlePointerUp}
            onpointercancel={handlePointerCancel}
            onclick={handleClick}
            oncontextmenu={handleChildContextMenu}
            onkeydown={(e) => handleChildKeyDown(e, child, childType)}
          >
            <!-- Child device rectangle. Stays behind the image as the
                 backing colour, and is the whole body when there is none. -->
            <rect
              class="child-device-rect"
              x={2}
              y={1}
              width={childWidth - 4}
              height={childHeight - 2}
              fill={childColour}
              rx="2"
              ry="2"
            />
            <!-- Child device image. A carrier child is drawn in its cell, so
                 the image covers the whole cell: it is sliced to fill, and the
                 inset the backing rect uses would change the aspect it is
                 sliced into and clip more than the crop frame showed. The
                 parent device image overflows its own rect the same way. -->
            {#if childImageUrl}
              {#key childImageUrl}
                <image
                  class="child-device-image"
                  data-testid="child-device-image"
                  x={0}
                  y={0}
                  width={childWidth}
                  height={childHeight}
                  href={childImageUrl}
                  preserveAspectRatio="xMidYMid slice"
                  role="img"
                  aria-label={childAriaLabel}
                />
              {/key}
            {/if}
            <!-- Selection highlight -->
            {#if isChildSelected}
              <rect
                class="child-selection-highlight"
                x={0}
                y={0}
                width={childWidth}
                height={childHeight}
                fill="none"
                stroke="var(--colour-selection)"
                stroke-width="2"
                rx="3"
                ry="3"
              />
            {/if}
            <!-- Child device label. Hidden over an image unless labels on
                 images are on, matching how the parent device behaves. -->
            {#if !childImageUrl || showLabelsOnImages}
              <text
                class="child-device-label"
                x={childWidth / 2}
                y={childHeight / 2}
                text-anchor="middle"
                dominant-baseline="middle"
                font-size={Math.min(11, childHeight * 0.6)}
                fill="var(--colour-text-on-device)"
              >
                {childName.length > 12
                  ? childName.slice(0, 10) + "…"
                  : childName}
              </text>
            {/if}
          </g>
        {/if}
      {/each}
    </g>
  {/if}
</g>

<style>
  .rack-device-wrapper {
    /* Enable GPU-accelerated filter animations */
    will-change: filter;
    transition: filter var(--anim-drag-settle, 0.15s) ease-out;
  }

  .rack-device-wrapper.dragging {
    opacity: 0.7;
    /* Drop shadow provides visual feedback during drag.
		   Note: CSS transform: scale() is NOT used here because SVG <g> elements
		   with existing transform="translate()" attributes will have their
		   CSS transform-origin calculated incorrectly, causing a visual position
		   jump when dragging starts. See Issue #5. */
    filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.4));
  }

  /* Hover state: subtle lift before dragging */
  .rack-device-wrapper:hover:not(.dragging) {
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
  }

  /* Touch behavior for interactive SVG group
     Safari 18.x fix #411: cursor moved to .device-rect for proper hit area */
  .rack-device-wrapper {
    /* iOS Safari fixes (#232):
       - Disable Safari's default callout/context menu on long press
       - Prevent text selection during touch gestures
       - Allow pan/pinch zoom but disable double-tap zoom delay */
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
    touch-action: manipulation;
  }

  /* Focus styling for keyboard navigation */
  .rack-device:focus {
    outline: none;
  }

  .rack-device:focus .device-rect,
  .rack-device:focus-within .device-rect {
    stroke: var(--colour-selection);
    stroke-width: 2;
  }

  /* Focus-visible for keyboard-only focus indication */
  .rack-device:focus-visible .device-rect {
    stroke: var(--colour-selection);
    stroke-width: 2;
  }

  .device-rect {
    stroke: rgba(0, 0, 0, 0.2);
    stroke-width: 1;
    /* Safari 18.x fix #411: cursor on rect element for proper hit area */
    cursor: grab;
  }

  .rack-device:active .device-rect,
  .rack-device-wrapper.dragging .device-rect {
    cursor: grabbing;
  }

  .device-selection {
    fill: none;
    stroke: var(--colour-selection);
    stroke-width: 2;
    pointer-events: none;
    animation: selection-settle 120ms ease-out;
  }

  /* One-shot settle when the selection rect mounts. No `to` block: the
     animation ends on the computed stroke-width (2 desktop, 3 small screens).
     The global prefers-reduced-motion reset collapses the duration. */
  @keyframes selection-settle {
    from {
      stroke-opacity: 0;
      stroke-width: 4;
    }
  }

  @media (max-width: 430px) {
    .device-selection {
      stroke-width: 3;
    }
  }

  .device-name {
    fill: var(--neutral-50);
    font-size: var(--font-size-device, 13px);
    font-family: var(--font-family, system-ui, sans-serif);
    font-weight: 500;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    pointer-events: none;
    user-select: none;
  }

  .device-rect.rear-muted {
    /* Desaturate and darken the back of a full-depth device so it reads as the
       rear, not a duplicate of the front. Initial values; the frontend-design
       pass tunes these against the design tokens. */
    filter: saturate(0.45) brightness(0.82);
  }

  .rear-badge {
    fill: var(--neutral-50);
    font-size: 8px;
    font-weight: 600;
    letter-spacing: 0.06em;
    opacity: 0.85;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    pointer-events: none;
    user-select: none;
  }

  /* Safari 18.x fix #411: category-icon-wrapper and icon-container CSS removed
     Category icons now use SVG-native CategoryIconSVG component */

  /* Safari 18.x fix #420: label-overlay-wrapper and label-overlay CSS removed
     Label overlays now use SVG-native LabelOverlaySVG component */

  .device-image {
    pointer-events: none;
    /* Fade the image in as its blob resolves. A CSS animation (not a Svelte
       transition: directive) is used deliberately so the global
       prefers-reduced-motion reset in animations.css collapses it to instant. */
    animation: device-image-fade-in 180ms ease-out;
  }

  @keyframes device-image-fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* Quiet placeholder shown over the device rect while a custom image for the
     face in view is still loading (or awaiting an auto-retry after a failed
     fetch). Reads as pending media, never a blank or broken cell. */
  .device-image-placeholder {
    pointer-events: none;
    fill: var(--colour-surface-raised);
    opacity: 0.6;
  }

  /* Respect reduced motion preference */
  @media (prefers-reduced-motion: reduce) {
    .rack-device-wrapper {
      transition: none;
    }
  }

  /* Container child device styles */
  .container-children {
    pointer-events: none;
  }

  .container-child {
    pointer-events: auto;
    cursor: grab;
  }

  .container-child.dragging {
    opacity: 0.7;
    cursor: grabbing;
  }

  .container-child:focus {
    outline: none;
  }

  .container-child:focus-visible .child-device-rect {
    stroke: var(--colour-selection);
    stroke-width: 2;
  }

  .child-device-rect {
    stroke: var(--neutral-600);
    stroke-width: 0.5;
    transition: filter var(--duration-fast, 150ms) ease-out;
  }

  .container-child:hover .child-device-rect {
    filter: brightness(1.1);
  }

  .container-child.selected .child-device-rect {
    filter: brightness(1.05);
  }

  .child-selection-highlight {
    pointer-events: none;
  }

  .child-device-label {
    font-family: var(--font-family, system-ui, sans-serif);
    font-weight: 500;
    pointer-events: none;
    user-select: none;
    text-shadow: 0 1px 1px rgba(0, 0, 0, 0.3);
  }
</style>
