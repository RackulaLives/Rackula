<!--
  Filter icon (Iconoir filter)

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
  <path
    d="M3 4.6c0-.6.4-1 1-1h16c.6 0 1 .4 1 1v1.8c0 .3-.1.5-.3.7l-6.4 6.4a1 1 0 0 0-.3.7v4.4c0 .8-.9 1.3-1.6.8l-2-1.3a1 1 0 0 1-.4-.8v-3.1a1 1 0 0 0-.3-.7L3.3 7.1A1 1 0 0 1 3 6.4V4.6Z"
  />
</svg>
