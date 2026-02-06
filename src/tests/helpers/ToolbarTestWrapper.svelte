<script lang="ts">
  import { Tooltip } from "bits-ui";
  import Toolbar from "$lib/components/Toolbar.svelte";

  interface Props {
    hasRacks?: boolean;
    onsave?: () => void;
    onload?: () => void;
    onexport?: () => void;
  }

  const noop = () => {};

  let {
    hasRacks = false,
    onsave = noop,
    onload = noop,
    onexport = noop,
  }: Props = $props();
</script>

<Tooltip.Provider delayDuration={0}>
  <Toolbar {hasRacks} {onsave} {onload} {onexport} />
</Tooltip.Provider>
