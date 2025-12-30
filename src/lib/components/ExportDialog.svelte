<!--
  Export Dialog Component
  Allows user to configure export options for rack layouts
  Features LogoLoader during export and shimmer preview
-->
<script lang="ts">
	import type {
		Rack,
		ExportFormat,
		ExportBackground,
		ExportOptions,
		ExportView,
		DeviceType,
		DisplayMode
	} from '$lib/types';
	import type { ImageStoreMap } from '$lib/types/images';
	import Dialog from './Dialog.svelte';
	import LogoLoader from './LogoLoader.svelte';
	import Shimmer from './Shimmer.svelte';
	import { generateExportSVG, generateExportFilename } from '$lib/utils/export';
	import { analytics } from '$lib/utils/analytics';

	interface Props {
		open: boolean;
		racks: Rack[];
		deviceTypes: DeviceType[];
		images?: ImageStoreMap;
		displayMode?: DisplayMode;
		layoutName?: string;
		selectedRackId: string | null;
		isExporting?: boolean;
		exportMessage?: string;
		qrCodeDataUrl?: string;
		onexport?: (event: CustomEvent<ExportOptions>) => void;
		oncancel?: () => void;
	}

	let {
		open,
		racks,
		deviceTypes,
		images,
		displayMode = 'label',
		layoutName = 'layout',
		selectedRackId: _selectedRackId,
		isExporting = false,
		exportMessage = 'Exporting...',
		qrCodeDataUrl,
		onexport,
		oncancel
	}: Props = $props();

	// Form state
	let format = $state<ExportFormat>('png');
	let includeLegend = $state(false);
	let background = $state<ExportBackground>('dark');
	let exportView = $state<ExportView>('both');
	let transparent = $state(false);
	let includeQR = $state(false);

	// Computed: Is CSV format (data export - no image options)
	const isCSV = $derived(format === 'csv');

	// Computed: Can select transparent background (PNG and SVG only)
	const canSelectTransparent = $derived(format === 'svg' || format === 'png');

	// Computed: Can include QR code (when QR code data URL is available and not CSV)
	const canIncludeQR = $derived(!isCSV && !!qrCodeDataUrl);

	// Computed: Can export (has racks)
	const canExport = $derived(racks.length > 0);

	// Computed: Preview filename
	const previewFilename = $derived(
		generateExportFilename(layoutName, isCSV ? null : exportView, format)
	);

	// Reset transparent when switching to format that doesn't support it
	$effect(() => {
		if (!canSelectTransparent && transparent) {
			transparent = false;
		}
	});

	// Preview SVG state
	let previewSvgString = $state<string | null>(null);
	let previewDimensions = $state<{ width: number; height: number } | null>(null);
	let previewError = $state<string | null>(null);

	// Generate preview when options change (for non-CSV formats)
	$effect(() => {
		if (!open || isCSV || racks.length === 0) {
			previewSvgString = null;
			previewDimensions = null;
			previewError = null;
			return;
		}

		// Build preview options
		const effectiveBackground = transparent ? 'transparent' : background;
		const previewOptions: ExportOptions = {
			format: 'svg', // Always generate as SVG for preview
			scope: 'all',
			includeNames: true,
			includeLegend,
			background: effectiveBackground,
			exportView,
			displayMode,
			includeQR: canIncludeQR ? includeQR : false,
			qrCodeDataUrl: canIncludeQR && includeQR ? qrCodeDataUrl : undefined
		};

		try {
			const svg = generateExportSVG(racks, deviceTypes, previewOptions, images);
			const width = parseInt(svg.getAttribute('width') || '0', 10);
			const height = parseInt(svg.getAttribute('height') || '0', 10);

			previewDimensions = { width, height };
			previewSvgString = svg.outerHTML;
			previewError = null;
		} catch (error) {
			// Log detailed error for debugging
			console.error('Export preview generation failed:', error);
			previewSvgString = null;
			previewDimensions = null;
			previewError = 'Preview generation failed';
		}
	});

	function handleExport() {
		// Use transparent background if checkbox is checked, otherwise use selected background
		const effectiveBackground = transparent ? 'transparent' : background;

		const options: ExportOptions = {
			format,
			scope: 'all',
			includeNames: true,
			includeLegend,
			background: effectiveBackground,
			exportView,
			includeQR: canIncludeQR ? includeQR : false,
			qrCodeDataUrl: canIncludeQR && includeQR ? qrCodeDataUrl : undefined
		};
		onexport?.(new CustomEvent('export', { detail: options }));
	}

	function handleCancel() {
		analytics.trackPanelClose('export');
		oncancel?.();
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			handleCancel();
		}
	}

	// Add/remove event listener based on open state and track panel open
	$effect(() => {
		if (open) {
			analytics.trackPanelOpen('export');
			window.addEventListener('keydown', handleKeyDown);
			return () => {
				window.removeEventListener('keydown', handleKeyDown);
			};
		}
	});
</script>

<Dialog {open} title="Export" width="456px" onclose={handleCancel}>
	<div class="export-form">
		<div class="form-group">
			<label for="export-format">Format</label>
			<select id="export-format" bind:value={format}>
				<option value="png">PNG</option>
				<option value="jpeg">JPEG</option>
				<option value="svg">SVG</option>
				<option value="pdf">PDF</option>
				<option value="csv">CSV (Spreadsheet)</option>
			</select>
		</div>

		{#if isCSV}
			<p class="csv-info">
				Exports rack contents as a spreadsheet with device positions, names, models, and categories.
			</p>
		{:else}
			<div class="form-group">
				<label for="export-view">View</label>
				<select id="export-view" bind:value={exportView}>
					<option value="both">Front & Rear (Side-by-Side)</option>
					<option value="front">Front Only</option>
					<option value="rear">Rear Only</option>
				</select>
			</div>

			<div class="form-group">
				<label for="export-theme">Theme</label>
				<select id="export-theme" bind:value={background} disabled={transparent}>
					<option value="dark">Dark</option>
					<option value="light">Light</option>
				</select>
			</div>

			{#if canSelectTransparent}
				<div class="form-group checkbox-group">
					<label>
						<input type="checkbox" bind:checked={transparent} />
						Transparent background
					</label>
				</div>
			{/if}

			<div class="form-group checkbox-group">
				<label>
					<input type="checkbox" bind:checked={includeLegend} />
					Include legend
				</label>
			</div>

			{#if canIncludeQR}
				<div class="form-group checkbox-group">
					<label>
						<input type="checkbox" bind:checked={includeQR} />
						Include sharing QR code
					</label>
				</div>
			{/if}
		{/if}
	</div>

	<!-- Preview area -->
	{#if !isCSV}
		<div class="preview-section">
			<span class="preview-label">Preview</span>
			{#if isExporting}
				<!-- Show loader during export -->
				<div class="preview-loading">
					<LogoLoader size={48} message={exportMessage} />
				</div>
			{:else if racks.length === 0}
				<div class="preview-placeholder">No rack to preview</div>
			{:else if previewError}
				<!-- Show error when preview generation fails -->
				<div class="preview-error" role="alert">
					<span class="preview-error__icon" aria-hidden="true">⚠</span>
					<span class="preview-error__message">{previewError}</span>
					<span class="preview-error__hint">Try changing export options</span>
				</div>
			{:else if previewSvgString && previewDimensions}
				<Shimmer loading={!previewSvgString}>
					<div
						class="preview-container"
						class:transparent-bg={transparent}
						style="aspect-ratio: {previewDimensions.width} / {previewDimensions.height};"
					>
						<!-- eslint-disable-next-line svelte/no-at-html-tags -- Safe: SVG generated by our own generateExportSVG function -->
						{@html previewSvgString}
					</div>
				</Shimmer>
			{/if}
		</div>
	{/if}

	<!-- Filename preview -->
	<div class="filename-preview">
		<span class="filename-label">Filename:</span>
		<span class="filename-value">{previewFilename}</span>
	</div>

	<div class="dialog-actions">
		<button type="button" class="btn-secondary" onclick={handleCancel} disabled={isExporting}>
			Cancel
		</button>
		<button
			type="button"
			class="btn-primary"
			onclick={handleExport}
			disabled={!canExport || isExporting}
		>
			{isExporting ? 'Exporting...' : 'Export'}
		</button>
	</div>
</Dialog>

<style>
	.export-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: var(--space-2) 0;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: var(--space-1-5);
	}

	.form-group label {
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-medium);
		color: var(--colour-text);
	}

	.form-group select {
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--colour-border);
		border-radius: var(--radius-sm);
		background: var(--input-bg);
		color: var(--colour-text);
		font-size: var(--font-size-base);
		cursor: pointer;
	}

	.form-group select:focus {
		outline: 2px solid var(--colour-selection);
		outline-offset: 1px;
	}

	.form-group select option:disabled {
		color: var(--colour-text-muted);
	}

	.csv-info {
		color: var(--colour-text-muted);
		font-size: var(--font-size-sm);
		line-height: 1.5;
		margin: 0;
		padding: var(--space-2) 0;
	}

	.preview-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-top: var(--space-2);
	}

	.preview-label {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--colour-text-muted);
	}

	.preview-container {
		max-width: 200px;
		max-height: 300px;
		border: 1px solid var(--colour-border);
		border-radius: var(--radius-sm);
		overflow: hidden;
		background: var(--colour-surface);
	}

	.preview-container.transparent-bg {
		/* Checkerboard pattern for transparent background preview */
		background-image:
			linear-gradient(45deg, #808080 25%, transparent 25%),
			linear-gradient(-45deg, #808080 25%, transparent 25%),
			linear-gradient(45deg, transparent 75%, #808080 75%),
			linear-gradient(-45deg, transparent 75%, #808080 75%);
		background-size: 10px 10px;
		background-position:
			0 0,
			0 5px,
			5px -5px,
			-5px 0;
	}

	.preview-container :global(svg) {
		display: block;
		width: 100%;
		height: auto;
	}

	.preview-placeholder {
		max-width: 200px;
		height: 100px;
		border: 1px dashed var(--colour-border);
		border-radius: var(--radius-sm);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--colour-text-muted);
		font-size: var(--font-size-sm);
	}

	.preview-loading {
		max-width: 200px;
		min-height: 120px;
		border: 1px solid var(--colour-border);
		border-radius: var(--radius-sm);
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--colour-surface);
		padding: var(--space-4);
	}

	.checkbox-group {
		flex-direction: row;
		align-items: center;
	}

	.checkbox-group label {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		cursor: pointer;
		font-weight: var(--font-weight-normal);
	}

	.checkbox-group input[type='checkbox'] {
		width: var(--space-4);
		height: var(--space-4);
		accent-color: var(--colour-selection);
		cursor: pointer;
	}

	.form-group select:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.filename-preview {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) 0;
		margin-top: var(--space-2);
	}

	.filename-label {
		font-size: var(--font-size-sm);
		color: var(--colour-text-muted);
		flex-shrink: 0;
	}

	.filename-value {
		font-size: var(--font-size-sm);
		font-family: monospace;
		color: var(--colour-text);
		background: var(--colour-surface-hover);
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-sm);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.dialog-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-3);
		margin-top: var(--space-4);
		padding-top: var(--space-4);
		border-top: 1px solid var(--colour-border);
	}

	.btn-secondary,
	.btn-primary {
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-sm);
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-medium);
		cursor: pointer;
		transition:
			background-color var(--duration-fast) ease,
			opacity var(--duration-fast) ease;
	}

	.btn-secondary {
		background: transparent;
		border: 1px solid var(--colour-border);
		color: var(--colour-text);
	}

	.btn-secondary:hover:not(:disabled) {
		background: var(--colour-surface-hover);
	}

	.btn-secondary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-primary {
		background: var(--colour-selection);
		border: none;
		color: var(--neutral-50);
	}

	.btn-primary:hover:not(:disabled) {
		background: var(--colour-selection-hover);
	}

	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Preview error state */
	.preview-error {
		max-width: 200px;
		min-height: 100px;
		border: 1px solid var(--colour-error);
		border-radius: var(--radius-sm);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		padding: var(--space-4);
		background: var(--colour-surface);
	}

	.preview-error__icon {
		font-size: var(--font-size-xl);
		color: var(--colour-error);
	}

	.preview-error__message {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--colour-error);
		text-align: center;
	}

	.preview-error__hint {
		font-size: var(--font-size-xs);
		color: var(--colour-text-muted);
		text-align: center;
	}
</style>
