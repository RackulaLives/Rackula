<!--
  About Panel Component
  Shows app information, keyboard shortcuts, and links
  Uses bits-ui Dialog primitives for accessibility and focus management
-->
<script lang="ts">
  import { Dialog } from "bits-ui";
  import { VERSION } from "$lib/version";
  import LogoLockup from "./LogoLockup.svelte";
  import { getToastStore } from "$lib/stores/toast.svelte";
  import { formatShortcut } from "$lib/utils/platform";
  import { analytics } from "$lib/utils/analytics";
  import {
    formatRelativeTime,
    formatFullTimestamp,
  } from "$lib/utils/buildTime";

  interface Props {
    open: boolean;
    /** Whether banana for scale easter egg is enabled */
    showBanana?: boolean;
    onclose?: () => void;
    /** Toggle banana for scale easter egg */
    ontogglebanana?: () => void;
  }

  let {
    open = $bindable(),
    showBanana = false,
    onclose,
    ontogglebanana,
  }: Props = $props();

  const toastStore = getToastStore();

  /**
   * Handle dialog open state changes.
   * Tracks analytics and calls onclose callback when dialog closes.
   */
  function handleOpenChange(newOpen: boolean) {
    if (newOpen) {
      analytics.trackPanelOpen("help");
    } else {
      analytics.trackPanelClose("help");
      onclose?.();
    }
    open = newOpen;
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
      name: "General",
      shortcuts: [
        { key: "Escape", action: "Clear selection / Close dialog" },
        { key: "I", action: "Toggle display mode" },
        { key: "F", action: "Fit all (zoom to fit)" },
        { key: "[", action: "Shrink sidebar" },
        { key: "]", action: "Widen sidebar" },
      ],
    },
    {
      name: "Editing",
      shortcuts: [
        { key: "Delete", action: "Delete selected" },
        { key: "↑ / ↓", action: "Move device up/down" },
        { key: "Shift + ↑ / ↓", action: "Move device 0.5U (fine)" },
      ],
    },
    {
      name: "File",
      shortcuts: [
        { key: formatShortcut("mod", "S"), action: "Save layout" },
        { key: formatShortcut("mod", "O"), action: "Load layout" },
        { key: formatShortcut("mod", "E"), action: "Export image" },
        { key: formatShortcut("mod", "Z"), action: "Undo" },
        { key: formatShortcut("mod", "shift", "Z"), action: "Redo" },
      ],
    },
  ];

  const GITHUB_URL = "https://github.com/RackulaLives/Rackula";

  // Pre-filled issue URLs
  const bugReportUrl = $derived(() => {
    const params = new URLSearchParams({
      template: "bug-report.yml",
      browser: `Rackula v${VERSION} on ${userAgent}`,
    });
    return `${GITHUB_URL}/issues/new?${params.toString()}`;
  });

  const featureRequestUrl = `${GITHUB_URL}/issues/new?template=feature-request.yml`;
</script>

<Dialog.Root {open} onOpenChange={handleOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay class="help-dialog-backdrop" />
    <Dialog.Content class="help-dialog" style="width: 600px;">
      <div class="dialog-header">
        <Dialog.Title class="dialog-title">About</Dialog.Title>
        <Dialog.Close class="dialog-close" aria-label="Close dialog">
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M15 5L5 15M5 5L15 15"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
        </Dialog.Close>
      </div>
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
              <svg
                viewBox="0 0 16 16"
                width="16"
                height="16"
                aria-hidden="true"
              >
                <path
                  fill="currentColor"
                  d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
                />
              </svg>
              Project
            </a>
            <a
              href={bugReportUrl()}
              target="_blank"
              rel="noopener noreferrer"
              class="quick-link"
            >
              <svg
                viewBox="0 0 16 16"
                width="16"
                height="16"
                aria-hidden="true"
              >
                <path
                  fill="currentColor"
                  d="M4.72.22a.75.75 0 0 1 1.06 0l1 1a.75.75 0 0 1 0 1.06l-.22.22.439.44a5.02 5.02 0 0 1 2.022 0l.439-.44-.22-.22a.75.75 0 1 1 1.06-1.06l1 1a.75.75 0 0 1 0 1.06l-.22.22c.224.264.42.554.583.862L13 4.75a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-.75.75h-1.173a5.013 5.013 0 0 1 0 1.498H13a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-.75.75h-1.341a4.997 4.997 0 0 1-.583.862l.22.22a.75.75 0 1 1-1.06 1.06l-1-1a.75.75 0 0 1 0-1.06l.22-.22a4.96 4.96 0 0 1-.439-.44 5.02 5.02 0 0 1-2.022 0l-.44.44.221.22a.75.75 0 1 1-1.06 1.06l-1-1a.75.75 0 0 1 0-1.06l.22-.22a4.997 4.997 0 0 1-.583-.862H3a.75.75 0 0 1-.75-.75v-1.5a.75.75 0 0 1 .75-.75h1.173a5.013 5.013 0 0 1 0-1.498H3a.75.75 0 0 1-.75-.75v-1.5A.75.75 0 0 1 3 4.75h1.341c.163-.308.359-.598.583-.862l-.22-.22a.75.75 0 0 1 0-1.06l1-1Zm2.78 5.53a3.5 3.5 0 1 0 5 5 3.5 3.5 0 0 0-5-5Z"
                />
              </svg>
              Report Bug
            </a>
            <a
              href={featureRequestUrl}
              target="_blank"
              rel="noopener noreferrer"
              class="quick-link"
            >
              <svg
                viewBox="0 0 16 16"
                width="16"
                height="16"
                aria-hidden="true"
              >
                <path
                  fill="currentColor"
                  d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7.25-3.25v2.5h2.5a.75.75 0 0 1 0 1.5h-2.5v2.5a.75.75 0 0 1-1.5 0v-2.5h-2.5a.75.75 0 0 1 0-1.5h2.5v-2.5a.75.75 0 0 1 1.5 0Z"
                />
              </svg>
              Request Feature
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
                <svg
                  viewBox="0 0 16 16"
                  width="14"
                  height="14"
                  aria-hidden="true"
                >
                  <path
                    fill="currentColor"
                    d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"
                  />
                </svg>
                Copied!
              {:else}
                <svg
                  viewBox="0 0 16 16"
                  width="14"
                  height="14"
                  aria-hidden="true"
                >
                  <path
                    fill="currentColor"
                    d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"
                  />
                  <path
                    fill="currentColor"
                    d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"
                  />
                </svg>
                Copy for bug report
              {/if}
            </button>
          </section>

          <!-- Easter Eggs section -->
          <section class="easter-eggs-section">
            <h4>Easter Eggs</h4>
            <label class="toggle-row">
              <input
                type="checkbox"
                checked={showBanana}
                onchange={() => ontogglebanana?.()}
                aria-label="Banana for scale"
              />
              <span class="toggle-label">Banana for scale</span>
              <span class="toggle-description">
                Show an accurately-scaled banana next to the rack
              </span>
            </label>
          </section>

          <p class="made-in">Made in Canada with love</p>
        </div>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  /* Dialog backdrop and container styles */
  :global(.help-dialog-backdrop) {
    position: fixed;
    inset: 0;
    background: var(--colour-backdrop, rgba(0, 0, 0, 0.6));
    z-index: var(--z-modal, 200);
  }

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

  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--colour-border);
  }

  :global(.dialog-title) {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: 600;
    color: var(--colour-text);
  }

  :global(.dialog-close) {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--colour-text-muted);
    cursor: pointer;
    transition: all var(--duration-fast);
  }

  :global(.dialog-close:hover) {
    background: var(--colour-surface-hover);
    color: var(--colour-text);
  }

  :global(.dialog-close:focus-visible) {
    outline: 2px solid var(--colour-selection);
    outline-offset: 2px;
  }

  .dialog-content {
    padding: var(--space-4);
    overflow-y: auto;
  }

  /* Screen reader only - visually hidden but accessible */
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

  .made-in {
    margin: 0;
    padding-top: var(--space-3);
    font-size: var(--font-size-sm);
    color: var(--colour-text-muted);
    text-align: center;
  }

  /* Easter Eggs section */
  .easter-eggs-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding-top: var(--space-3);
    border-top: 1px solid var(--colour-border);
  }

  .easter-eggs-section h4 {
    margin: 0;
    font-size: var(--font-size-sm);
    font-weight: 500;
    color: var(--colour-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .toggle-row {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    cursor: pointer;
  }

  .toggle-row input[type="checkbox"] {
    margin-top: 2px;
    cursor: pointer;
  }

  .toggle-label {
    font-size: var(--font-size-sm);
    color: var(--colour-text);
    font-weight: 500;
  }

  .toggle-description {
    font-size: var(--font-size-xs);
    color: var(--colour-text-muted);
    margin-left: auto;
  }
</style>
