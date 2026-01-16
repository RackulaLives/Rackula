<!--
  Bug/Warning icon (Iconoir warning-triangle)
  Converted to inline SVG for offline support
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
  stroke-linecap="round"
  stroke-width="1.5"
  aria-hidden="true"
>
  <path
    d="M20.043 21H3.957c-1.538 0-2.5-1.664-1.734-2.997l8.043-13.988c.77-1.337 2.699-1.337 3.468 0l8.043 13.988C22.543 19.336 21.58 21 20.043 21ZM12 9v4"
  />
  <path stroke-linejoin="round" d="m12 17.01l.01-.011" />
</svg>
