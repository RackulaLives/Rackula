<!--
  About Panel Component
  Shows app information, keyboard shortcuts, and links
-->
<script lang="ts">
  import { VERSION } from "$lib/version";
  import Dialog from "./Dialog.svelte";
  import LogoLockup from "./LogoLockup.svelte";
  import { getToastStore } from "$lib/stores/toast.svelte";
  import { formatShortcut } from "$lib/utils/platform";
  import { analytics } from "$lib/utils/analytics";

  interface Props {
    open: boolean;
    onclose?: () => void;
  }

  let { open, onclose }: Props = $props();

  // Track panel open/close
  $effect(() => {
    if (open) {
      analytics.trackPanelOpen("help");
    }
  });

  const toastStore = getToastStore();

  // Get browser user agent for troubleshooting
  const userAgent =
    typeof navigator !== "undefined" ? navigator.userAgent : "Unknown";

  // Toggle for showing debug info
  let showDebugInfo = $state(false);

  async function copyDebugInfo() {
    const text = `Rackula v${VERSION} on ${userAgent}`;
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
      toastStore.showToast("Debug info copied", "success", 2000);
    } catch {
      toastStore.showToast("Failed to copy", "error");
    }
  }

  function toggleDebugInfo() {
    showDebugInfo = !showDebugInfo;
  }

  // Keyboard shortcuts grouped by category
  const shortcutGroups = [
    {
      name: "General",
      shortcuts: [
        { key: "Escape", action: "Clear selection / Close dialog" },
        { key: "I", action: "Toggle display mode" },
        { key: "F", action: "Fit all (zoom to fit)" },
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

  function handleClose() {
    analytics.trackPanelClose("help");
    onclose?.();
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      handleClose();
    }
  }

  $effect(() => {
    if (open) {
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        window.removeEventListener("keydown", handleKeyDown);
      };
    }
  });
</script>

<Dialog {open} title="About" width="600px" onclose={handleClose}>
  <div class="about-content">
    <!-- Header: Logo + Version -->
    <header class="about-header">
      <div class="brand-row">
        <LogoLockup size={48} />
        <button
          type="button"
          class="version-btn"
          onclick={toggleDebugInfo}
          title="Click to show debug info"
        >
          v{VERSION}
          <svg
            class="chevron-icon"
            class:expanded={showDebugInfo}
            viewBox="0 0 16 16"
            width="12"
            height="12"
            aria-hidden="true"
          >
            <path
              fill="currentColor"
              d="M4.427 7.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 7H4.604a.25.25 0 00-.177.427z"
            />
          </svg>
        </button>
      </div>
    </header>

    <!-- Debug info (expandable) -->
    {#if showDebugInfo}
      <div class="debug-info">
        <code class="user-agent">{userAgent}</code>
        <button
          type="button"
          class="copy-btn"
          onclick={copyDebugInfo}
          title="Copy debug info"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path
              fill="currentColor"
              d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"
            />
            <path
              fill="currentColor"
              d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"
            />
          </svg>
        </button>
      </div>
    {/if}

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
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
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
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
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
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path
            fill="currentColor"
            d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7.25-3.25v2.5h2.5a.75.75 0 0 1 0 1.5h-2.5v2.5a.75.75 0 0 1-1.5 0v-2.5h-2.5a.75.75 0 0 1 0-1.5h2.5v-2.5a.75.75 0 0 1 1.5 0Z"
          />
        </svg>
        Request Feature
      </a>
    </div>

    <p class="made-in">Made in Canada 🇨🇦 with ❤️</p>
  </div>
</Dialog>

<style>
  .about-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  /* Header row: Logo + Version */
  .about-header {
    display: flex;
    align-items: center;
    padding-bottom: var(--space-3);
    border-bottom: 1px solid var(--colour-border);
  }

  .brand-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .version-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: var(--font-size-sm);
    font-family: var(--font-mono, monospace);
    color: var(--colour-text-muted);
    transition: all 0.15s ease;
  }

  .version-btn:hover {
    background: var(--colour-surface);
    border-color: var(--colour-border);
    color: var(--colour-text);
  }

  .chevron-icon {
    transition: transform 0.15s ease;
  }

  .chevron-icon.expanded {
    transform: rotate(180deg);
  }

  /* Debug info panel */
  .debug-info {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2);
    background: var(--colour-surface);
    border-radius: var(--radius-sm);
    border: 1px solid var(--colour-border);
  }

  .debug-info .user-agent {
    flex: 1;
    font-size: var(--font-size-xs);
    color: var(--colour-text-muted);
    font-family: var(--font-mono, monospace);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .copy-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-1);
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--colour-text-muted);
    transition:
      color 0.15s ease,
      background 0.15s ease;
  }

  .copy-btn:hover {
    color: var(--colour-selection);
    background: var(--colour-surface-hover);
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
</style>
