<!--
  Toast notification component
  Displays a single toast with icon, message, optional action button, and dismiss button
  Features: slide-in/out animations, success glow effect
-->
<script lang="ts">
  import type { Toast as ToastType } from "$lib/stores/toast.svelte";
  import { getToastStore } from "$lib/stores/toast.svelte";

  interface Props {
    toast: ToastType;
  }

  let { toast }: Props = $props();

  const toastStore = getToastStore();

  // Track exit animation state
  let isExiting = $state(false);

  function handleDismiss() {
    // Start exit animation
    isExiting = true;
    // Wait for animation to complete, then remove
    setTimeout(() => {
      toastStore.dismissToast(toast.id);
    }, 300); // Match --anim-toast-exit duration
  }

  function handleAction() {
    if (toast.action) {
      toast.action.onClick();
      // Dismiss after action is triggered
      handleDismiss();
    }
  }

  // Get icon based on type
  function getIcon(type: ToastType["type"]): string {
    switch (type) {
      case "success":
        return "✓";
      case "error":
        return "✕";
      case "warning":
        return "⚠";
      case "info":
        return "ℹ";
    }
  }
</script>

<div
  class="toast toast--{toast.type}"
  class:toast--exiting={isExiting}
  class:toast--success-glow={toast.type === "success" && !isExiting}
  role="alert"
>
  <span class="toast__icon" aria-hidden="true">
    {getIcon(toast.type)}
  </span>
  <span class="toast__message">
    {toast.message}
  </span>
  {#if toast.action}
    <button type="button" class="toast__action" onclick={handleAction}>
      {toast.action.label}
    </button>
  {/if}
  <button
    type="button"
    class="toast__dismiss"
    onclick={handleDismiss}
    aria-label="Dismiss notification"
  >
    ✕
  </button>
</div>

<style>
  .toast {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border-radius: var(--radius-md);
    background: var(--toast-bg);
    border: 1px solid var(--toast-border);
    box-shadow: var(--shadow-md);
    min-width: 280px;
    max-width: 420px;
    animation: slideIn 0.2s ease-out;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateX(100%);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  @keyframes slideOut {
    from {
      opacity: 1;
      transform: translateX(0);
    }
    to {
      opacity: 0;
      transform: translateX(100%);
    }
  }

  @keyframes success-glow {
    0% {
      box-shadow:
        var(--shadow-md),
        0 0 0 0 rgba(80, 250, 123, 0.4);
    }
    100% {
      box-shadow:
        var(--shadow-md),
        0 0 0 8px transparent;
    }
  }

  /* Exit animation */
  .toast--exiting {
    animation: slideOut var(--anim-toast-exit, 0.3s) ease-in forwards;
  }

  /* Success glow effect on appear */
  .toast--success-glow {
    animation:
      slideIn 0.2s ease-out,
      success-glow var(--anim-success-glow, 0.5s) ease-out;
  }

  .toast--success {
    border-left: 4px solid var(--colour-success);
  }

  .toast--error {
    border-left: 4px solid var(--colour-error);
  }

  .toast--warning {
    border-left: 4px solid var(--colour-warning);
  }

  .toast--info {
    border-left: 4px solid var(--colour-info);
  }

  .toast__icon {
    flex-shrink: 0;
    width: 1.25rem;
    height: 1.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.875rem;
    font-weight: bold;
  }

  .toast--success .toast__icon {
    color: var(--colour-success);
  }

  .toast--error .toast__icon {
    color: var(--colour-error);
  }

  .toast--warning .toast__icon {
    color: var(--colour-warning);
  }

  .toast--info .toast__icon {
    color: var(--colour-info);
  }

  .toast__message {
    flex: 1;
    font-size: 0.875rem;
    color: var(--colour-text);
    word-break: break-word;
  }

  .toast__action {
    flex-shrink: 0;
    padding: 0.25rem 0.75rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--colour-selection);
    background: transparent;
    border: 1px solid var(--colour-selection);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .toast__action:hover {
    background: var(--colour-selection);
    color: var(--colour-text-on-selection, var(--colour-bg));
  }

  .toast__action:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: 2px;
  }

  .toast__dismiss {
    flex-shrink: 0;
    width: 1.5rem;
    height: 1.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--colour-text-muted);
    font-size: 0.75rem;
    transition: all 0.15s ease;
  }

  .toast__dismiss:hover {
    background: var(--colour-hover);
    color: var(--colour-text);
  }

  .toast__dismiss:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: 1px;
  }
</style>
