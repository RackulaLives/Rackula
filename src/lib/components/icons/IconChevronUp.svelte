<!--
  Chevron Up icon using Iconoir via Iconify
  Part of #608 icon standardization

  Sizing: Uses --icon-size-md (20px) by default.
  Override via parent CSS: .parent :global(svg) { width: var(--icon-size-sm); }
-->
<script lang="ts">
  import Icon from "@iconify/svelte";
</script>

<Icon icon="iconoir:nav-arrow-up" class="icon-chevron-up" aria-hidden="true" />

<style>
  :global(.icon-chevron-up) {
    width: var(--icon-size-md);
    height: var(--icon-size-md);
  }
</style>
