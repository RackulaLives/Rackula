<!--
  AppMenu Component
  The menu behind the logo. The logo lockup is the menu trigger; the items are
  projected from the actions registry (getAppMenuSections), so the menu cannot
  drift from the keyboard handler or help overlay. Storage-mode aware on two
  levels: the item set differs between the browser and server builds, and each
  item's enabled state is derived from its registry enabledWhen predicate
  against a live context (rack presence, storage mode). Disabled items stay in
  the menu, rendered aria-disabled by bits-ui, rather than being hidden.
-->
<script lang="ts">
  import { DropdownMenu } from "bits-ui";
  import LogoLockup from "./LogoLockup.svelte";
  import {
    getAppMenuSections,
    type ActionEnabledContext,
    type ActionId,
  } from "$lib/actions/registry";
  import { getStorageMode, type StorageMode } from "$lib/storage";
  import "$lib/styles/menu.css";

  interface Props {
    /** Maps each app-menu action id to the closure that runs it. */
    onaction: (id: ActionId) => void;
    /** Whether any rack exists; gates share and view-yaml. */
    hasRacks?: boolean;
    /** Party mode passes through to the logo lockup. */
    partyMode?: boolean;
  }

  let { onaction, hasRacks = false, partyMode = false }: Props = $props();

  let open = $state(false);

  const mode: StorageMode = getStorageMode();

  // Live context for the registry's enabledWhen predicates. Only the app menu's
  // global-scope items are projected, and the gated ones (share, view-yaml)
  // read hasRacks; the selection and history fields are not consulted by any
  // menu item, so they are reported as the neutral, no-target state.
  const enableContext: ActionEnabledContext = $derived({
    hasSelection: false,
    isDeviceSelected: false,
    isRackSelected: false,
    canUndo: false,
    canRedo: false,
    hasRacks,
    mode,
    canMoveDeviceSlot: false,
  });

  const sections = $derived(getAppMenuSections(mode, enableContext));

  function handleSelect(id: ActionId) {
    return () => {
      onaction(id);
      open = false;
    };
  }
</script>

<DropdownMenu.Root bind:open>
  <DropdownMenu.Trigger>
    {#snippet child({ props })}
      <button
        {...props}
        type="button"
        class="app-menu-trigger"
        aria-label="App menu"
        data-testid="btn-app-menu"
      >
        <LogoLockup size={32} {partyMode} showText={false} />
        <span class="app-menu-caret" aria-hidden="true">▾</span>
      </button>
    {/snippet}
  </DropdownMenu.Trigger>

  <DropdownMenu.Portal>
    <DropdownMenu.Content
      class="menu-content menu-inline"
      sideOffset={4}
      align="start"
    >
      {#each sections as section, sectionIndex (section.group)}
        {#if sectionIndex > 0}
          <DropdownMenu.Separator class="menu-separator" />
        {/if}
        <DropdownMenu.Group>
          {#each section.items as item (item.id)}
            <DropdownMenu.Item
              class="menu-item"
              disabled={item.disabled ?? false}
              data-testid={`app-menu-${item.id}`}
              onSelect={handleSelect(item.id)}
            >
              <span class="menu-label">{item.label}</span>
              {#if item.shortcut}
                <span class="menu-shortcut">{item.shortcut}</span>
              {/if}
            </DropdownMenu.Item>
          {/each}
        </DropdownMenu.Group>
      {/each}
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>

<style>
  /* The logo doubles as the menu trigger. A 1px border + radius give it a
     persistent button affordance so it reads as a menu, not a bare logo, while
     the brand mark stays uncaged (transparent fill, no filled chip) (#2398). A
     disclosure caret signals it opens a menu. padding gives ~8px clearance from
     the edges (#2386). */
  .app-menu-trigger {
    display: flex;
    align-items: center;
    /* >= 44px hit area (WCAG 2.5.5) inside the 48px bar; the border is included
       (border-box) so the 32px mark + caret centre within it. */
    min-height: 44px;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-md);
    background: transparent;
    cursor: pointer;
    transition:
      background-color var(--duration-fast) var(--ease-out),
      border-color var(--duration-fast) var(--ease-out),
      transform var(--duration-fast) var(--ease-out);
  }

  /* Disclosure caret: muted by default, brightens with the trigger on hover and
     while the menu is open. */
  .app-menu-caret {
    display: inline-flex;
    align-items: center;
    font-size: var(--font-size-xs);
    line-height: 1;
    color: var(--colour-text-muted);
    transition:
      color var(--duration-fast) var(--ease-out),
      transform var(--duration-fast) var(--ease-out);
  }

  .app-menu-trigger:hover {
    border-color: var(--colour-selection);
    background: var(--colour-surface-hover);
  }

  .app-menu-trigger:hover .app-menu-caret {
    color: var(--colour-text);
  }

  .app-menu-trigger:active {
    transform: scale(0.98);
  }

  .app-menu-trigger:focus-visible {
    outline: none;
    box-shadow:
      0 0 0 2px var(--colour-bg),
      0 0 0 4px var(--colour-focus-ring);
  }

  .app-menu-trigger[data-state="open"] {
    border-color: var(--colour-selection);
    background: var(--colour-surface-hover);
  }

  /* Flip the caret while the menu is open to reinforce the disclosure state. */
  .app-menu-trigger[data-state="open"] .app-menu-caret {
    color: var(--colour-text);
    transform: rotate(180deg);
  }

  @media (prefers-reduced-motion: reduce) {
    .app-menu-trigger,
    .app-menu-caret {
      transition: none;
    }

    .app-menu-trigger:active {
      transform: none;
    }

    /* The open-state caret keeps its rotated orientation as a static
       expanded/collapsed cue; only the transition timing above is removed, so
       it flips instantly rather than animating. */
  }
</style>
