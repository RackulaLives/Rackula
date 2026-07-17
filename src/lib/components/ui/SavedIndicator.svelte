<!--
  SavedIndicator Component
  Shared "Saved" acknowledgement flashed next to a field label after a
  discrete commit (blur, or a picker selection). Used by EditPanelMetadata's
  Name/Colour/IP/Notes fields, EditPanelRack's Name field, and RackEditSheet's
  Name field, which previously duplicated this markup, CSS, and fade-in
  animation verbatim (#3005).

  The component only renders the affordance; callers own the per-field
  `show` state and its timeout.
-->
<script lang="ts">
  import Tooltip from "../Tooltip.svelte";

  interface Props {
    /** Whether to show the "Saved" affordance. */
    show: boolean;
    /** Test ID for end-to-end test selectors, e.g. "saved-indicator-name". */
    "data-testid": string;
  }

  let { show, "data-testid": dataTestid }: Props = $props();
</script>

{#if show}
  <Tooltip text="Saved">
    <span class="saved-indicator" data-testid={dataTestid}>✓</span>
  </Tooltip>
{/if}

<style>
  .saved-indicator {
    color: var(--colour-success);
    font-size: var(--font-size-sm);
    animation: fade-in var(--duration-fast) ease-out;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
