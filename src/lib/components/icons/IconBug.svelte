<!--
  Bug Report icon using Iconoir via Iconify
  Part of #608 icon standardization

  Uses iconoir:warning-triangle for the "Report Bug" link. The warning
  triangle (⚠️) is universally recognized for reporting issues/problems.

  Sizing: Uses --icon-size-md (20px) by default.
  Override via parent CSS: .parent :global(svg) { width: var(--icon-size-sm); }

  Note: :global() is required because @iconify/svelte generates the SVG
  internally, so Svelte's scoped styles cannot target it directly.
-->
<script lang="ts">
  import Icon from "@iconify/svelte";
</script>

<Icon icon="iconoir:warning-triangle" class="icon-bug" aria-hidden="true" />

<style>
  :global(.icon-bug) {
    width: var(--icon-size-md, 20px);
    height: var(--icon-size-md, 20px);
  }
</style>
