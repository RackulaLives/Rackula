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
  import { IconSearch, IconPlus, IconChevronLeft, IconGearBold } from "./icons";
  import { ICON_SIZE } from "$lib/constants/sizing";
  import { dialogStore } from "$lib/stores/dialogs.svelte";
  import { getViewportStore } from "$lib/utils/viewport.svelte";
  import { getSelectionStore } from "$lib/stores/selection.svelte";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getUIStore } from "$lib/stores/ui.svelte";
  import { getPlacementStore } from "$lib/stores/placement.svelte";
  import { getStorageMode } from "$lib/storage";
  import { canMoveSelectedDeviceSlot } from "$lib/actions/selection-actions";
  import {
    getPaletteCommands,
    getPaletteEmptyState,
  } from "$lib/actions/palette-commands";
  import {
    searchPaletteDevices,
    type PaletteDeviceSources,
  } from "$lib/actions/palette-devices";
  import {
    recordCommand,
    getRecents,
  } from "$lib/stores/palette-recents.svelte";
  import {
    createActionDispatch,
    type ActionDispatch,
  } from "$lib/actions/dispatch";
  import { getStarterLibrary, getStarterSlugs } from "$lib/data/starterLibrary";
  import { getBrandPacks, getBrandSlugs } from "$lib/data/brandPacks";
  import type { ActionId, ActionEnabledContext } from "$lib/actions/registry";
  import type { DeviceType } from "$lib/types";

  const viewportStore = getViewportStore();
  const selectionStore = getSelectionStore();
  const layoutStore = getLayoutStore();
  const uiStore = getUIStore();
  const placementStore = getPlacementStore();
  const isSheet = $derived(viewportStore.isMobile);

  const open = $derived(dialogStore.isOpen("commandPalette"));
  const dispatch: ActionDispatch = createActionDispatch();

  // Sub-mode: "commands" is the top-level command list; "devices" is the pushed
  // device-search sub-page (#2214). bits-ui Command has no native page stack, so
  // the sub-page is local state that swaps the list content inside the same
  // Command.Root. Device rows live only in "devices" and never enter the
  // top-level command projection.
  let mode = $state<"commands" | "devices">("commands");
  let search = $state("");
  let deviceQuery = $state("");
  // The single persistent input element, kept focused across mode switches so a
  // mouse-driven push/pop still lands the caret in the search box.
  let inputEl = $state<HTMLElement | null>(null);

  // Live enable context for gating selection (and rack-dependent) commands.
  const ctx = $derived<ActionEnabledContext>({
    hasSelection: selectionStore.hasSelection,
    isDeviceSelected: selectionStore.isDeviceSelected,
    isRackSelected: selectionStore.isRackSelected,
    canUndo: layoutStore.canUndo,
    canRedo: layoutStore.canRedo,
    hasRacks: layoutStore.hasRack,
    mode: getStorageMode(),
    canMoveDeviceSlot: canMoveSelectedDeviceSlot(),
  });

  const groups = $derived(getPaletteCommands(ctx));
  const showEmptyState = $derived(search.trim() === "");
  const emptyState = $derived(getPaletteEmptyState(ctx, getRecents()));

  // "Add device..." is an accelerator into placement, offered only when there is
  // a rack to place into. It is a palette-internal mode switch, NOT a registry
  // action, so it can never leak into the dispatch map, app menu, or help.
  const canAddDevice = $derived(layoutStore.hasRack);

  // Static library sources; brand packs are constant, starter/custom resolve per
  // call so newly created custom types appear without reopening the palette.
  const brandPacks = getBrandPacks();
  const activeRackWidth = $derived(layoutStore.activeRack?.width ?? 19);
  const deviceSources = $derived.by<PaletteDeviceSources>(() => {
    const starterSlugs = getStarterSlugs();
    const brandSlugs = getBrandSlugs();
    const placed = layoutStore.device_types;
    const placedSlugs = new Set(placed.map((d) => d.slug));
    return {
      starter: getStarterLibrary().filter((d) => !placedSlugs.has(d.slug)),
      brandPackDevices: brandPacks.flatMap((pack) => pack.devices),
      // Placed starter overrides and genuinely custom types; brand-pack placed
      // copies are dropped so brand rows are not duplicated.
      customDevices: placed.filter(
        (d) => starterSlugs.has(d.slug) || !brandSlugs.has(d.slug),
      ),
    };
  });
  const deviceResults = $derived(
    searchPaletteDevices(
      deviceSources,
      deviceQuery,
      activeRackWidth,
      uiStore.compatibleOnly,
    ),
  );

  function deviceLabel(device: DeviceType): string {
    const model = device.model ?? device.slug;
    return device.manufacturer ? `${device.manufacturer} ${model}` : model;
  }

  function resetState() {
    mode = "commands";
    search = "";
    deviceQuery = "";
  }

  function handleOpenChange(next: boolean) {
    if (next) return;
    // Only clear the store if the palette is still the current dialog; a command
    // run from the palette may have already opened a different dialog.
    if (dialogStore.isOpen("commandPalette")) dialogStore.close();
    resetState();
  }

  function enterDeviceMode() {
    deviceQuery = "";
    mode = "devices";
    inputEl?.focus();
  }

  function exitDeviceMode() {
    deviceQuery = "";
    mode = "commands";
    inputEl?.focus();
  }

  // Backspace on an empty device query returns to the command list (mirrors the
  // VS Code Quick Open back gesture). Guarded on empty so it never also deletes
  // a character mid-query.
  function handleDeviceInputKeydown(event: KeyboardEvent) {
    if (event.key === "Backspace" && deviceQuery === "") {
      event.preventDefault();
      exitDeviceMode();
    }
  }

  function placeDevice(device: DeviceType) {
    // Mirror the mobile tap-to-place path: start placement, then close. The
    // palette closing is the cue to position the device on the canvas.
    placementStore.startPlacement(device);
    dialogStore.close();
    resetState();
  }

  // Settings gear in the input row. dialogStore is scalar (one dialog at a
  // time), so closing the palette first would clobber the settings dialog;
  // instead open settings directly, which replaces the palette in the store.
  function openSettings() {
    resetState();
    dialogStore.open("settings");
  }

  function run(id: ActionId) {
    // Record the run as a recent BEFORE closing: only commands actually picked
    // from the palette become recents (not keyboard-invoked actions).
    recordCommand(id);
    // Close the palette BEFORE running the command. dialogStore is scalar (one
    // dialog at a time): a command that opens its own dialog (share, view-yaml,
    // new-layout, ...) would be clobbered if we closed AFTER dispatch.
    dialogStore.close();
    resetState();
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

      <Command.Root
        label="Command palette"
        loop
        shouldFilter={mode !== "devices"}
        class="command-root"
      >
        <div class="command-input-row">
          {#if mode === "devices"}
            <button
              type="button"
              class="command-back"
              onclick={exitDeviceMode}
              aria-label="Back to commands"
              data-testid="command-palette-device-back"
            >
              <IconChevronLeft />
            </button>
          {:else}
            <span class="command-input-icon" aria-hidden="true">
              <IconSearch />
            </span>
          {/if}
          <!-- One persistent input across modes so focus survives the sub-page
               push/pop. bind:value swaps between the command and device queries;
               onkeydown handles Backspace-at-empty only while in device mode. -->
          <Command.Input
            bind:ref={inputEl}
            bind:value={
              () => (mode === "devices" ? deviceQuery : search),
              (v) => {
                if (mode === "devices") deviceQuery = v;
                else search = v;
              }
            }
            onkeydown={mode === "devices"
              ? handleDeviceInputKeydown
              : undefined}
            class="command-input"
            placeholder={mode === "devices"
              ? "Add device..."
              : "Search or jump to..."}
            data-testid="command-palette-input"
          />
          <button
            type="button"
            class="command-settings"
            onclick={openSettings}
            aria-label="Settings"
            data-testid="command-palette-settings"
          >
            <IconGearBold size={ICON_SIZE.md} />
          </button>
        </div>

        <Command.List class="command-list" aria-label="Commands">
          <Command.Viewport class="command-viewport">
            {#if mode !== "devices"}
              <Command.Empty class="command-empty">
                No matching commands
              </Command.Empty>
            {/if}

            {#if mode === "devices"}
              {#if deviceResults.length === 0}
                <p
                  class="command-empty"
                  data-testid="command-palette-device-empty"
                >
                  No matching devices
                </p>
              {:else}
                <Command.Group
                  class="command-group"
                  data-testid="command-palette-device-results"
                >
                  <Command.GroupHeading class="command-group-heading">
                    Add device
                  </Command.GroupHeading>
                  <Command.GroupItems>
                    {#each deviceResults as device (device.slug)}
                      <Command.Item
                        value={device.slug}
                        onSelect={() => placeDevice(device)}
                        class="command-item"
                        data-testid={`command-palette-device-item-${device.slug}`}
                      >
                        <span class="command-item-label"
                          >{deviceLabel(device)}</span
                        >
                        <span class="command-item-shortcut"
                          >{device.u_height}U</span
                        >
                      </Command.Item>
                    {/each}
                  </Command.GroupItems>
                </Command.Group>
              {/if}
            {:else if showEmptyState}
              {@const hasRecent = emptyState.recent.length > 0}
              {@const hasSelection = emptyState.selection.length > 0}
              {#if canAddDevice}
                <Command.Group class="command-group">
                  <Command.GroupItems>
                    <Command.Item
                      value="Add device..."
                      keywords={[
                        "add",
                        "device",
                        "place",
                        "insert",
                        "hardware",
                      ]}
                      onSelect={enterDeviceMode}
                      class="command-item command-item--lead"
                      data-testid="command-palette-add-device"
                    >
                      <span class="command-item-lead">
                        <span class="command-item-icon" aria-hidden="true">
                          <IconPlus />
                        </span>
                        <span class="command-item-label">Add device...</span>
                      </span>
                    </Command.Item>
                  </Command.GroupItems>
                </Command.Group>
              {/if}
              {#if hasRecent}
                <Command.Group
                  class="command-group"
                  data-testid="command-palette-recent"
                >
                  <Command.GroupHeading class="command-group-heading">
                    Recent
                  </Command.GroupHeading>
                  <Command.GroupItems>
                    {#each emptyState.recent as command (command.id)}
                      <Command.Item
                        value={command.label}
                        keywords={command.keywords}
                        onSelect={() => run(command.id)}
                        class="command-item"
                        data-testid={`command-palette-recent-item-${command.id}`}
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
              {/if}

              {#if hasSelection}
                {#if hasRecent}
                  <Command.Separator class="command-separator" />
                {/if}
                <Command.Group
                  class="command-group"
                  data-testid="command-palette-selection"
                >
                  <Command.GroupHeading class="command-group-heading">
                    Selection
                  </Command.GroupHeading>
                  <Command.GroupItems>
                    {#each emptyState.selection as command (command.id)}
                      <Command.Item
                        value={command.label}
                        keywords={command.keywords}
                        onSelect={() => run(command.id)}
                        class="command-item"
                        data-testid={`command-palette-selection-item-${command.id}`}
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
              {/if}

              {#each emptyState.commands as group, groupIndex (group.heading)}
                {#if canAddDevice || hasRecent || hasSelection || groupIndex > 0}
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
            {:else}
              {#if canAddDevice}
                <Command.Group class="command-group">
                  <Command.GroupItems>
                    <Command.Item
                      value="Add device..."
                      keywords={[
                        "add",
                        "device",
                        "place",
                        "insert",
                        "hardware",
                      ]}
                      onSelect={enterDeviceMode}
                      class="command-item command-item--lead"
                      data-testid="command-palette-add-device"
                    >
                      <span class="command-item-lead">
                        <span class="command-item-icon" aria-hidden="true">
                          <IconPlus />
                        </span>
                        <span class="command-item-label">Add device...</span>
                      </span>
                    </Command.Item>
                  </Command.GroupItems>
                </Command.Group>
              {/if}
              {#each groups as group, groupIndex (group.heading)}
                {#if canAddDevice || groupIndex > 0}
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
            {/if}
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

  /* Icon buttons in the input row: the back affordance (device sub-page) and
     the settings gear (trailing edge). Both get a 48px touch target, a
     theme-aware muted colour, and a visible focus ring. The negative vertical
     margin keeps the row height tied to the input, not the larger touch
     target. */
  .command-back,
  .command-settings {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: var(--touch-target-min);
    min-height: var(--touch-target-min);
    margin: calc(var(--space-2) * -1) 0;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--colour-text-muted);
    cursor: pointer;
    border-radius: var(--radius-sm);
  }

  .command-back:hover,
  .command-settings:hover {
    color: var(--colour-text);
  }

  .command-back:focus-visible,
  .command-settings:focus-visible {
    outline: 2px solid var(--colour-focus-ring);
    outline-offset: -2px;
  }

  .command-back :global(svg) {
    width: var(--icon-size-md);
    height: var(--icon-size-md);
  }

  :global(.command-input) {
    flex: 1;
    min-width: 0;
    min-height: var(--touch-target-min);
    /* Breathing room so the placeholder and typed text do not sit flush against
       the search icon and the row edge. */
    padding-left: var(--space-2);
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
    /* Right-aligned hint column (Raycast/Linear scan pattern): margin-left:auto
       pins it to the trailing edge so it stays scannable as the list grows. */
    margin-left: auto;
    flex-shrink: 0;
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    white-space: nowrap;
    color: var(--colour-text-muted);
  }

  /* "Add device..." lead row: icon plus label, reads as an entry point. */
  .command-item-lead {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
  }

  .command-item-icon {
    display: inline-flex;
    color: var(--colour-text-muted);
  }

  .command-item-icon :global(svg) {
    width: var(--icon-size-md);
    height: var(--icon-size-md);
  }

  :global(.command-item--lead[data-selected]) .command-item-icon {
    color: var(--colour-text);
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
