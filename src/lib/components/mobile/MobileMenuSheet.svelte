<!--
  MobileMenuSheet Component

  Body of the mobile app-menu bottom sheet (#2597). It is the touch presentation
  of the same app menu the desktop dropdown shows behind the logo: it renders the
  shared registry projection (projectMobileMenuSections -> getAppMenuSections) so
  no menu item set, ordering, label, or icon is duplicated here. Adding or
  reordering a registry action updates this sheet with zero changes in this file.

  Unlike the desktop dropdown (which renders bare separators), this view renders
  the projection's section headings as visible titles, the pattern the headings
  added in #2596 were built for. Each item resolves its icon from iconForAction
  by action id; disabled items (from the projection's enabledWhen) render
  aria-disabled and do not dispatch. Keyboard shortcuts are omitted on mobile.

  The sheet chrome (scrim, focus trap, Escape, swipe-to-dismiss) is the shared
  Dialog wrapper in DialogOrchestrator; this component is the body only, matching
  MobileLayoutsSheet and MobileViewSheet.
-->
<script lang="ts">
  import {
    type ActionEnabledContext,
    type ActionId,
  } from "$lib/actions/registry";
  import { projectMobileMenuSections } from "./mobile-menu-projection";
  import { iconForAction } from "$lib/components/icons/action-icons";
  import { ICON_SIZE } from "$lib/constants/sizing";
  import { getStorageMode, type StorageMode } from "$lib/storage";

  interface Props {
    /** Runs the chosen app-menu action; bound to the shared dispatch spine. */
    onaction: (id: ActionId) => void;
    /** Whether any rack exists; gates share and view-yaml (via the projection). */
    hasRacks?: boolean;
    /** Dismiss the sheet after an action runs. */
    onclose?: () => void;
  }

  let { onaction, hasRacks = false, onclose }: Props = $props();

  const mode: StorageMode = getStorageMode();

  // Live context for the projection's enabledWhen predicates, mirroring the
  // desktop AppMenu: only the rack-gated items (share, view-yaml) read hasRacks;
  // the selection and history fields are reported as the neutral no-target state
  // because no app-menu item consults them.
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

  const sections = $derived(projectMobileMenuSections(mode, enableContext));

  function runAction(id: ActionId, disabled: boolean) {
    if (disabled) return;
    onaction(id);
    onclose?.();
  }
</script>

<div class="mobile-menu-sheet">
  {#each sections as section (section.group)}
    <section
      class="menu-section"
      aria-labelledby="menu-heading-{section.group}"
    >
      <h3 class="section-heading" id="menu-heading-{section.group}">
        {section.heading}
      </h3>
      <div class="menu-items">
        {#each section.items as item (item.id)}
          {@const Icon = iconForAction[item.id]}
          {@const disabled = item.disabled ?? false}
          <!-- aria-disabled, not the native disabled attribute: a natively
               disabled button is removed from the tab order and the a11y tree,
               so a screen-reader user could not reach it to learn why it is
               unavailable. Matching the desktop dropdown (bits-ui keeps disabled
               items focusable and aria-disabled), the row stays focusable and
               runAction no-ops the activation. -->
          <button
            type="button"
            class="menu-item"
            aria-disabled={disabled}
            data-testid="mobile-menu-{item.id}"
            onclick={() => runAction(item.id, disabled)}
          >
            <span class="menu-icon" aria-hidden="true">
              {#if Icon}
                <Icon size={ICON_SIZE.md} />
              {/if}
            </span>
            <span class="menu-label">{item.label}</span>
          </button>
        {/each}
      </div>
    </section>
  {/each}
</div>

<style>
  .mobile-menu-sheet {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-1) var(--space-1) var(--space-4);
  }

  .menu-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .section-heading {
    margin: 0 0 var(--space-1);
    padding: 0 var(--space-1);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    letter-spacing: var(--letter-spacing-wide);
    text-transform: uppercase;
    color: var(--colour-text-muted);
  }

  .menu-items {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    min-height: var(--touch-target-min);
    padding: var(--space-2) var(--space-3);
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--colour-text);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    text-align: left;
    cursor: pointer;
    transition:
      background-color var(--duration-fast) var(--ease-out),
      border-color var(--duration-fast) var(--ease-out);
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  .menu-item:hover:not([aria-disabled="true"]) {
    background: var(--colour-surface-hover);
  }

  .menu-item:active:not([aria-disabled="true"]) {
    scale: 0.99;
  }

  .menu-item:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: -2px;
  }

  .menu-item[aria-disabled="true"] {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .menu-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--colour-text-muted);
  }

  .menu-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (prefers-reduced-motion: reduce) {
    .menu-item {
      transition: none;
    }

    .menu-item:active:not([aria-disabled="true"]) {
      scale: 1;
    }
  }
</style>
