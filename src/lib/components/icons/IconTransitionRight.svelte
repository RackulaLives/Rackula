<!--
  Transition-right icon (Iconoir)

  Used for the flip-device-face verb: a solid rounded panel, an arrow, and an
  outlined panel read as "swap this face for the other one".

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
    d="M2 18V6C2 4.34315 3.34315 3 5 3H7C8.65685 3 10 4.34315 10 6V18C10 19.6569 8.65685 21 7 21H5C3.34315 21 2 19.6569 2 18Z"
  />
  <path
    d="M16 3H18C20.2091 3 22 4.79086 22 7V17C22 19.2091 20.2091 21 18 21H16"
  />
  <path d="M10 12H18M18 12L15 9M18 12L15 15" />
</svg>
