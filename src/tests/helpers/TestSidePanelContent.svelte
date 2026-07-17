<script lang="ts">
  import { Tooltip } from "bits-ui";
  import SidePanelContent from "$lib/components/SidePanelContent.svelte";
  import type { SidePanelTab } from "$lib/stores/ui.svelte";

  interface Props {
    activeTab: SidePanelTab;
    onTabChange: (tab: SidePanelTab) => void;
  }

  let { activeTab, onTabChange }: Props = $props();
</script>

<!-- SidePanelContent's Saved indicators render a Tooltip (#3005), which needs
     the Tooltip.Provider context; the app supplies it at the top level
     (App.svelte), so mount it the same way here (see TestVerbBarOverlay.svelte). -->
<Tooltip.Provider>
  <SidePanelContent {activeTab} {onTabChange} />
</Tooltip.Provider>
