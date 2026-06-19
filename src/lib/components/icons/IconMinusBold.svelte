<!--
  Minus icon (Phosphor Bold)
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
    d="M228,128a12,12,0,0,1-12,12H40a12,12,0,0,1,0-24H216A12,12,0,0,1,228,128Z"
  />
</svg>
