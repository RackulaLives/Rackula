<!--
  Grip icon for drag affordance
  6-dot pattern (2 columns × 3 rows)
-->
<script lang="ts">
  interface Props {
    size?: number;
  }

  let { size = 16 }: Props = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 16 16"
  fill="none"
  aria-hidden="true"
>
  <!-- Left column -->
  <circle cx="5" cy="3" r="1.5" fill="currentColor" />
  <circle cx="5" cy="8" r="1.5" fill="currentColor" />
  <circle cx="5" cy="13" r="1.5" fill="currentColor" />
  <!-- Right column -->
  <circle cx="11" cy="3" r="1.5" fill="currentColor" />
  <circle cx="11" cy="8" r="1.5" fill="currentColor" />
  <circle cx="11" cy="13" r="1.5" fill="currentColor" />
</svg>
