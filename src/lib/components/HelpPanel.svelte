<!--
  About Panel Component
  Shows app information, keyboard shortcuts, and links
  Uses bits-ui Dialog primitives for accessibility and focus management
-->
<script lang="ts">
  import { Dialog } from "bits-ui";
  import { VERSION } from "$lib/version";
  import LogoLockup from "./LogoLockup.svelte";
  import { IconGitHub, IconBug, IconChat, IconCheck, IconCopy } from "./icons";
  import { getToastStore } from "$lib/stores/toast.svelte";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { formatShortcut } from "$lib/utils/platform";
  import { analytics } from "$lib/utils/analytics";
  import {
    formatRelativeTime,
    formatFullTimestamp,
  } from "$lib/utils/buildTime";

  interface Props {
    open: boolean;
    onclose?: () => void;
  }

  let { open = $bindable(), onclose }: Props = $props();

  const toastStore = getToastStore();
  const layoutStore = getLayoutStore();

  /**
   * Handle dialog open state changes.
   * Tracks analytics and calls onclose callback when dialog closes.
   * Important: Set open state FIRST to ensure bits-ui state stays in sync
   * before triggering parent callbacks that may cause re-renders.
   */
  function handleOpenChange(newOpen: boolean) {
    open = newOpen;
    if (newOpen) {
      analytics.trackPanelOpen("help");
    } else {
      analytics.trackPanelClose("help");
      onclose?.();
    }
  }

  // Get browser user agent for troubleshooting
  const userAgent =
    typeof navigator !== "undefined" ? navigator.userAgent : "Unknown";

  // Build info constants from vite.config.js
  const commitHash =
    typeof __COMMIT_HASH__ !== "undefined" ? __COMMIT_HASH__ : "";
  const branchName =
    typeof __BRANCH_NAME__ !== "undefined" ? __BRANCH_NAME__ : "";
  const buildTime = typeof __BUILD_TIME__ !== "undefined" ? __BUILD_TIME__ : "";
  const isDirty = typeof __GIT_DIRTY__ !== "undefined" ? __GIT_DIRTY__ : false;
  const commitUrl = commitHash
    ? `https://github.com/RackulaLives/Rackula/commit/${commitHash}`
    : "";

  // Live-updating relative time for build timestamp
  let now = $state(new Date());

  $effect(() => {
    if (!open) return;
    const interval = setInterval(() => {
      now = new Date();
    }, 60_000); // Update every minute
    return () => clearInterval(interval);
  });

  // Derived relative time
  const relativeTime = $derived(
    buildTime ? formatRelativeTime(buildTime, now) : "",
  );
  const fullTimestamp = $derived(
    buildTime ? formatFullTimestamp(buildTime) : "",
  );

  // Copy state for button feedback
  let copied = $state(false);

  async function copyBuildInfo() {
    // Build the copy text with all available info
    const lines: string[] = [];

    // Line 1: Version with commit/branch/dirty context
    let versionLine = `Rackula v${VERSION}`;
    if (commitHash) {
      const parts = [commitHash];
      if (branchName) parts.push(branchName);
      if (isDirty) parts.push("dirty");
      versionLine += ` (${parts.join(", ")})`;
    }
    lines.push(versionLine);

    // Line 2: Build time
    if (fullTimestamp) {
      lines.push(`Built: ${fullTimestamp}`);
    }

    // Line 3: Browser
    lines.push(`Browser: ${userAgent}`);

    // Line 4: Screen dimensions with pixel ratio
    if (typeof window !== "undefined") {
      const dpr = window.devicePixelRatio || 1;
      lines.push(`Screen: ${window.innerWidth}×${window.innerHeight} @${dpr}x`);
    }

    // Line 5: Platform
    if (typeof navigator !== "undefined" && navigator.platform) {
      lines.push(`Platform: ${navigator.platform}`);
    }

    // Line 6: Layout state
    const layoutName = layoutStore.layout.name || "Untitled";
    const rackCount = layoutStore.rackCount;
    const deviceCount = layoutStore.totalDeviceCount;
    lines.push(
      `Layout: ${layoutName} (${rackCount} rack${rackCount !== 1 ? "s" : ""}, ${deviceCount} device${deviceCount !== 1 ? "s" : ""})`,
    );

    const text = lines.join("\n");

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      copied = true;
      toastStore.showToast("Build info copied", "success", 2000);
      setTimeout(() => {
        copied = false;
      }, 2000);
    } catch {
      toastStore.showToast("Failed to copy", "error");
    }
  }

  // Keyboard shortcuts grouped by category
  const shortcutGroups = [
    {
      name: "Navigation",
      shortcuts: [
        { key: "Scroll Wheel", action: "Zoom in/out (at cursor)" },
        { key: "Shift + Scroll", action: "Pan horizontally" },
        { key: "Click + Drag", action: "Pan canvas" },
        { key: "F", action: "Fit all (zoom to fit)" },
      ],
    },
    {
      name: "General",
      shortcuts: [
        { key: "Escape", action: "Clear selection / Close dialog" },
        { key: "I", action: "Toggle display mode" },
        { key: "[", action: "Shrink sidebar" },
        { key: "]", action: "Widen sidebar" },
      ],
    },
    {
      name: "Editing",
      shortcuts: [
        { key: "Delete", action: "Delete selected" },
        { key: "↑ / ↓", action: "Move device up/down" },
        { key: "Shift + ↑ / ↓", action: "Move device ⅓U (fine)" },
      ],
    },
    {
      name: "File",
      shortcuts: [
        { key: formatShortcut("mod", "S"), action: "Save layout" },
        { key: formatShortcut("mod", "O"), action: "Load layout" },
        { key: formatShortcut("mod", "E"), action: "Export image" },
        { key: formatShortcut("mod", "H"), action: "Share" },
        { key: formatShortcut("mod", "Z"), action: "Undo" },
        { key: formatShortcut("mod", "shift", "Z"), action: "Redo" },
      ],
    },
  ];

  const GITHUB_URL = "https://github.com/RackulaLives/Rackula";

  // Pre-filled issue URLs
  const bugReportUrl = $derived.by(() => {
    const params = new URLSearchParams({
      template: "bug-report.yml",
      browser: `Rackula v${VERSION} on ${userAgent}`,
    });
    return `${GITHUB_URL}/issues/new?${params.toString()}`;
  });

  const discussionsUrl = `${GITHUB_URL}/discussions`;
</script>

<Dialog.Root {open} onOpenChange={handleOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay class="dialog-backdrop" />
    <Dialog.Content class="help-dialog" style="width: 600px;">
      <!-- Visually hidden title for accessibility -->
      <Dialog.Title class="sr-only">About Rackula</Dialog.Title>
      <Dialog.Description class="help-dialog-description">
        Application help, keyboard shortcuts, and build information
      </Dialog.Description>
      <div class="dialog-content">
        <div class="about-content">
          <!-- Header: Logo -->
          <header class="about-header">
            <div class="brand-row">
              <LogoLockup size={48} showcase />
            </div>
          </header>

          <!-- Keyboard Shortcuts (grouped) -->
          {#each shortcutGroups as group (group.name)}
            <section class="shortcut-group">
              <h4>{group.name}</h4>
              <div class="shortcuts-list">
                {#each group.shortcuts as { key, action } (key)}
                  <div class="shortcut-row">
                    <kbd class="key-cell">{key}</kbd>
                    <span class="action">{action}</span>
                  </div>
                {/each}
              </div>
            </section>
          {/each}

          <!-- Quick links -->
          <div class="quick-links">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              class="quick-link"
            >
              <IconGitHub />
              Project
            </a>
            <a
              href={bugReportUrl}
              target="_blank"
              rel="noopener noreferrer"
              class="quick-link"
            >
              <IconBug />
              Report Bug
            </a>
            <a
              href={discussionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              class="quick-link"
            >
              <IconChat />
              Share Ideas
            </a>
          </div>

          <!-- Build Info Section -->
          <section class="build-info-section">
            <div class="build-info-grid">
              <div class="info-row">
                <span class="info-label">Version</span>
                <span class="info-value">v{VERSION}</span>
              </div>

              {#if commitHash}
                <div class="info-row">
                  <span class="info-label">Commit</span>
                  <span class="info-value">
                    <a
                      href={commitUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="commit-link"
                    >
                      {commitHash}{#if isDirty}<span class="dirty-badge">*</span
                        >{/if}
                    </a>
                  </span>
                </div>
              {/if}

              {#if branchName}
                <div class="info-row">
                  <span class="info-label">Branch</span>
                  <span class="info-value">{branchName}</span>
                </div>
              {/if}

              {#if relativeTime}
                <div class="info-row">
                  <span class="info-label">Built</span>
                  <span class="info-value" title={fullTimestamp}>
                    {relativeTime} ago
                  </span>
                </div>
              {/if}

              <div class="info-row">
                <span class="info-label">Browser</span>
                <span class="info-value user-agent">{userAgent}</span>
              </div>
            </div>

            <button
              type="button"
              class="copy-info-btn"
              class:copied
              onclick={copyBuildInfo}
            >
              {#if copied}
                <IconCheck />
                Copied!
              {:else}
                <IconCopy />
                Copy for bug report
              {/if}
            </button>
          </section>

          <p class="made-in">Made in Canada 🇨🇦 with ❤️</p>
        </div>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  /* Base dialog styles (.dialog-backdrop, .dialog-title, .dialog-close)
     are defined in src/lib/styles/dialogs.css and imported globally */

  /* HelpPanel-specific dialog container with size constraints */
  :global(.help-dialog) {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    background: var(--colour-dialog-bg, var(--colour-bg));
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    max-width: 90vw;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    z-index: calc(var(--z-modal, 200) + 1);
  }

  .dialog-content {
    padding: var(--space-4);
    overflow-y: auto;
  }

  /* Screen reader only - visually hidden but accessible */
  :global(.help-dialog .sr-only),
  :global(.help-dialog-description) {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .about-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  /* Header row: Logo + Version */
  .about-header {
    display: flex;
    align-items: center;
    padding-bottom: var(--space-1);
    border-bottom: 1px solid var(--colour-border);
  }

  .brand-row {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Build Info Section */
  .build-info-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-2);
    background: var(--colour-surface);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-md);
  }

  .build-info-grid {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--space-2) var(--space-2);
  }

  .info-row {
    display: contents;
  }

  .info-label {
    font-family: var(--font-mono, monospace);
    font-size: var(--font-size-xs);
    color: var(--colour-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .info-value {
    font-family: var(--font-mono, monospace);
    font-size: var(--font-size-sm);
    color: var(--colour-text);
  }

  .info-value.user-agent {
    font-size: var(--font-size-xs);
    color: var(--colour-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .commit-link {
    color: var(--dracula-cyan, #8be9fd);
    text-decoration: none;
  }

  .commit-link:hover {
    text-decoration: underline;
  }

  .dirty-badge {
    color: var(--dracula-orange, #ffb86c);
    margin-left: 2px;
  }

  .copy-info-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-2);
    background: transparent;
    border: 1px dashed var(--colour-border);
    border-radius: var(--radius-sm);
    color: var(--colour-text-muted);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .copy-info-btn:hover {
    border-color: var(--colour-text-muted);
    color: var(--colour-text);
  }

  .copy-info-btn.copied {
    border-color: var(--dracula-green, #50fa7b);
    color: var(--dracula-green, #50fa7b);
    border-style: solid;
  }

  /* Override icon sizes within copy button to match previous inline SVGs (14px) */
  .copy-info-btn :global(svg) {
    width: var(--icon-size-xs);
    height: var(--icon-size-xs);
  }

  /* Shortcut groups */
  .shortcut-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .shortcut-group h4 {
    margin: 0;
    font-size: var(--font-size-sm);
    font-weight: 500;
    color: var(--colour-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .shortcuts-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .shortcut-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    font-size: var(--font-size-sm);
  }

  .key-cell {
    min-width: 140px;
    font-family: var(--font-mono, monospace);
    font-size: var(--font-size-xs);
    background: var(--colour-surface);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    padding: 2px var(--space-2);
    color: var(--colour-text);
  }

  .action {
    color: var(--colour-text-muted);
  }

  /* Quick links */
  .quick-links {
    display: flex;
    gap: var(--space-3);
    justify-content: center;
    padding-top: var(--space-3);
    border-top: 1px solid var(--colour-border);
  }

  .quick-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    flex: 1;
    padding: var(--space-2) var(--space-3);
    font-size: var(--font-size-sm);
    color: var(--colour-text-muted);
    text-decoration: none;
    background: var(--colour-surface);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    transition:
      color 0.15s ease,
      border-color 0.15s ease,
      background 0.15s ease;
  }

  .quick-link:hover {
    color: var(--colour-text);
    border-color: var(--colour-selection);
    background: var(--colour-surface-hover);
  }

  .quick-link:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: 2px;
  }

  /* Override icon sizes within quick links to match previous inline SVGs */
  .quick-link :global(svg) {
    width: var(--icon-size-sm);
    height: var(--icon-size-sm);
  }

  .made-in {
    margin: 0;
    padding-top: var(--space-3);
    font-size: var(--font-size-sm);
    color: var(--colour-text-muted);
    text-align: center;
  }
</style>
