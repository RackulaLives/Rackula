<!--
  IconImageLabel Component
  Combined icon for "Both" display mode (Labels + Images)
  Overlays text (T) and image icons
-->
<script lang="ts">
  interface Props {
    size?: number;
  }

  let { size = 18 }: Props = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <!-- Image frame (background, slightly smaller) -->
  <rect x="2" y="6" width="12" height="12" rx="1" opacity="0.6" />
  <!-- Text T (foreground, offset) -->
  <path d="M12 4V4h8v3" />
  <path d="M16 4v10" />
  <path d="M14 14h4" />
</svg>
