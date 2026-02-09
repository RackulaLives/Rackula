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
	.toast-container {
		position: fixed;
		bottom: calc(
			1.5rem + var(--safe-area-bottom, 0px) + var(--keyboard-height, 0px)
		);
		right: 1.5rem;
		z-index: 9999;
		display: flex;
		flex-direction: column-reverse;
		gap: 0.75rem;
		pointer-events: none;
	}

	.toast-container :global(.toast) {
		pointer-events: auto;
	}

	/* Responsive positioning */
	@media (max-width: 480px) {
		.toast-container {
			left: 1rem;
			right: 1rem;
			bottom: calc(
				1rem + var(--safe-area-bottom, 0px) + var(--keyboard-height, 0px)
			);
		}

		.toast-container :global(.toast) {
			min-width: 0;
			max-width: none;
		}
	}
</style>
