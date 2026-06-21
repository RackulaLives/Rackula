<!--
  THROWAWAY PROTOTYPE for spike #2437. Not wired into the app.

  Demonstrates a clickable panel-edge collapse affordance with a hover-revealed
  grip, sized so the hover/click hit area is comfortable while the resting visual
  is just a 1px border. This is the HYBRID shape: the grip lives on the border AND
  the existing in-row chevron is retained (the chevron is shown here as a sibling
  for illustration; in the real components it already exists).

  Wiring in the real components:
  - Right panel: drop <PanelEdgeGrip side="left" oncollapse={handleCollapse} />
    inside aside.side-panel in SidePanel.svelte, on the canvas-facing (left) edge.
  - Left panel: drop <PanelEdgeGrip side="right" oncollapse={handleCollapseSidebar} />
    inside aside.sidebar-panel in App.svelte, on the canvas-facing (right) edge.
  Both call the existing set*Collapsed(true) handlers. No store change needed.
  Gate to non-mobile (touch has no hover) with the existing viewportStore.isMobile.
-->
<script lang="ts">
  interface Props {
    /** Which edge of the panel the grip sits on (the canvas-facing edge). */
    side: "left" | "right";
    /** Collapse the panel. Wires to the existing set*Collapsed(true) handlers. */
    oncollapse: () => void;
  }

  let { side, oncollapse }: Props = $props();
</script>

<!-- A full-height hit strip on the panel edge. At rest it reads as the existing
     1px border; on hover it widens its visible band and reveals a grip plus a
     col-resize-style cursor, the same way VS Code surfaces its sash. It is a real
     button so keyboard and screen-reader users get a labelled, focusable control
     in addition to the in-row chevron. -->
<button
  type="button"
  class="edge-grip edge-grip--{side}"
  aria-label={`Collapse ${side} panel`}
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
       At least 24px wide to meet WCAG 2.2 target-size guidance. */
    width: 24px;
    padding: 0;
    border: none;
    background: transparent;
    cursor: col-resize;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .edge-grip--left {
    left: -12px;
  }

  .edge-grip--right {
    right: -12px;
  }

  /* The resting hairline that reads as the panel border. */
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
    left: 12px;
  }

  .edge-grip--right::before {
    right: 12px;
  }

  /* Hover and focus reveal the grip and brighten the border line. */
  .edge-grip:hover::before,
  .edge-grip:focus-visible::before {
    background: var(--colour-selection);
    width: 2px;
  }

  /* The revealed grip dots: hidden until hover/focus. */
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
