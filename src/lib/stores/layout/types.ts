/**
 * Shared types for layout domain modules
 *
 * Provides the LayoutStateAccess interface that extracted modules use
 * to read and mutate the store's reactive state without direct access
 * to the module-level $state variables in layout.svelte.ts.
 */

import type { Layout, Rack, RackGroup } from "$lib/types";

/**
 * Interface for accessing layout store state from extracted modules.
 * The facade (layout.svelte.ts) creates an instance that bridges
 * the module-level $state variables to these extracted functions.
 */
export interface LayoutStateAccess {
  /** Get the current layout */
  getLayout(): Layout;
  /** Replace the layout (triggers Svelte reactivity) */
  setLayout(layout: Layout): void;
  /** Get the current active rack ID */
  getActiveRackId(): string | null;
  /** Set the active rack ID */
  setActiveRackId(id: string | null): void;
  /** Mark the layout as dirty */
  markDirty(): void;
  /** Mark the layout as started (user has created/loaded a rack) */
  markStarted(): void;
  /** Get rack groups (convenience, reads from layout.rack_groups) */
  getRackGroups(): RackGroup[];
  /** Find a rack by ID in the current layout */
  findRack(id: string): Rack | undefined;
  /** Find the index of a rack by ID */
  findRackIndex(id: string): number;
}
