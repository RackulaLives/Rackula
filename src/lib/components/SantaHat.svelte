<!--
  SantaHat Component
  Christmas Day easter egg decoration
  SVG Santa hat with curved shape and subtle depth
-->
<script lang="ts">
  interface Props {
    size?: number;
  }

  let { size = 24 }: Props = $props();
</script>

<svg
  class="santa-hat"
  width={size}
  height={size}
  viewBox="0 0 32 32"
  aria-hidden="true"
  style="transform: rotate(19deg)"
>
  <!-- Hat body - tapered cone with slight curve -->
  <path d="M6 26 L14 6 L18 6 L26 26 Z" fill="#E63946" />
  <path d="M8 26 L14.5 7 L17.5 7 L24 26 Z" fill="#FF5555" />

  <!-- White fur trim -->
  <rect x="4" y="24" width="24" height="7" rx="3.5" fill="#F1F1F1" />
  <rect x="5" y="25" width="22" height="5" rx="2.5" fill="#FFFFFF" />

  <!-- Pom-pom - connected to hat tip -->
  <circle cx="16" cy="6" r="4.5" fill="#F1F1F1" />
  <circle cx="16" cy="6" r="3.5" fill="#FFFFFF" />
</svg>

<style>
  .santa-hat {
    pointer-events: none;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2));
  }
</style>
