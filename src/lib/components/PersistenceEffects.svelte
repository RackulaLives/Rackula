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
    isSessionSavePending,
    isServerSavePending,
    getApiAvailableState,
    hasEverConnectedToApi,
    shouldWarnBeforeUnload,
  } from "$lib/storage";
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

    // Last-chance flush on unload paths where visibilitychange may not fire
    // (pagehide is bfcache-safe to keep attached, unlike beforeunload)
    function handlePageHide() {
      flushSessionSave();
    }
    window.addEventListener("pagehide", handlePageHide);

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
      window.removeEventListener("pagehide", handlePageHide);
    };
  });

  // Mobile keyboard adaptation
  onMount(() =>
    setupKeyboardViewportAdaptation({
      isMobile: () => viewportStore.isMobile,
    }),
  );

  // Warn only on genuine in-flight loss risk (see $lib/storage/unload-risk)
  const warnBeforeUnload = $derived(
    shouldWarnBeforeUnload({
      warnOnUnsavedChanges: uiStore.warnOnUnsavedChanges,
      sessionSavePending: isSessionSavePending(),
      serverSavePending: isServerSavePending(),
      serverMode: hasEverConnectedToApi(),
      serverReachable: getApiAvailableState(),
      isDirty: layoutStore.isDirty,
    }),
  );

  // Only shows the leave warning; flushing is handled by the always-attached
  // visibilitychange and pagehide listeners above
  function handleBeforeUnload(event: BeforeUnloadEvent) {
    event.preventDefault();
    event.returnValue = "";
  }

  // Attach the handler only while the risk condition holds and remove it as
  // soon as the flush or save completes (Chrome guidance: never permanently)
  $effect(() => {
    if (!warnBeforeUnload) return;
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  });
</script>
