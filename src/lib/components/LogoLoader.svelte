<!--
  LogoLoader Component
  Animated logo with slot reveal for loading states
  Used during async operations like export generation
-->
<script lang="ts">
  import {
    LOGO_OUTLINE,
    LOGO_SLOTS,
    LOGO_SLOT_RADIUS,
    LOGO_SQUARE_VIEWBOX,
  } from "$lib/components/logo-geometry";

  interface Props {
    size?: number;
    message?: string;
  }

  let { size = 48, message = "" }: Props = $props();
</script>

<div class="logo-loader" role="status" aria-live="polite">
  <!-- Logo mark with animated slots -->
  <svg
    class="logo-mark"
    viewBox={LOGO_SQUARE_VIEWBOX}
    width={size}
    height={size}
    aria-hidden="true"
    fill-rule="evenodd"
  >
    <!-- Outer frame (static) -->
    <path
      class="frame"
      d={LOGO_OUTLINE}
      fill="none"
      stroke="currentColor"
      stroke-width="3"
    />

    <!-- Animated slots with staggered fill -->
    {#each LOGO_SLOTS as slot, i (slot.y)}
      <rect
        class="slot slot-{i + 1}"
        x={slot.x}
        y={slot.y}
        width={slot.width}
        height={slot.height}
        rx={LOGO_SLOT_RADIUS}
      />
    {/each}
  </svg>

  {#if message}
    <span class="loader-message">{message}</span>
  {/if}
</div>

<style>
  .logo-loader {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
  }

  .logo-mark {
    color: var(--dracula-purple);
    filter: drop-shadow(0 0 8px rgba(189, 147, 249, 0.3));
  }

  .frame {
    stroke: var(--dracula-purple);
  }

  .slot {
    fill: var(--dracula-purple);
    transform-origin: left center;
    animation: slot-fill var(--anim-loading, 2s) ease-in-out infinite;
  }

  .slot-1 {
    animation-delay: 0s;
  }

  .slot-2 {
    animation-delay: 0.3s;
  }

  .slot-3 {
    animation-delay: 0.6s;
  }

  .loader-message {
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    color: var(--colour-text-muted);
    text-align: center;
  }

  /* Reduced motion: static slots */
  @media (prefers-reduced-motion: reduce) {
    .slot {
      animation: none;
      opacity: 0.6;
    }

    .slot-1 {
      opacity: 1;
    }

    .slot-2 {
      opacity: 0.8;
    }

    .slot-3 {
      opacity: 0.6;
    }
  }
</style>
