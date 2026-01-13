<!--
  MobileWarningModal Component
  Shows a warning to users on small viewports that Rackula is designed for desktop.
  Dismissible and remembers dismissal for the session.
  Uses bits-ui AlertDialog for accessibility and focus management.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { AlertDialog } from "bits-ui";

  const STORAGE_KEY = "rackula-mobile-warning-dismissed";
  const BREAKPOINT = 1024;

  let open = $state(false);

  onMount(() => {
    // Only show on small viewports that haven't dismissed
    const isMobile = window.innerWidth < BREAKPOINT;
    const isDismissed = sessionStorage.getItem(STORAGE_KEY) === "true";

    if (isMobile && !isDismissed) {
      open = true;
    }
  });

  function handleOpenChange(isOpen: boolean) {
    open = isOpen;
    // Persist dismissal when dialog closes
    if (!isOpen) {
      sessionStorage.setItem(STORAGE_KEY, "true");
    }
  }
</script>

<AlertDialog.Root {open} onOpenChange={handleOpenChange}>
  <AlertDialog.Portal>
    <AlertDialog.Overlay class="modal-backdrop" />
    <AlertDialog.Content class="modal">
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

      <AlertDialog.Title class="modal-title">
        Rackula works best on desktop
      </AlertDialog.Title>

      <AlertDialog.Description class="modal-description">
        This app is designed for screens 1024px or wider. For the best
        experience, please visit on a desktop or laptop computer.
      </AlertDialog.Description>

      <p class="modal-note">Mobile support is coming soon!</p>

      <AlertDialog.Cancel class="continue-button">
        Continue anyway
      </AlertDialog.Cancel>
    </AlertDialog.Content>
  </AlertDialog.Portal>
</AlertDialog.Root>

<style>
  :global(.modal-backdrop) {
    position: fixed;
    inset: 0;
    background: var(--colour-backdrop, rgba(0, 0, 0, 0.8));
    z-index: var(--z-modal, 200);
  }

  :global(.modal) {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: var(--colour-dialog-bg, var(--colour-bg));
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    max-width: 400px;
    width: calc(100% - var(--space-8));
    padding: var(--space-6);
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-4);
    z-index: var(--z-modal, 200);
  }

  .modal-icon {
    color: var(--colour-primary);
    opacity: 0.8;
  }

  :global(.modal-title) {
    margin: 0;
    font-size: var(--font-size-xl, 1.25rem);
    font-weight: 600;
    color: var(--colour-text);
  }

  :global(.modal-description) {
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

  :global(.continue-button) {
    margin-top: var(--space-2);
    padding: var(--space-3) var(--space-6);
    background: var(--colour-button-primary);
    color: var(--colour-text-on-primary);
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--font-size-base, 1rem);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast);
  }

  :global(.continue-button:hover) {
    background: var(--colour-button-primary-hover);
  }

  :global(.continue-button:focus-visible) {
    outline: 2px solid var(--colour-selection);
    outline-offset: 2px;
  }
</style>
