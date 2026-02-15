<!--
  File download icon (Phosphor Bold) — document with down-arrow
  Used for "Save As" / archive download actions
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
    d="M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Zm-42.34-50.34a8,8,0,0,1,0,11.31l-24,24a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L120,176.69V120a8,8,0,0,1,16,0v56.69l10.34-10.35A8,8,0,0,1,157.66,165.66Z"
  />
</svg>
