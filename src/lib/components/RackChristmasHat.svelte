<!--
  RackChristmasHat SVG Component
  Renders a Santa hat easter egg on the rack during the Christmas season.

  This is a pure rendering component — no interaction logic.
  Must be rendered late in SVG order (appears on top of rack name).
-->
<script lang="ts">
  interface Props {
    /** Top padding for rack name area (used for vertical positioning) */
    rackPadding: number;
  }

  let { rackPadding }: Props = $props();
</script>

<g
  transform="translate({-24}, {rackPadding -
    85}) rotate(-18, 45, 75) scale(1.35)"
>
  <!-- Shadow -->
  <ellipse cx="40" cy="68" rx="26" ry="5" fill="rgba(0,0,0,0.12)" />
  <!-- Hat body - tapered cone -->
  <path d="M14 65 L36 15 L44 15 L66 65 Z" fill="#E63946" />
  <path d="M18 65 L37 18 L43 18 L62 65 Z" fill="#FF5555" />
  <!-- White fur trim -->
  <rect x="8" y="60" width="64" height="14" rx="7" fill="#F1F1F1" />
  <rect x="10" y="62" width="60" height="10" rx="5" fill="#FFFFFF" />
  <!-- Pom-pom - connected to tip -->
  <circle cx="40" cy="15" r="10" fill="#F1F1F1" />
  <circle cx="40" cy="15" r="8" fill="#FFFFFF" />
</g>
