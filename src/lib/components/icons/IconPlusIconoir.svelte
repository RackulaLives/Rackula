<!--
  Plus icon (Iconoir)
  Part of #608 icon standardization

  Note: This is an Iconoir version separate from the existing IconPlus (Lucide)
  for use in components migrating to the Iconoir standard.

  Sizing: Uses size prop (default 20px).
  Override by passing a different size value.
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
  stroke-width="1.5"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d="M6 12H12M18 12H12M12 12V6M12 12V18" />
</svg>
