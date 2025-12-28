<!--
  MobileWarningModal Component
  Shows a warning to users on small viewports that Rackula is designed for desktop.
  Dismissible and remembers dismissal for the session.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { trapFocus, focusFirst, createFocusManager } from "$lib/utils/focus";

  const STORAGE_KEY = "rackula-mobile-warning-dismissed";
  const BREAKPOINT = 1024;

  let open = $state(false);
  let dialogElement: HTMLDivElement | null = $state(null);
  const focusManager = createFocusManager();

  onMount(() => {
    // Only show on small viewports that haven't dismissed
    const isMobile = window.innerWidth < BREAKPOINT;
    const isDismissed = sessionStorage.getItem(STORAGE_KEY) === "true";

    if (isMobile && !isDismissed) {
      open = true;
    }
  });

  function handleContinue() {
    sessionStorage.setItem(STORAGE_KEY, "true");
    open = false;
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape" && open) {
      handleContinue();
    }
  }

  // Focus management
  $effect(() => {
    if (open) {
      focusManager.save();
      setTimeout(() => {
        if (dialogElement) {
          focusFirst(dialogElement);
        }
      }, 0);
    } else {
      focusManager.restore();
    }
  });

  onMount(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  });
</script>

{#if open}
  <div class="modal-backdrop" role="presentation">
    <div
      bind:this={dialogElement}
      class="modal"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="mobile-warning-title"
      aria-describedby="mobile-warning-desc"
      use:trapFocus
    >
      <div class="modal-icon" aria-hidden="true">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
          <line
            x1="12"
            y1="18"
            x2="12"
            y2="18.01"
            stroke-width="2"
            stroke-linecap="round"
          />
        </svg>
      </div>

      <h2 id="mobile-warning-title" class="modal-title">
        Rackula works best on desktop
      </h2>

      <p id="mobile-warning-desc" class="modal-description">
        This app is designed for screens 1024px or wider. For the best
        experience, please visit on a desktop or laptop computer.
      </p>

      <p class="modal-note">Mobile support is coming soon!</p>

      <button type="button" class="continue-button" onclick={handleContinue}>
        Continue anyway
      </button>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: var(--colour-backdrop, rgba(0, 0, 0, 0.8));
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-modal, 200);
    padding: var(--space-4);
  }

  .modal {
    background: var(--colour-dialog-bg, var(--colour-bg));
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    max-width: 400px;
    width: 100%;
    padding: var(--space-6);
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-4);
  }

  .modal-icon {
    color: var(--colour-primary);
    opacity: 0.8;
  }

  .modal-title {
    margin: 0;
    font-size: var(--font-size-xl, 1.25rem);
    font-weight: 600;
    color: var(--colour-text);
  }

  .modal-description {
    margin: 0;
    font-size: var(--font-size-base, 1rem);
    color: var(--colour-text-muted);
    line-height: 1.5;
  }

  .modal-note {
    margin: 0;
    font-size: var(--font-size-sm, 0.875rem);
    color: var(--colour-primary);
    font-weight: 500;
  }

  .continue-button {
    margin-top: var(--space-2);
    padding: var(--space-3) var(--space-6);
    background: var(--colour-primary);
    color: var(--colour-primary-contrast, white);
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--font-size-base, 1rem);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast);
  }

  .continue-button:hover {
    background: var(--colour-primary-hover);
  }

  .continue-button:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: 2px;
  }
</style>
