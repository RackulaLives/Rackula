<!--
  BuildInfoTooltip Component
  Rich tooltip showing build information for dev environments.
  Features: version, commit (linked), branch, build time, click-to-copy
-->
<script lang="ts">
  import {
    formatRelativeTime,
    formatFullTimestamp,
  } from "$lib/utils/buildTime";
  import { Check, ExternalLink } from "@lucide/svelte";

  // Build-time constants from vite.config.ts
  declare const __APP_VERSION__: string;
  declare const __BUILD_TIME__: string;
  declare const __COMMIT_HASH__: string;
  declare const __BRANCH_NAME__: string;
  declare const __GIT_DIRTY__: boolean;

  interface Props {
    visible: boolean;
  }

  let { visible }: Props = $props();

  // Build info with fallbacks
  const version =
    typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "unknown";
  const buildTime = typeof __BUILD_TIME__ !== "undefined" ? __BUILD_TIME__ : "";
  const commitHash =
    typeof __COMMIT_HASH__ !== "undefined" ? __COMMIT_HASH__ : "";
  const branchName =
    typeof __BRANCH_NAME__ !== "undefined" ? __BRANCH_NAME__ : "";
  const isDirty = typeof __GIT_DIRTY__ !== "undefined" ? __GIT_DIRTY__ : false;

  // GitHub URLs
  const repoUrl = "https://github.com/RackulaLives/Rackula";
  const commitUrl = commitHash ? `${repoUrl}/commit/${commitHash}` : "";

  // Update relative time every minute
  let now = $state(new Date());
  $effect(() => {
    const interval = setInterval(() => {
      now = new Date();
    }, 60_000);
    return () => clearInterval(interval);
  });

  const relativeTime = $derived(
    buildTime ? formatRelativeTime(buildTime, now) : "",
  );
  const fullTimestamp = $derived(
    buildTime ? formatFullTimestamp(buildTime) : "",
  );

  // Copy state
  let copied = $state(false);
  let copyTimeoutId: ReturnType<typeof setTimeout> | null = null;

  /**
   * Format version string for clipboard
   * e.g., "Rackula v0.6.13 (e2bf857, main)"
   */
  function getClipboardText(): string {
    const parts = [`Rackula v${version}`];
    if (commitHash || branchName) {
      const details: string[] = [];
      if (commitHash) details.push(commitHash);
      if (branchName) details.push(branchName);
      if (isDirty) details.push("dirty");
      parts.push(`(${details.join(", ")})`);
    }
    return parts.join(" ");
  }

  /**
   * Copy build info to clipboard
   */
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(getClipboardText());
      copied = true;

      // Clear any existing timeout
      if (copyTimeoutId) {
        clearTimeout(copyTimeoutId);
      }

      // Reset after 2 seconds
      copyTimeoutId = setTimeout(() => {
        copied = false;
        copyTimeoutId = null;
      }, 2000);
    } catch {
      // Clipboard API not available (e.g., HTTP context)
      console.warn("Clipboard API not available");
    }
  }
</script>

{#if visible}
  <div
    class="build-info-tooltip"
    role="tooltip"
    data-testid="build-info-tooltip"
  >
    <div class="tooltip-content">
      <!-- Version -->
      <div class="info-row">
        <span class="info-label">Version</span>
        <span class="info-value">v{version}</span>
      </div>

      <!-- Commit (linked) -->
      {#if commitHash}
        <div class="info-row">
          <span class="info-label">Commit</span>
          <a
            href={commitUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="info-value commit-link"
            title="View commit on GitHub"
          >
            {commitHash}{#if isDirty}*{/if}
            <ExternalLink size={12} aria-hidden="true" />
          </a>
        </div>
      {/if}

      <!-- Branch -->
      {#if branchName}
        <div class="info-row">
          <span class="info-label">Branch</span>
          <span class="info-value">{branchName}</span>
        </div>
      {/if}

      <!-- Build time -->
      {#if relativeTime}
        <div class="info-row">
          <span class="info-label">Built</span>
          <span class="info-value" title={fullTimestamp}>
            {relativeTime} ago
          </span>
        </div>
      {/if}
    </div>

    <!-- Copy button -->
    <button
      type="button"
      class="copy-button"
      class:copied
      onclick={handleCopy}
      title="Copy version info to clipboard"
      data-testid="copy-build-info"
    >
      {#if copied}
        <Check size={14} aria-hidden="true" />
        <span>Copied!</span>
      {:else}
        <span>Click to copy</span>
      {/if}
    </button>
  </div>
{/if}

<style>
  .build-info-tooltip {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: var(--z-tooltip, 1000);
    margin-top: var(--space-2);
    padding: var(--space-3);
    background-color: var(--colour-surface-overlay, #282a36);
    border: 1px solid var(--colour-border, #44475a);
    border-radius: var(--radius-md, 8px);
    box-shadow: var(--shadow-lg);
    min-width: 200px;
    animation: tooltip-fade-in var(--duration-fast, 100ms)
      var(--ease-out, ease-out);
  }

  @keyframes tooltip-fade-in {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .tooltip-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-3);
  }

  .info-label {
    font-family: var(--font-mono, monospace);
    font-size: var(--font-size-xs, 12px);
    color: var(--colour-text-muted, #6272a4);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .info-value {
    font-family: var(--font-mono, monospace);
    font-size: var(--font-size-sm, 14px);
    color: var(--colour-text, #f8f8f2);
    font-weight: var(--font-weight-medium, 500);
  }

  .commit-link {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    color: var(--dracula-cyan, #8be9fd);
    text-decoration: none;
    transition: color var(--duration-fast, 150ms) var(--ease-out, ease-out);
  }

  .commit-link:hover {
    color: var(--dracula-purple, #bd93f9);
    text-decoration: underline;
  }

  .copy-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    width: 100%;
    margin-top: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border: 1px dashed var(--colour-border, #44475a);
    border-radius: var(--radius-sm, 4px);
    background: transparent;
    color: var(--colour-text-muted, #6272a4);
    font-family: var(--font-mono, monospace);
    font-size: var(--font-size-xs, 12px);
    cursor: pointer;
    transition:
      background-color var(--duration-fast, 150ms) var(--ease-out, ease-out),
      border-color var(--duration-fast, 150ms) var(--ease-out, ease-out),
      color var(--duration-fast, 150ms) var(--ease-out, ease-out);
  }

  .copy-button:hover {
    background: var(--colour-surface-hover, rgba(255, 255, 255, 0.05));
    border-color: var(--colour-text-muted, #6272a4);
    color: var(--colour-text, #f8f8f2);
  }

  .copy-button.copied {
    border-color: var(--dracula-green, #50fa7b);
    color: var(--dracula-green, #50fa7b);
    border-style: solid;
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .build-info-tooltip {
      animation: none;
    }
  }
</style>
