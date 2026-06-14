<!--
  Pin icon for favourite (pinned) device types in the palette.
  `filled` draws the solid pinned state; otherwise the outline (unpinned) state.
-->
<script lang="ts">
  interface Props {
    size?: number;
    filled?: boolean;
  }

  let { size = 16, filled = false }: Props = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill={filled ? "currentColor" : "none"}
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  data-icon="pin"
>
  <path d="M12 17v5" />
  <path
    d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"
  />
</svg>
