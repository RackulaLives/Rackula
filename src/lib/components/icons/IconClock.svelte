<!--
  Clock icon for pending/in-progress status
  Based on Lucide clock icon
-->
<script lang="ts">
  interface Props {
    size?: number;
    class?: string;
  }
  let { size = 20, class: className = "" }: Props = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  class={className}
>
  <circle cx="12" cy="12" r="9" />
  <polyline points="12 7 12 12 15 14" />
</svg>
