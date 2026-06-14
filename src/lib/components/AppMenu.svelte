<!--
  AppMenu Component
  The menu behind the logo. The logo lockup is the menu trigger; the items are
  projected from the actions registry (getAppMenuSections), so the menu cannot
  drift from the keyboard handler or help overlay. Storage-mode aware in the
  static sense: the item set differs between the browser and server builds.
  Full mode-aware enable/disable logic is #2187.
-->
<script lang="ts">
  import { DropdownMenu } from "bits-ui";
  import LogoLockup from "./LogoLockup.svelte";
  import { getAppMenuSections, type ActionId } from "$lib/actions/registry";
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
  const sections = getAppMenuSections(mode);

  // Actions that need a rack to act on. Only share and view-yaml are gated,
  // matching the existing FileMenu: save, load, and the exports stay available
  // for an empty-but-named layout. Full mode-aware enable/disable is #2187.
  const RACK_DEPENDENT: ReadonlySet<ActionId> = new Set<ActionId>([
    "share",
    "view-yaml",
  ]);

  function isDisabled(id: ActionId): boolean {
    return RACK_DEPENDENT.has(id) && !hasRacks;
  }

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
        <LogoLockup size={32} {partyMode} />
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
              disabled={isDisabled(item.id)}
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
  /* The logo doubles as the menu trigger. Keeps the visual treatment the logo
     had as a plain toolbar button (transparent, subtle hover and focus ring). */
  .app-menu-trigger {
    display: flex;
    align-items: center;
    padding: var(--space-1);
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    cursor: pointer;
    transition:
      background-color var(--duration-fast) var(--ease-out),
      transform var(--duration-fast) var(--ease-out);
  }

  .app-menu-trigger:hover {
    background: var(--colour-surface-hover);
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
    background: var(--colour-surface-hover);
  }

  @media (prefers-reduced-motion: reduce) {
    .app-menu-trigger {
      transition: none;
    }

    .app-menu-trigger:active {
      transform: none;
    }
  }
</style>
