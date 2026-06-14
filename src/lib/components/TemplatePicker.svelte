<!--
  TemplatePicker

  The empty-canvas starting point (#2095). Shown by WelcomeScreen when no layout
  exists, it lets a new user start from a starter template or a blank layout, or
  reach the import-file and share entry points.

  Template previews reuse the cached export renderer (#2083) and are purely
  decorative: each preview frame is aria-hidden and the card carries a real text
  label, so assistive tech announces the template by name, not by SVG.

  Scope: this component only chooses WHAT the empty state offers. It does not
  decide WHEN the empty state shows (that is the launch/restore logic) nor how a
  chosen layout is loaded (the parent wires onchoosetemplate to loadLayout).
-->
<script lang="ts">
  import type { StarterTemplate } from "$lib/templates/starter-templates";
  import { renderLayoutPreviewSvg } from "./layout-preview-render";
  import { IconPlus, IconUpload, IconShareBold } from "./icons";

  interface Props {
    /** Starter templates to offer. Empty array renders the blank-only state. */
    templates: StarterTemplate[];
    /** Load the chosen template as a new layout. */
    onchoosetemplate: (template: StarterTemplate) => void;
    /** Start a blank layout (add the first rack). */
    onblank: () => void;
    /** Open the import-from-file flow. */
    onimport: () => void;
    /** Open the share flow. */
    onshare: () => void;
  }

  let { templates, onchoosetemplate, onblank, onimport, onshare }: Props =
    $props();

  // Render each template's thumbnail once. The set is tiny and stable for the
  // lifetime of the empty state, so a plain derived map is enough; no LRU cache
  // is needed here (that backs the per-tab sidebar previews instead).
  const previews = $derived(
    new Map(templates.map((t) => [t.id, renderLayoutPreviewSvg(t.layout)])),
  );

  function rackSummary(template: StarterTemplate): string {
    const rackCount = template.layout.racks.length;
    const deviceCount = template.layout.racks.reduce(
      (sum, rack) => sum + rack.devices.length,
      0,
    );
    const rackWord = rackCount === 1 ? "rack" : "racks";
    const deviceWord = deviceCount === 1 ? "device" : "devices";
    return `${rackCount} ${rackWord}, ${deviceCount} ${deviceWord}`;
  }
</script>

<section class="template-picker" aria-labelledby="template-picker-heading">
  <header class="picker-header">
    <h2 id="template-picker-heading" class="picker-title">
      Start a new layout
    </h2>
    <p class="picker-subtitle">
      Pick a starter template or begin from an empty rack.
    </p>
  </header>

  {#if templates.length > 0}
    <ul class="template-grid">
      {#each templates as template (template.id)}
        {@const preview = previews.get(template.id)}
        <li>
          <button
            type="button"
            class="template-card"
            onclick={() => onchoosetemplate(template)}
          >
            <span class="card-preview" aria-hidden="true">
              {#if preview}
                <!-- eslint-disable-next-line svelte/no-at-html-tags -- Safe: SVG built by generateExportSVG via the DOM API; all user text is set with textContent and escaped by XMLSerializer, never raw-HTML injected. -->
                {@html preview}
              {:else}
                <span class="card-preview-empty"></span>
              {/if}
            </span>
            <span class="card-body">
              <span class="card-name">{template.layout.name}</span>
              <span class="card-meta">{rackSummary(template)}</span>
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  <div class="picker-actions">
    <button type="button" class="action-button is-primary" onclick={onblank}>
      <IconPlus size={18} />
      <span>Blank layout</span>
    </button>
    <button type="button" class="action-button" onclick={onimport}>
      <IconUpload size={18} />
      <span>Import file</span>
    </button>
    <button type="button" class="action-button" onclick={onshare}>
      <IconShareBold size={18} />
      <span>Share</span>
    </button>
  </div>
</section>

<style>
  .template-picker {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-6);
    width: min(100%, 760px);
    padding: var(--space-6);
    text-align: center;
  }

  .picker-header {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .picker-title {
    margin: 0;
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-semibold);
    color: var(--colour-text);
    letter-spacing: var(--letter-spacing-tight);
  }

  .picker-subtitle {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--colour-text-muted);
  }

  .template-grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: var(--space-4);
    width: 100%;
  }

  .template-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    width: 100%;
    min-height: 44px;
    padding: var(--space-3);
    background: var(--colour-surface);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-lg);
    color: var(--colour-text);
    cursor: pointer;
    text-align: left;
    transition:
      border-color 0.15s ease,
      transform 0.15s ease,
      box-shadow 0.15s ease;
  }

  .template-card:hover {
    border-color: var(--colour-primary);
    transform: translateY(-2px);
    box-shadow: var(--shadow-md);
  }

  .template-card:focus-visible {
    outline: 2px solid var(--colour-focus-ring);
    outline-offset: 2px;
    border-color: var(--colour-primary);
  }

  .card-preview {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 120px;
    padding: var(--space-2);
    background: var(--colour-bg-darker);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .card-preview :global(svg) {
    max-width: 100%;
    max-height: 100%;
    height: auto;
  }

  .card-preview-empty {
    width: 100%;
    height: 100%;
    border-radius: var(--radius-sm);
    background: var(--colour-surface-raised);
  }

  .card-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-0-5);
  }

  .card-name {
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
  }

  .card-meta {
    font-size: var(--font-size-xs);
    color: var(--colour-text-muted);
  }

  .picker-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-3);
  }

  .action-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    min-height: 44px;
    padding: var(--space-2) var(--space-4);
    background: var(--colour-surface);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-md);
    color: var(--colour-text);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      background-color 0.15s ease;
  }

  .action-button:hover {
    border-color: var(--colour-border-hover);
    background: var(--colour-surface-hover);
  }

  .action-button:focus-visible {
    outline: 2px solid var(--colour-focus-ring);
    outline-offset: 2px;
  }

  .action-button.is-primary {
    border-color: var(--colour-primary);
    color: var(--colour-primary);
  }

  @media (prefers-reduced-motion: reduce) {
    .template-card,
    .action-button {
      transition: none;
    }

    .template-card:hover {
      transform: none;
    }
  }
</style>
