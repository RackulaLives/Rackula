<!--
  KeyboardHandler component
  Handles global keyboard shortcuts for the application
-->
<script lang="ts">
  import { shouldIgnoreKeyboard } from "$lib/utils/keyboard";
  import { findActionForEvent } from "$lib/actions/registry";
  import {
    createActionDispatch,
    isCommandPaletteShortcut,
  } from "$lib/actions/dispatch";
  import { getWorkspaceStore } from "$lib/stores/workspace.svelte";
  import { dialogStore } from "$lib/stores/dialogs.svelte";

  const workspace = getWorkspaceStore();
  const dispatch = createActionDispatch();

  /**
   * Alt+1-9 jumps to the Nth open layout tab. Keyed off event.code (Digit1..9)
   * rather than event.key because macOS remaps Alt+digit to a symbol (Alt+1
   * yields the character produced by that key, not "1"). Returns true when the
   * event was a tab-jump so the caller can stop processing.
   */
  function handleTabJump(event: KeyboardEvent): boolean {
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return false;
    }
    const match = /^Digit([1-9])$/.exec(event.code);
    if (!match) return false;

    event.preventDefault();
    const index = Number(match[1]) - 1;
    const tab = workspace.tabs[index];
    if (tab) {
      workspace.switchTo(tab.id);
    }
    return true;
  }

  function handleKeyDown(event: KeyboardEvent) {
    // Palette shortcut fires even from a text field, and before any other
    // handling. It is the first special-case to run before shouldIgnoreKeyboard.
    if (isCommandPaletteShortcut(event)) {
      event.preventDefault();
      event.stopPropagation();
      dialogStore.open("commandPalette");
      return;
    }

    // While the palette is open the global handler is inert: the Dialog owns
    // Escape and the Command input owns typing.
    if (dialogStore.isOpen("commandPalette")) return;

    // Ignore if in input field
    if (shouldIgnoreKeyboard(event)) return;

    // Workspace tab jumps (Alt+1-9) are dynamic, not fixed registry actions, so
    // they take precedence over the action registry.
    if (handleTabJump(event)) return;

    const action = findActionForEvent(event);
    if (!action) return;

    event.preventDefault();
    dispatch[action.id]?.();
  }
</script>

<svelte:window onkeydown={handleKeyDown} />
