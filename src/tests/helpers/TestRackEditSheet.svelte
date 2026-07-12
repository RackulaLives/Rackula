<script lang="ts">
  import { Tooltip } from "bits-ui";
  import RackEditSheet from "$lib/components/RackEditSheet.svelte";
  import type { Rack } from "$lib/types";

  interface Props {
    rack: Rack;
    onclose?: () => void;
  }

  let { rack, onclose }: Props = $props();
</script>

<!-- RackEditSheet's Saved indicator renders a Tooltip (#3005 fix round 1),
     which needs the Tooltip.Provider context; the app supplies it at the top
     level (App.svelte), so mount it the same way here (see
     TestSidePanelContent.svelte / TestVerbBarOverlay.svelte). -->
<Tooltip.Provider>
  <RackEditSheet {rack} {onclose} />
</Tooltip.Provider>
