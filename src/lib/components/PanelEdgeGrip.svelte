<!--
  PanelEdgeGrip: a secondary collapse affordance that floats on a side panel's
  canvas-facing seam (hybrid outcome of spike #2437). The chevron in the tab row
  stays the primary, always-visible control; this grip is an additive VS Code-style
  edge shortcut for mouse users.

  The host mounts it on the seam between the panel and the canvas (see App.svelte
  .edge-grip-seam) entirely on the canvas side, so it never overlaps panel content
  or the device-list scrollbar (#2560). The grip fills that mount; its hairline and
  handle hug the panel-facing edge, landing on the panel border.

  At rest the grip reads as the panel's existing 1px border. On hover or keyboard
  focus it widens the line, reveals a small grip handle, and shows a pointer cursor.
  Clicking it collapses the panel via the host's existing collapse handler. It
  collapses only; it does not drag-to-resize.

  Gate placement to non-mobile (touch has no hover) and hide it while the panel is
  collapsed, both in the host.
-->
<script lang="ts">
  interface Props {
    /** The panel this grip collapses; also fixes which edge the line hugs. */
    panel: "left" | "right";
    /** Collapse the panel. Wires to the host's existing set*Collapsed(true) handler. */
    oncollapse: () => void;
  }

  let { panel, oncollapse }: Props = $props();

  const label = $derived(`Collapse ${panel} panel`);
</script>

<!-- A full-height hit strip on the panel's seam. It is a real button so keyboard
     and screen-reader users get a labelled, focusable control alongside the in-row
     chevron. -->
<button
  type="button"
  class="edge-grip edge-grip--{panel}"
  aria-label={label}
  onclick={oncollapse}
>
  <span class="edge-grip-handle" aria-hidden="true"></span>
</button>

<style>
  /* Fills the host's seam mount. The mount sits on the canvas side of the seam, so
     the whole hit strip is clear of panel content and the scrollbar. */
  .edge-grip {
    position: absolute;
    inset: 0;
    padding: 0;
    border: none;
    background: transparent;
    /* Pointer, not col-resize: this collapses, it does not drag-to-resize. */
    cursor: pointer;
    display: flex;
    align-items: center;
  }

  /* The handle and hairline hug the panel-facing edge of the strip, which the host
     pins to the seam, so the revealed handle sits right on the panel border. */
  .edge-grip--left {
    justify-content: flex-start;
  }

  .edge-grip--right {
    justify-content: flex-end;
  }

  /* The resting hairline that reads as the panel border, pinned to the seam. */
  .edge-grip::before {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--colour-border);
    transition: background-color var(--duration-fast) var(--ease-out);
  }

  .edge-grip--left::before {
    left: 0;
  }

  .edge-grip--right::before {
    right: 0;
  }

  /* Hover and keyboard focus reveal the grip and brighten the border line. */
  .edge-grip:hover::before,
  .edge-grip:focus-visible::before {
    background: var(--colour-selection);
    width: 2px;
  }

  /* The revealed grip handle: hidden until hover/focus. */
  .edge-grip-handle {
    width: 4px;
    height: 28px;
    border-radius: 2px;
    background: var(--colour-border-hover);
    opacity: 0;
    transition: opacity var(--duration-fast) var(--ease-out);
  }

  .edge-grip:hover .edge-grip-handle,
  .edge-grip:focus-visible .edge-grip-handle {
    opacity: 1;
  }

  .edge-grip:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: -2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .edge-grip::before,
    .edge-grip-handle {
      transition: none;
    }
  }
</style>
