<!--
  Plus icon using Iconoir via Iconify
  Part of #608 icon standardization

  Note: This is an Iconoir version separate from the existing IconPlus (Lucide)
  for use in components migrating to the Iconoir standard.

  Sizing: Uses --icon-size-md (20px) by default.
  Override via parent CSS: .parent :global(svg) { width: var(--icon-size-lg); }
-->
<script lang="ts">
  import Icon from "@iconify/svelte";
</script>

<Icon icon="iconoir:plus" class="icon-plus-iconoir" aria-hidden="true" />

<style>
  :global(.icon-plus-iconoir) {
    width: var(--icon-size-md);
    height: var(--icon-size-md);
  }
</style>
