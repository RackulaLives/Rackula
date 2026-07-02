<!--
  NewLayoutMenu Component (#2829)

  The dropdown half of the split "+" control, shared by the tab-bar "+"
  (LayoutTabs) and the Layouts-panel "+" (LayoutsLibrary). It renders a focusable
  chevron trigger plus the menu content: a "Blank layout" row and, when starters
  have loaded, a "From template" section listing each starter with a colour dot,
  name, and rack/device meta.

  Split-control wiring:
  - The host keeps its own primary "+" button (plain click unchanged, #2829 R1).
  - This chevron opens the menu on click.
  - The host binds `open` and sets it true from a right-click (oncontextmenu) on
    its primary "+", so chevron and right-click open the same menu.

  Starters lazy-load on first open through the shared starter-templates source,
  so the fetch never runs until a menu is opened and repeat opens reuse the cache.
  On load failure the source stays empty and only "Blank layout" renders.

  Accessibility: bits-ui DropdownMenu provides roving focus, arrow/Home/End
  navigation, and Escape-to-close. The chevron is a real focusable button.
-->
<script lang="ts">
  import { DropdownMenu } from "bits-ui";
  import { IconChevronDown } from "./icons";
  import { ICON_SIZE } from "$lib/constants/sizing";
  import {
    ensureStartersLoaded,
    getStarterTemplates,
    openStarter,
  } from "$lib/stores/starter-templates.svelte";
  import { starterRackSummary } from "$lib/templates/starter-templates";
  import "$lib/styles/menu.css";

  interface Props {
    /**
     * Create a blank layout. Wired to the host's existing primary "+" handler so
     * the "Blank layout" row does exactly what a plain "+" click does (#2829 R1).
     */
    onblank: () => void;
    /** Bindable open state, so the host's "+" right-click can open this menu. */
    open?: boolean;
    /** Visual variant matching the host's "+": the toolbar tab strip or the panel header. */
    variant?: "toolbar" | "panel";
    /** Test id for the chevron trigger. */
    chevronTestId?: string;
  }

  let {
    onblank,
    open = $bindable(false),
    variant = "toolbar",
    chevronTestId,
  }: Props = $props();

  const starters = $derived(getStarterTemplates());

  // Lazy-load starters the first time any menu opens; the shared source caches
  // the result across every "+" control and the palette.
  function handleOpenChange(next: boolean): void {
    if (next) void ensureStartersLoaded();
  }
</script>

<DropdownMenu.Root bind:open onOpenChange={handleOpenChange}>
  <DropdownMenu.Trigger>
    {#snippet child({ props })}
      <button
        {...props}
        type="button"
        class="new-layout-chevron new-layout-chevron--{variant}"
        aria-label="New layout options"
        data-testid={chevronTestId}
      >
        <IconChevronDown size={ICON_SIZE.sm} />
      </button>
    {/snippet}
  </DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content
      class="menu-content menu-inline"
      sideOffset={4}
      align="end"
    >
      <DropdownMenu.Item
        class="menu-item"
        data-testid="new-layout-item-blank"
        onSelect={onblank}
      >
        <span class="menu-label">Blank layout</span>
      </DropdownMenu.Item>

      {#if starters.length > 0}
        <DropdownMenu.Group>
          <DropdownMenu.GroupHeading class="menu-label-header">
            From template
          </DropdownMenu.GroupHeading>
          {#each starters as template (template.id)}
            <DropdownMenu.Item
              class="menu-item"
              data-testid="new-layout-item-{template.id}"
              onSelect={() => openStarter(template)}
            >
              <span
                class="starter-dot"
                style:background={template.colour}
                aria-hidden="true"
              ></span>
              <span class="menu-label starter-text">
                <span class="starter-name">{template.layout.name}</span>
                <span class="starter-meta">{starterRackSummary(template)}</span>
              </span>
            </DropdownMenu.Item>
          {/each}
        </DropdownMenu.Group>
      {/if}
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>

<style>
  .new-layout-chevron {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    color: var(--colour-text-muted);
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-out),
      color var(--duration-fast) var(--ease-out),
      border-color var(--duration-fast) var(--ease-out);
  }

  .new-layout-chevron:hover,
  .new-layout-chevron[data-state="open"] {
    background: var(--colour-surface-hover);
    color: var(--colour-text);
  }

  .new-layout-chevron:focus-visible {
    outline: none;
    color: var(--colour-text);
    box-shadow:
      0 0 0 2px var(--colour-bg),
      0 0 0 4px var(--colour-focus-ring);
  }

  /* Toolbar tab strip: raw px to pixel-align with the sibling .layout-tab-add
     control in LayoutTabs (itself 44px tall); no 44px design token exists. */
  .new-layout-chevron--toolbar {
    width: 28px;
    height: 44px;
  }

  /* Panel header: matches the small square, bordered "+" button. */
  .new-layout-chevron--panel {
    width: var(--space-6);
    height: var(--space-8);
    background: var(--colour-surface-secondary);
    border-color: var(--colour-border);
  }

  .new-layout-chevron--panel:hover,
  .new-layout-chevron--panel[data-state="open"] {
    border-color: var(--colour-border-hover);
  }

  /* Starter row: colour dot, then a two-line name/meta stack. */
  .starter-dot {
    flex: 0 0 auto;
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .starter-text {
    display: flex;
    flex-direction: column;
    gap: var(--space-0-5);
    min-width: 0;
  }

  .starter-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .starter-meta {
    font-size: var(--font-size-xs);
    color: var(--colour-text-muted-inverse);
  }

  @media (prefers-reduced-motion: reduce) {
    .new-layout-chevron {
      transition: none;
    }
  }
</style>
