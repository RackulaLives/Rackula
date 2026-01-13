<!--
  ImportFromNetBoxDialog Component
  Dialog for importing device types from NetBox devicetype-library YAML format
  Uses bits-ui Tabs for accessible input mode selection
-->
<script lang="ts">
  import Dialog from "./Dialog.svelte";
  import { Tabs } from "$lib/components/ui/Tabs";
  import type { DeviceCategory } from "$lib/types";
  import { ALL_CATEGORIES, CATEGORY_COLOURS } from "$lib/types/constants";
  import {
    parseNetBoxYaml,
    convertToDeviceType,
    inferCategory,
    type NetBoxDeviceType,
    type ImportResult,
  } from "$lib/utils/netbox-import";

  interface Props {
    open: boolean;
    onimport?: (result: ImportResult) => void;
    oncancel?: () => void;
  }

  let { open, onimport, oncancel }: Props = $props();

  // Input mode
  type InputMode = "paste" | "upload";
  let inputMode = $state<InputMode>("paste");

  // YAML input state
  let yamlInput = $state("");
  let fileInputEl: HTMLInputElement | null = $state(null);

  // Parsing state
  let isParsing = $state(false);
  let parseError = $state("");
  let parsedData = $state<NetBoxDeviceType | null>(null);

  // Preview overrides
  let categoryOverride = $state<DeviceCategory | null>(null);
  let colourOverride = $state<string | null>(null);
  let userChangedColour = $state(false);

  // Computed values
  let inferredCategory = $derived(
    parsedData ? inferCategory(parsedData) : "other",
  );

  let effectiveCategory = $derived(categoryOverride ?? inferredCategory);
  let effectiveColour = $derived(
    colourOverride ?? CATEGORY_COLOURS[effectiveCategory],
  );

  // Reset state when dialog opens
  $effect(() => {
    if (open) {
      resetForm();
    }
  });

  function resetForm() {
    inputMode = "paste";
    yamlInput = "";
    parseError = "";
    parsedData = null;
    categoryOverride = null;
    colourOverride = null;
    userChangedColour = false;
    isParsing = false;
  }

  function getCategoryLabel(cat: DeviceCategory): string {
    const labels: Record<DeviceCategory, string> = {
      server: "Server",
      network: "Network",
      "patch-panel": "Patch Panel",
      power: "Power",
      storage: "Storage",
      kvm: "KVM",
      "av-media": "AV/Media",
      cooling: "Cooling",
      shelf: "Shelf",
      blank: "Blank Panel",
      "cable-management": "Cable Management",
      other: "Other",
    };
    return labels[cat];
  }

  async function handleParse() {
    if (!yamlInput.trim()) {
      parseError = "Please enter YAML content";
      return;
    }

    isParsing = true;
    parseError = "";
    parsedData = null;

    try {
      const result = await parseNetBoxYaml(yamlInput);

      if (!result.success) {
        parseError = result.error;
      } else {
        parsedData = result.data;
        // Reset overrides when new data is parsed
        categoryOverride = null;
        colourOverride = null;
        userChangedColour = false;
      }
    } catch (err) {
      parseError = err instanceof Error ? err.message : "Unknown error";
    } finally {
      isParsing = false;
    }
  }

  async function handleFileUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    // Validate file type
    if (!file.name.endsWith(".yaml") && !file.name.endsWith(".yml")) {
      parseError = "Please select a .yaml or .yml file";
      return;
    }

    try {
      const text = await file.text();
      yamlInput = text;
      // Auto-parse after file upload
      await handleParse();
    } catch (_err) {
      parseError = "Failed to read file";
    }

    // Reset file input
    if (input) input.value = "";
  }

  function handleCategoryChange(event: Event) {
    const newCategory = (event.target as HTMLSelectElement)
      .value as DeviceCategory;
    categoryOverride = newCategory;

    // Update colour to match category if user hasn't manually changed it
    if (!userChangedColour) {
      colourOverride = CATEGORY_COLOURS[newCategory];
    }
  }

  function handleColourChange(event: Event) {
    colourOverride = (event.target as HTMLInputElement).value;
    userChangedColour = true;
  }

  function handleImport() {
    if (!parsedData) return;

    const result = convertToDeviceType(parsedData, {
      category: categoryOverride ?? undefined,
      colour: colourOverride ?? undefined,
    });

    onimport?.(result);
  }

  function handleCancel() {
    oncancel?.();
  }
</script>

<Dialog {open} title="Import from NetBox" width="560px" onclose={handleCancel}>
  <div class="import-dialog">
    <!-- Input Mode Tabs -->
    <Tabs.Root
      value={inputMode}
      onValueChange={(value) => {
        if (value) inputMode = value as InputMode;
      }}
      orientation="horizontal"
      class="input-tabs-root"
    >
      <Tabs.List class="input-tabs" aria-label="Import input mode">
        <Tabs.Trigger value="paste" class="tab">Paste YAML</Tabs.Trigger>
        <Tabs.Trigger value="upload" class="tab">Upload File</Tabs.Trigger>
      </Tabs.List>

      <!-- Input Area -->
      <Tabs.Content value="paste" class="input-area">
        <textarea
          class="yaml-input"
          bind:value={yamlInput}
          placeholder="Paste NetBox device type YAML here...

Example:
manufacturer: Ubiquiti
model: USW-Pro-24
slug: ubiquiti-usw-pro-24
u_height: 1
is_full_depth: false"
          rows="10"
        ></textarea>
      </Tabs.Content>

      <Tabs.Content value="upload" class="input-area">
        <div class="file-upload">
          <input
            type="file"
            accept=".yaml,.yml"
            bind:this={fileInputEl}
            onchange={handleFileUpload}
            class="file-input"
            id="yaml-file"
          />
          <label for="yaml-file" class="file-label">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M12 16V8M12 8L9 11M12 8L15 11"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path
                d="M3 15V17C3 18.1046 3.89543 19 5 19H19C20.1046 19 21 18.1046 21 17V15"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              />
            </svg>
            <span>Choose a .yaml or .yml file</span>
          </label>
          {#if yamlInput}
            <p class="file-loaded">
              File loaded - {yamlInput.split("\n").length} lines
            </p>
          {/if}
        </div>
      </Tabs.Content>
    </Tabs.Root>

    <!-- Parse Button -->
    {#if !parsedData}
      <button
        type="button"
        class="btn btn-primary parse-btn"
        onclick={handleParse}
        disabled={isParsing || !yamlInput.trim()}
      >
        {isParsing ? "Parsing..." : "Parse YAML"}
      </button>
    {/if}

    <!-- Error Message -->
    {#if parseError}
      <div class="error-message">
        {parseError}
      </div>
    {/if}

    <!-- Preview Section -->
    {#if parsedData}
      <div class="preview-section">
        <h3 class="preview-title">Preview</h3>

        <div class="preview-card" style="border-left-color: {effectiveColour}">
          <div class="preview-header">
            <span class="preview-manufacturer">{parsedData.manufacturer}</span>
            <span class="preview-model">{parsedData.model}</span>
          </div>

          <div class="preview-details">
            <div class="detail-item">
              <span class="detail-label">Slug:</span>
              <code class="detail-value">{parsedData.slug}</code>
            </div>
            <div class="detail-item">
              <span class="detail-label">Height:</span>
              <span class="detail-value">{parsedData.u_height ?? 1}U</span>
            </div>
            {#if parsedData.interfaces?.length}
              <div class="detail-item">
                <span class="detail-label">Interfaces:</span>
                <span class="detail-value">{parsedData.interfaces.length}</span>
              </div>
            {/if}
            {#if parsedData.airflow}
              <div class="detail-item">
                <span class="detail-label">Airflow:</span>
                <span class="detail-value">{parsedData.airflow}</span>
              </div>
            {/if}
          </div>
        </div>

        <!-- Category and Colour Overrides -->
        <div class="override-row">
          <div class="override-group">
            <label for="category-override">Category</label>
            <select
              id="category-override"
              class="input-field"
              value={effectiveCategory}
              onchange={handleCategoryChange}
            >
              {#each ALL_CATEGORIES as cat (cat)}
                <option value={cat}>
                  {getCategoryLabel(cat)}
                  {cat === inferredCategory ? "(inferred)" : ""}
                </option>
              {/each}
            </select>
          </div>

          <div class="override-group">
            <label for="colour-override">Colour</label>
            <div class="colour-input-wrapper">
              <input
                type="color"
                id="colour-override"
                value={effectiveColour}
                onchange={handleColourChange}
                class="colour-input"
              />
              <span class="colour-hex">{effectiveColour}</span>
            </div>
          </div>
        </div>

        <!-- Reset to Parse New -->
        <button
          type="button"
          class="btn btn-secondary reset-btn"
          onclick={() => {
            parsedData = null;
            parseError = "";
          }}
        >
          Parse Different YAML
        </button>
      </div>
    {/if}

    <!-- Action Buttons -->
    <div class="form-actions">
      <button type="button" class="btn btn-secondary" onclick={handleCancel}>
        Cancel
      </button>
      <button
        type="button"
        class="btn btn-primary"
        onclick={handleImport}
        disabled={!parsedData}
      >
        Import
      </button>
    </div>
  </div>
</Dialog>

<style>
  .import-dialog {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  :global(.input-tabs-root) {
    display: contents;
  }

  :global(.input-tabs) {
    display: flex;
    gap: var(--space-1);
    border-bottom: 1px solid var(--colour-border);
    padding-bottom: var(--space-2);
  }

  :global(.tab) {
    padding: var(--space-2) var(--space-4);
    background: transparent;
    border: none;
    border-radius: var(--radius-md) var(--radius-md) 0 0;
    color: var(--colour-text-muted);
    cursor: pointer;
    font-size: var(--font-size-base);
    transition: all var(--transition-fast);
  }

  :global(.tab:hover) {
    color: var(--colour-text);
    background: var(--colour-surface-hover);
  }

  :global(.tab[data-state="active"]) {
    color: var(--colour-selection);
    border-bottom: 2px solid var(--colour-selection);
    margin-bottom: -1px;
  }

  :global(.tab:focus-visible) {
    outline: 2px solid var(--colour-selection);
    outline-offset: -2px;
  }

  :global(.input-area) {
    min-height: 200px;
  }

  .yaml-input {
    width: 100%;
    min-height: 200px;
    padding: var(--space-3);
    background: var(--colour-input-bg, var(--colour-bg));
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-md);
    color: var(--colour-text);
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    resize: vertical;
  }

  .yaml-input:focus {
    outline: none;
    border-color: var(--colour-selection);
    box-shadow: var(--glow-pink-sm);
  }

  .file-upload {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 200px;
    border: 2px dashed var(--colour-border);
    border-radius: var(--radius-md);
    padding: var(--space-6);
    gap: var(--space-3);
  }

  .file-input {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
  }

  .file-label {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    color: var(--colour-text-muted);
    cursor: pointer;
    transition: color var(--transition-fast);
  }

  .file-label:hover {
    color: var(--colour-selection);
  }

  .file-loaded {
    color: var(--colour-success);
    font-size: var(--font-size-sm);
    margin: 0;
  }

  .parse-btn {
    align-self: flex-start;
  }

  .error-message {
    padding: var(--space-3);
    background: var(--colour-error-bg, rgba(255, 85, 85, 0.1));
    border: 1px solid var(--colour-error);
    border-radius: var(--radius-md);
    color: var(--colour-error);
    font-size: var(--font-size-sm);
  }

  .preview-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding-top: var(--space-3);
    border-top: 1px solid var(--colour-border);
  }

  .preview-title {
    margin: 0;
    font-size: var(--font-size-base);
    font-weight: 600;
    color: var(--colour-text);
  }

  .preview-card {
    padding: var(--space-4);
    background: var(--colour-surface);
    border: 1px solid var(--colour-border);
    border-left-width: 4px;
    border-radius: var(--radius-md);
  }

  .preview-header {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-bottom: var(--space-3);
  }

  .preview-manufacturer {
    font-size: var(--font-size-sm);
    color: var(--colour-text-muted);
  }

  .preview-model {
    font-size: var(--font-size-lg);
    font-weight: 600;
    color: var(--colour-text);
  }

  .preview-details {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-2);
  }

  .detail-item {
    display: flex;
    flex-direction: column;
    gap: var(--space-0-5);
  }

  .detail-label {
    font-size: var(--font-size-xs);
    color: var(--colour-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .detail-value {
    font-size: var(--font-size-sm);
    color: var(--colour-text);
  }

  code.detail-value {
    font-family: var(--font-mono);
    background: var(--colour-surface-hover);
    padding: var(--space-0-5) var(--space-1);
    border-radius: var(--radius-sm);
  }

  .override-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-4);
  }

  .override-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-1-5);
  }

  .override-group label {
    font-weight: var(--font-weight-medium);
    color: var(--colour-text);
    font-size: var(--font-size-sm);
  }

  .input-field {
    padding: var(--space-2) var(--space-3);
    background: var(--colour-input-bg, var(--colour-bg));
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-md);
    color: var(--colour-text);
    font-size: var(--font-size-base);
  }

  .input-field:focus {
    outline: none;
    border-color: var(--colour-selection);
    box-shadow: var(--glow-pink-sm);
  }

  .colour-input-wrapper {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .colour-input {
    width: 40px;
    height: 32px;
    padding: 2px;
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    background: transparent;
    cursor: pointer;
  }

  .colour-input::-webkit-color-swatch {
    border: none;
    border-radius: 2px;
  }

  .colour-hex {
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    color: var(--colour-text-muted);
  }

  .reset-btn {
    align-self: flex-start;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
    padding-top: var(--space-3);
    border-top: 1px solid var(--colour-border);
  }

  .btn {
    padding: var(--space-2) var(--space-5);
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: var(--colour-button-bg);
    color: var(--colour-text);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--colour-button-hover);
  }

  .btn-primary {
    background: var(--colour-selection);
    color: var(--colour-text-on-primary);
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--colour-selection-hover);
  }
</style>
