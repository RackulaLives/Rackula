<!--
  IconImageLabel Component (Phosphor Bold style)
  Combined icon for the "Both" display mode (image + text label).
  The framed photo reuses the IconImageBold path, compressed into the top of
  the canvas, sitting above two text-label bars. Matches the sibling
  IconImageBold / IconTextBold icons (viewBox 256, currentColor fill).
-->
<script lang="ts">
  interface Props {
    size?: number;
  }

  let { size = 20 }: Props = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 256 256"
  fill="currentColor"
  aria-hidden="true"
>
  <!-- Framed photo (IconImageBold path), compressed into the top region -->
  <g transform="translate(0,-7) scale(1,0.66)">
    <path
      d="M144,96a16,16,0,1,1,16,16A16,16,0,0,1,144,96Zm92-40V200a20,20,0,0,1-20,20H40a20,20,0,0,1-20-20V56A20,20,0,0,1,40,36H216A20,20,0,0,1,236,56ZM44,60v79.72l33.86-33.86a20,20,0,0,1,28.28,0L147.31,147l17.18-17.17a20,20,0,0,1,28.28,0L212,149.09V60Zm0,136H162.34L92,125.66l-48,48Zm168,0V183l-33.37-33.37L164.28,164l32,32Z"
    />
  </g>
  <!-- Text-label bars (bottom) -->
  <path
    d="M232,200a12,12,0,0,1-12,12H36a12,12,0,0,1,0-24H220A12,12,0,0,1,232,200Z"
  />
  <path
    d="M192,232a12,12,0,0,1-12,12H76a12,12,0,0,1,0-24H180A12,12,0,0,1,192,232Z"
  />
</svg>
