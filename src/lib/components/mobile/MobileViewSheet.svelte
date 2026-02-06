<!--
  MobileViewSheet Component
  Mobile bottom sheet controls for display mode, annotations, theme, and zoom actions.
-->
<script lang="ts">
  import type { DisplayMode } from "$lib/types";
  import SegmentedControl from "$lib/components/SegmentedControl.svelte";
  import Switch from "$lib/components/Switch.svelte";

  interface Props {
    displayMode: DisplayMode;
    showAnnotations: boolean;
    theme: "dark" | "light";
    ondisplaymodechange?: (mode: DisplayMode) => void;
    onannotationschange?: (enabled: boolean) => void;
    onthemechange?: (theme: "dark" | "light") => void;
    onfitall?: () => void;
    onresetzoom?: () => void;
    onclose?: () => void;
  }

  let {
    displayMode,
    showAnnotations,
    theme,
    ondisplaymodechange,
    onannotationschange,
    onthemechange,
    onfitall,
    onresetzoom,
    onclose,
  }: Props = $props();

  const displayModeOptions: Array<{ value: DisplayMode; label: string }> = [
    { value: "label", label: "Label" },
    { value: "image", label: "Image" },
    { value: "image-label", label: "Image + Label" },
  ];
  const themeLabel = $derived(
    `Theme (${theme === "dark" ? "Dark" : "Light"})`,
  );

  function handleDisplayModeChange(mode: DisplayMode) {
    ondisplaymodechange?.(mode);
  }

  function handleAnnotationsChange(enabled: boolean) {
    onannotationschange?.(enabled);
  }

  function handleThemeChange(darkMode: boolean) {
    onthemechange?.(darkMode ? "dark" : "light");
  }

  function handleFitAll() {
    onfitall?.();
    onclose?.();
  }

  function handleResetZoom() {
    onresetzoom?.();
    onclose?.();
  }
</script>

<div class="mobile-view-sheet">
  <section class="section">
    <h3 class="section-title">Display Mode</h3>
    <SegmentedControl
      options={displayModeOptions}
      value={displayMode}
      onchange={handleDisplayModeChange}
      ariaLabel="Display mode"
    />
  </section>

  <section class="section">
    <Switch
      id="mobile-view-annotations"
      checked={showAnnotations}
      label="Annotations"
      onchange={handleAnnotationsChange}
    />
  </section>

  <section class="section">
    <Switch
      id="mobile-view-theme"
      checked={theme === "dark"}
      label={themeLabel}
      onchange={handleThemeChange}
    />
  </section>

  <div class="divider" role="separator" aria-hidden="true"></div>

  <section class="actions">
    <button type="button" class="action-button" onclick={handleFitAll}>
      Fit All
    </button>
    <button type="button" class="action-button" onclick={handleResetZoom}>
      Reset Zoom
    </button>
  </section>
</div>

<style>
  .mobile-view-sheet {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-1) var(--space-1) var(--space-4);
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .section-title {
    margin: 0;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--colour-text);
  }

  .divider {
    height: 1px;
    background: var(--colour-border);
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .action-button {
    width: 100%;
    min-height: var(--touch-target-min);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-md);
    background: var(--colour-surface);
    color: var(--colour-text);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition:
      background-color var(--duration-fast) var(--ease-out),
      border-color var(--duration-fast) var(--ease-out);
  }

  .action-button:hover {
    background: var(--colour-surface-hover);
    border-color: var(--colour-text-muted);
  }

  .action-button:active {
    background: var(--colour-surface-hover);
    scale: 0.98;
  }

  .action-button:focus-visible {
    outline: 2px solid var(--colour-focus-ring);
    outline-offset: 2px;
  }
</style>
