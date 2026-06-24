<!--
  List icon (Phosphor Bold) — the app-menu (hamburger) trigger on mobile.
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
  viewBox="0 0 256 256"
  fill="currentColor"
  aria-hidden="true"
>
  <path
    d="M28,64a12,12,0,0,1,12-12H216a12,12,0,0,1,0,24H40A12,12,0,0,1,28,64Zm188,52H40a12,12,0,0,0,0,24H216a12,12,0,0,0,0-24Zm0,64H40a12,12,0,0,0,0,24H216a12,12,0,0,0,0-24Z"
  />
</svg>
