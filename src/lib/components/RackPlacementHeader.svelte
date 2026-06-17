<!--
  RackPlacementHeader SVG Component
  Renders the tap/click-to-place header overlay inside the rack SVG.
  Shows the pending device name and a cancel button.

  This is a pure rendering component with a single cancel callback.
  Must be rendered late in SVG order (appears on top of rack content).

  NOTE: This foreignObject is safe for Safari compatibility.
  Unlike RackDevice's label overlay, this element is NOT inside a transformed
  <g> element - it's a direct child of the root <svg> with explicit x/y coords.
  Safari's foreignObject transform inheritance bug (WebKit #230304) only affects
  foreignObjects inside transformed <g> elements. See #420 for audit details.
-->
<script lang="ts">
  interface Props {
    /** Total rack width in pixels */
    rackWidth: number;
    /** Top padding for rack name area */
    rackPadding: number;
    /** Name of the device being placed */
    deviceModel: string;
    /** Input verb for the prompt ("Tap" on touch, "Click" on desktop) */
    actionVerb?: string;
    /** Callback when user cancels placement */
    oncancel?: () => void;
  }

  let {
    rackWidth,
    rackPadding,
    deviceModel,
    actionVerb = "Tap",
    oncancel,
  }: Props = $props();
</script>

<foreignObject
  x="0"
  y={rackPadding}
  width={rackWidth}
  height="24"
  class="placement-header-container"
>
  <div
    class="placement-header"
    role="status"
    aria-live="polite"
    xmlns="http://www.w3.org/1999/xhtml"
  >
    <span class="placement-text">
      {actionVerb} to place: <strong>{deviceModel}</strong>
    </span>
    <button
      type="button"
      class="placement-cancel"
      onclick={oncancel}
      aria-label="Cancel placement"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  </div>
</foreignObject>

<style>
  /* Placement header - foreignObject container */
  .placement-header-container {
    overflow: visible;
  }

  /* Placement header bar */
  .placement-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    height: 24px;
    padding: 0 6px;
    background: rgba(40, 42, 54, 0.95);
    border-bottom: 1px solid var(--dracula-pink, #ff79c6);
    font-family: var(--font-family, system-ui, sans-serif);
    font-size: 11px;
    color: var(--dracula-foreground, #f8f8f2);
    box-sizing: border-box;
  }

  .placement-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .placement-text strong {
    color: var(--dracula-pink, #ff79c6);
    font-weight: 600;
  }

  .placement-cancel {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--dracula-foreground, #f8f8f2);
    cursor: pointer;
    transition: background-color 150ms;
    /* Expand touch target */
    position: relative;
  }

  .placement-cancel::before {
    content: "";
    position: absolute;
    inset: -14px -10px;
  }

  .placement-cancel:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .placement-cancel:active {
    background: rgba(255, 255, 255, 0.2);
  }
</style>
