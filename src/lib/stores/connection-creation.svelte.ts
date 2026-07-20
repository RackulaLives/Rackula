/**
 * Connection Creation Store
 * Manages the desktop click-to-click connection creation workflow (#1932):
 * click a source port to arm the mode, then click a target port to create
 * the connection. Mirrors the tap-to-place pattern (placement.svelte.ts): a
 * mode flag plus the minimal state needed to resume the interaction, reset
 * on cancel/complete rather than accumulated across attempts.
 */

import type { InterfaceTemplate } from "$lib/types";

// State
let isCreating = $state(false);
let sourcePortId = $state<string | null>(null);
let sourceIface = $state<InterfaceTemplate | null>(null);

/**
 * Screen-reader announcement for connection-creation state transitions. Set
 * on start, cancel, and complete so assistive technologies can announce the
 * mode without a visible toast for every step (mirrors placementAnnouncement).
 */
let connectionAnnouncement = $state<string | null>(null);

/**
 * Arm connection creation with a source port. Clicking a second port while
 * armed targets it (see the handler in connection-creation.ts); clicking a
 * port while idle calls this to start.
 *
 * Unlike placement mode (which has a persistent "Placing" banner covering
 * the armed state), connection creation has no equivalent banner, so this
 * sets an announcement rather than clearing it: it is the only screen-reader
 * signal that the mode was entered.
 */
function startConnection(portId: string, iface: InterfaceTemplate): void {
  connectionAnnouncement = `${iface.label ?? iface.name} selected, click a target port to connect`;
  isCreating = true;
  sourcePortId = portId;
  sourceIface = iface;
}

/**
 * Internal helper to reset connection-creation state.
 * Used by cancel and complete.
 */
function resetState(): void {
  isCreating = false;
  sourcePortId = null;
  sourceIface = null;
}

/**
 * Cancel connection creation without creating a connection.
 * Used by Escape, right-click, clicking the source port again, and a
 * validation error on the target port.
 */
function cancelConnection(): void {
  if (isCreating) {
    connectionAnnouncement = "Connection creation cancelled";
  }
  resetState();
}

/**
 * Complete connection creation after a connection was successfully added.
 * `summary` overrides the default announcement.
 */
function completeConnection(summary?: string): void {
  if (isCreating) {
    connectionAnnouncement = summary ?? "Connection created";
  }
  resetState();
}

/**
 * Reset connection-creation store state (for testing).
 */
export function resetConnectionCreationStore(): void {
  connectionAnnouncement = null;
  resetState();
}

/**
 * Get the connection-creation store with reactive state and actions.
 * @returns Store object with getters and actions
 */
export function getConnectionCreationStore() {
  return {
    get isCreating() {
      return isCreating;
    },
    get sourcePortId() {
      return sourcePortId;
    },
    get sourceIface() {
      return sourceIface;
    },
    /**
     * Screen-reader announcement text for the most recent connection-creation
     * state transition (started, cancelled, or created). Null while idle.
     */
    get connectionAnnouncement() {
      return connectionAnnouncement;
    },
    startConnection,
    cancelConnection,
    completeConnection,
  };
}
