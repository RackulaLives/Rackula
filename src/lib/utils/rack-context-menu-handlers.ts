/**
 * Rack Device Context Menu Handlers
 * Bridges device context menu UI events to the context action functions.
 * Extracted from Rack.svelte to reduce component size.
 */

import type { Rack, DeviceType } from "$lib/types";
import type {
  RackContextActions,
  ContextMenuTarget,
} from "$lib/utils/rack-context-actions";

export interface ContextMenuState {
  open: boolean;
  target: ContextMenuTarget | null;
}

export interface ContextMenuHandlers {
  handleOpen(
    event: CustomEvent<{
      rackId: string;
      deviceIndex: number;
      x: number;
      y: number;
    }>,
  ): void;
  close(): void;
  handleEdit(rack: Rack): void;
  handleDuplicate(rack: Rack): void;
  handleMoveUp(rack: Rack, deviceLibrary: DeviceType[]): void;
  handleMoveDown(rack: Rack): void;
  handleFlip(rack: Rack): void;
  handleDelete(): void;
}

/**
 * Create context menu handler functions that mutate the provided state getters/setters.
 */
export function createContextMenuHandlers(
  actions: RackContextActions,
  getState: () => ContextMenuState,
  setState: (state: ContextMenuState) => void,
): ContextMenuHandlers {
  function close() {
    setState({ open: false, target: null });
  }

  return {
    handleOpen(event) {
      setState({ open: true, target: event.detail });
    },
    close,
    handleEdit(rack) {
      const { target } = getState();
      if (!target) return;
      actions.handleEdit(rack, target);
      close();
    },
    handleDuplicate(rack) {
      const { target } = getState();
      if (!target) return;
      actions.handleDuplicate(rack, target);
      close();
    },
    handleMoveUp(rack, deviceLibrary) {
      const { target } = getState();
      if (!target) return;
      actions.handleMoveUp(rack, deviceLibrary, target);
      close();
    },
    handleMoveDown(rack) {
      const { target } = getState();
      if (!target) return;
      actions.handleMoveDown(rack, target);
      close();
    },
    handleFlip(rack) {
      const { target } = getState();
      if (!target) return;
      actions.handleFlip(rack, target);
      close();
    },
    handleDelete() {
      const { target } = getState();
      if (!target) return;
      actions.handleDelete(target);
      close();
    },
  };
}
