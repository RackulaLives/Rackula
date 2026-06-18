<!--
  CollapsedPanelStrip Component

  The collapsed state for either side panel: a 44px-wide clickable vertical
  strip on the panel's outer edge (issue #2397). It contains, top to bottom,
  the reopen chevron and the active tab name as a rotated vertical label. The
  whole strip is the hit target and reopens the panel to its last-active tab.

  Mirrored via the `side` prop so a single component serves both panels:
  - Left panel collapses leftward; its strip reopens with `»` (chevron right).
  - Right panel collapses rightward; its strip reopens with `«` (chevron left).
-->
<script lang="ts">
  import { IconChevronLeft, IconChevronRight } from "./icons";
  import { ICON_SIZE } from "$lib/constants/sizing";

  interface Props {
    /** Which edge this strip sits on. Drives the reopen chevron direction. */
    side: "left" | "right";
    /** The active tab name, shown as a rotated vertical label. */
    label: string;
    /** Reopen the panel to its last-active tab. */
    onexpand: () => void;
  }

  let { side, label, onexpand }: Props = $props();
</script>

<button
  type="button"
  class="collapsed-strip collapsed-strip--{side}"
  aria-label="Expand {label} panel"
  aria-expanded="false"
  onclick={onexpand}
  data-testid="panel-collapsed-strip-{side}"
>
  <span class="collapsed-strip-chevron" aria-hidden="true">
    {#if side === "left"}
      <IconChevronRight size={ICON_SIZE.md} />
    {:else}
      <IconChevronLeft size={ICON_SIZE.md} />
    {/if}
  </span>
  <span class="collapsed-strip-label" aria-hidden="true">{label}</span>
</button>

<style>
  /* A full-height, 44px-wide column. The whole button is the hit target. */
  .collapsed-strip {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    width: var(--panel-collapsed-strip-width, 44px);
    height: 100%;
    flex-shrink: 0;
    padding: var(--space-2) 0;
    border: none;
    background: var(--colour-sidebar-bg);
    color: var(--colour-text-muted);
    cursor: pointer;
    transition:
      background-color var(--duration-fast) var(--ease-out),
      color var(--duration-fast) var(--ease-out);
  }

  .collapsed-strip--left {
    border-right: 1px solid var(--colour-border);
  }

  .collapsed-strip--right {
    border-left: 1px solid var(--colour-border);
  }

  .collapsed-strip:hover {
    background: var(--colour-surface-hover);
    color: var(--colour-text);
  }

  .collapsed-strip:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: -2px;
  }

  /* The chevron sits in the top 44px, matching the tab-row height it expands to. */
  .collapsed-strip-chevron {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: var(--panel-collapsed-strip-width, 44px);
    flex-shrink: 0;
  }

  /* Active tab name, rotated to read bottom-to-top up the strip. */
  .collapsed-strip-label {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    letter-spacing: 0.02em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-height: 100%;
  }

  @media (prefers-reduced-motion: reduce) {
    .collapsed-strip {
      transition: none;
    }
  }
</style>
