<!--
  Bug Report icon using Iconoir via Iconify
  Part of #608 icon standardization

  Note: Uses iconoir:warning-circle as specified in issue #673 for the
  "Report Bug" link. The warning-circle icon was chosen over a literal bug
  icon to convey "report an issue" rather than "software bug".

  Sizing: Uses --icon-size-md (20px) by default.
  Override via parent CSS: .parent :global(svg) { width: var(--icon-size-sm); }

  Note: :global() is required because @iconify/svelte generates the SVG
  internally, so Svelte's scoped styles cannot target it directly.
-->
<script lang="ts">
  import Icon from "@iconify/svelte";
</script>

<Icon icon="iconoir:warning-circle" class="icon-bug" aria-hidden="true" />

<style>
  :global(.icon-bug) {
    width: var(--icon-size-md, 20px);
    height: var(--icon-size-md, 20px);
  }
</style>
