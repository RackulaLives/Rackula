<script lang="ts">
  import { Tooltip } from "bits-ui";
  import DevicePaletteItem from "$lib/components/DevicePaletteItem.svelte";
  import type { DeviceType } from "$lib/types";

  interface Props {
    device: DeviceType;
    tabindex?: number;
  }

  let { device, tabindex = 0 }: Props = $props();
</script>

<!-- DevicePaletteItem renders a favourite-pin button that uses Tooltip; the
     app supplies the Tooltip.Provider context at the top level (App.svelte),
     so mount it the same way here for isolated unit tests. -->
<Tooltip.Provider>
  <DevicePaletteItem {device} {tabindex} />
</Tooltip.Provider>
