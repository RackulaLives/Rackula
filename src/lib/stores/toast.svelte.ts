/**
 * Toast notification store using Svelte 5 runes
 * Provides notifications for user feedback with optional action buttons
 */

import { SvelteMap } from "svelte/reactivity";
import { generateId } from "$lib/utils/device";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration: number; // ms, 0 = permanent
  action?: ToastAction;
  /**
   * Marks a toast whose action undoes a specific history command (#2993,
   * #3028). Its Undo button always targets the top of the undo stack, so once
   * any newer command is recorded the toast no longer describes what Undo
   * would do; dismissUndoToasts() clears it at that point rather than letting
   * a stale toast revert the wrong action.
   */
  isUndoAffordance?: boolean;
}

const DEFAULT_DURATION = 5000; // 5 seconds

/**
 * Maximum number of toasts visible at once (#3004/R27b/R26). Rapid
 * consecutive actions (e.g. holding undo/redo) must not pile an unbounded
 * column of toasts over the canvas; once the cap is exceeded, the oldest
 * toast is dismissed to make room for the newest.
 */
export const MAX_VISIBLE_TOASTS = 3;

// Store state
let toasts = $state<Toast[]>([]);

// Timeout IDs for auto-dismiss
const timeouts = new SvelteMap<string, ReturnType<typeof setTimeout>>();

/**
 * Show a new toast notification
 * Returns the toast ID for manual dismissal if needed
 */
function showToast(
  message: string,
  type: ToastType,
  duration: number = DEFAULT_DURATION,
  action?: ToastAction,
  isUndoAffordance = false,
): string {
  const id = generateId();
  const toast: Toast = {
    id,
    type,
    message,
    duration,
    action,
    isUndoAffordance,
  };

  toasts = [...toasts, toast];

  // Cap the visible stack: drop the oldest toasts first so the column never
  // grows past MAX_VISIBLE_TOASTS, however many showToast calls arrive in a
  // burst (#3004/R27b). Evict the oldest non-undo-affordance toast before
  // ever touching an undo toast, so a stack cap can't silently hide a still
  // clickable Undo for a destructive action (e.g. device removal) during a
  // burst. Only when every visible toast is an undo affordance does the
  // oldest of those get evicted; that edge is safe since undo toasts also
  // auto-dismiss at 5s and via dismissUndoToasts() on the next command.
  while (toasts.length > MAX_VISIBLE_TOASTS) {
    const evictable = toasts.find((t) => !t.isUndoAffordance) ?? toasts[0];
    if (!evictable) break;
    dismissToast(evictable.id);
  }

  // Set up auto-dismiss if duration > 0
  if (duration > 0) {
    const timeoutId = setTimeout(() => {
      dismissToast(id);
    }, duration);
    timeouts.set(id, timeoutId);
  }

  return id;
}

/**
 * Show a toast with an undo action
 * Convenience wrapper for common undo pattern. Flagged as an undo affordance
 * (#2993, #3028) so dismissUndoToasts() clears it once a newer command is
 * recorded, before its Undo button can revert the wrong action.
 */
function showUndoToast(
  message: string,
  onUndo: () => void,
  actionLabel = "Undo",
): string {
  return showToast(
    message,
    "info",
    DEFAULT_DURATION,
    {
      label: actionLabel,
      onClick: onUndo,
    },
    true,
  );
}

/**
 * Dismiss every toast currently offering an undo affordance (#2993, #3028).
 * Called whenever a new command enters the undo history, since an undo
 * toast's action always targets the top of the undo stack: once a newer
 * command is recorded, the toast no longer describes what its Undo button
 * would actually revert.
 */
function dismissUndoToasts(): void {
  for (const toast of toasts) {
    if (toast.isUndoAffordance) {
      dismissToast(toast.id);
    }
  }
}

/**
 * Dismiss a specific toast by ID
 */
function dismissToast(id: string): void {
  // Clear timeout if exists
  const timeoutId = timeouts.get(id);
  if (timeoutId) {
    clearTimeout(timeoutId);
    timeouts.delete(id);
  }

  toasts = toasts.filter((t) => t.id !== id);
}

/**
 * Clear all toasts
 */
function clearAllToasts(): void {
  // Clear all timeouts
  for (const timeoutId of timeouts.values()) {
    clearTimeout(timeoutId);
  }
  timeouts.clear();

  toasts = [];
}

/**
 * Reset store state (for testing)
 */
export function resetToastStore(): void {
  clearAllToasts();
}

/**
 * Get the toast store
 */
export function getToastStore() {
  return {
    get toasts() {
      return toasts;
    },
    showToast,
    showUndoToast,
    dismissToast,
    dismissUndoToasts,
    clearAllToasts,
  };
}
