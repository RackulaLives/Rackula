<!--
  PanelEdgeGrip: a secondary collapse affordance on a side panel's canvas-facing
  edge (hybrid outcome of spike #2437). The chevron in the tab row stays the
  primary, always-visible control; this grip is an additive VS Code-style edge
  shortcut for mouse users.

  At rest the grip reads as the panel's existing 1px border. On hover or keyboard
  focus it widens the line, reveals a small grip handle, and shows a pointer
  cursor. Clicking it collapses the panel via the host's existing collapse
  handler. It collapses only; it does not drag-to-resize.

  Gate placement to non-mobile (touch has no hover) in the host with
  viewportStore.isMobile.
-->
<script lang="ts">
  interface Props {
    /** Which edge of the panel the grip sits on (the canvas-facing edge). */
    side: "left" | "right";
    /** Collapse the panel. Wires to the host's existing set*Collapsed(true) handler. */
    oncollapse: () => void;
  }

  let { side, oncollapse }: Props = $props();

  const label = $derived(
    side === "left" ? "Collapse right panel" : "Collapse left panel",
  );
</script>

<!-- A full-height hit strip on the panel edge. It is a real button so keyboard
     and screen-reader users get a labelled, focusable control alongside the
     in-row chevron. The label is side-aware: the grip on a panel's LEFT edge
     belongs to the right-hand panel, and vice versa. -->
<button
  type="button"
  class="edge-grip edge-grip--{side}"
  aria-label={label}
  onclick={oncollapse}
>
  <span class="edge-grip-handle" aria-hidden="true"></span>
</button>

<style>
  .edge-grip {
    position: absolute;
    top: 0;
    bottom: 0;
    /* Comfortable pointer hit area even though the resting visual is 1px.
       24px wide meets WCAG 2.2 SC 2.5.8 target-size guidance. The host panel
       reserves a matching gutter so the grip never obscures a control. */
    width: var(--panel-edge-grip-width);
    padding: 0;
    border: none;
    background: transparent;
    /* Pointer, not col-resize: this collapses, it does not drag-to-resize. */
    cursor: pointer;
    z-index: 1;
    display: flex;
    align-items: center;
  }

  /* The 24px hit strip sits flush against the canvas-facing edge, fully INSIDE
     the panel. The host asides use overflow: hidden, so a strip hanging past
     the edge would be clipped and lose half its hit area; keeping it inside
     preserves the full 24px target. The revealed handle hugs the same edge
     (flex alignment) so it reads as one element with the hairline. */
  .edge-grip--left {
    left: 0;
    justify-content: flex-start;
  }

  .edge-grip--right {
    right: 0;
    justify-content: flex-end;
  }

  /* The resting hairline that reads as the panel border, pinned to the
     canvas-facing edge so it overlaps the aside's own 1px border exactly. */
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
