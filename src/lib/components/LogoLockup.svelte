<!--
  LogoLockup Component
  Logo + title lockup for toolbar branding
  Logo mark: Dracula purple by default, rainbow gradient on hover
  Brand text: White by default, rainbow gradient on hover
  Celebrate on success, Showcase mode: slow rainbow wave for About/Help

  v4: DRackula prefix for dev/local environments (blood-red D)
  v5: Purple logo mark with white brand text (restoring Dracula theming)
-->
<script lang="ts">
  import SantaHat from "./SantaHat.svelte";
  import { isChristmas } from "$lib/utils/christmas";

  interface Props {
    size?: number;
    celebrate?: boolean;
    partyMode?: boolean;
    showcase?: boolean;
    alwaysShowTitle?: boolean;
  }

  let {
    size = 36,
    celebrate = false,
    partyMode = false,
    showcase = false,
    alwaysShowTitle = false,
  }: Props = $props();

  // Christmas easter egg - only show on December 25
  const showChristmasHat = isChristmas();

  // Environment detection for DRackula prefix
  // Check hostname for local dev or deployed dev environment (d.racku.la)
  const hostname =
    typeof window !== "undefined" ? window.location.hostname : "";
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
  const isDevSite = hostname === "d.racku.la";

  // Show "D" prefix on dev/local environments (not on production count.racku.la)
  const showEnvPrefix = $derived(isLocalhost || isDevSite);

  // Hover state for rainbow animation
  let hovering = $state(false);

  // Calculate proportional title height (logo should be slightly taller)
  const titleHeight = $derived(size * 1.2);

  type ActiveGradientKind = "rainbow" | "celebrate" | "party" | "showcase";
  type GradientIds = Record<ActiveGradientKind, string>;

  function createGradientIds(prefix: string): GradientIds {
    return {
      rainbow: `${prefix}-rainbow`,
      celebrate: `${prefix}-celebrate`,
      party: `${prefix}-party`,
      showcase: `${prefix}-showcase`,
    };
  }

  // Unique IDs per LogoLockup instance avoid collisions across Toolbar/StartScreen/Help.
  const gradientIdSuffix = Math.random().toString(36).slice(2, 9);
  const markGradientIds = createGradientIds(`lockup-mark-${gradientIdSuffix}`);
  const titleGradientIds = createGradientIds(
    `lockup-title-${gradientIdSuffix}`,
  );

  // Determine active gradient based on state (priority order).
  const activeGradient = $derived<ActiveGradientKind | null>(
    partyMode
      ? "party"
      : celebrate
        ? "celebrate"
        : showcase
          ? "showcase"
          : hovering
            ? "rainbow"
            : null,
  );

  const markGradientUrl = $derived(
    activeGradient ? `url(#${markGradientIds[activeGradient]})` : undefined,
  );
  const titleGradientUrl = $derived(
    activeGradient ? `url(#${titleGradientIds[activeGradient]})` : undefined,
  );
</script>

{#snippet activeGradientDef(kind: ActiveGradientKind, id: string)}
  <defs>
    {#if kind === "rainbow"}
      <!-- Animated rainbow gradient for hover (Dracula colors, 6s cycle) -->
      <linearGradient {id} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%">
          <animate
            attributeName="stop-color"
            values="#BD93F9;#FF79C6;#8BE9FD;#50FA7B;#BD93F9"
            dur="6s"
            repeatCount="indefinite"
          />
        </stop>
        <stop offset="50%">
          <animate
            attributeName="stop-color"
            values="#FF79C6;#8BE9FD;#50FA7B;#BD93F9;#FF79C6"
            dur="6s"
            repeatCount="indefinite"
          />
        </stop>
        <stop offset="100%">
          <animate
            attributeName="stop-color"
            values="#8BE9FD;#50FA7B;#BD93F9;#FF79C6;#8BE9FD"
            dur="6s"
            repeatCount="indefinite"
          />
        </stop>
      </linearGradient>
    {:else if kind === "celebrate"}
      <!-- Celebrate gradient (3s one-shot rainbow wave) -->
      <linearGradient {id} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%">
          <animate
            attributeName="stop-color"
            values="#BD93F9;#FF79C6;#8BE9FD;#50FA7B;#BD93F9"
            dur="3s"
            repeatCount="1"
            fill="freeze"
          />
        </stop>
        <stop offset="50%">
          <animate
            attributeName="stop-color"
            values="#FF79C6;#8BE9FD;#50FA7B;#BD93F9;#FF79C6"
            dur="3s"
            repeatCount="1"
            fill="freeze"
          />
        </stop>
        <stop offset="100%">
          <animate
            attributeName="stop-color"
            values="#8BE9FD;#50FA7B;#BD93F9;#FF79C6;#8BE9FD"
            dur="3s"
            repeatCount="1"
            fill="freeze"
          />
        </stop>
      </linearGradient>
    {:else if kind === "party"}
      <!-- Party mode gradient (fast 0.5s rainbow cycle) -->
      <linearGradient {id} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%">
          <animate
            attributeName="stop-color"
            values="#BD93F9;#FF79C6;#8BE9FD;#50FA7B;#FFB86C;#FF5555;#F1FA8C;#BD93F9"
            dur="0.5s"
            repeatCount="indefinite"
          />
        </stop>
        <stop offset="50%">
          <animate
            attributeName="stop-color"
            values="#8BE9FD;#50FA7B;#FFB86C;#FF5555;#F1FA8C;#BD93F9;#FF79C6;#8BE9FD"
            dur="0.5s"
            repeatCount="indefinite"
          />
        </stop>
        <stop offset="100%">
          <animate
            attributeName="stop-color"
            values="#50FA7B;#FFB86C;#FF5555;#F1FA8C;#BD93F9;#FF79C6;#8BE9FD;#50FA7B"
            dur="0.5s"
            repeatCount="indefinite"
          />
        </stop>
      </linearGradient>
    {:else}
      <!-- Showcase gradient: static fallback to avoid Firefox image decode errors on initial load -->
      <linearGradient {id} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#BD93F9" />
        <stop offset="50%" stop-color="#8BE9FD" />
        <stop offset="100%" stop-color="#50FA7B" />
      </linearGradient>
    {/if}
  </defs>
{/snippet}

<div
  class="logo-lockup"
  onmouseenter={() => (hovering = true)}
  onmouseleave={() => (hovering = false)}
  role="presentation"
>
  <!-- Logo mark with widow's peak + optional Christmas hat -->
  <div class="logo-mark-container">
    <svg
      class="logo-mark"
      class:logo-mark--celebrate={celebrate}
      class:logo-mark--party={partyMode}
      class:logo-mark--showcase={showcase}
      class:logo-mark--hover={hovering && !partyMode && !celebrate && !showcase}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      aria-hidden="true"
      fill-rule="evenodd"
    >
      {#if activeGradient}
        {@render activeGradientDef(
          activeGradient,
          markGradientIds[activeGradient],
        )}
      {/if}
      <!-- Widow's peak frame with device slots as negative space -->
      <path
        d="M6 4 L13 4 L16 7 L19 4 L26 4 L26 28 L6 28 Z M10 9 h12 v4 h-12 z M10 15 h12 v4 h-12 z M10 21 h12 v4 h-12 z"
        fill={markGradientUrl}
      />
    </svg>
    {#if showChristmasHat}
      <div class="logo-hat">
        <SantaHat size={size * 0.45} />
      </div>
    {/if}
  </div>

  <!-- Title (SVG text for gradient support) - Space Grotesk -->
  <!-- DRackula: adds red "D" prefix on dev/local environments -->
  <svg
    class="logo-title"
    class:logo-title--celebrate={celebrate}
    class:logo-title--party={partyMode}
    class:logo-title--showcase={showcase}
    class:logo-title--hover={hovering && !partyMode && !celebrate && !showcase}
    class:logo-title--always-visible={alwaysShowTitle}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 {showEnvPrefix ? 180 : 160} 50"
    height={titleHeight}
    role="img"
    aria-label={showEnvPrefix
      ? "DRackula - development environment"
      : "Rackula"}
  >
    {#if activeGradient}
      {@render activeGradientDef(
        activeGradient,
        titleGradientIds[activeGradient],
      )}
    {/if}
    <text x="0" y="38" fill={titleGradientUrl}
      >{#if showEnvPrefix}<tspan class="env-prefix" font-size="44">D</tspan
        >{/if}<tspan>Rackula</tspan></text
    >
  </svg>
</div>

<style>
  .logo-lockup {
    display: flex;
    align-items: flex-end;
    gap: var(--space-2);
  }

  .logo-mark-container {
    position: relative;
    flex-shrink: 0;
  }

  .logo-hat {
    position: absolute;
    top: -9px;
    right: 0px;
    z-index: 1;
  }

  .logo-mark {
    /* Dracula purple by default, gradient on hover/special states */
    fill: var(--dracula-purple, #bd93f9);
    transition: fill 0.3s ease;
    flex-shrink: 0;
    filter: drop-shadow(0 0 6px rgba(189, 147, 249, 0.2));
    /* Align mark baseline with text baseline */
    margin-bottom: -2px;
  }

  .logo-title text {
    /* White by default, gradient on hover/special states */
    fill: var(--dracula-foreground, #f8f8f2);
    transition: fill 0.3s ease;
  }

  .logo-title {
    width: auto;
    filter: drop-shadow(0 0 6px rgba(248, 248, 242, 0.15));
  }

  .logo-title text {
    /* Space Grotesk for wordmark */
    font-family: "Space Grotesk", var(--font-family, system-ui, sans-serif);
    font-size: 38px;
    font-weight: 500;
  }

  /* DRackula: blood-red "D" prefix for dev/local environments */
  /* Always red - never changes with gradient animations */
  .logo-title text .env-prefix,
  .logo-title--hover text .env-prefix,
  .logo-title--celebrate text .env-prefix,
  .logo-title--party text .env-prefix,
  .logo-title--showcase text .env-prefix {
    fill: var(--dracula-red, #ff5555) !important;
  }

  /* Celebrate state: rainbow wave for 3s */
  .logo-mark--celebrate,
  .logo-title--celebrate {
    filter: drop-shadow(0 0 20px rgba(189, 147, 249, 0.4));
  }

  /* Party mode: fast rainbow + wobble */
  .logo-mark--party,
  .logo-title--party {
    filter: drop-shadow(0 0 24px rgba(189, 147, 249, 0.5));
    animation: wobble var(--anim-party, 0.5s) ease-in-out infinite;
  }

  /* Showcase mode: slow rainbow wave for About/Help */
  .logo-mark--showcase,
  .logo-title--showcase {
    filter: drop-shadow(0 0 16px rgba(189, 147, 249, 0.4));
  }

  /* Hover state: 6s rainbow cycle */
  .logo-mark--hover,
  .logo-title--hover {
    filter: drop-shadow(0 0 12px rgba(189, 147, 249, 0.4));
  }

  /* Respect reduced motion preference */
  @media (prefers-reduced-motion: reduce) {
    .logo-mark {
      /* Purple by default (matches normal state) */
      fill: var(--dracula-purple, #bd93f9);
      filter: drop-shadow(0 0 6px rgba(189, 147, 249, 0.2));
    }

    .logo-title text {
      /* White by default, static purple on hover/special states */
      fill: var(--dracula-foreground, #f8f8f2);
    }

    .logo-title {
      filter: drop-shadow(0 0 6px rgba(248, 248, 242, 0.15));
    }

    /* Static purple for hover state (no animation) - logo stays purple, text goes purple */
    .logo-mark--hover path {
      fill: var(--dracula-purple) !important;
      filter: drop-shadow(0 0 8px rgba(189, 147, 249, 0.3));
    }

    .logo-title--hover text {
      fill: var(--dracula-purple) !important;
    }

    .logo-title--hover {
      filter: drop-shadow(0 0 8px rgba(189, 147, 249, 0.2));
    }

    /* Static purple for special states (no animation) */
    .logo-mark--celebrate path,
    .logo-mark--party path,
    .logo-mark--showcase path,
    .logo-title--celebrate text,
    .logo-title--party text,
    .logo-title--showcase text {
      fill: var(--dracula-purple) !important;
    }

    .logo-mark--party,
    .logo-title--party {
      animation: none;
    }

    /* DRackula prefix stays red in reduced motion */
    .logo-title text .env-prefix {
      fill: var(--dracula-red, #ff5555) !important;
    }
  }

  /* Responsive: hide title on small screens (but not in toolbar hamburger mode) */
  @media (max-width: 600px) {
    .logo-title {
      display: none;
    }

    /* alwaysShowTitle prop overrides responsive hide */
    .logo-title--always-visible {
      display: block !important;
    }
  }

  /* Always show Rackula text in toolbar hamburger button (mobile) */
  :global(.toolbar-brand) .logo-title,
  :global(.toolbar-brand.hamburger-mode) .logo-title {
    display: block !important;
  }

  /* Wobble keyframe for party mode */
  @keyframes wobble {
    0%,
    100% {
      transform: rotate(0deg);
    }
    25% {
      transform: rotate(-3deg);
    }
    75% {
      transform: rotate(3deg);
    }
  }
</style>
