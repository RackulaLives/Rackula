<!--
  Mobile/smartphone icon using Iconoir via Iconify
  Part of #608 icon standardization

  Sizing: Uses --icon-size-md (20px) by default.
  Override via parent CSS: .parent :global(svg) { width: 48px; height: 48px; }
-->
<script lang="ts">
  import Icon from "@iconify/svelte";
</script>

<Icon icon="iconoir:smartphone" class="icon-mobile" aria-hidden="true" />

<style>
  :global(.icon-mobile) {
    width: var(--icon-size-md);
    height: var(--icon-size-md);
  }
</style>
