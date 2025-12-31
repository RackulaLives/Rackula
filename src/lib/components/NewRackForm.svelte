<!--
  NewRackForm Component
  Form dialog for creating a new rack
-->
<script lang="ts">
	import Dialog from './Dialog.svelte';
	import {
		COMMON_RACK_HEIGHTS,
		MIN_RACK_HEIGHT,
		MAX_RACK_HEIGHT,
		STANDARD_RACK_WIDTH,
		ALLOWED_RACK_WIDTHS
	} from '$lib/types/constants';

	// Height options for 10" racks (smaller form factor)
	const SMALL_RACK_HEIGHTS = [4, 6, 8, 12];

	interface Props {
		open: boolean;
		rackCount?: number;
		oncreate?: (data: { name: string; height: number; width: number }) => void;
		oncancel?: () => void;
	}

	let { open, rackCount: _rackCount = 0, oncreate, oncancel }: Props = $props();

	// Form state
	let name = $state('');
	let selectedHeight = $state(42);
	let isCustomHeight = $state(false);
	let customHeight = $state(42);
	let selectedWidth = $state(STANDARD_RACK_WIDTH);

	// Validation errors
	let nameError = $state('');
	let heightError = $state('');

	// Available heights based on rack width
	const availableHeights = $derived(
		selectedWidth === 10 ? SMALL_RACK_HEIGHTS : COMMON_RACK_HEIGHTS
	);

	// Reset height when width changes if current selection isn't available
	$effect(() => {
		if (!isCustomHeight && !availableHeights.includes(selectedHeight)) {
			// Select the largest available height as default (array is never empty)
			selectedHeight = availableHeights[availableHeights.length - 1]!;
		}
	});

	// Reset form when dialog opens
	$effect(() => {
		if (open) {
			name = 'Racky McRackface';
			selectedWidth = STANDARD_RACK_WIDTH;
			selectedHeight = 42;
			isCustomHeight = false;
			customHeight = 42;
			nameError = '';
			heightError = '';
		}
	});

	function selectPresetHeight(height: number) {
		isCustomHeight = false;
		selectedHeight = height;
		heightError = '';
	}

	function selectCustomHeight() {
		isCustomHeight = true;
		heightError = '';
	}

	function getCurrentHeight(): number {
		return isCustomHeight ? customHeight : selectedHeight;
	}

	function validate(): boolean {
		let valid = true;
		nameError = '';
		heightError = '';

		if (!name.trim()) {
			nameError = 'Name is required';
			valid = false;
		}

		const height = getCurrentHeight();
		if (height < MIN_RACK_HEIGHT || height > MAX_RACK_HEIGHT) {
			heightError = `Height must be between ${MIN_RACK_HEIGHT} and ${MAX_RACK_HEIGHT}`;
			valid = false;
		}

		return valid;
	}

	function handleSubmit() {
		if (validate()) {
			oncreate?.({
				name: name.trim(),
				height: getCurrentHeight(),
				width: selectedWidth
			});
		}
	}

	function handleCancel() {
		oncancel?.();
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			handleSubmit();
		}
	}
</script>

<Dialog {open} title="New Rack" width="var(--dialog-width-md)" showClose={false}>
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<form class="new-rack-form" onsubmit={(e) => e.preventDefault()} onkeydown={handleKeyDown}>
		<div class="form-group">
			<label for="rack-name">Rack Name</label>
			<input
				type="text"
				id="rack-name"
				class="input-field"
				bind:value={name}
				placeholder="e.g., Main Server Rack"
				class:error={nameError}
			/>
			{#if nameError}
				<span class="error-message">{nameError}</span>
			{/if}
		</div>

		<div class="form-group">
			<span class="form-label">Rack Width</span>
			<div class="width-options" role="group" aria-label="Rack width">
				{#each ALLOWED_RACK_WIDTHS as width (width)}
					<label class="width-option">
						<input
							type="radio"
							name="rack-width"
							value={width}
							checked={selectedWidth === width}
							onchange={() => (selectedWidth = width)}
						/>
						<span class="width-label">{width}"</span>
					</label>
				{/each}
			</div>
		</div>

		<div class="form-group">
			<span class="form-label">Height</span>
			<div class="height-buttons" role="group" aria-label="Rack height">
				{#each availableHeights as height (height)}
					<button
						type="button"
						class="height-btn"
						class:selected={!isCustomHeight && selectedHeight === height}
						onclick={() => selectPresetHeight(height)}
					>
						{height}U
					</button>
				{/each}
				<button
					type="button"
					class="height-btn"
					class:selected={isCustomHeight}
					onclick={selectCustomHeight}
				>
					Custom
				</button>
			</div>
			{#if isCustomHeight}
				<div class="custom-height-input">
					<label for="custom-height" class="sr-only">Custom Height</label>
					<input
						type="number"
						id="custom-height"
						class="input-field"
						aria-label="Custom height"
						bind:value={customHeight}
						min={MIN_RACK_HEIGHT}
						max={MAX_RACK_HEIGHT}
						class:error={heightError}
					/>
					<span class="unit">U</span>
				</div>
			{/if}
			{#if heightError}
				<span class="error-message">{heightError}</span>
			{/if}
		</div>

		<div class="form-actions">
			<button type="button" class="btn btn-secondary" onclick={handleCancel}> Cancel </button>
			<button type="submit" class="btn btn-primary" onclick={handleSubmit}> Create </button>
		</div>
	</form>
</Dialog>

<style>
	.new-rack-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.form-group label,
	.form-group .form-label {
		font-weight: var(--font-weight-medium);
		color: var(--colour-text);
	}

	.form-group input[type='text'],
	.form-group input[type='number'] {
		padding: var(--space-2) var(--space-3);
		background: var(--colour-input-bg, var(--colour-bg));
		border: 1px solid var(--colour-border);
		border-radius: var(--radius-md);
		color: var(--colour-text);
		font-size: var(--font-size-base);
	}

	.form-group input:focus {
		outline: none;
		border-color: var(--colour-selection);
		box-shadow: var(--glow-pink-sm);
	}

	.form-group input.error {
		border-color: var(--colour-error);
	}

	.error-message {
		font-size: var(--font-size-sm);
		color: var(--colour-error);
	}

	.height-buttons {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
	}

	.height-btn {
		padding: var(--space-2) var(--space-4);
		background: var(--colour-button-bg);
		border: 1px solid var(--colour-border);
		border-radius: var(--radius-md);
		color: var(--colour-text);
		font-size: var(--font-size-base);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.height-btn:hover {
		background: var(--colour-button-hover);
	}

	.height-btn.selected {
		background: var(--colour-selection);
		border-color: var(--colour-selection);
		color: white;
	}

	.custom-height-input {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-2);
	}

	.custom-height-input input {
		width: var(--input-width-custom);
		padding: var(--space-2) var(--space-3);
		background: var(--colour-input-bg, var(--colour-bg));
		border: 1px solid var(--colour-border);
		border-radius: var(--radius-md);
		color: var(--colour-text);
		font-size: var(--font-size-base);
	}

	.custom-height-input .unit {
		color: var(--colour-text-muted);
		font-size: var(--font-size-base);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.width-options {
		display: flex;
		gap: var(--space-4);
	}

	.width-option {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		cursor: pointer;
	}

	.width-option input[type='radio'] {
		width: 18px;
		height: 18px;
		accent-color: var(--colour-selection);
		cursor: pointer;
	}

	.width-label {
		font-size: var(--font-size-base);
		color: var(--colour-text);
	}

	.form-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-3);
		margin-top: var(--space-2);
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
		background: var(--colour-button-primary);
		color: var(--colour-text-on-primary);
	}

	.btn-primary:hover {
		background: var(--colour-button-primary-hover);
	}
</style>
