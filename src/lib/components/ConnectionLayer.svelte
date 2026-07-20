<!--
  ConnectionLayer SVG Component
  Renders every Connection (#1931) whose ports both resolve to an anchor
  within this rack/face as cubic bezier paths, routed via the external
  channel algorithm (spike #262, src/lib/utils/connection-path.ts).

  Rendered by Rack.svelte as a sibling layer AFTER the device each-block, so
  it draws above every device body: PortIndicators renders mid-stack inside
  RackDevice and cannot draw a line that crosses from one device to another,
  which is why this layer lives at the rack level instead.

  Anchors come exclusively from port-geometry.ts's getPortAnchors (#3089),
  by way of connection-path.ts's buildPortAnchorMap - never recomputed here.
  A connection whose port has no anchor (grouped/high-density device, wrong
  rack face, cross-rack endpoint, or legacy data with no PlacedPort match)
  is silently skipped rather than approximated; see buildRenderedConnections'
  doc comment for the reasoning.
-->
<script lang="ts">
  import type { DeviceType, PlacedDevice, RackView } from "$lib/types";
  import { getConnectionStore } from "$lib/stores/connection.svelte";
  import {
    buildPortAnchorMap,
    buildRenderedConnections,
  } from "$lib/utils/connection-path";
  import { type RackDimensions } from "$lib/utils/rack-drop-coordinator";
  import ConnectionPath from "./ConnectionPath.svelte";

  interface Props {
    /** This rack's currently-visible, non-container-child devices (same set RackDevice renders). */
    devices: PlacedDevice[];
    deviceLibrary: DeviceType[];
    /** Matches RackDevice's own rackView default: falls back to "front" when the rack has no view set. */
    rackView?: RackView;
    rackDims: RackDimensions;
  }

  let {
    devices,
    deviceLibrary,
    rackView = "front",
    rackDims,
  }: Props = $props();

  const connectionStore = getConnectionStore();

  // Slug index rebuilt only when deviceLibrary changes, same pattern as
  // Rack.svelte's own bySlug.
  const bySlug = $derived(new Map(deviceLibrary.map((dt) => [dt.slug, dt])));

  const portAnchors = $derived(
    buildPortAnchorMap(devices, bySlug, rackView, rackDims),
  );

  const rackBounds = $derived({
    x: 0,
    y: 0,
    width: rackDims.rackWidth,
    height: rackDims.rackHeight * rackDims.uHeight,
  });

  const renderedConnections = $derived(
    buildRenderedConnections(
      connectionStore.connections,
      portAnchors,
      rackBounds,
    ),
  );
</script>

<g class="connection-layer">
  {#each renderedConnections as { connection, geometry } (connection.id)}
    <ConnectionPath {connection} {geometry} />
  {/each}
</g>

<style>
  .connection-layer {
    pointer-events: none;
  }
</style>
