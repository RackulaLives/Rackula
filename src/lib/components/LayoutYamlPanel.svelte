<script lang="ts">
  import type { ZodIssue } from "zod";
  import type { Layout } from "$lib/types";
  import { LayoutSchema } from "$lib/schemas";
  import { buildYamlFilename } from "$lib/utils/folder-structure";
  import {
    parseLayoutYaml,
    parseYaml,
    serializeLayoutToYaml,
  } from "$lib/utils/yaml";
  import { layoutDebug } from "$lib/utils/debug";
  import { getToastStore } from "$lib/stores/toast.svelte";
  import { IconCopy, IconDownload } from "./icons";
  import { ICON_SIZE } from "$lib/constants/sizing";

  interface Props {
    open: boolean;
    layout: Layout;
    onapply?: (layout: Layout) => void | Promise<void>;
  }

  let { open, layout, onapply }: Props = $props();

  const toastStore = getToastStore();
  const debug = layoutDebug.state;

  let yamlText = $state("");
  let baselineYaml = $state("");
  let isEditing = $state(false);
  let isValidating = $state(false);
  let isApplying = $state(false);
  let syntaxError = $state<string | null>(null);
  let schemaError = $state<string | null>(null);
  let showConflictPrompt = $state(false);
  let latestYamlAtConflict = $state<string | null>(null);
  let pendingLayout = $state<Layout | null>(null);

  let validationTimer: ReturnType<typeof setTimeout> | null = null;
  let validationRun = 0;
  let syncRun = 0;
  let applyIntentId = 0;

  const applyDisabled = $derived(
    !isEditing ||
      isApplying ||
      isValidating ||
      Boolean(syntaxError) ||
      Boolean(schemaError),
  );

  const validationMessage = $derived.by(() => {
    if (!isEditing) return null;
    if (isValidating) {
      return { tone: "info", text: "Validating YAML..." };
    }
    if (syntaxError) {
      return { tone: "error", text: `Syntax error: ${syntaxError}` };
    }
    if (schemaError) {
      return { tone: "error", text: `Schema error: ${schemaError}` };
    }
    return { tone: "success", text: "YAML is valid." };
  });

  $effect(() => {
    if (!open || isEditing || isApplying) return;
    void syncFromLayout(layout, { allowWhileEditing: false });
  });

  $effect(() => {
    if (open) return;

    ++applyIntentId;
    ++syncRun;
    ++validationRun;
    if (validationTimer) {
      clearTimeout(validationTimer);
      validationTimer = null;
    }

    isEditing = false;
    isApplying = false;
    isValidating = false;
    syntaxError = null;
    schemaError = null;
    showConflictPrompt = false;
    latestYamlAtConflict = null;
    pendingLayout = null;
  });

  $effect(() => {
    if (!open || !isEditing) return;

    const text = yamlText;
    const runId = ++validationRun;
    isValidating = true;
    showConflictPrompt = false;

    if (validationTimer) {
      clearTimeout(validationTimer);
    }

    validationTimer = setTimeout(() => {
      void validateYamlText(text, runId);
    }, 250);

    return () => {
      if (validationTimer) {
        clearTimeout(validationTimer);
      }
    };
  });

  function formatSchemaIssue(issue: ZodIssue): string {
    const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
    return `${path}${issue.message}`;
  }

  function toErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return "Unknown error";
  }

  async function syncFromLayout(
    sourceLayout: Layout,
    options: { allowWhileEditing: boolean } = { allowWhileEditing: true },
  ): Promise<void> {
    const runId = ++syncRun;
    debug("syncing from layout, runId=%d", runId);
    const editingAtStart = isEditing;
    const textAtStart = yamlText;
    const serialized = await serializeLayoutToYaml(sourceLayout);
    if (runId !== syncRun) return;
    if (!options.allowWhileEditing && isEditing) {
      // Preserve in-flight user edits made while initial hydration was running.
      if (editingAtStart || yamlText !== textAtStart) return;
    }

    baselineYaml = serialized;
    yamlText = serialized;
    syntaxError = null;
    schemaError = null;
    isValidating = false;
    showConflictPrompt = false;
    latestYamlAtConflict = null;
    pendingLayout = null;
  }

  async function validateYamlText(text: string, runId: number): Promise<void> {
    if (runId !== validationRun) return;

    const trimmed = text.trim();
    if (!trimmed) {
      syntaxError = "YAML cannot be empty.";
      schemaError = null;
      isValidating = false;
      debug("validation complete, hasErrors=%o", { syntaxError, schemaError });
      return;
    }

    let parsed: unknown;

    try {
      parsed = await parseYaml(trimmed);
    } catch (error) {
      if (runId !== validationRun) return;
      syntaxError = toErrorMessage(error);
      schemaError = null;
      isValidating = false;
      debug("validation complete, hasErrors=%o", { syntaxError, schemaError });
      return;
    }

    if (runId !== validationRun) return;

    syntaxError = null;
    const schemaResult = LayoutSchema.safeParse(parsed);
    if (!schemaResult.success) {
      const firstIssue = schemaResult.error.issues[0];
      schemaError = firstIssue
        ? formatSchemaIssue(firstIssue)
        : "Invalid YAML layout schema.";
    } else {
      schemaError = null;
    }

    isValidating = false;
    debug("validation complete, hasErrors=%o", { syntaxError, schemaError });
  }

  function handleEditModeToggle(): void {
    if (isEditing) {
      isEditing = false;
      void syncFromLayout(layout, { allowWhileEditing: true });
      return;
    }

    isEditing = true;
  }

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(yamlText);
      toastStore.showToast("YAML copied to clipboard", "success");
    } catch {
      toastStore.showToast("Failed to copy YAML", "error");
    }
  }

  function handleDownload(): void {
    const blob = new Blob([yamlText], { type: "text/yaml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = buildYamlFilename(layout.name);
    link.click();
    URL.revokeObjectURL(url);
  }

  async function commitParsedLayout(nextLayout: Layout): Promise<void> {
    isApplying = true;
    try {
      await onapply?.(nextLayout);
      await syncFromLayout(nextLayout);
      isEditing = false;
      showConflictPrompt = false;
      latestYamlAtConflict = null;
      pendingLayout = null;
    } catch (_error) {
      toastStore.showToast("Failed to apply YAML layout", "error");
    } finally {
      isApplying = false;
    }
  }

  async function handleApply(): Promise<void> {
    if (applyDisabled) return;
    const intent = ++applyIntentId;
    debug("apply started, intent=%d", intent);

    let parsedLayout: Layout;
    try {
      parsedLayout = await parseLayoutYaml(yamlText);
    } catch (error) {
      schemaError = toErrorMessage(error);
      return;
    }
    if (intent !== applyIntentId) return;

    const latestYaml = await serializeLayoutToYaml(layout);
    if (intent !== applyIntentId) return;

    if (latestYaml !== baselineYaml) {
      debug("conflict detected, baselineYaml differs from latestYaml");
      pendingLayout = parsedLayout;
      latestYamlAtConflict = latestYaml;
      showConflictPrompt = true;
      return;
    }

    await commitParsedLayout(parsedLayout);
  }

  async function handleApplyAnyway(): Promise<void> {
    if (!pendingLayout || isApplying) return;
    ++applyIntentId;
    await commitParsedLayout(pendingLayout);
  }

  async function handleReloadLatest(): Promise<void> {
    const intent = ++applyIntentId;
    const latestAtStart = latestYamlAtConflict;
    const latest = latestAtStart ?? (await serializeLayoutToYaml(layout));
    if (intent !== applyIntentId) return;
    if (latestAtStart !== latestYamlAtConflict) return;
    baselineYaml = latest;
    yamlText = latest;
    showConflictPrompt = false;
    latestYamlAtConflict = null;
    pendingLayout = null;
    isEditing = true;
  }
</script>

<div class="yaml-panel">
  <div class="yaml-panel-header">
    <p class="mode-label" data-testid="yaml-mode-label">
      {isEditing ? "Editable mode" : "Read-only mode"}
    </p>
    <div class="panel-actions">
      <button
        type="button"
        class="icon-btn"
        onclick={handleCopy}
        aria-label="Copy YAML"
      >
        <IconCopy size={ICON_SIZE.sm} />
      </button>
      <button
        type="button"
        class="icon-btn"
        onclick={handleDownload}
        aria-label="Download YAML"
      >
        <IconDownload size={ICON_SIZE.sm} />
      </button>
      <button
        type="button"
        class="btn btn-secondary"
        onclick={handleEditModeToggle}
      >
        {isEditing ? "Cancel edits" : "Edit YAML"}
      </button>
    </div>
  </div>

  {#if showConflictPrompt}
    <div class="conflict-box" role="alert" data-testid="yaml-conflict-prompt">
      <p class="conflict-title">Layout changed while this editor was open.</p>
      <p class="conflict-copy">
        Choose how to proceed to avoid overwriting newer layout changes by
        mistake.
      </p>
      <div class="conflict-actions">
        <button
          type="button"
          class="btn btn-secondary"
          onclick={handleReloadLatest}
        >
          Reload latest
        </button>
        <button
          type="button"
          class="btn btn-danger"
          onclick={handleApplyAnyway}
        >
          Apply anyway
        </button>
      </div>
    </div>
  {/if}

  {#if validationMessage}
    <p
      class="validation-message {validationMessage.tone}"
      role={validationMessage.tone === "error" ? "alert" : "status"}
      data-testid="yaml-validation-message"
    >
      {validationMessage.text}
    </p>
  {/if}

  <textarea
    class="yaml-textarea"
    bind:value={yamlText}
    readonly={!isEditing}
    spellcheck="false"
    aria-label="Layout YAML editor"
    data-testid="yaml-textarea"
  ></textarea>

  {#if isEditing}
    <div class="footer-actions">
      <button
        type="button"
        class="btn btn-primary"
        disabled={applyDisabled}
        onclick={handleApply}
      >
        {isApplying ? "Applying..." : "Apply YAML"}
      </button>
    </div>
  {/if}
</div>

<style>
  .yaml-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    width: 100%;
    min-height: min(68vh, 700px);
  }

  .yaml-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    flex-wrap: wrap;
  }

  .mode-label {
    margin: 0;
    font-size: var(--font-size-xs);
    color: var(--colour-text-muted);
  }

  .panel-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--colour-text);
    cursor: pointer;
    transition: background-color var(--duration-fast) var(--ease-out);
  }

  .icon-btn:hover {
    background: var(--colour-surface-hover);
  }

  .icon-btn:focus-visible {
    outline: 2px solid var(--colour-focus-ring);
    outline-offset: 1px;
  }

  .conflict-box {
    border: 1px solid var(--colour-warning-border, #f59e0b);
    background: color-mix(
      in oklab,
      var(--colour-warning-bg, #f59e0b) 12%,
      var(--colour-bg)
    );
    border-radius: var(--radius-sm);
    padding: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .conflict-title {
    margin: 0;
    font-weight: var(--font-weight-semibold);
    color: var(--colour-text);
  }

  .conflict-copy {
    margin: 0;
    color: var(--colour-text-muted);
    font-size: var(--font-size-sm);
  }

  .conflict-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .validation-message {
    margin: 0;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-xs);
    border: 1px solid transparent;
  }

  .validation-message.info {
    border-color: var(--colour-border);
    background: var(--colour-surface);
    color: var(--colour-text-muted);
  }

  .validation-message.success {
    border-color: var(--colour-success-border, #16a34a);
    background: color-mix(
      in oklab,
      var(--colour-success-bg, #16a34a) 12%,
      var(--colour-bg)
    );
    color: var(--colour-text);
  }

  .validation-message.error {
    border-color: var(--colour-error-border, #ef4444);
    background: color-mix(
      in oklab,
      var(--colour-error-bg, #ef4444) 12%,
      var(--colour-bg)
    );
    color: var(--colour-text);
  }

  .yaml-textarea {
    flex: 1;
    min-height: 420px;
    width: 100%;
    resize: vertical;
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    background: var(--input-bg);
    color: var(--colour-text);
    padding: var(--space-3);
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    line-height: 1.45;
    tab-size: 2;
  }

  .yaml-textarea:focus-visible {
    outline: 2px solid var(--colour-focus-ring);
    outline-offset: 1px;
  }

  .yaml-textarea:read-only {
    opacity: 0.92;
    cursor: default;
  }

  .footer-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    min-height: var(--touch-target-min);
    padding: 0 var(--space-3);
    border-radius: var(--radius-sm);
    border: 1px solid transparent;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
  }

  .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: transparent;
    border-color: var(--colour-border);
    color: var(--colour-text);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--colour-surface-hover);
  }

  .btn-primary {
    background: var(--colour-button-primary);
    color: var(--colour-text-on-primary);
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--colour-button-primary-hover);
  }

  .btn-danger {
    background: transparent;
    border-color: var(--colour-error-border, #ef4444);
    color: var(--colour-error-text, #ef4444);
  }

  .btn-danger:hover:not(:disabled) {
    background: color-mix(
      in oklab,
      var(--colour-error-bg, #ef4444) 12%,
      var(--colour-bg)
    );
  }

  @media (max-width: 680px) {
    .yaml-panel {
      min-height: min(74vh, 780px);
    }

    .yaml-textarea {
      min-height: 360px;
    }

    .panel-actions {
      width: 100%;
      justify-content: flex-end;
    }
  }
</style>
