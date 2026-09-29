<!-- Stand-in for ImageCropDialog: Apply confirms the chosen file uncropped. -->
<script lang="ts">
  interface Props {
    file: File | null;
    onconfirm?: (cropped: File) => void;
  }

  let { file, onconfirm }: Props = $props();
</script>

{#if file}
  <button type="button" onclick={() => onconfirm?.(file)}>Apply</button>
{/if}
