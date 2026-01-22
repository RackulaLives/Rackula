<!--
  Square with minus icon for indeterminate checkbox state
  Based on Phosphor MinusSquare icon
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
  viewBox="0 0 256 256"
  fill="currentColor"
  aria-hidden="true"
>
  <path
    d="M208,32H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32Zm0,176H48V48H208V208Zm-32-72a8,8,0,0,1-8,8H88a8,8,0,0,1,0-16h80A8,8,0,0,1,176,136Z"
  />
</svg>
