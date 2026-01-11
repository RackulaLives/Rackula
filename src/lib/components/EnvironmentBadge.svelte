<!--
  EnvironmentBadge Component
  Visual indicator for non-production environments (DEV, LOCAL)
  Features cylon-style text gradient animation, respects prefers-reduced-motion
-->
<script module>
  // Build-time environment constant from vite.config.ts
  declare const __BUILD_ENV__: string;
</script>

<script lang="ts">
  // Determine environment type
  const buildEnv = typeof __BUILD_ENV__ !== "undefined" ? __BUILD_ENV__ : "";

  // Check if running locally
  const isLocalhost =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1");

  // Determine badge text and visibility
  // LOCAL takes precedence over DEV
  const badgeText = $derived.by(() => {
    if (isLocalhost) return "LOCAL";
    if (buildEnv === "development") return "DEV";
    return null;
  });

  // Aria label for accessibility
  const ariaLabel = $derived.by(() => {
    if (isLocalhost) return "Local environment";
    if (buildEnv === "development") return "Development environment";
    return "";
  });
</script>

{#if badgeText}
  <span class="env-badge" role="status" aria-label={ariaLabel}>
    <span class="env-badge__text">{badgeText}</span>
  </span>
{/if}

<style>
  .env-badge {
    display: inline-flex;
    align-items: center;
    padding: var(--space-1) var(--space-2);
    background: var(--env-badge-bg);
    border-radius: var(--radius-sm);
    user-select: none;
  }

  /* Cylon-style animated text gradient */
  .env-badge__text {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-bold);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    /* Gradient text effect */
    background: linear-gradient(
      90deg,
      var(--env-badge-text) 0%,
      var(--env-badge-text) 35%,
      var(--env-badge-gradient-highlight) 50%,
      var(--env-badge-text) 65%,
      var(--env-badge-text) 100%
    );
    background-size: 200% 100%;
    background-clip: text;
    -webkit-background-clip: text;
    color: transparent;
    animation: cylon-text var(--anim-env-cylon) ease-in-out infinite;
  }

  @keyframes cylon-text {
    0%,
    100% {
      background-position: 200% center;
    }
    50% {
      background-position: 0% center;
    }
  }

  /* Respect reduced motion preference - static text */
  @media (prefers-reduced-motion: reduce) {
    .env-badge__text {
      background: none;
      color: var(--env-badge-text);
      animation: none;
    }
  }
</style>
