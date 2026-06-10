<!--
  Rackula logo icon - coffin-tapered mark
  Uses design tokens for theming
-->
<script lang="ts">
  import {
    LOGO_VIEWBOX,
    LOGO_OUTLINE,
    LOGO_SLOTS,
    LOGO_SLOT_RADIUS,
  } from "$lib/components/logo-geometry";

  interface Props {
    size?: number;
  }

  let { size = 20 }: Props = $props();
</script>

<svg
  class="logo-icon"
  width={size}
  height={size}
  viewBox={LOGO_VIEWBOX}
  fill="none"
  aria-hidden="true"
>
  <path d={LOGO_OUTLINE} class="logo-frame" />
  {#each LOGO_SLOTS as slot (slot.y)}
    <rect
      x={slot.x}
      y={slot.y}
      width={slot.width}
      height={slot.height}
      rx={LOGO_SLOT_RADIUS}
      class="logo-slot"
    />
  {/each}
</svg>

<style>
  .logo-frame {
    fill: var(--logo-frame, var(--dracula-purple, #bd93f9));
  }
  .logo-slot {
    fill: var(--logo-interior, var(--colour-bg-primary, #282a36));
  }
</style>
