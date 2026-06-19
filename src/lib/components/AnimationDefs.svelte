<!--
  AnimationDefs Component
  Hidden SVG containing animated gradient definitions for global use

  Gradient IDs:
  - #rainbow-wave: Full Dracula palette cycling (6s) - for success celebrations
  - #party-grad: Fast celebration gradient (0.5s) - for party mode
  - #loading-grad: Purple breathe effect (2s) - for loading states
-->
<script lang="ts">
  // No props needed - this component just provides global SVG defs
</script>

<!-- Hidden SVG for global gradient definitions -->
<svg
  width="0"
  height="0"
  style="position: absolute; pointer-events: none;"
  aria-hidden="true"
  role="presentation"
>
  <defs>
    <!-- Rainbow Wave Gradient (6s cycle) - Success celebrations -->
    <linearGradient id="rainbow-wave" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%">
        <animate
          attributeName="stop-color"
          values="#BD93F9;#FF79C6;#8BE9FD;#50FA7B;#FFB86C;#FF5555;#F1FA8C;#BD93F9"
          dur="6s"
          repeatCount="indefinite"
        />
      </stop>
      <stop offset="50%">
        <animate
          attributeName="stop-color"
          values="#FF79C6;#8BE9FD;#50FA7B;#FFB86C;#FF5555;#F1FA8C;#BD93F9;#FF79C6"
          dur="6s"
          repeatCount="indefinite"
        />
      </stop>
      <stop offset="100%">
        <animate
          attributeName="stop-color"
          values="#8BE9FD;#50FA7B;#FFB86C;#FF5555;#F1FA8C;#BD93F9;#FF79C6;#8BE9FD"
          dur="6s"
          repeatCount="indefinite"
        />
      </stop>
    </linearGradient>

    <!-- Party Mode Gradient (0.5s cycle) - Fast celebration -->
    <linearGradient id="party-grad" x1="0%" y1="0%" x2="100%" y2="100%">
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
          values="#FF79C6;#8BE9FD;#50FA7B;#FFB86C;#FF5555;#F1FA8C;#BD93F9;#FF79C6"
          dur="0.5s"
          repeatCount="indefinite"
        />
      </stop>
      <stop offset="100%">
        <animate
          attributeName="stop-color"
          values="#8BE9FD;#50FA7B;#FFB86C;#FF5555;#F1FA8C;#BD93F9;#FF79C6;#8BE9FD"
          dur="0.5s"
          repeatCount="indefinite"
        />
      </stop>
    </linearGradient>

    <!-- Loading Gradient (2s cycle) - Purple breathe effect -->
    <linearGradient id="loading-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%">
        <animate
          attributeName="stop-color"
          values="#BD93F9;#44475A;#BD93F9"
          dur="2s"
          repeatCount="indefinite"
        />
      </stop>
      <stop offset="100%">
        <animate
          attributeName="stop-color"
          values="#44475A;#BD93F9;#44475A"
          dur="2s"
          repeatCount="indefinite"
        />
      </stop>
    </linearGradient>

    <!-- Celebrate Gradient (3s one-shot) - For logo celebration -->
    <linearGradient id="celebrate-grad" x1="0%" y1="0%" x2="100%" y2="100%">
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
  </defs>
</svg>
