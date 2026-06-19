<!--
  ColourSwatch Component
  Displays a small colour preview square
-->
<script lang="ts">
  interface Props {
    colour: string;
    size?: number;
  }

  let { colour, size = 16 }: Props = $props();
</script>

<span
  class="colour-swatch"
  style:background-color={colour}
  style:width="{size}px"
  style:height="{size}px"
  role="presentation"
  aria-hidden="true"
></span>

<style>
  .colour-swatch {
    display: inline-block;
    border: 1px solid var(--colour-border);
    border-radius: 2px;
    flex-shrink: 0;
  }
</style>
