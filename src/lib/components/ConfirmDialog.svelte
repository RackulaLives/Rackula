<!--
  ConfirmDialog Component
  Reusable confirmation dialog for destructive actions
-->
<script lang="ts">
	import Dialog from './Dialog.svelte';
	import { onMount } from 'svelte';

	interface Props {
		open: boolean;
		title: string;
		message: string;
		confirmLabel?: string;
		cancelLabel?: string;
		destructive?: boolean;
		onconfirm?: () => void;
		oncancel?: () => void;
	}

	let {
		open,
		title,
		message,
		confirmLabel = 'Delete',
		cancelLabel = 'Cancel',
		destructive = true,
		onconfirm,
		oncancel
	}: Props = $props();

	function handleConfirm() {
		onconfirm?.();
	}

	function handleCancel() {
		oncancel?.();
	}

	// Handle keyboard shortcuts
	function handleKeyDown(event: KeyboardEvent) {
		if (!open) return;

		if (event.key === 'Enter') {
			event.preventDefault();
			handleConfirm();
		}
	}

	onMount(() => {
		document.addEventListener('keydown', handleKeyDown);
		return () => {
			document.removeEventListener('keydown', handleKeyDown);
		};
	});
</script>

<Dialog {open} {title} onclose={handleCancel} width="380px">
	<div class="confirm-dialog">
		<p class="message">{message}</p>

		<div class="actions">
			<button type="button" class="btn btn-secondary" data-testid="btn-cancel-confirm" onclick={handleCancel}>
				{cancelLabel}
			</button>
			<button
				type="button"
				class="btn {destructive ? 'btn-destructive' : 'btn-primary'}"
				data-testid="btn-confirm-action"
				onclick={handleConfirm}
			>
				{confirmLabel}
			</button>
		</div>
	</div>
</Dialog>

<style>
	.confirm-dialog {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}

	.message {
		margin: 0;
		font-size: var(--font-size-base);
		line-height: 1.5;
		color: var(--colour-text);
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-3);
	}

	.btn {
		padding: var(--space-2) var(--space-5);
		border: none;
		border-radius: var(--radius-md);
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-medium);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.btn-secondary {
		background: var(--colour-button-bg);
		color: var(--colour-text);
	}

	.btn-secondary:hover {
		background: var(--colour-button-hover);
	}

	.btn-primary {
		background: var(--colour-selection);
		color: white;
	}

	.btn-primary:hover {
		background: var(--colour-selection-hover);
	}

	.btn-destructive {
		background: var(--colour-error);
		color: white;
	}

	.btn-destructive:hover {
		background: var(--colour-error-hover);
	}

	.btn:focus-visible {
		outline: 2px solid var(--colour-selection);
		outline-offset: 2px;
	}
</style>
