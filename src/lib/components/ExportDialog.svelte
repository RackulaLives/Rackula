<!--
  Export Dialog Component
  Allows user to configure export options for rack layouts
  Features LogoLoader during export, shimmer preview, rack selection for multi-rack exports
-->
<script lang="ts">
  import type {
    Rack,
    RackGroup,
    ExportFormat,
    ExportBackground,
    ExportOptions,
    ExportView,
    DeviceType,
    DisplayMode,
  } from "$lib/types";
  import type { ImageStoreMap } from "$lib/types/images";
  import Dialog from "./Dialog.svelte";
  import LogoLoader from "./LogoLoader.svelte";
  import Shimmer from "./Shimmer.svelte";
  import { generateExportSVG, generateExportFilename } from "$lib/utils/export";
  import { analytics } from "$lib/utils/analytics";
  import { SvelteSet } from "svelte/reactivity";

  /**
   * Represents a selectable item in the export dialog.
   * Can be either a standalone rack or a bayed rack group.
   */
  interface SelectableItem {
    /** Unique identifier (rack ID for standalone, group ID for groups) */
    id: string;
    /** Display name */
    name: string;
    /** Height display (e.g., "42U" or "42U × 3-bay") */
    heightDisplay: string;
    /** All rack IDs included in this item */
    rackIds: string[];
    /** Whether this is a bayed group */
    isBayedGroup: boolean;
  }

  interface Props {
    open: boolean;
    racks: Rack[];
    /** Rack groups for bayed rack consolidation */
    rackGroups?: RackGroup[];
    deviceTypes: DeviceType[];
    images?: ImageStoreMap;
    displayMode?: DisplayMode;
    layoutName?: string;
    selectedRackId: string | null;
    /** Pre-selected rack IDs for multi-rack export (from context menu) */
    selectedRackIds?: string[];
    isExporting?: boolean;
    exportMessage?: string;
    /** Progress for multi-rack exports (0-100) */
    exportProgress?: number;
    qrCodeDataUrl?: string;
    onexport?: (event: CustomEvent<ExportOptions>) => void;
    oncancel?: () => void;
  }

  let {
    open,
    racks,
    rackGroups = [],
    deviceTypes,
    images,
    displayMode = "label",
    layoutName = "layout",
    selectedRackId: _selectedRackId,
    selectedRackIds: initialSelectedRackIds,
    isExporting = false,
    exportMessage = "Exporting...",
    exportProgress,
    qrCodeDataUrl,
    onexport,
    oncancel,
  }: Props = $props();

  // Form state
  let format = $state<ExportFormat>("png");
  let includeLegend = $state(false);
  let background = $state<ExportBackground>("dark");
  let exportView = $state<ExportView>("both");
  let transparent = $state(false);
  let includeQR = $state(false);

  // Rack selection state (stores rack IDs, not item IDs)
  // Using SvelteSet for reactive mutations (.add/.delete/.clear)
  const selectedRacks = new SvelteSet<string>();

  // Preview pagination state (for 4+ racks)
  let previewIndex = $state(0);

  // Build selectable items: consolidate bayed groups, keep standalone racks separate
  const selectableItems = $derived.by((): SelectableItem[] => {
    const items: SelectableItem[] = [];
    const racksInGroups = new SvelteSet<string>();

    // Get bayed groups only (layout_preset === 'bayed')
    const bayedGroups = rackGroups.filter((g) => g.layout_preset === "bayed");

    // Add bayed groups as single selectable items
    for (const group of bayedGroups) {
      const groupRacks = group.rack_ids
        .map((id) => racks.find((r) => r.id === id))
        .filter((r): r is Rack => r !== undefined);

      if (groupRacks.length === 0) continue;

      // Mark these racks as belonging to a group
      for (const rackId of group.rack_ids) {
        racksInGroups.add(rackId);
      }

      // Use group name if available, otherwise first rack's name
      const displayName = group.name || groupRacks[0]!.name;
      const height = groupRacks[0]!.height;
      const bayCount = groupRacks.length;

      items.push({
        id: group.id,
        name: displayName,
        heightDisplay: `${height}U × ${bayCount}-bay`,
        rackIds: group.rack_ids,
        isBayedGroup: true,
      });
    }

    // Add standalone racks (not part of any bayed group)
    for (const rack of racks) {
      if (!racksInGroups.has(rack.id)) {
        items.push({
          id: rack.id,
          name: rack.name,
          heightDisplay: `${rack.height}U`,
          rackIds: [rack.id],
          isBayedGroup: false,
        });
      }
    }

    return items;
  });

  // Initialize rack selection when dialog opens or selectedRackIds changes
  $effect(() => {
    if (open) {
      // Clear and repopulate the set (mutation triggers reactivity)
      selectedRacks.clear();
      if (initialSelectedRackIds && initialSelectedRackIds.length > 0) {
        // Pre-select specified racks (from context menu)
        for (const id of initialSelectedRackIds) {
          selectedRacks.add(id);
        }
      } else {
        // Default: all racks selected
        for (const rack of racks) {
          selectedRacks.add(rack.id);
        }
      }
      previewIndex = 0;
    }
  });

  // Computed: Is CSV format (data export - no image options)
  const isCSV = $derived(format === "csv");

  // Computed: Can select transparent background (PNG and SVG only)
  const canSelectTransparent = $derived(format === "svg" || format === "png");

  // Computed: Can include QR code (when QR code data URL is available and not CSV)
  const canIncludeQR = $derived(!isCSV && !!qrCodeDataUrl);

  // Computed: Show rack selection (only when 2+ selectable items)
  const showRackSelection = $derived(selectableItems.length >= 2);

  // Computed: Selected racks array (ordered by position)
  const selectedRacksArray = $derived(
    racks.filter((r) => selectedRacks.has(r.id)),
  );

  // Check if a selectable item is fully selected (all its racks are selected)
  function isItemSelected(item: SelectableItem): boolean {
    return item.rackIds.every((id) => selectedRacks.has(id));
  }

  // Check if a selectable item is partially selected (some but not all racks selected)
  function isItemPartiallySelected(item: SelectableItem): boolean {
    const selectedCount = item.rackIds.filter((id) =>
      selectedRacks.has(id),
    ).length;
    return selectedCount > 0 && selectedCount < item.rackIds.length;
  }

  // Count of selected items (for select all/deselect all button state)
  const selectedItemsCount = $derived(
    selectableItems.filter((item) => isItemSelected(item)).length,
  );

  // Computed: Will export as multi-file (ZIP for images, multi-page for PDF)
  const isMultiFileExport = $derived(selectedRacksArray.length >= 4 && !isCSV);

  // Computed: Can export (has racks selected)
  const canExport = $derived(selectedRacksArray.length > 0);

  // Computed: Preview filename
  const previewFilename = $derived(
    isMultiFileExport && format !== "pdf"
      ? generateExportFilename(layoutName, null, "zip")
      : generateExportFilename(layoutName, isCSV ? null : exportView, format),
  );

  // Computed: Info message for multi-file export
  const multiFileMessage = $derived(
    !isMultiFileExport
      ? null
      : format === "pdf"
        ? `${selectedRacksArray.length} racks selected — will export as multi-page PDF`
        : `${selectedRacksArray.length} racks selected — will export as ZIP with one image per rack`,
  );

  // Reset transparent when switching to format that doesn't support it
  $effect(() => {
    if (!canSelectTransparent && transparent) {
      transparent = false;
    }
  });

  // Reset preview index when selection changes
  $effect(() => {
    if (previewIndex >= selectedRacksArray.length) {
      previewIndex = Math.max(0, selectedRacksArray.length - 1);
    }
  });

  // Preview SVG state
  let previewSvgString = $state<string | null>(null);
  let previewDimensions = $state<{ width: number; height: number } | null>(
    null,
  );
  let previewError = $state<string | null>(null);

  // Generate preview when options change (for non-CSV formats)
  $effect(() => {
    if (!open || isCSV || selectedRacksArray.length === 0) {
      previewSvgString = null;
      previewDimensions = null;
      previewError = null;
      return;
    }

    // Build preview options
    const effectiveBackground = transparent ? "transparent" : background;
    const previewOptions: ExportOptions = {
      format: "svg", // Always generate as SVG for preview
      scope: "all",
      includeNames: true,
      includeLegend,
      background: effectiveBackground,
      exportView,
      displayMode,
      includeQR: canIncludeQR ? includeQR : false,
      qrCodeDataUrl: canIncludeQR && includeQR ? qrCodeDataUrl : undefined,
    };

    try {
      // For multi-file export (4+ racks), show paginated single-rack preview
      // For composite export (1-3 racks), show all selected racks together
      const racksToPreview = isMultiFileExport
        ? [selectedRacksArray[previewIndex]].filter(Boolean)
        : selectedRacksArray;

      if (racksToPreview.length === 0) {
        previewSvgString = null;
        previewDimensions = null;
        return;
      }

      const svg = generateExportSVG(
        racksToPreview,
        deviceTypes,
        previewOptions,
        images,
        rackGroups,
      );
      const width = parseInt(svg.getAttribute("width") || "0", 10);
      const height = parseInt(svg.getAttribute("height") || "0", 10);

      previewDimensions = { width, height };
      previewSvgString = svg.outerHTML;
      previewError = null;
    } catch (error) {
      // Log detailed error for debugging
      console.error("Export preview generation failed:", error);
      previewSvgString = null;
      previewDimensions = null;
      previewError = "Preview generation failed";
    }
  });

  function handleExport() {
    // Use transparent background if checkbox is checked, otherwise use selected background
    const effectiveBackground = transparent ? "transparent" : background;

    const options: ExportOptions = {
      format,
      scope: "all",
      includeNames: true,
      includeLegend,
      background: effectiveBackground,
      exportView,
      includeQR: canIncludeQR ? includeQR : false,
      qrCodeDataUrl: canIncludeQR && includeQR ? qrCodeDataUrl : undefined,
      selectedRackIds: Array.from(selectedRacks),
    };
    onexport?.(new CustomEvent("export", { detail: options }));
  }

  function handleCancel() {
    analytics.trackPanelClose("export");
    oncancel?.();
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      handleCancel();
    }
  }

  // Selectable item toggle - toggles all racks in the item
  function toggleItem(item: SelectableItem) {
    if (isItemSelected(item)) {
      // Deselect all racks in this item
      for (const rackId of item.rackIds) {
        selectedRacks.delete(rackId);
      }
    } else {
      // Select all racks in this item
      for (const rackId of item.rackIds) {
        selectedRacks.add(rackId);
      }
    }
  }

  function selectAllItems() {
    selectedRacks.clear();
    for (const rack of racks) {
      selectedRacks.add(rack.id);
    }
  }

  function deselectAllItems() {
    selectedRacks.clear();
  }

  // Preview pagination
  function prevPreview() {
    previewIndex = Math.max(0, previewIndex - 1);
  }

  function nextPreview() {
    previewIndex = Math.min(selectedRacksArray.length - 1, previewIndex + 1);
  }

  // Add/remove event listener based on open state and track panel open
  $effect(() => {
    if (open) {
      analytics.trackPanelOpen("export");
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        window.removeEventListener("keydown", handleKeyDown);
      };
    }
  });
</script>

<Dialog {open} title="Export" width="480px" onclose={handleCancel}>
  <div class="export-form">
    <div class="form-group">
      <label for="export-format">Format</label>
      <select id="export-format" bind:value={format}>
        <option value="png">PNG</option>
        <option value="jpeg">JPEG</option>
        <option value="svg">SVG</option>
        <option value="pdf">PDF</option>
        <option value="csv">CSV (Spreadsheet)</option>
      </select>
    </div>

    {#if isCSV}
      <p class="csv-info">
        Exports rack contents as a spreadsheet with device positions, names,
        models, and categories.
      </p>
    {:else}
      <!-- Rack Selection (for 2+ selectable items) -->
      {#if showRackSelection}
        <div class="form-group rack-selection">
          <div class="rack-selection-header">
            <span class="section-label">Racks</span>
            <div class="rack-selection-actions">
              <button
                type="button"
                class="btn-link"
                onclick={selectAllItems}
                disabled={selectedItemsCount === selectableItems.length}
              >
                Select All
              </button>
              <span class="separator">|</span>
              <button
                type="button"
                class="btn-link"
                onclick={deselectAllItems}
                disabled={selectedRacks.size === 0}
              >
                Deselect All
              </button>
            </div>
          </div>
          <div class="rack-checklist">
            {#each selectableItems as item (item.id)}
              <label class="rack-item" class:bayed-group={item.isBayedGroup}>
                <input
                  type="checkbox"
                  checked={isItemSelected(item)}
                  indeterminate={isItemPartiallySelected(item)}
                  onchange={() => toggleItem(item)}
                />
                <span class="rack-name">{item.name}</span>
                <span class="rack-height">{item.heightDisplay}</span>
              </label>
            {/each}
          </div>
        </div>

        <!-- Multi-file export info message -->
        {#if multiFileMessage}
          <div class="info-message">
            <span class="info-icon">ℹ️</span>
            <span>{multiFileMessage}</span>
          </div>
        {/if}
      {/if}

      <div class="form-group">
        <label for="export-view">View</label>
        <select id="export-view" bind:value={exportView}>
          <option value="both">Front & Rear (Side-by-Side)</option>
          <option value="front">Front Only</option>
          <option value="rear">Rear Only</option>
        </select>
      </div>

      <div class="form-group">
        <label for="export-theme">Theme</label>
        <select
          id="export-theme"
          bind:value={background}
          disabled={transparent}
        >
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </div>

      {#if canSelectTransparent}
        <div class="form-group checkbox-group">
          <label>
            <input type="checkbox" bind:checked={transparent} />
            Transparent background
          </label>
        </div>
      {/if}

      <div class="form-group checkbox-group">
        <label>
          <input type="checkbox" bind:checked={includeLegend} />
          Include legend
        </label>
      </div>

      {#if canIncludeQR}
        <div class="form-group checkbox-group">
          <label>
            <input type="checkbox" bind:checked={includeQR} />
            Include sharing QR code
          </label>
        </div>
      {/if}
    {/if}
  </div>

  <!-- Preview area -->
  {#if !isCSV}
    <div class="preview-section">
      <span class="preview-label">Preview</span>
      {#if isExporting}
        <!-- Show loader during export -->
        <div class="preview-loading">
          <LogoLoader size={48} message={exportMessage} />
          {#if exportProgress !== undefined}
            <div class="progress-bar">
              <div class="progress-fill" style="width: {exportProgress}%"></div>
            </div>
          {/if}
        </div>
      {:else if selectedRacksArray.length === 0}
        <div class="preview-placeholder">No rack selected</div>
      {:else if previewError}
        <!-- Show error when preview generation fails -->
        <div class="preview-error" role="alert">
          <span class="preview-error__icon" aria-hidden="true">⚠</span>
          <span class="preview-error__message">{previewError}</span>
          <span class="preview-error__hint">Try changing export options</span>
        </div>
      {:else if previewSvgString && previewDimensions}
        <Shimmer loading={!previewSvgString}>
          <div
            class="preview-container"
            class:transparent-bg={transparent}
            style="aspect-ratio: {previewDimensions.width} / {previewDimensions.height};"
          >
            <!-- eslint-disable-next-line svelte/no-at-html-tags -- Safe: SVG generated by our own generateExportSVG function -->
            {@html previewSvgString}
          </div>
        </Shimmer>

        <!-- Pagination for 4+ racks -->
        {#if isMultiFileExport && selectedRacksArray.length > 1}
          <div class="preview-pagination">
            <button
              type="button"
              class="btn-icon"
              onclick={prevPreview}
              disabled={previewIndex === 0}
              aria-label="Previous rack"
            >
              ◀
            </button>
            <span class="pagination-info">
              {previewIndex + 1} of {selectedRacksArray.length}
            </span>
            <button
              type="button"
              class="btn-icon"
              onclick={nextPreview}
              disabled={previewIndex === selectedRacksArray.length - 1}
              aria-label="Next rack"
            >
              ▶
            </button>
          </div>
          <div class="preview-rack-name">
            {selectedRacksArray[previewIndex]?.name ?? ""}
            ({selectedRacksArray[previewIndex]?.height ?? 0}U)
          </div>
        {/if}
      {/if}
    </div>
  {/if}

  <!-- Filename preview -->
  <div class="filename-preview">
    <span class="filename-label">Filename:</span>
    <span class="filename-value">{previewFilename}</span>
  </div>

  <div class="dialog-actions">
    <button
      type="button"
      class="btn-secondary"
      onclick={handleCancel}
      disabled={isExporting}
    >
      Cancel
    </button>
    <button
      type="button"
      class="btn-primary"
      onclick={handleExport}
      disabled={!canExport || isExporting}
    >
      {isExporting ? "Exporting..." : "Export"}
    </button>
  </div>
</Dialog>

<style>
  .export-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-2) 0;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-1-5);
  }

  .form-group label {
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    color: var(--colour-text);
  }

  .form-group select {
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    background: var(--input-bg);
    color: var(--colour-text);
    font-size: var(--font-size-base);
    cursor: pointer;
  }

  .form-group select:focus {
    outline: 2px solid var(--colour-selection);
    outline-offset: 1px;
  }

  .form-group select option:disabled {
    color: var(--colour-text-muted);
  }

  .csv-info {
    color: var(--colour-text-muted);
    font-size: var(--font-size-sm);
    line-height: 1.5;
    margin: 0;
    padding: var(--space-2) 0;
  }

  /* Rack Selection */
  .rack-selection {
    gap: var(--space-2);
  }

  .rack-selection-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .section-label {
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    color: var(--colour-text);
  }

  .rack-selection-actions {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }

  .btn-link {
    background: none;
    border: none;
    color: var(--colour-selection);
    font-size: var(--font-size-sm);
    cursor: pointer;
    padding: 0;
  }

  .btn-link:hover:not(:disabled) {
    text-decoration: underline;
  }

  .btn-link:disabled {
    color: var(--colour-text-muted);
    cursor: not-allowed;
  }

  .separator {
    color: var(--colour-text-muted);
  }

  .rack-checklist {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    max-height: 120px;
    overflow-y: auto;
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    padding: var(--space-2);
  }

  .rack-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    cursor: pointer;
    padding: var(--space-1);
    border-radius: var(--radius-sm);
    font-weight: var(--font-weight-normal);
  }

  .rack-item:hover {
    background: var(--colour-surface-hover);
  }

  .rack-item input[type="checkbox"] {
    width: var(--space-4);
    height: var(--space-4);
    accent-color: var(--colour-selection);
    cursor: pointer;
    flex-shrink: 0;
  }

  .rack-name {
    flex: 1;
    font-size: var(--font-size-sm);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .rack-height {
    font-size: var(--font-size-xs);
    color: var(--colour-text-muted);
    flex-shrink: 0;
  }

  /* Bayed group indicator */
  .rack-item.bayed-group .rack-name::before {
    content: "";
    display: inline-block;
    width: var(--space-1-5);
    height: var(--space-1-5);
    background: var(--colour-selection);
    border-radius: 50%;
    margin-right: var(--space-1-5);
    vertical-align: middle;
  }

  /* Info message */
  .info-message {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--colour-surface-hover);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
    color: var(--colour-text);
  }

  .info-icon {
    flex-shrink: 0;
  }

  .preview-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  .preview-label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--colour-text-muted);
  }

  .preview-container {
    max-width: 200px;
    max-height: 300px;
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    overflow: hidden;
    background: var(--colour-surface);
  }

  .preview-container.transparent-bg {
    /* Checkerboard pattern for transparent background preview */
    background-image:
      linear-gradient(45deg, #808080 25%, transparent 25%),
      linear-gradient(-45deg, #808080 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #808080 75%),
      linear-gradient(-45deg, transparent 75%, #808080 75%);
    background-size: 10px 10px;
    background-position:
      0 0,
      0 5px,
      5px -5px,
      -5px 0;
  }

  .preview-container :global(svg) {
    display: block;
    width: 100%;
    height: auto;
  }

  .preview-placeholder {
    max-width: 200px;
    height: 100px;
    border: 1px dashed var(--colour-border);
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--colour-text-muted);
    font-size: var(--font-size-sm);
  }

  .preview-loading {
    max-width: 200px;
    min-height: 120px;
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    background: var(--colour-surface);
    padding: var(--space-4);
  }

  /* Progress bar */
  .progress-bar {
    width: 100%;
    height: 4px;
    background: var(--colour-border);
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--colour-selection);
    transition: width 0.2s ease;
  }

  /* Preview pagination */
  .preview-pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    margin-top: var(--space-2);
  }

  .btn-icon {
    background: var(--colour-surface);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    padding: var(--space-1) var(--space-2);
    cursor: pointer;
    color: var(--colour-text);
    font-size: var(--font-size-sm);
  }

  .btn-icon:hover:not(:disabled) {
    background: var(--colour-surface-hover);
  }

  .btn-icon:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .pagination-info {
    font-size: var(--font-size-sm);
    color: var(--colour-text-muted);
  }

  .preview-rack-name {
    text-align: center;
    font-size: var(--font-size-sm);
    color: var(--colour-text);
    margin-top: var(--space-1);
  }

  .checkbox-group {
    flex-direction: row;
    align-items: center;
  }

  .checkbox-group label {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    cursor: pointer;
    font-weight: var(--font-weight-normal);
  }

  .checkbox-group input[type="checkbox"] {
    width: var(--space-4);
    height: var(--space-4);
    accent-color: var(--colour-selection);
    cursor: pointer;
  }

  .form-group select:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .filename-preview {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) 0;
    margin-top: var(--space-2);
  }

  .filename-label {
    font-size: var(--font-size-sm);
    color: var(--colour-text-muted);
    flex-shrink: 0;
  }

  .filename-value {
    font-size: var(--font-size-sm);
    font-family: monospace;
    color: var(--colour-text);
    background: var(--colour-surface-hover);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
    margin-top: var(--space-4);
    padding-top: var(--space-4);
    border-top: 1px solid var(--colour-border);
  }

  .btn-secondary,
  .btn-primary {
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition:
      background-color var(--duration-fast) ease,
      opacity var(--duration-fast) ease;
  }

  .btn-secondary {
    background: transparent;
    border: 1px solid var(--colour-border);
    color: var(--colour-text);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--colour-surface-hover);
  }

  .btn-secondary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    background: var(--colour-selection);
    border: none;
    color: var(--neutral-50);
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--colour-selection-hover);
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Preview error state */
  .preview-error {
    max-width: 200px;
    min-height: 100px;
    border: 1px solid var(--colour-error);
    border-radius: var(--radius-sm);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-4);
    background: var(--colour-surface);
  }

  .preview-error__icon {
    font-size: var(--font-size-xl);
    color: var(--colour-error);
  }

  .preview-error__message {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--colour-error);
    text-align: center;
  }

  .preview-error__hint {
    font-size: var(--font-size-xs);
    color: var(--colour-text-muted);
    text-align: center;
  }
</style>
