<script lang="ts">
  import { Tooltip } from "bits-ui";
  import Canvas from "$lib/components/Canvas.svelte";

  // Canvas renders VerbBarOverlay once a rack exists and something is
  // selected; the verb buttons use Tooltip, whose context the app supplies
  // at the top level (App.svelte). Mount it the same way here so tests can
  // render Canvas with a real selection without a "Tooltip.Provider not
  // found" crash (mirrors TestVerbBarOverlay.svelte).
</script>

<Tooltip.Provider>
  <Canvas />
</Tooltip.Provider>
