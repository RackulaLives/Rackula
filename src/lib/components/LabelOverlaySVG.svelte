<!--
  LabelOverlaySVG Component
  Pure SVG rendering of label overlay on device images.
  Safari 18.x fix #420: Avoids foreignObject transform inheritance bug.

  Renders device label text at the bottom of the device with a gradient
  background for readability over device images.
-->
<script lang="ts">
  interface Props {
    text: string;
    fontSize: number;
    width: number;
    height: number;
  }

  let { text, fontSize, width, height }: Props = $props();

  // Generate unique ID for gradient reference
  const gradientId = $derived(
    `label-gradient-${Math.random().toString(36).slice(2, 9)}`,
  );
</script>

<!--
  Nested SVG for positioning within parent SVG context.
  Safari requires explicit positioning via nested SVG rather than relying on
  parent <g> transform inheritance with foreignObject.
-->
<svg x="0" y="0" {width} {height} class="label-overlay-svg" aria-hidden="true">
  <defs>
    <!-- Gradient background for text readability -->
    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(0, 0, 0, 0)" />
      <stop offset="50%" stop-color="rgba(0, 0, 0, 0.3)" />
      <stop offset="100%" stop-color="rgba(0, 0, 0, 0.6)" />
    </linearGradient>
  </defs>

  <!-- Gradient background rect -->
  <rect
    x="0"
    y="0"
    {width}
    {height}
    fill="url(#{gradientId})"
    class="gradient-bg"
  />

  <!-- Label text at bottom center -->
  <text
    x={width / 2}
    y={height - 4}
    text-anchor="middle"
    dominant-baseline="auto"
    class="label-text"
    style:font-size="{fontSize}px"
  >
    {text}
  </text>
</svg>

<style>
  .label-overlay-svg {
    overflow: visible;
    pointer-events: none;
  }

  .gradient-bg {
    pointer-events: none;
  }

  .label-text {
    font-family: var(--font-family, system-ui, sans-serif);
    font-weight: 500;
    fill: var(--neutral-50, #f8f8f2);
    /* Text shadow via SVG filter would be heavier - using stroke outline instead */
  }
</style>
