<!--
  Chevron Down icon (Iconoir nav-arrow-down)
  Part of #608 icon standardization

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
  <path d="M6 9L12 15L18 9" />
</svg>
