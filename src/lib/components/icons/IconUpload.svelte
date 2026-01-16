<!--
  Upload icon using Iconoir via Iconify
  Part of #608 icon standardization

  Sizing: Uses --icon-size-md (20px) by default.
  Override via parent CSS: .parent :global(svg) { width: var(--icon-size-lg); }
-->
<script lang="ts">
  import Icon from "@iconify/svelte";
</script>

<Icon icon="iconoir:upload" class="icon-upload" aria-hidden="true" />

<style>
  :global(.icon-upload) {
    width: var(--icon-size-md);
    height: var(--icon-size-md);
  }
</style>
