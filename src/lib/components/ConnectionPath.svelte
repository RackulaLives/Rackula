<!--
  ConnectionPath SVG Component
  Renders a single Connection (#1931) as an SVG cubic bezier path between two
  already-resolved port anchors (see connection-path.ts / ConnectionLayer).

  Hover affordance mirrors PortIndicators' hit-target idiom: a wide invisible
  stroke owns pointer events and carries the label as a native SVG <title>
  (a lightweight tooltip, per the issue's Testing Notes; hover/frame-rate
  behaviour is verified manually / via E2E, not by unit tests), while a CSS
  :hover on the shared group highlights the visible line and arrow.
-->
<script lang="ts">
  import type { Connection } from "$lib/types";
  import {
    arrowPointsAttr,
    type ConnectionGeometry,
  } from "$lib/utils/connection-path";

  interface Props {
    connection: Connection;
    geometry: ConnectionGeometry;
  }

  let { connection, geometry }: Props = $props();

  // Connection.color is a user-chosen hex literal (schema: "Optional color
  // for visualization (hex, e.g., '#FF5500')"), so it is used as-is when
  // set; the fallback is a design token, not a hardcoded hex, matching the
  // project's no-hex-literal-defaults convention.
  const strokeColour = $derived(
    connection.color ?? "var(--colour-port-default)",
  );
</script>

<g class="connection">
  <path
    class="connection-hit"
    d={geometry.path}
    fill="none"
    stroke="transparent"
    stroke-width="12"
  >
    {#if connection.label}
      <title>{connection.label}</title>
    {/if}
  </path>
  <path
    class="connection-line"
    d={geometry.path}
    fill="none"
    stroke={strokeColour}
  />
  {#if geometry.arrow}
    <polygon
      class="connection-arrow"
      points={arrowPointsAttr(geometry.arrow)}
      fill={strokeColour}
    />
  {/if}
</g>

<style>
  .connection {
    pointer-events: none;
  }

  .connection-hit {
    pointer-events: stroke;
    cursor: pointer;
  }

  .connection-line {
    stroke-width: 1.5;
    stroke-linecap: round;
    opacity: 0.85;
    transition:
      stroke-width 150ms ease-out,
      opacity 150ms ease-out;
  }

  .connection-arrow {
    opacity: 0.85;
    transition: opacity 150ms ease-out;
  }

  .connection:hover .connection-line {
    stroke-width: 2.5;
    opacity: 1;
  }

  .connection:hover .connection-arrow {
    opacity: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    .connection-line,
    .connection-arrow {
      transition: none;
    }
  }
</style>
