<!--
  EditPanelRack Component
  Edit panel section: properties for the selected rack or bayed rack group:
  name, height, width, depth, form factor, U numbering, base weight,
  rear-view visibility, notes, annotation field, and delete.

  Transitional: the "Show Rear View" and "Annotation Field" controls are
  layout-scoped view toggles that move to the M14 View tab (#2078). They live
  here for now to preserve current behaviour.
-->
<script lang="ts">
  import { onDestroy } from "svelte";
  import SegmentedControl from "./SegmentedControl.svelte";
  import MarkdownPreview from "./MarkdownPreview.svelte";
  import SavedIndicator from "./ui/SavedIndicator.svelte";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getSelectionStore } from "$lib/stores/selection.svelte";
  import { getUIStore } from "$lib/stores/ui.svelte";
  import { getCanvasStore } from "$lib/stores/canvas.svelte";
  import {
    canResizeRackTo,
    getConflictDetails,
    formatConflictMessage,
  } from "$lib/utils/rack-resize";
  import {
    COMMON_RACK_HEIGHTS,
    RACK_DEPTH_PRESETS_MM,
    DEFAULT_RACK_DEPTH_MM,
    DEFAULT_RACK_BASE_WEIGHT,
  } from "$lib/types/constants";
  import type {
    Rack,
    RackGroup,
    AnnotationField,
    FormFactor,
  } from "$lib/types";

  interface Props {
    selectedRack: Rack;
    selectedGroup: RackGroup | null;
  }

  let { selectedRack, selectedGroup }: Props = $props();

  const layoutStore = getLayoutStore();
  const selectionStore = getSelectionStore();
  const uiStore = getUIStore();
  const canvasStore = getCanvasStore();

  // Selectable rack widths. RackSchema.width already permits all four; the
  // to-scale 21-inch drawing lands in #2736.
  const widthOptions = [10, 19, 21, 23] as const;

  // Form factor options for the selector.
  const formFactorOptions: { value: FormFactor; label: string }[] = [
    { value: "2-post", label: "2-post" },
    { value: "4-post", label: "4-post" },
    { value: "4-post-cabinet", label: "4-post cabinet" },
    { value: "wall-mount", label: "Wall mount" },
    { value: "open-frame", label: "Open frame" },
  ];

  // Local state for form fields
  let rackName = $state("");
  let rackHeight = $state(42);
  let rackNotes = $state("");
  let rackDepth = $state(DEFAULT_RACK_DEPTH_MM);
  let rackWeight = $state(DEFAULT_RACK_BASE_WEIGHT);

  // Resize validation error state
  let resizeError = $state<string | null>(null);
  let depthError = $state<string | null>(null);
  let weightError = $state<string | null>(null);

  // Save feedback for the Name field (#3005): height, width, depth, and
  // numbering apply on click and are visibly reflected immediately (active
  // preset, updated value); Name commits on blur, so it gets the same
  // "Saved" acknowledgement used by the device edit panel's blur-committed
  // fields rather than reading as frozen next to them.
  let rackNameSaved = $state(false);
  let rackNameSavedTimeout: ReturnType<typeof setTimeout> | undefined;

  onDestroy(() => {
    if (rackNameSavedTimeout) {
      clearTimeout(rackNameSavedTimeout);
      rackNameSavedTimeout = undefined;
    }
  });

  // Identity of the currently edited rack/group, tracked via a plain closure
  // variable (not $state) so reading it doesn't add a reactive dependency of
  // its own; it's only ever compared against inside the effect below.
  let previousEntityKey: string | null = null;

  // Sync local state with selected rack/group and clear errors. This effect
  // also reruns on every field write to the *currently* selected rack (e.g.
  // right after this panel's own Name save, since that updates
  // selectedRack.name), so the Name Saved-flash flag is only cleared when the
  // entity identity itself changes, not on every resync (#3005).
  $effect(() => {
    // For bayed racks, use the group name; otherwise use rack name
    rackName = selectedGroup?.name ?? selectedRack.name;
    rackHeight = selectedRack.height;
    rackNotes = selectedRack.notes ?? "";
    rackDepth = selectedRack.depth_mm ?? DEFAULT_RACK_DEPTH_MM;
    rackWeight = selectedRack.base_weight ?? DEFAULT_RACK_BASE_WEIGHT;
    resizeError = null; // Clear any previous resize error
    depthError = null;
    weightError = null;

    const entityKey = selectedGroup
      ? `group:${selectedGroup.id}`
      : `rack:${selectedRack.id}`;
    if (entityKey !== previousEntityKey) {
      previousEntityKey = entityKey;
      clearTimeout(rackNameSavedTimeout);
      rackNameSaved = false;
    }
  });

  // Update rack/group name on blur
  function handleNameBlur() {
    const currentName = selectedGroup?.name ?? selectedRack.name;
    if (rackName !== currentName) {
      if (selectedGroup) {
        // Update group name for bayed racks
        layoutStore.updateRackGroup(selectedGroup.id, {
          name: rackName || undefined,
        });
      } else {
        // Update rack name for regular racks
        layoutStore.updateRack(selectedRack.id, { name: rackName });
      }
      clearTimeout(rackNameSavedTimeout);
      rackNameSaved = true;
      rackNameSavedTimeout = setTimeout(() => {
        rackNameSaved = false;
      }, 2000);
    }
  }

  // Update rack name on Enter
  function handleNameKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      (event.target as HTMLInputElement).blur();
    }
  }

  // Update rack notes on blur
  function handleNotesBlur() {
    const trimmedNotes = rackNotes.trim();
    const notesToSave = trimmedNotes === "" ? undefined : trimmedNotes;
    if (notesToSave !== selectedRack.notes) {
      layoutStore.updateRack(selectedRack.id, { notes: notesToSave });
    }
  }

  // Validate and apply height change
  function attemptHeightChange(newHeight: number): boolean {
    // Re-submitting the current height (re-entering the value, clicking the
    // already-active preset) is a no-op, not a resize attempt, so it must not
    // surface a rejection error (#2222).
    if (newHeight === selectedRack.height) {
      resizeError = null;
      return true;
    }

    // Bayed racks must all share a height, so the store rejects per-rack
    // height changes. Detect that here and revert the optimistic value,
    // otherwise the input keeps showing a height the rack never adopted
    // (#2222). getRackGroupForRack is authoritative regardless of whether
    // the group or an individual bay was selected.
    const group = layoutStore.getRackGroupForRack(selectedRack.id);
    if (group?.layout_preset === "bayed") {
      resizeError = "Bayed racks must share the same height.";
      rackHeight = selectedRack.height;
      return false;
    }

    const result = canResizeRackTo(
      selectedRack,
      newHeight,
      layoutStore.device_types,
    );

    if (!result.allowed) {
      const conflictDetails = getConflictDetails(
        result.conflicts,
        layoutStore.device_types,
      );
      resizeError = formatConflictMessage(conflictDetails);
      // Revert local state to current rack height
      rackHeight = selectedRack.height;
      return false;
    }

    // Clear error and apply change
    resizeError = null;
    layoutStore.updateRack(selectedRack.id, { height: newHeight });
    // Reset view to center the resized rack
    canvasStore.fitAll(layoutStore.activeRack ? [layoutStore.activeRack] : []);
    return true;
  }

  // Update rack height on input change
  function handleHeightChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const newHeight = parseInt(target.value, 10);
    if (newHeight >= 1 && newHeight <= 100) {
      attemptHeightChange(newHeight);
    }
  }

  // Handle preset button click
  function handlePresetClick(preset: number) {
    rackHeight = preset;
    attemptHeightChange(preset);
  }

  // Apply a depth value in millimetres. Rejects blank, non-finite, and
  // non-positive input so the store never receives an invalid measurement.
  function applyDepth(value: number) {
    if (!Number.isFinite(value) || value <= 0) {
      depthError = "Depth must be a positive number in millimetres.";
      rackDepth = selectedRack.depth_mm ?? DEFAULT_RACK_DEPTH_MM;
      return;
    }
    depthError = null;
    rackDepth = value;
    if (value !== selectedRack.depth_mm) {
      layoutStore.updateRack(selectedRack.id, { depth_mm: value });
    }
  }

  function handleDepthChange(event: Event) {
    const raw = (event.target as HTMLInputElement).value;
    applyDepth(raw.trim() === "" ? Number.NaN : Number(raw));
  }

  function handleDepthPresetClick(preset: number) {
    applyDepth(preset);
  }

  // Apply a base-weight value. Rejects blank, non-finite, and negative input;
  // zero is allowed.
  function handleWeightChange(event: Event) {
    const raw = (event.target as HTMLInputElement).value;
    const value = raw.trim() === "" ? Number.NaN : Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      weightError = "Base weight must be zero or a positive number.";
      rackWeight = selectedRack.base_weight ?? DEFAULT_RACK_BASE_WEIGHT;
      return;
    }
    weightError = null;
    rackWeight = value;
    if (value !== selectedRack.base_weight) {
      layoutStore.updateRack(selectedRack.id, { base_weight: value });
    }
  }

  // Delete selected rack or bayed rack group
  function handleDeleteRack() {
    if (selectedGroup) {
      // Delete entire bayed rack group - must delete racks first, then the group
      const rackIds = [...selectedGroup.rack_ids];
      selectionStore.clearSelection();
      // Delete each rack in the group
      for (const rackId of rackIds) {
        layoutStore.deleteRack(rackId);
      }
      // The group will be auto-deleted when all racks are removed
    } else {
      // Delete individual rack (clear selection first, matching the group path)
      const rackId = selectedRack.id;
      selectionStore.clearSelection();
      layoutStore.deleteRack(rackId);
    }
  }
</script>

<div class="edit-form">
  <div class="form-group">
    <label for="rack-name">
      Name
      <SavedIndicator
        show={rackNameSaved}
        data-testid="saved-indicator-rack-name"
      />
    </label>
    <input
      type="text"
      id="rack-name"
      class="input-field"
      bind:value={rackName}
      onblur={handleNameBlur}
      onkeydown={handleNameKeydown}
      maxlength="50"
    />
  </div>

  <div class="form-group">
    <label for="rack-height">Height</label>
    <input
      type="number"
      id="rack-height"
      class="input-field"
      class:error={resizeError !== null}
      bind:value={rackHeight}
      onchange={handleHeightChange}
      min="1"
      max="100"
    />
    {#if resizeError}
      <p class="helper-text error">Cannot resize: {resizeError}</p>
    {/if}
    <div class="height-presets">
      {#each COMMON_RACK_HEIGHTS as preset (preset)}
        <button
          type="button"
          class="preset-btn"
          data-testid="btn-preset-height-{preset}"
          class:active={rackHeight === preset}
          onclick={() => handlePresetClick(preset)}
        >
          {preset}U
        </button>
      {/each}
    </div>
  </div>

  <div class="form-group">
    <label for="rack-width">Width</label>
    <div class="preset-row" role="group" aria-label="Rack width in inches">
      {#each widthOptions as option (option)}
        <button
          type="button"
          class="preset-btn"
          class:active={selectedRack.width === option}
          aria-pressed={selectedRack.width === option}
          onclick={() =>
            layoutStore.updateRack(selectedRack.id, { width: option })}
        >
          {option}"
        </button>
      {/each}
    </div>
  </div>

  <div class="form-group">
    <label for="rack-depth">Depth (mm)</label>
    <input
      type="number"
      id="rack-depth"
      class="input-field"
      class:error={depthError !== null}
      bind:value={rackDepth}
      onchange={handleDepthChange}
      min="1"
      step="1"
    />
    {#if depthError}
      <p class="helper-text error">{depthError}</p>
    {/if}
    <div class="preset-row">
      {#each RACK_DEPTH_PRESETS_MM as preset (preset)}
        <button
          type="button"
          class="preset-btn"
          class:active={rackDepth === preset}
          onclick={() => handleDepthPresetClick(preset)}
        >
          {preset}
        </button>
      {/each}
    </div>
  </div>

  <div class="form-group">
    <label for="rack-form-factor">Form Factor</label>
    <select
      id="rack-form-factor"
      class="input-field"
      value={selectedRack.form_factor}
      onchange={(e) =>
        layoutStore.updateRack(selectedRack.id, {
          form_factor: e.currentTarget.value as FormFactor,
        })}
    >
      {#each formFactorOptions as option (option.value)}
        <option value={option.value}>{option.label}</option>
      {/each}
    </select>
  </div>

  <div class="form-group">
    <label for="rack-numbering">U Numbering</label>
    <SegmentedControl
      options={[
        { value: "bottom", label: "U1 at bottom" },
        { value: "top", label: "U1 at top" },
      ]}
      value={selectedRack.desc_units ? "top" : "bottom"}
      onchange={(value) =>
        layoutStore.updateRack(selectedRack.id, {
          desc_units: value === "top",
        })}
      ariaLabel="U numbering direction"
    />
  </div>

  <div class="form-group">
    <label for="rack-base-weight">Base Weight</label>
    <input
      type="number"
      id="rack-base-weight"
      class="input-field"
      class:error={weightError !== null}
      bind:value={rackWeight}
      onchange={handleWeightChange}
      min="0"
      step="0.1"
    />
    {#if weightError}
      <p class="helper-text error">{weightError}</p>
    {/if}
  </div>

  <div class="form-group">
    <label for="show-rear-view">Show Rear View</label>
    <SegmentedControl
      options={[
        { value: "show", label: "Show" },
        { value: "hide", label: "Hide" },
      ]}
      value={selectedRack.show_rear ? "show" : "hide"}
      onchange={(value) => {
        const showRear = value === "show";
        if (selectedGroup) {
          // For bayed racks, update all racks in the group
          for (const rackId of selectedGroup.rack_ids) {
            layoutStore.updateRack(rackId, { show_rear: showRear });
          }
        } else {
          layoutStore.updateRack(selectedRack.id, { show_rear: showRear });
        }
      }}
      ariaLabel="Show rear view on canvas"
    />
  </div>

  <div class="form-group">
    <label for="rack-notes">Notes</label>
    <textarea
      id="rack-notes"
      class="input-field textarea"
      bind:value={rackNotes}
      onblur={handleNotesBlur}
      rows="4"
      placeholder="Add notes about this rack..."></textarea>
    {#if rackNotes.trim()}
      <div class="notes-preview">
        <span class="preview-label">Preview</span>
        <MarkdownPreview content={rackNotes} />
      </div>
    {/if}
  </div>

  <div class="form-group">
    <label for="annotation-field">Annotation Field</label>
    <select
      id="annotation-field"
      class="input-field"
      value={uiStore.annotationField}
      onchange={(e) =>
        uiStore.setAnnotationField(e.currentTarget.value as AnnotationField)}
    >
      <option value="name">Name</option>
      <option value="ip">IP Address</option>
      <option value="notes">Notes</option>
      <option value="asset_tag">Asset Tag</option>
      <option value="serial">Serial Number</option>
      <option value="manufacturer">Manufacturer</option>
    </select>
    <p class="helper-text">
      Field shown in annotation column (press N to toggle)
    </p>
  </div>

  <div class="actions">
    <button
      type="button"
      class="btn-danger"
      onclick={handleDeleteRack}
      aria-label={selectedGroup ? "Delete bayed rack" : "Delete rack"}
    >
      {selectedGroup ? "Delete Bayed Rack" : "Delete Rack"}
    </button>
  </div>
</div>

<style>
  .edit-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
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
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .form-group input {
    padding: var(--space-2) var(--space-3);
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    border-radius: var(--radius-sm);
    color: var(--colour-text);
    font-size: var(--font-size-base);
  }

  .form-group input:focus {
    outline: none;
    border-color: var(--colour-selection);
  }

  .form-group select {
    padding: var(--space-2) var(--space-3);
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    border-radius: var(--radius-sm);
    color: var(--colour-text);
    font-size: var(--font-size-base);
    cursor: pointer;
  }

  .form-group select:focus {
    outline: none;
    border-color: var(--colour-selection);
  }

  .form-group textarea {
    padding: var(--space-2) var(--space-3);
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    border-radius: var(--radius-sm);
    color: var(--colour-text);
    font-size: var(--font-size-base);
    font-family: inherit;
    resize: vertical;
    min-height: 80px;
  }

  .form-group textarea:focus {
    outline: none;
    border-color: var(--colour-selection);
  }

  .helper-text {
    font-size: var(--font-size-sm);
    margin: 0;
    color: var(--colour-text-muted);
  }

  .helper-text.error {
    color: var(--colour-error);
  }

  .input-field.error {
    border-color: var(--colour-error);
  }

  .height-presets {
    display: flex;
    gap: var(--space-2);
    margin-top: var(--space-1);
  }

  .preset-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: var(--space-1);
  }

  .preset-btn {
    padding: var(--space-1) var(--space-2);
    background: var(--button-bg);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    color: var(--colour-text);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: background-color var(--duration-fast);
  }

  .preset-btn:hover {
    background: var(--button-bg-hover);
  }

  .preset-btn.active {
    background: var(--colour-selection);
    border-color: var(--colour-selection);
    color: var(--colour-text-inverse);
  }

  .actions {
    margin-top: var(--space-6);
  }

  .btn-danger {
    width: 100%;
    padding: var(--space-3) var(--space-4);
    background: var(--colour-error);
    border: none;
    border-radius: var(--radius-sm);
    color: var(--colour-text-inverse);
    font-size: var(--font-size-base);
    font-weight: 500;
    cursor: pointer;
    transition: background-color var(--duration-fast);
  }

  .btn-danger:hover {
    background: var(--colour-error-hover);
  }

  /* Markdown preview for notes */
  .notes-preview {
    margin-top: var(--space-2);
    padding: var(--space-2);
    background: var(--colour-surface-secondary);
    border-radius: var(--radius-md);
    border: 1px solid var(--colour-border);
  }

  .preview-label {
    display: block;
    font-size: var(--font-size-xs);
    font-weight: 500;
    color: var(--colour-text-muted);
    margin-bottom: var(--space-1);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
</style>
