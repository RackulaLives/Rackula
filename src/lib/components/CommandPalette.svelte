<!--
  CommandPalette - the Ctrl/Cmd+K command accelerator (#2212, shell only)

  Composes bits-ui Command.* inside bits-ui Dialog.* so the palette gets the
  Dialog's focus trap, Escape handling, and inert backdrop, and the Command's
  ARIA combobox/listbox model plus built-in fuzzy filtering. Command rows are
  projected from the actions registry (getPaletteCommands), so the palette is a
  projection of the one registry and cannot drift from the menu, keyboard
  handler, or help overlay. Recents and the rich selection-aware empty state
  are #2213. Bottom-sheet presentation below the mobile breakpoint mirrors
  Dialog.svelte. All colours via design tokens.
-->
<script lang="ts">
  import { Dialog, Command } from "bits-ui";
  import { IconSearch } from "./icons";
  import { dialogStore } from "$lib/stores/dialogs.svelte";
  import { getViewportStore } from "$lib/utils/viewport.svelte";
  import { getSelectionStore } from "$lib/stores/selection.svelte";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getStorageMode } from "$lib/storage";
  import { getPaletteCommands } from "$lib/actions/palette-commands";
  import {
    createActionDispatch,
    type ActionDispatch,
  } from "$lib/actions/dispatch";
  import type { ActionId, ActionEnabledContext } from "$lib/actions/registry";

  const viewportStore = getViewportStore();
  const selectionStore = getSelectionStore();
  const layoutStore = getLayoutStore();
  const isSheet = $derived(viewportStore.isMobile);

  const open = $derived(dialogStore.isOpen("commandPalette"));
  const dispatch: ActionDispatch = createActionDispatch();

  let search = $state("");

  // Live enable context for gating selection (and rack-dependent) commands.
  const ctx = $derived<ActionEnabledContext>({
    hasSelection: selectionStore.hasSelection,
    isDeviceSelected: selectionStore.isDeviceSelected,
    isRackSelected: selectionStore.isRackSelected,
    canUndo: layoutStore.canUndo,
    canRedo: layoutStore.canRedo,
    hasRacks: layoutStore.hasRack,
    mode: getStorageMode(),
  });

  const groups = $derived(getPaletteCommands(ctx));

  function handleOpenChange(next: boolean) {
    if (next) return;
    // Only clear the store if the palette is still the current dialog; a command
    // run from the palette may have already opened a different dialog.
    if (dialogStore.isOpen("commandPalette")) dialogStore.close();
    search = "";
  }

  function run(id: ActionId) {
    // Close the palette BEFORE running the command. dialogStore is scalar (one
    // dialog at a time): a command that opens its own dialog (share, view-yaml,
    // new-layout, ...) would be clobbered if we closed AFTER dispatch.
    search = "";
    dialogStore.close();
    dispatch[id]?.();
  }
</script>

<Dialog.Root {open} onOpenChange={handleOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay class="dialog-backdrop" data-testid="dialog-backdrop" />
    <Dialog.Content
      class="command-palette {isSheet
        ? 'command-palette--sheet'
        : 'command-palette--centred'}"
      data-testid="command-palette"
    >
      <!-- Visually-hidden accessible name for the dialog. -->
      <Dialog.Title class="sr-only">Command palette</Dialog.Title>

      <Command.Root label="Command palette" loop class="command-root">
        <div class="command-input-row">
          <span class="command-input-icon" aria-hidden="true">
            <IconSearch />
          </span>
          <Command.Input
            bind:value={search}
            class="command-input"
            placeholder="Search or jump to..."
            data-testid="command-palette-input"
          />
        </div>

        <Command.List class="command-list" aria-label="Commands">
          <Command.Viewport class="command-viewport">
            <Command.Empty class="command-empty">
              No matching commands
            </Command.Empty>

            {#each groups as group, groupIndex (group.heading)}
              {#if groupIndex > 0}
                <Command.Separator class="command-separator" />
              {/if}
              <Command.Group class="command-group">
                <Command.GroupHeading class="command-group-heading">
                  {group.heading}
                </Command.GroupHeading>
                <Command.GroupItems>
                  {#each group.commands as command (command.id)}
                    <Command.Item
                      value={command.label}
                      keywords={command.keywords}
                      onSelect={() => run(command.id)}
                      class="command-item"
                      data-testid={`command-palette-item-${command.id}`}
                    >
                      <span class="command-item-label">{command.label}</span>
                      {#if command.shortcut}
                        <span class="command-item-shortcut"
                          >{command.shortcut}</span
                        >
                      {/if}
                    </Command.Item>
                  {/each}
                </Command.GroupItems>
              </Command.Group>
            {/each}
          </Command.Viewport>
        </Command.List>

        <div class="command-footer" aria-hidden="true">
          <span><kbd>&#8593;</kbd><kbd>&#8595;</kbd> navigate</span>
          <span><kbd>&#8629;</kbd> run</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </Command.Root>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  /* Reuses .dialog-backdrop (and its fade keyframes) from
     src/lib/styles/dialogs.css, imported globally via app.css, exactly like
     Dialog.svelte. All colours via tokens.

     The palette, input, list, viewport, group heading, items, separator, and
     empty classes are forwarded to bits-ui-rendered elements via the `class`
     prop, so Svelte's scoper cannot see them on authored markup. They are
     wrapped in :global() (the same reason Dialog.svelte's .dialog/.dialog-backdrop
     live in the global dialogs.css). The input row, icon, and footer below are
     real elements in this template and stay scoped. */

  :global(.command-palette) {
    position: fixed;
    width: min(90vw, 640px);
    max-height: 70vh;
    display: flex;
    flex-direction: column;
    background: var(--colour-surface);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    overflow: hidden;
    z-index: calc(var(--z-modal) + 1);
  }

  /* Centred (desktop): sits in the upper third so it reads like a launcher. */
  :global(.command-palette--centred) {
    left: 50%;
    top: 12vh;
    transform: translateX(-50%);
  }

  :global(.command-palette--centred[data-state="open"]) {
    animation: command-palette-in var(--duration-fast) ease forwards;
  }

  :global(.command-palette--centred[data-state="closed"]) {
    animation: command-palette-out var(--duration-fast) ease forwards;
  }

  /* Bottom-sheet (mobile): slides up from the bottom edge. */
  :global(.command-palette--sheet) {
    left: 0;
    right: 0;
    bottom: 0;
    top: auto;
    width: 100%;
    max-height: 85vh;
    border-radius: var(--radius-md) var(--radius-md) 0 0;
    transform: translateY(100%);
    transition: transform var(--duration-slow) cubic-bezier(0.4, 0, 0.2, 1);
  }

  :global(.command-palette--sheet[data-state="open"]) {
    transform: translateY(0);
  }

  .command-input-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--colour-border);
  }

  .command-input-icon {
    display: inline-flex;
    color: var(--colour-text-muted);
  }

  .command-input-icon :global(svg) {
    width: var(--icon-size-md);
    height: var(--icon-size-md);
  }

  :global(.command-input) {
    flex: 1;
    min-height: var(--touch-target-min);
    border: none;
    background: transparent;
    color: var(--colour-text);
    font-size: var(--font-size-md);
    font-family: inherit;
    outline: none;
  }

  :global(.command-input::placeholder) {
    color: var(--colour-text-muted);
  }

  :global(.command-list) {
    overflow-y: auto;
  }

  :global(.command-viewport) {
    padding: var(--space-2);
  }

  :global(.command-group-heading) {
    padding: var(--space-2) var(--space-2) var(--space-1);
    font-size: var(--font-size-xs);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--colour-text-muted);
  }

  :global(.command-item) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    min-height: var(--touch-target-min);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    color: var(--colour-text);
    cursor: pointer;
  }

  :global(.command-item[data-selected]) {
    background: var(--colour-surface-hover);
    color: var(--colour-text);
  }

  :global(.command-item[data-disabled]) {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .command-item-shortcut {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    color: var(--colour-text-muted);
  }

  :global(.command-separator) {
    height: 1px;
    margin: var(--space-1) 0;
    background: var(--colour-border);
  }

  :global(.command-empty) {
    padding: var(--space-4);
    text-align: center;
    color: var(--colour-text-muted);
  }

  .command-footer {
    display: flex;
    gap: var(--space-4);
    padding: var(--space-2) var(--space-4);
    border-top: 1px solid var(--colour-border);
    font-size: var(--font-size-xs);
    color: var(--colour-text-muted);
  }

  .command-footer kbd {
    font-family: var(--font-mono);
    background: var(--colour-surface-hover);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    padding: 0 var(--space-1);
    margin-right: 2px;
  }

  :global(.command-input:focus-visible) {
    outline: 2px solid var(--colour-focus-ring);
    outline-offset: -2px;
  }

  @keyframes command-palette-in {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(-0.5rem);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }

  @keyframes command-palette-out {
    from {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
    to {
      opacity: 0;
      transform: translateX(-50%) translateY(-0.5rem);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.command-palette--centred[data-state="open"]),
    :global(.command-palette--centred[data-state="closed"]) {
      animation: none;
    }

    :global(.command-palette--sheet) {
      transition: none;
    }
  }
</style>
