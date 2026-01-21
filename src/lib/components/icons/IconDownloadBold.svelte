<!--
  Download icon (Phosphor Bold) - for Export action
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
  <path
    d="M71.51,88.49a12,12,0,0,1,17-17L116,99V24a12,12,0,0,1,24,0V99l27.51-27.52a12,12,0,0,1,17,17l-48,48a12,12,0,0,1-17,0ZM224,116H188a12,12,0,0,0,0,24h32v56H36V140H68a12,12,0,0,0,0-24H32a20,20,0,0,0-20,20v64a20,20,0,0,0,20,20H224a20,20,0,0,0,20-20V136A20,20,0,0,0,224,116Zm-20,52a16,16,0,1,0-16,16A16,16,0,0,0,204,168Z"
  />
</svg>
