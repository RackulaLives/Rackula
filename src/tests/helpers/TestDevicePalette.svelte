<script lang="ts">
  import { Tooltip } from "bits-ui";
  import DevicePalette from "$lib/components/DevicePalette.svelte";

  interface Props {
    oncreatedevice?: () => void;
  }

  let { oncreatedevice }: Props = $props();
</script>

<!-- DevicePalette renders device rows that use Tooltip; the app supplies the
     Tooltip.Provider context at the top level (App.svelte), so mount it the
     same way here. -->
<Tooltip.Provider>
  <DevicePalette {oncreatedevice} />
</Tooltip.Provider>
