<!--
  Shimmer Component
  Light sweep overlay for loading skeleton states
  Wraps content and shows shimmer effect when loading
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    loading?: boolean;
    children: Snippet;
  }

  let { loading = false, children }: Props = $props();
</script>

<div class="shimmer-container">
  {@render children()}
  {#if loading}
    <div class="shimmer-overlay" aria-hidden="true"></div>
  {/if}
</div>

<style>
  .shimmer-container {
    position: relative;
    overflow: hidden;
  }

  .shimmer-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(255, 255, 255, 0.08) 50%,
      transparent 100%
    );
    background-size: 200% 100%;
    animation: shimmer var(--anim-shimmer, 2s) infinite;
    pointer-events: none;
  }

  /* Reduced motion: no animation, static subtle overlay */
  @media (prefers-reduced-motion: reduce) {
    .shimmer-overlay {
      animation: none;
      background: rgba(255, 255, 255, 0.03);
    }
  }
</style>
