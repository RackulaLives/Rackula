<!--
  Flip icon (Iconoir)

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
  <path d="M9.5 20H2L9.5 4V20Z" />
  <path d="M20.125 20H22L21.0625 18" />
  <path d="M16.375 20H14.5V18" />
  <path d="M14.5 12V14" />
  <path d="M18.25 12L19.1875 14" />
  <path d="M16.375 8L14.5 4V8" />
</svg>
