<!--
  Rackula logo icon - widow's peak variant
  Uses design tokens for theming
-->
<script lang="ts">
  interface Props {
    size?: number;
  }

  let { size = 20 }: Props = $props();
</script>

<svg
  class="logo-icon"
  width={size}
  height={size}
  viewBox="0 0 36 54"
  fill="none"
  aria-hidden="true"
>
  <!-- Rack frame with widow's peak -->
  <path 
    d="M0 0 L14 0 L18 6 L22 0 L36 0 L36 54 L0 54 Z" 
    class="logo-frame" 
  />
  <!-- Device slots -->
  <rect x="5" y="10" width="26" height="10" class="logo-slot" />
  <rect x="5" y="22" width="26" height="10" class="logo-slot" />
  <rect x="5" y="34" width="26" height="10" class="logo-slot" />
</svg>

<style>
  .logo-frame {
    fill: var(--logo-frame, var(--dracula-purple, #BD93F9));
  }
  .logo-slot {
    fill: var(--logo-interior, var(--colour-bg-primary, #282A36));
  }
</style>
