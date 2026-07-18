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
    getPaletteSearchCommands,
    getPaletteEmptyState,
    noConfidentCommandMatch as computeNoConfidentCommandMatch,
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
  // readOnly is included so that mutation commands are suppressed in the palette
  // command list while the lock is active, matching the visual affordance.
  const ctx = $derived<ActionEnabledContext>({
    hasSelection: selectionStore.hasSelection,
    isDeviceSelected: selectionStore.isDeviceSelected,
    isRackSelected: selectionStore.isRackSelected,
    canUndo: layoutStore.canUndo,
    canRedo: layoutStore.canRedo,
    hasRacks: layoutStore.hasRack,
    hasMultipleRacks: layoutStore.rackCount >= 2,
    mode: getStorageMode(),
    canMoveDeviceSlot: canMoveSelectedDeviceSlot(),
    readOnly: uiStore.readOnly,
  });

  const showEmptyState = $derived(search.trim() === "");
  const emptyState = $derived(getPaletteEmptyState(ctx, getRecents()));
  // Flat, relevance-ranked search list (#2777 rule 12). Carries context-gated
  // commands greyed-with-reason (#2778); bits-ui fuzzy-filters and ranks them.
  const searchCommands = $derived(getPaletteSearchCommands(ctx));
  // The routing threshold and its scorer-comparison logic live in
  // palette-commands.ts (noConfidentCommandMatch, #2996) so the component and
  // its unit test share one source of truth instead of two constants silently
  // drifting apart. True when no command row is a *confident* match for the
  // query - covers both a true zero-match and a query that only
  // coincidentally brushes a command via a loose interior-word or
  // character-jump hit (a scope gap in #106/#2779's original no-command-match
  // bridge). Gates the device bridge - and, via handleInputKeydown, Enter
  // itself - so a device-like query never silently hijacks Enter into an
  // unrelated command nor a greyed row (#2779, decision 11).
  const noConfidentCommandMatch = $derived(
    computeNoConfidentCommandMatch(search, searchCommands),
  );
  // While browsing (command mode, empty query) nothing is armed: the highlight
  // is suppressed and Enter is inert until the first keystroke (#2777 decision 8).
  const browsing = $derived(mode !== "devices" && search.trim() === "");

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

  // The palette is mounted permanently (only its Dialog.Content unmounts), so a
  // close must reset the sub-mode/search state or it leaks into the next open.
  // onOpenChange only fires for bits-ui-initiated closes (Escape, click-out), so
  // a programmatic close - Cmd+K toggle, a command opening another dialog -
  // would otherwise reopen stuck in device mode or mid-search. Resetting on the
  // open->false transition covers every close path. Depends only on `open`, so
  // writing the mode/search state here cannot re-trigger it.
  $effect(() => {
    if (!open) resetState();
  });

  function handleOpenChange(next: boolean) {
    if (next) return;
    // Only clear the store if the palette is still the current dialog; a command
    // run from the palette may have already opened a different dialog.
    if (dialogStore.isOpen("commandPalette")) dialogStore.close();
    resetState();
  }

  // Enter the device sub-page. An optional prefill seeds the device query so the
  // no-command-match bridge ("Add a device called '<query>'") carries the typed
  // text straight into device search (#2779, rule 11).
  function enterDeviceMode(prefill = "") {
    deviceQuery = prefill;
    mode = "devices";
    inputEl?.focus();
  }

  function exitDeviceMode() {
    deviceQuery = "";
    mode = "commands";
    inputEl?.focus();
  }

  // Esc in the device sub-page pops back to the command list first; a second Esc
  // (now in command mode) lets the Dialog close as usual (#2779). Intercept
  // before bits-ui's Dialog handles Escape so the first press never closes the
  // whole palette.
  function handleContentEscapeKeydown(event: KeyboardEvent) {
    if (mode === "devices") {
      event.preventDefault();
      exitDeviceMode();
    }
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

  // One keydown handler for the persistent input. Device mode keeps the
  // Backspace-to-pop gesture; command mode splits on whether there is a query
  // yet (#2777 decision 8, #2996):
  // - Empty query (browsing): ordinary command rows stay unarmed exactly as
  //   decision 8 requires, but the explicit "Add device..." lead row is a
  //   persistent, named affordance rather than "whatever bits-ui highlighted
  //   first" - so Enter arms it specifically (only when it is actually
  //   offered) instead of staying fully inert. This does not reverse decision
  //   8 for anything else: no other row can fire from an empty query.
  // - Non-empty query with no *confident* command match: bits-ui would still
  //   auto-select and fire whatever row scored above zero, including a stray
  //   coincidental hit ("xserve" -> "Export all layouts"). Routing Enter to
  //   the device bridge here - the same condition that renders it - means a
  //   device-like query can no longer silently run an unrelated command
  //   instead of surfacing the bridge. A confident command match (the query
  //   genuinely names a command) is untouched and still runs natively.
  function handleInputKeydown(event: KeyboardEvent) {
    if (mode === "devices") {
      handleDeviceInputKeydown(event);
      return;
    }
    if (event.key !== "Enter") return;
    if (search.trim() === "") {
      event.preventDefault();
      event.stopPropagation();
      if (canAddDevice) enterDeviceMode();
      return;
    }
    if (canAddDevice && noConfidentCommandMatch) {
      event.preventDefault();
      event.stopPropagation();
      enterDeviceMode(search);
    }
  }

  function placeDevice(device: DeviceType) {
    // Tap-to-place is suppressed when the layout is locked for viewing.
    if (uiStore.readOnly) return;
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
      onEscapeKeydown={handleContentEscapeKeydown}
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
               handleInputKeydown owns the per-mode key behaviour (Backspace-pop
               in device mode, Enter-inert while browsing in command mode). -->
          <Command.Input
            bind:ref={inputEl}
            bind:value={
              () => (mode === "devices" ? deviceQuery : search),
              (v) => {
                // Strip leading whitespace so a standalone or leading space does
                // not put bits-ui into active-search (reordering/blanking the
                // browse list) while showEmptyState still reads it as empty.
                // Interior and trailing spaces are kept so multi-word queries
                // still type normally.
                const next = v.trimStart();
                if (mode === "devices") deviceQuery = next;
                else search = next;
              }
            }
            onkeydown={handleInputKeydown}
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

        <Command.List
          class="command-list {browsing ? 'command-list--browsing' : ''}"
          aria-label="Commands"
        >
          <Command.Viewport class="command-viewport">
            {#if mode !== "devices" && !canAddDevice}
              <!-- With a rack present the device bridge below is the non-blank
                   fallback, so the empty slot is only needed when no rack exists
                   and the "Add device..." affordance is unavailable. -->
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
                      onSelect={() => enterDeviceMode()}
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
              <!-- Searching: one flat, relevance-ranked list, no headings
                   (#2777 rule 12). Unavailable commands stay, greyed with a
                   reason (#2778 rule 10); bits-ui filters and ranks all rows. -->
              <Command.Group class="command-group">
                <Command.GroupItems>
                  {#each searchCommands as command (command.id)}
                    <Command.Item
                      value={command.label}
                      keywords={command.keywords}
                      disabled={command.disabledReason !== undefined}
                      onSelect={() => run(command.id)}
                      class="command-item"
                      data-testid={`command-palette-item-${command.id}`}
                    >
                      <span class="command-item-label">{command.label}</span>
                      {#if command.disabledReason}
                        <span class="command-item-reason"
                          >{command.disabledReason}</span
                        >
                      {:else if command.shortcut}
                        <span class="command-item-shortcut"
                          >{command.shortcut}</span
                        >
                      {/if}
                    </Command.Item>
                  {/each}
                </Command.GroupItems>
              </Command.Group>
              <!-- Device-search bridge to the device catalogue (#2779 rule
                   11, widened by #2996). Shown whenever no command row is a
                   *confident* match for the query - a true zero-match, or a
                   query that only coincidentally brushes a command's keyword
                   or an interior word (see noConfidentCommandMatch) - so a
                   device-like query ("server", "switch", "xserve") always
                   keeps a route into device search even if it also brushes an
                   unrelated command. It lives in its OWN forceMounted group,
                   NOT the command group above: bits-ui culls a group whose
                   items all score zero by setting hidden on the group
                   element, which hides a forceMounted item nested inside it
                   too (#2853). forceMount on the group keeps it rendered and
                   forceMount on the item keeps the item mounted. Enter is
                   routed here explicitly by handleInputKeydown under the same
                   condition, so a coincidental low-confidence command match
                   can never fire ahead of it; selecting it (by click or
                   Enter) enters device search pre-filled with the typed
                   query. -->
              {#if canAddDevice && noConfidentCommandMatch}
                <Command.Group forceMount class="command-group">
                  <Command.GroupItems>
                    <Command.Item
                      forceMount
                      value="add device"
                      onSelect={() => enterDeviceMode(search)}
                      class="command-item command-item--lead"
                      data-testid="command-palette-create-device"
                    >
                      <span class="command-item-lead">
                        <span class="command-item-icon" aria-hidden="true">
                          <IconPlus />
                        </span>
                        <span class="command-item-label"
                          >Add a device called "{search}"</span
                        >
                      </span>
                    </Command.Item>
                  </Command.GroupItems>
                </Command.Group>
              {/if}
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
    max-height: 70dvh;
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
    top: 12dvh;
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
    max-height: calc(100dvh - env(safe-area-inset-top, 0px));
    border-radius: var(--radius-md) var(--radius-md) 0 0;
    transform: translateY(100%);
    transition: transform var(--duration-slow) cubic-bezier(0.4, 0, 0.2, 1);
  }

  :global(.command-palette--sheet[data-state="open"]) {
    transform: translateY(0);
  }

  /* Command.Root: bits-ui renders this element and the class is forwarded via
     the `class` prop, so it must be wrapped in :global() like the other
     forwarded classes. Without a rule it defaults to display:block and grows to
     content height, breaking the flex-column scroll chain: the palette (capped,
     overflow:hidden) then clips the tall browse list and pushes the footer out
     of view. Making it a filling flex column keeps .command-list as the single
     bounded scroll region and pins .command-footer below it. */
  :global(.command-root) {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
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
    flex: 1 1 auto;
    min-height: 0;
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

  /* Why an unavailable command cannot run, shown on the greyed search row
     (#2778). Pinned to the trailing edge like the shortcut, but in prose. */
  .command-item-reason {
    margin-left: auto;
    flex-shrink: 0;
    font-size: var(--font-size-xs);
    white-space: nowrap;
    color: var(--colour-text-muted);
  }

  /* No highlight while browsing (#2777 decision 8): bits-ui auto-selects the
     first row, but until the user types nothing should look armed, so the
     selected background is neutralised. Hover (pointer intent) is unaffected.
     Enter is made inert separately in handleInputKeydown. */
  :global(.command-list--browsing .command-item[data-selected]) {
    background: transparent;
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

  /* Browse parity for the lead-row icon: bits-ui auto-selects the "Add
     device..." row on open, so without this its icon would carry the armed tint
     while the rest of the row is neutralised, contradicting "nothing highlighted
     on open" (#2777 decision 8). */
  :global(.command-list--browsing .command-item--lead[data-selected])
    .command-item-icon {
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
