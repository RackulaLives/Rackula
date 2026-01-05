<!--
  CategoryIconSVG Component
  Pure SVG rendering of category icons for use inside SVG elements.
  Safari 18.x fix #411: Avoids foreignObject transform inheritance bug.
-->
<script lang="ts">
  import type { DeviceCategory } from "$lib/types";
  import {
    Server,
    Network,
    EthernetPort,
    Zap,
    HardDrive,
    Monitor,
    Speaker,
    Fan,
    AlignEndHorizontal,
    CircleOff,
    Cable,
    CircleQuestionMark,
  } from "@lucide/svelte";
  import type { Component } from "svelte";
  import type { IconProps } from "@lucide/svelte";

  interface Props {
    category: DeviceCategory;
    size?: number;
    x?: number;
    y?: number;
  }

  let { category, size = 16, x = 0, y = 0 }: Props = $props();

  // Map categories to Lucide icon components
  const iconMap: Record<DeviceCategory, Component<IconProps>> = {
    server: Server,
    network: Network,
    "patch-panel": EthernetPort,
    power: Zap,
    storage: HardDrive,
    kvm: Monitor,
    "av-media": Speaker,
    cooling: Fan,
    shelf: AlignEndHorizontal,
    blank: CircleOff,
    "cable-management": Cable,
    other: CircleQuestionMark,
  };

  // Get the icon component for this category (fallback to CircleQuestionMark)
  const IconComponent = $derived(iconMap[category] ?? CircleQuestionMark);
</script>

<!--
  Nested SVG for positioning within parent SVG context.
  Safari requires explicit x/y on the SVG element rather than relying on
  parent <g> transform inheritance with foreignObject.
-->
<svg
  {x}
  {y}
  width={size}
  height={size}
  class="category-icon-svg"
  aria-hidden="true"
>
  <IconComponent {size} />
</svg>

<style>
  .category-icon-svg {
    overflow: visible;
    color: rgba(255, 255, 255, 0.8);
    filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.5));
  }

  .category-icon-svg :global(svg) {
    /* Lucide icons render their own nested SVG - reset its position */
    display: block;
  }
</style>
