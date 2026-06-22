<script lang="ts">
  import { Tooltip } from "bits-ui";
  import VerbBarOverlay from "$lib/components/VerbBarOverlay.svelte";

  interface Props {
    canvasEl: HTMLElement | null;
    ondelete?: () => void;
    onrackfocus?: (rackIds: string[]) => void;
    onrackexport?: (rackIds: string[]) => void;
  }

  let { canvasEl, ondelete, onrackfocus, onrackexport }: Props = $props();
</script>

<!-- VerbBar renders verb buttons that use Tooltip; the app supplies the
     Tooltip.Provider context at the top level (App.svelte), so mount it the
     same way here. -->
<Tooltip.Provider>
  <VerbBarOverlay {canvasEl} {ondelete} {onrackfocus} {onrackexport} />
</Tooltip.Provider>
