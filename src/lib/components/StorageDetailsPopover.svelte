<!--
  StorageDetailsPopover
  Read-only facts for the storage chip popover. Prop-driven so it renders the
  same way from the chip and from a unit test. Facts only: no actions (those
  live in the app menu, #2446). Browser mode shows the autosave time and the
  last-export time, labelled, so a recent autosave never reads as a durable
  backup. Server mode shows the last server save, reframed as "last reached"
  when the connection is degraded. Server-not-found shows an honest note that
  the layout has not been saved to the server.
-->
<script lang="ts">
  import { IconCheck, IconClock, IconWarningTriangle } from "./icons";
  import { ICON_SIZE } from "$lib/constants/sizing";
  import { formatTimeAgo } from "$lib/utils/relative-time";
  import type { DurabilityKind } from "$lib/storage";

  interface Props {
    mode: "browser" | "server";
    kind: DurabilityKind;
    headline: string;
    icon: "saved" | "pending" | "error";
    changesSinceExport: number;
    lastExportedAt: string | null;
    autosaveAt: string | null;
    serverSavedAt: string | null;
    nowMs: number;
  }

  let {
    mode,
    kind,
    headline,
    icon,
    changesSinceExport,
    lastExportedAt,
    autosaveAt,
    serverSavedAt,
    nowMs,
  }: Props = $props();

  const autosaveRel = $derived(formatTimeAgo(autosaveAt, nowMs));
  const exportRel = $derived(formatTimeAgo(lastExportedAt, nowMs));
  const serverRel = $derived(formatTimeAgo(serverSavedAt, nowMs));
  const neverReached = $derived(kind === "server-not-found");
  const degraded = $derived(kind === "offline");
</script>

<div class="storage-details">
  <div class="storage-details-head storage-details-{icon}">
    {#if icon === "saved"}
      <IconCheck size={ICON_SIZE.sm} />
    {:else if icon === "pending"}
      <IconClock size={ICON_SIZE.sm} />
    {:else}
      <IconWarningTriangle size={ICON_SIZE.sm} />
    {/if}
    <span>{headline}</span>
  </div>

  <div class="storage-details-divider"></div>

  {#if mode === "browser"}
    {#if autosaveRel}
      <div class="storage-details-row">
        <span class="storage-details-label">Auto-saved</span>
        <span class="storage-details-value">{autosaveRel}</span>
      </div>
    {/if}
    <div class="storage-details-row">
      <span class="storage-details-label">Last exported</span>
      <span
        class="storage-details-value"
        class:storage-details-warn={changesSinceExport > 0}
      >
        {exportRel ?? "Never exported"}
      </span>
    </div>
    {#if changesSinceExport > 0}
      <p class="storage-details-note storage-details-warn">
        {changesSinceExport}
        {changesSinceExport === 1 ? "change" : "changes"} since last export
      </p>
    {/if}
    <p class="storage-details-foot">Stored in this browser only</p>
  {:else if neverReached}
    <p class="storage-details-note storage-details-warn">
      This layout has not been saved to the server.
    </p>
    <p class="storage-details-foot">Not saved to the server</p>
  {:else}
    <div class="storage-details-row">
      <span class="storage-details-label">
        {degraded ? "Last reached server" : "Last saved"}
      </span>
      <span class="storage-details-value" class:storage-details-warn={degraded}>
        {serverRel ?? "Not yet saved"}
      </span>
    </div>
    {#if degraded}
      <p class="storage-details-note storage-details-warn">
        Your most recent edits may not be saved.
      </p>
    {/if}
    <p class="storage-details-foot">Stored on the server</p>
  {/if}
</div>

<style>
  .storage-details {
    min-width: 224px;
    padding: var(--space-3);
    font-size: var(--font-size-xs);
    color: var(--colour-text);
  }
  .storage-details-head {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-weight: 600;
  }
  .storage-details-saved {
    color: var(--colour-success);
  }
  .storage-details-pending {
    color: var(--colour-warning);
  }
  .storage-details-error {
    color: var(--colour-error);
  }
  .storage-details-divider {
    height: 1px;
    background: var(--colour-border);
    margin: var(--space-2) calc(-1 * var(--space-3));
  }
  .storage-details-row {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
    padding: 2px 0;
  }
  .storage-details-label {
    color: var(--colour-text-muted);
  }
  .storage-details-value {
    font-variant-numeric: tabular-nums;
  }
  .storage-details-warn {
    color: var(--colour-warning);
  }
  .storage-details-note {
    margin: var(--space-1) 0 0;
    font-size: var(--font-size-xs);
  }
  .storage-details-foot {
    margin: var(--space-2) 0 0;
    color: var(--colour-text-muted);
  }
</style>
