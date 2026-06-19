<!--
  Fit All icon - four arrows pointing outward from center
-->
<script lang="ts">
  interface Props {
    size?: number;
  }

  let { size = 20 }: Props = $props();
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
  data-icon="fit-all"
>
  <!-- Top-left arrow -->
  <polyline points="4,14 4,4 14,4" />
  <line x1="4" y1="4" x2="9" y2="9" />

  <!-- Top-right arrow -->
  <polyline points="10,4 20,4 20,14" />
  <line x1="20" y1="4" x2="15" y2="9" />

  <!-- Bottom-left arrow -->
  <polyline points="4,10 4,20 14,20" />
  <line x1="4" y1="20" x2="9" y2="15" />

  <!-- Bottom-right arrow -->
  <polyline points="10,20 20,20 20,10" />
  <line x1="20" y1="20" x2="15" y2="15" />
</svg>
