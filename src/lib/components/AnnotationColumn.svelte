<!--
  AnnotationColumn Component
  Displays metadata field values aligned with device U positions
  Positioned to the left of the rack view
-->
<script lang="ts">
  import type {
    Rack as RackType,
    DeviceType,
    PlacedDevice,
    AnnotationField,
  } from "$lib/types";
  import {
    U_HEIGHT_PX,
    RAIL_WIDTH,
    RACK_PADDING_HIDDEN,
  } from "$lib/constants/layout";
  import { toHumanUnits } from "$lib/utils/position";

  interface Props {
    rack: RackType;
    deviceLibrary: DeviceType[];
    annotationField: AnnotationField;
    /** Width of the annotation column in pixels */
    width?: number;
    /** Filter to show only front or rear mounted devices */
    faceFilter?: "front" | "rear";
  }

  let {
    rack,
    deviceLibrary,
    annotationField,
    width = 100,
    faceFilter,
  }: Props = $props();

  // Padding from right edge for text alignment
  const TEXT_PADDING = 8;

  // Create a lookup map for device types
  const deviceTypeMap = $derived(
    new Map(deviceLibrary.map((dt) => [dt.slug, dt])),
  );

  // Get the value for a specific annotation field from a placed device
  function getAnnotationValue(
    placedDevice: PlacedDevice,
    deviceType: DeviceType | undefined,
    field: AnnotationField,
  ): string {
    switch (field) {
      case "name":
        return placedDevice.name ?? deviceType?.model ?? deviceType?.slug ?? "";
      case "ip": {
        // Read from custom_fields.ip
        const ip = placedDevice.custom_fields?.ip;
        return typeof ip === "string" ? ip : "";
      }
      case "notes":
        return placedDevice.notes ?? "";
      case "asset_tag":
        return deviceType?.asset_tag ?? "";
      case "serial":
        return deviceType?.serial_number ?? "";
      case "manufacturer":
        return deviceType?.manufacturer ?? "";
      default:
        return "";
    }
  }

  // Calculate Y position for a device annotation (vertically centered)
  // Position is in internal units (1/6U), must convert to human U for calculation
  function getAnnotationY(positionInternal: number, uHeight: number): number {
    // Convert internal units to human U
    const positionU = toHumanUnits(positionInternal);
    // SVG Y = (rackHeight - positionU - u_height + 1) * U_HEIGHT + offset
    // We add RACK_PADDING_HIDDEN (since dual-view hides rack name) + RAIL_WIDTH (top bar)
    const topOffset = RACK_PADDING_HIDDEN + RAIL_WIDTH;
    const deviceTopY =
      (rack.height - positionU - uHeight + 1) * U_HEIGHT_PX + topOffset;
    const deviceHeight = uHeight * U_HEIGHT_PX;
    // Return center Y position
    return deviceTopY + deviceHeight / 2;
  }

  // Calculate total SVG height to match rack
  const svgHeight = $derived(
    RACK_PADDING_HIDDEN + RAIL_WIDTH * 2 + rack.height * U_HEIGHT_PX,
  );

  // Filter devices by face if faceFilter is provided
  const filteredDevices = $derived(
    faceFilter
      ? rack.devices.filter((d) => d.face === faceFilter)
      : rack.devices,
  );

  // Get annotations for filtered devices
  const annotations = $derived(
    filteredDevices.map((device) => {
      const deviceType = deviceTypeMap.get(device.device_type);
      const uHeight = deviceType?.u_height ?? 1;
      const value = getAnnotationValue(device, deviceType, annotationField);
      const y = getAnnotationY(device.position, uHeight);
      return {
        id: device.id,
        value: value || "—", // Em-dash for empty values
        y,
        isEmpty: !value,
      };
    }),
  );

  // Truncate long values
  function truncate(value: string, maxLength: number = 15): string {
    if (value.length <= maxLength) return value;
    return value.slice(0, maxLength - 1) + "…";
  }
</script>

<div class="annotation-column" style="width: {width}px;">
  <svg
    {width}
    height={svgHeight}
    viewBox="0 0 {width} {svgHeight}"
    class="annotation-svg"
    role="presentation"
    aria-hidden="true"
  >
    {#each annotations as annotation (annotation.id)}
      <text
        x={width - TEXT_PADDING}
        y={annotation.y}
        class="annotation-text"
        class:empty={annotation.isEmpty}
        dominant-baseline="middle"
        text-anchor="end"
      >
        <title>{annotation.value}</title>
        {truncate(annotation.value)}
      </text>
    {/each}
  </svg>
</div>

<style>
  .annotation-column {
    display: flex;
    flex-shrink: 0;
  }

  .annotation-svg {
    display: block;
  }

  .annotation-text {
    font-family: var(
      --font-family-mono,
      "SF Mono",
      "Monaco",
      "Consolas",
      monospace
    );
    font-size: var(--font-size-2xs, 10px);
    fill: var(--colour-text);
    user-select: none;
  }

  .annotation-text.empty {
    fill: var(--colour-text-muted);
    opacity: 0.5;
  }
</style>
