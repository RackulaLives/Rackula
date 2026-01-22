<!--
  Cloud-Off icon for offline status
  Based on Iconoir cloud-xmark icon pattern
-->
<script lang="ts">
  interface Props {
    size?: number;
    label?: string;
  }

  let { size = 20, label }: Props = $props();
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
  aria-hidden={label ? undefined : "true"}
  aria-label={label}
  role={label ? "img" : undefined}
>
  <!-- Cloud shape -->
  <path
    d="M12 4a5.5 5.5 0 0 0-5.4 4.4A4 4 0 0 0 7 16h10a4 4 0 0 0 .6-7.9A5.5 5.5 0 0 0 12 4Z"
  />
  <!-- Diagonal strike-through -->
  <path d="M3 3l18 18" />
</svg>
