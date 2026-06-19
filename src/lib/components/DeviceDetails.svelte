<!--
  DeviceDetails Component
  The mobile selection inspector: one bottom sheet for the selected device.
  Carries the device facts, the registry-driven verbs (nudge up/down, optional
  slot move, flip, duplicate), inline-editable fields (name, IP, notes), and a
  quiet, de-emphasised Remove. Verbs project from the shared actions registry
  (metadata + enabledWhen) and dispatch by action id, so mobile and desktop
  share one source of truth for command labels, availability, and behaviour.
-->
<script lang="ts">
  import type { PlacedDevice, DeviceType, RackView } from "$lib/types";
  import type { ActionId } from "$lib/actions/registry";
  import type { SelectionVerbItem } from "$lib/actions/verb-bars";
  import {
    IconChevronUp,
    IconChevronDown,
    IconTrash,
    IconFlip,
    IconCopy,
    IconChevronRight,
    IconEdit,
  } from "./icons";
  import { ICON_SIZE } from "$lib/constants/sizing";
  import { formatPosition, UNITS_PER_U } from "$lib/utils/position";
  import { getCategoryDisplayName } from "$lib/utils/deviceFilters";

  interface Props {
    device: PlacedDevice;
    deviceType: DeviceType;
    rackView?: RackView;
    rackHeight?: number;
    /** Show the verb row, editable fields, and Remove. Used on mobile. */
    showActions?: boolean;
    /**
     * Whether the layout is in read-only mode. When true the inspector hides
     * all mutating verbs and editable fields, showing only the device summary
     * line. The caller is still responsible for gating dispatched actions.
     */
    readOnly?: boolean;
    /**
     * Registry-projected selection verbs with disabled state. When supplied
     * (with onaction), the action buttons render from the registry instead of
     * bespoke per-consumer callbacks.
     */
    verbs?: SelectionVerbItem[];
    /** Dispatch a registry verb by action id. */
    onaction?: (id: ActionId) => void;
    /** Current IP/hostname for the placement (held outside PlacedDevice). */
    ip?: string;
    /** Commit a new placement name (empty string clears the custom name). */
    oneditname?: (name: string) => void;
    /** Commit a new IP/hostname (empty string clears it). */
    oneditip?: (ip: string) => void;
    /** Commit new placement notes (empty string clears them). */
    oneditnotes?: (notes: string) => void;
  }

  let {
    device,
    deviceType,
    rackView: _rackView = "front",
    rackHeight: _rackHeight,
    showActions = false,
    readOnly = false,
    verbs = [],
    onaction,
    ip = "",
    oneditname,
    oneditip,
    oneditnotes,
  }: Props = $props();

  // Display name: custom name if set, otherwise device type model/slug.
  const displayName = $derived(
    device.name ?? deviceType.model ?? deviceType.slug,
  );

  // Compact one-line summary: Type - height - position - face.
  const positionLabel = $derived.by(() => {
    const bottom = formatPosition(device.position);
    const topInternal =
      device.position + (deviceType.u_height - 1) * UNITS_PER_U;
    const top = formatPosition(topInternal);
    return deviceType.u_height === 1 ? bottom : `${bottom}-${top}`;
  });

  const faceLabel = $derived(
    device.face === "both"
      ? "Both Faces"
      : device.face === "front"
        ? "Front"
        : "Rear",
  );

  const summary = $derived(
    `${getCategoryDisplayName(deviceType.category)} · ${deviceType.u_height}U · ${positionLabel} · ${faceLabel}`,
  );

  // Resolve verbs from the registry projection. Each is undefined when the
  // registry did not include it (e.g. move-device-slot is absent for
  // full-width devices), so the template guards with {#if}. The verb row holds
  // the affirmative verbs; delete is surfaced separately as a quiet Remove.
  const moveUpVerb = $derived(verbs.find((v) => v.id === "move-device-up"));
  const moveDownVerb = $derived(verbs.find((v) => v.id === "move-device-down"));
  const slotVerb = $derived(verbs.find((v) => v.id === "move-device-slot"));
  const flipVerb = $derived(verbs.find((v) => v.id === "flip-device-face"));
  const duplicateVerb = $derived(
    verbs.find((v) => v.id === "duplicate-selection"),
  );
  const deleteVerb = $derived(verbs.find((v) => v.id === "delete-selection"));

  // Affirmative verbs for the row, in mockup order: Up, Down, [Slot], Flip.
  // Duplicate is appended in the template. Delete is surfaced as a quiet Remove.
  const rowVerbs = $derived(
    [moveUpVerb, moveDownVerb, slotVerb, flipVerb].filter(
      (v): v is SelectionVerbItem => v !== undefined,
    ),
  );

  function dispatch(id: ActionId) {
    onaction?.(id);
  }

  // --- Inline name editing (click to edit, commit on blur/Enter) ---
  // editingDeviceId pins the edit to the placement it started on. A blur can
  // fire after the selection has advanced to another placement, so commits and
  // the open editor are gated on the current device still matching (mirrors the
  // desktop EditPanelMetadata guard, #2223).
  let editingDeviceId = $state<string | null>(null);
  let nameInput = $state("");
  const editingName = $derived(
    editingDeviceId !== null && device.id === editingDeviceId,
  );

  function startEditingName() {
    nameInput = device.name ?? deviceType.model ?? deviceType.slug;
    editingDeviceId = device.id;
  }

  function commitName() {
    // Abort if the selection moved to a different placement mid-edit, so a
    // pending commit never lands on the wrong device.
    if (device.id !== editingDeviceId) {
      editingDeviceId = null;
      return;
    }
    editingDeviceId = null;
    const next = nameInput.trim();
    const typeName = deviceType.model ?? deviceType.slug;
    oneditname?.(next === typeName ? "" : next);
  }

  function handleNameKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitName();
    } else if (event.key === "Escape") {
      editingDeviceId = null;
    }
  }

  // --- IP editing (bind:value, commit on blur) ---
  // Writable derived resets to the supplied ip when the selection changes.
  let ipInput = $derived(ip);

  function commitIp() {
    const next = ipInput.trim();
    if (next === ip.trim()) return;
    oneditip?.(next);
  }

  // --- Notes editing (bind:value, commit on blur) ---
  let notesInput = $derived(device.notes ?? "");

  function commitNotes() {
    const next = notesInput.trim();
    if (next === (device.notes ?? "").trim()) return;
    oneditnotes?.(next);
  }
</script>

<div class="device-details">
  {#if showActions && verbs.length > 0}
    <!-- Compact inspector: summary, verb row, editable fields, quiet Remove -->
    <div class="inspector">
      <p class="summary">{summary}</p>

      {#if !readOnly}
        <div class="verbs">
          {#each rowVerbs as verb (verb.id)}
            <button
              type="button"
              class="verb"
              onclick={() => dispatch(verb.id)}
              disabled={verb.disabled}
              aria-label={verb.label}
            >
              {#if verb.id === "move-device-up"}
                <IconChevronUp />
                <span>Up</span>
              {:else if verb.id === "move-device-down"}
                <IconChevronDown />
                <span>Down</span>
              {:else if verb.id === "move-device-slot"}
                <IconChevronRight size={ICON_SIZE.sm} />
                <span>Move</span>
              {:else if verb.id === "flip-device-face"}
                <IconFlip size={ICON_SIZE.sm} />
                <span>Flip</span>
              {/if}
            </button>
          {/each}
          {#if duplicateVerb}
            <button
              type="button"
              class="verb"
              onclick={() => dispatch(duplicateVerb.id)}
              disabled={duplicateVerb.disabled}
              aria-label={duplicateVerb.label}
            >
              <IconCopy size={ICON_SIZE.sm} />
              <span>Duplicate</span>
            </button>
          {/if}
        </div>

        <div class="fields">
          <div class="field">
            <span class="field-label" id="inspector-name-label">Name</span>
            {#if editingName}
              <!-- svelte-ignore a11y_autofocus -->
              <input
                type="text"
                class="field-input"
                aria-labelledby="inspector-name-label"
                bind:value={nameInput}
                onblur={commitName}
                onkeydown={handleNameKeydown}
                autofocus
              />
            {:else}
              <button
                type="button"
                class="field-edit"
                onclick={startEditingName}
                aria-label="Edit name"
              >
                <span class="field-value">{displayName}</span>
                <IconEdit />
              </button>
            {/if}
          </div>

          <div class="field">
            <label class="field-label" for="inspector-ip">IP</label>
            <input
              id="inspector-ip"
              type="text"
              class="field-input"
              placeholder="e.g. 192.168.1.10"
              bind:value={ipInput}
              onblur={commitIp}
            />
          </div>

          <div class="field field-notes">
            <label class="field-label" for="inspector-notes">Notes</label>
            <textarea
              id="inspector-notes"
              class="field-input notes-input"
              rows="2"
              placeholder="Add notes about this placement"
              bind:value={notesInput}
              onblur={commitNotes}></textarea>
          </div>
        </div>

        {#if deleteVerb}
          <div class="foot">
            <button
              type="button"
              class="remove"
              onclick={() => dispatch(deleteVerb.id)}
              disabled={deleteVerb.disabled}
              aria-label={deleteVerb.label}
            >
              <IconTrash size={ICON_SIZE.sm} />
              <span>Remove</span>
            </button>
          </div>
        {/if}
      {/if}
    </div>
  {:else}
    <!-- Read-only facts (non-inspector consumers) -->
    <div class="detail-section name-section">
      <h3 class="device-name">{displayName}</h3>
    </div>

    <div class="detail-section info-section">
      <div class="info-row">
        <span class="info-label">Height</span>
        <span class="info-value">{deviceType.u_height}U</span>
      </div>
      <div class="info-row">
        <span class="info-label">Category</span>
        <span class="info-value"
          >{getCategoryDisplayName(deviceType.category)}</span
        >
      </div>
      <div class="info-row">
        <span class="info-label">Position</span>
        <span class="info-value">{positionLabel}, {faceLabel}</span>
      </div>
    </div>

    {#if deviceType.manufacturer || deviceType.part_number}
      <div class="detail-section optional-section">
        {#if deviceType.manufacturer}
          <div class="info-row">
            <span class="info-label">Manufacturer</span>
            <span class="info-value">{deviceType.manufacturer}</span>
          </div>
        {/if}
        {#if deviceType.part_number}
          <div class="info-row">
            <span class="info-label">Part Number</span>
            <span class="info-value">{deviceType.part_number}</span>
          </div>
        {/if}
      </div>
    {/if}

    {#if device.notes}
      <div class="detail-section notes-section">
        <span class="info-label">Notes</span>
        <p class="notes-text">{device.notes}</p>
      </div>
    {/if}
  {/if}
</div>

<style>
  .device-details {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    font-size: 0.875rem;
  }

  /* ---------- Mobile inspector ---------- */
  .inspector {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .summary {
    margin: 0;
    color: var(--colour-text-muted);
    font-size: var(--font-size-sm);
  }

  .verbs {
    display: flex;
    gap: var(--space-2);
  }

  .verb {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-1-5);
    min-height: var(--touch-target-min);
    padding: var(--space-2);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--colour-text);
    background: var(--colour-surface-secondary);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: background-color 0.15s ease;
  }

  .verb :global(svg) {
    width: var(--icon-size-sm);
    height: var(--icon-size-sm);
    flex-shrink: 0;
  }

  .verb:hover:not(:disabled) {
    background: var(--colour-bg-light);
  }

  .verb:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .fields {
    display: flex;
    flex-direction: column;
  }

  .field {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: var(--touch-target-min);
    padding: var(--space-1) 0;
    border-bottom: 1px solid var(--colour-border);
  }

  .field-notes {
    align-items: flex-start;
    padding-top: var(--space-2);
  }

  .field-label {
    flex-shrink: 0;
    width: 4.5rem;
    color: var(--colour-text-muted);
    font-size: var(--font-size-base);
  }

  .field-edit {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    min-height: var(--touch-target-min);
    padding: var(--space-1) 0;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    color: var(--colour-text);
    font-size: var(--font-size-base);
  }

  .field-edit :global(svg) {
    width: var(--icon-size-xs);
    height: var(--icon-size-xs);
    flex-shrink: 0;
    color: var(--colour-text-muted);
  }

  .field-value {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .field-input {
    flex: 1;
    width: 100%;
    min-height: var(--touch-target-min);
    padding: var(--space-1) 0;
    background: transparent;
    border: none;
    color: var(--colour-text);
    font-size: var(--font-size-base);
    font-family: inherit;
  }

  .field-input:focus {
    outline: none;
  }

  .field-input::placeholder {
    color: var(--colour-text-muted);
  }

  .notes-input {
    resize: vertical;
    line-height: 1.4;
  }

  .foot {
    display: flex;
    justify-content: flex-end;
    padding-top: var(--space-2);
  }

  .remove {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--touch-target-min);
    padding: var(--space-2) var(--space-3);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--dracula-red);
    background: color-mix(in srgb, var(--dracula-red) 14%, transparent);
    border: 1px solid color-mix(in srgb, var(--dracula-red) 45%, transparent);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: background-color 0.15s ease;
  }

  .remove :global(svg) {
    width: var(--icon-size-sm);
    height: var(--icon-size-sm);
  }

  .remove:hover:not(:disabled) {
    background: color-mix(in srgb, var(--dracula-red) 22%, transparent);
  }

  .remove:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* ---------- Read-only facts (non-inspector) ---------- */
  .detail-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .name-section {
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--colour-border);
  }

  .device-name {
    font-size: 1.25rem;
    font-weight: 600;
    margin: 0;
    color: var(--colour-text);
  }

  .info-section,
  .optional-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }

  .info-label {
    font-weight: 500;
    color: var(--colour-text-muted);
    flex-shrink: 0;
  }

  .info-value {
    text-align: right;
    color: var(--colour-text);
    flex-grow: 1;
  }

  .notes-section {
    padding-top: 0.5rem;
    border-top: 1px solid var(--colour-border);
  }

  .notes-text {
    margin: 0;
    color: var(--colour-text);
    white-space: pre-wrap;
    word-break: break-word;
  }
</style>
