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
    getStorageMode,
    shouldWarnBeforeUnload,
    persistBrowserWorkspace,
    getTwinTabGuard,
    setForeignWriteNotifier,
    type PersistTab,
  } from "$lib/storage";
  import { getImageStore } from "$lib/stores/images.svelte";
  import { getViewportStore } from "$lib/utils/viewport.svelte";
  import { getUIStore } from "$lib/stores/ui.svelte";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getWorkspaceStore } from "$lib/stores/workspace.svelte";
  import { getToastStore } from "$lib/stores/toast.svelte";
  import { setupKeyboardViewportAdaptation } from "$lib/utils/keyboard-viewport";

  const imageStore = getImageStore();
  const viewportStore = getViewportStore();
  const uiStore = getUIStore();
  const layoutStore = getLayoutStore();
  const workspaceStore = getWorkspaceStore();
  const toastStore = getToastStore();

  // Twin-tab guard (#2044): one shared instance for this page. The persist path
  // skips paused layouts; a foreign write to a layout body pauses that layout
  // and raises an "Open in another tab" toast offering a Reload.
  const twinTabGuard = getTwinTabGuard();
  let foreignWriteToastId: string | undefined;
  setForeignWriteNotifier(() => {
    // One toast for the page: any paused layout is recovered by the same Reload.
    // A spurious signal leaves the tab paused until that manual Reload by design.
    // Suppress only while the previous toast is still on screen; once the user
    // dismisses it without reloading, a later foreign write must re-raise it
    // (the tab stays paused, so the Reload prompt has to come back).
    if (
      foreignWriteToastId &&
      toastStore.toasts.some((toast) => toast.id === foreignWriteToastId)
    ) {
      return;
    }
    foreignWriteToastId = toastStore.showToast(
      "This layout is open in another tab. Edits here are paused to avoid overwriting it. Reload to continue editing.",
      "warning",
      0,
      {
        label: "Reload",
        onClick: () => {
          if (typeof window !== "undefined") window.location.reload();
        },
      },
    );
  });

  // Register all persistence $effects (localStorage autosave, server autosave, health check)
  initPersistenceEffects();

  // Browser-mode multi-layout persistence (#2080): debounced autosave of the
  // open tab set and the active tab's body into the workspace schema (#2179).
  // Server mode keeps its own working-copy + server autosave path untouched.
  let workspaceSaveTimer: ReturnType<typeof setTimeout> | null = null;

  function snapshotWorkspaceTabs(): {
    tabs: PersistTab[];
    activeLayoutId: string | null;
  } {
    const tabs: PersistTab[] = [];
    let activeLayoutId: string | null = null;
    for (const tab of workspaceStore.tabs) {
      const layoutId = tab.layoutId ?? tab.store.layout.metadata?.id;
      if (!layoutId) continue;
      if (tab.id === workspaceStore.activeId) activeLayoutId = layoutId;
      if (tab.hydrated) {
        tabs.push({
          layoutId,
          hydrated: true,
          layout: $state.snapshot(tab.store.layout),
          changesSinceExport: tab.store.changesSinceExport,
          hasEverExported: tab.store.hasEverExported,
        });
      } else {
        tabs.push({
          layoutId,
          hydrated: false,
          name: tab.store.layout.name,
        });
      }
    }
    return { tabs, activeLayoutId };
  }

  // Whether any open tab holds real content worth persisting. A pristine
  // cold-start blank tab (no rack, never started) is skipped so a fresh install
  // that never created anything does not leave a phantom workspace + a
  // returning-user marker behind. A restored or edited layout has started.
  function hasPersistableContent(): boolean {
    return workspaceStore.tabs.some(
      (tab) => !tab.hydrated || tab.store.hasStarted,
    );
  }

  // Persist the workspace, honouring the twin-tab guard: paused layouts are
  // skipped, and every hydrated body write (not just the active layout's) runs
  // through its own per-layout Web Lock where available, so a non-active layout
  // body is still serialised against a peer tab editing that same layout. Each
  // lock is keyed per layout id, so writing many bodies never nests one lock.
  // The tab-id stamp remains the real ping-pong guard; the lock only serialises
  // concurrent writers when it can be taken.
  function persistWorkspaceGuarded(snapshot: {
    tabs: PersistTab[];
    activeLayoutId: string | null;
  }): Promise<void> {
    return persistBrowserWorkspace({
      ...snapshot,
      isPaused: (layoutId) => twinTabGuard.isPaused(layoutId),
      withLayoutLock: (layoutId, write) =>
        twinTabGuard.withLayoutLock(layoutId, write),
    });
  }

  $effect(() => {
    if (getStorageMode() === "server") return;
    // Track the reactive surface: tab set, active id, and the active tab's
    // layout (so edits to the focused layout trigger a save). Only the active
    // tab is hydrated-and-editable; inactive bodies do not change in place.
    const snapshot = snapshotWorkspaceTabs();
    if (snapshot.tabs.length === 0 || !hasPersistableContent()) return;

    if (workspaceSaveTimer) clearTimeout(workspaceSaveTimer);
    workspaceSaveTimer = setTimeout(() => {
      void persistWorkspaceGuarded(snapshot);
      workspaceSaveTimer = null;
    }, 1000);

    return () => {
      if (workspaceSaveTimer) {
        clearTimeout(workspaceSaveTimer);
        workspaceSaveTimer = null;
      }
    };
  });

  // Last-chance synchronous persist of the workspace on page hide, so an edit
  // still inside the 1s debounce window survives a fast tab close. Browser mode
  // only; server mode flushes through flushSessionSave.
  function flushWorkspaceSave(): void {
    if (getStorageMode() === "server") return;
    if (workspaceSaveTimer) {
      clearTimeout(workspaceSaveTimer);
      workspaceSaveTimer = null;
    }
    const snapshot = snapshotWorkspaceTabs();
    if (snapshot.tabs.length > 0 && hasPersistableContent()) {
      // Synchronous last-chance write: skip paused layouts but do not await the
      // Web Lock (pagehide cannot wait on async work).
      persistBrowserWorkspace({
        ...snapshot,
        isPaused: (layoutId) => twinTabGuard.isPaused(layoutId),
      });
    }
  }

  onMount(() => {
    // Flush pending session save when page becomes hidden (tab close, navigate away)
    // visibilitychange fires reliably on mobile unlike beforeunload
    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        flushSessionSave();
        flushWorkspaceSave();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Last-chance flush on unload paths where visibilitychange may not fire
    // (pagehide is bfcache-safe to keep attached, unlike beforeunload)
    function handlePageHide() {
      flushSessionSave();
      flushWorkspaceSave();
    }
    window.addEventListener("pagehide", handlePageHide);

    // Twin-tab guard (#2044): a `storage` event fires in every OTHER same-origin
    // tab when localStorage changes. A foreign write to a layout body pauses this
    // tab's autosave for that layout id (browser mode only; server mode owns its
    // own working copy).
    function handleStorageEvent(event: StorageEvent) {
      if (getStorageMode() === "server") return;
      twinTabGuard.handleStorageEvent({
        key: event.key,
        newValue: event.newValue,
      });
    }
    window.addEventListener("storage", handleStorageEvent);

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
      window.removeEventListener("storage", handleStorageEvent);
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
      serverMode: getStorageMode() === "server",
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
