<!--
  Toast container component
  Displays all active toasts in a stack
-->
<script lang="ts">
	import { getToastStore } from '$lib/stores/toast.svelte';
	import Toast from './Toast.svelte';

	const toastStore = getToastStore();
</script>

<div class="toast-container" aria-live="polite" aria-atomic="false">
	{#each toastStore.toasts as toast (toast.id)}
		<Toast {toast} />
	{/each}
</div>

<style>
	/* Anchored top-right, beneath the top bar / storage chip. The stack grows
	   downward: newest sits just under the chip and older toasts push down
	   (column-reverse keeps the latest closest to its source, #2405). The right
	   offset matches the storage chip's right edge (the toolbar right lane's
	   --space-2 padding) so cause and effect line up vertically. */
	.toast-container {
		position: fixed;
		top: calc(
			var(--toolbar-height) + var(--space-3) + env(safe-area-inset-top, 0px)
		);
		right: calc(var(--space-2) + env(safe-area-inset-right, 0px));
		z-index: var(--z-toast);
		display: flex;
		flex-direction: column-reverse;
		gap: 0.75rem;
		pointer-events: none;
	}

	.toast-container :global(.toast) {
		pointer-events: auto;
	}

	/* Responsive positioning: span the width beneath the top bar on small
	   screens so messages stay readable, still stacking downward from the top. */
	@media (max-width: 480px) {
		.toast-container {
			left: calc(var(--space-4) + env(safe-area-inset-left, 0px));
			right: calc(var(--space-4) + env(safe-area-inset-right, 0px));
			top: calc(
				var(--toolbar-height) + var(--space-2) + env(safe-area-inset-top, 0px)
			);
		}

		.toast-container :global(.toast) {
			min-width: 0;
			max-width: none;
		}
	}
</style>
