<!--
  PersistenceEffects - Renderless component for persistence lifecycle
  Registers $effects for autosave (localStorage + server) and health checks.
  Handles visibilitychange, bundled images, window title, and keyboard viewport.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import {
    initPersistenceEffects,
    flushSessionSave,
  } from "$lib/utils/persistence-manager.svelte";
  import { getImageStore } from "$lib/stores/images.svelte";
  import { getViewportStore } from "$lib/utils/viewport.svelte";
  import { getUIStore } from "$lib/stores/ui.svelte";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { setupKeyboardViewportAdaptation } from "$lib/utils/keyboard-viewport";

  const imageStore = getImageStore();
  const viewportStore = getViewportStore();
  const uiStore = getUIStore();
  const layoutStore = getLayoutStore();

  // Register all persistence $effects (localStorage autosave, server autosave, health check)
  initPersistenceEffects();

  onMount(() => {
    // Flush pending session save when page becomes hidden (tab close, navigate away)
    // visibilitychange fires reliably on mobile unlike beforeunload
    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        flushSessionSave();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Load bundled images for starter library devices
    imageStore.loadBundledImages();

    // Set window title with environment prefix in non-production environments
    const buildEnv = typeof __BUILD_ENV__ !== "undefined" ? __BUILD_ENV__ : "";
    const isLocalhost =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";

    let envPrefix = "";
    if (isLocalhost) {
      envPrefix = "LOCAL - ";
    } else if (buildEnv === "development") {
      envPrefix = "DEV - ";
    }

    if (envPrefix) {
      document.title = `${envPrefix}${document.title}`;
    }

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  });

  // Mobile keyboard adaptation
  onMount(() =>
    setupKeyboardViewportAdaptation({
      isMobile: () => viewportStore.isMobile,
    }),
  );

  function handleBeforeUnload(event: BeforeUnloadEvent) {
    // Flush pending session save before the page unloads
    flushSessionSave();

    if (uiStore.warnOnUnsavedChanges && layoutStore.isDirty) {
      event.preventDefault();
      event.returnValue = "You have unsaved changes. Leave anyway?";
      return event.returnValue;
    }
  }
</script>

<svelte:window onbeforeunload={handleBeforeUnload} />
