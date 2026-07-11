<!--
  Minimal harness for testing initPersistenceEffects() in isolation, without
  the rest of PersistenceEffects.svelte's unrelated wiring (workspace persist,
  keyboard viewport, twin-tab guard, beforeunload). Registers only the three
  $effects manager.svelte.ts owns: session autosave, server autosave, health
  check polling.
-->
<script lang="ts">
  import { initPersistenceEffects } from "$lib/storage/manager.svelte";

  initPersistenceEffects();
</script>
