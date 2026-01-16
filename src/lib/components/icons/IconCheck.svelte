<!--
  Check/Success icon using Iconoir via Iconify
  Part of #608 icon standardization

  Sizing: Uses --icon-size-md (20px) by default.
  Override via parent CSS: .parent :global(svg) { width: var(--icon-size-sm); }

  Note: :global() is required because @iconify/svelte generates the SVG
  internally, so Svelte's scoped styles cannot target it directly.
-->
<script lang="ts">
  import Icon from "@iconify/svelte";
</script>

<Icon icon="iconoir:check" class="icon-check" aria-hidden="true" />

<style>
  :global(.icon-check) {
    width: var(--icon-size-md, 20px);
    height: var(--icon-size-md, 20px);
  }
</style>
