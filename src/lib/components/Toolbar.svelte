<!--
  Toolbar Component
  Main application toolbar with actions and theme toggle
-->
<script lang="ts">
	import Tooltip from './Tooltip.svelte';
	import ToolbarDrawer from './ToolbarDrawer.svelte';
	import LogoLockup from './LogoLockup.svelte';
	import {
		IconPlus,
		IconSave,
		IconLoad,
		IconExport,
		IconShare,
		IconTrash,
		IconFitAll,
		IconSun,
		IconMoon,
		IconLabel,
		IconImage,
		IconUndo,
		IconRedo,
		IconMenu
	} from './icons';
	import type { DisplayMode } from '$lib/types';
	import { getLayoutStore } from '$lib/stores/layout.svelte';
	import { getToastStore } from '$lib/stores/toast.svelte';
	import { analytics } from '$lib/utils/analytics';

	interface Props {
		hasSelection?: boolean;
		hasRacks?: boolean;
		theme?: 'dark' | 'light';
		displayMode?: DisplayMode;
		partyMode?: boolean;
		onnewrack?: () => void;
		onsave?: () => void;
		onload?: () => void;
		onexport?: () => void;
		onshare?: () => void;
		ondelete?: () => void;
		onfitall?: () => void;
		ontoggletheme?: () => void;
		ontoggledisplaymode?: () => void;
		onhelp?: () => void;
	}

	let {
		hasSelection = false,
		hasRacks = false,
		theme = 'dark',
		displayMode = 'label',
		partyMode = false,
		onnewrack,
		onsave,
		onload,
		onexport,
		onshare,
		ondelete,
		onfitall,
		ontoggletheme,
		ontoggledisplaymode,
		onhelp
	}: Props = $props();

	// Display mode labels for the 3-way toggle (prefixed with "View:" to indicate current state)
	const displayModeLabels: Record<DisplayMode, string> = {
		label: 'View: Label',
		image: 'View: Image',
		'image-label': 'View: Both'
	};
	const displayModeLabel = $derived(displayModeLabels[displayMode]);

	const layoutStore = getLayoutStore();
	const toastStore = getToastStore();

	// Drawer state for hamburger menu
	let drawerOpen = $state(false);
	let brandRef: HTMLElement | null = $state(null);

	// Track if we're in hamburger mode (<= 1024px)
	let isHamburgerMode = $state(false);

	// Set up media query listener on mount
	$effect(() => {
		const mediaQuery = window.matchMedia('(max-width: 1024px)');
		isHamburgerMode = mediaQuery.matches;

		const handleChange = (e: MediaQueryListEvent) => {
			isHamburgerMode = e.matches;
			// Close drawer if switching to full mode
			if (!e.matches) {
				drawerOpen = false;
			}
		};

		mediaQuery.addEventListener('change', handleChange);
		return () => mediaQuery.removeEventListener('change', handleChange);
	});

	function toggleDrawer() {
		// Only toggle drawer in hamburger mode
		if (isHamburgerMode) {
			drawerOpen = !drawerOpen;
			analytics.trackToolbarClick('hamburger');
		}
	}

	function closeDrawer() {
		drawerOpen = false;
		// Return focus to brand/hamburger button
		brandRef?.focus();
	}

	function handleUndo() {
		if (!layoutStore.canUndo) return;
		const desc = layoutStore.undoDescription?.replace('Undo: ', '') ?? 'action';
		layoutStore.undo();
		toastStore.showToast(`Undid: ${desc}`, 'info');
		analytics.trackToolbarClick('undo');
	}

	function handleRedo() {
		if (!layoutStore.canRedo) return;
		const desc = layoutStore.redoDescription?.replace('Redo: ', '') ?? 'action';
		layoutStore.redo();
		toastStore.showToast(`Redid: ${desc}`, 'info');
		analytics.trackToolbarClick('redo');
	}

	function handleNewRack() {
		analytics.trackRackCreate();
		analytics.trackToolbarClick('new-rack');
		onnewrack?.();
	}

	function handleDelete() {
		analytics.trackToolbarClick('delete');
		ondelete?.();
	}

	function handleFitAll() {
		analytics.trackToolbarClick('fit-all');
		onfitall?.();
	}

	function handleToggleTheme() {
		analytics.trackToolbarClick('theme');
		ontoggletheme?.();
	}
</script>

<header class="toolbar">
	<!-- Left section: Branding -->
	<div class="toolbar-section toolbar-left">
		{#if isHamburgerMode}
			<button
				bind:this={brandRef}
				class="toolbar-brand hamburger-mode"
				type="button"
				aria-expanded={drawerOpen}
				aria-controls="toolbar-drawer"
				aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
				onclick={toggleDrawer}
				data-testid="btn-hamburger-menu"
			>
				<LogoLockup size={36} {partyMode} />
				<span class="hamburger-icon" aria-hidden="true">
					<IconMenu size={20} />
				</span>
			</button>
		{:else}
			<Tooltip text="About & Shortcuts" shortcut="?" position="bottom">
				<button
					class="toolbar-brand toolbar-brand--clickable"
					type="button"
					aria-label="About & Shortcuts"
					onclick={onhelp}
					data-testid="btn-logo-about"
				>
					<LogoLockup size={36} {partyMode} />
				</button>
			</Tooltip>
		{/if}
	</div>

	<!-- Center section: Main actions -->
	<div class="toolbar-section toolbar-center">
		<!-- File Operations -->
		<Tooltip text="New Rack" shortcut="N" position="bottom">
			<button
				class="toolbar-action-btn"
				class:primary={!hasRacks}
				aria-label="New Rack"
				onclick={handleNewRack}
				data-testid="btn-new-rack"
			>
				<IconPlus size={16} />
				<span>New Rack</span>
			</button>
		</Tooltip>

		<Tooltip text="Load Layout" shortcut="Ctrl+O" position="bottom">
			<button
				class="toolbar-action-btn"
				aria-label="Load Layout"
				onclick={onload}
				data-testid="btn-load-layout"
			>
				<IconLoad size={16} />
				<span>Load Layout</span>
			</button>
		</Tooltip>

		<Tooltip text="Save Layout" shortcut="Ctrl+S" position="bottom">
			<button class="toolbar-action-btn" aria-label="Save" onclick={onsave} data-testid="btn-save">
				<IconSave size={16} />
				<span>Save</span>
			</button>
		</Tooltip>

		<Tooltip text="Export Image" shortcut="Ctrl+E" position="bottom">
			<button
				class="toolbar-action-btn"
				aria-label="Export"
				onclick={onexport}
				data-testid="btn-export"
			>
				<IconExport size={16} />
				<span>Export</span>
			</button>
		</Tooltip>

		<Tooltip text="Share Layout" position="bottom">
			<button
				class="toolbar-action-btn"
				aria-label="Share"
				disabled={!hasRacks}
				onclick={onshare}
				data-testid="btn-share"
			>
				<IconShare size={16} />
				<span>Share</span>
			</button>
		</Tooltip>

		<div class="separator" aria-hidden="true"></div>

		<!-- Edit Operations -->
		<Tooltip text={layoutStore.undoDescription ?? 'Undo'} shortcut="Ctrl+Z" position="bottom">
			<button
				class="toolbar-action-btn"
				aria-label={layoutStore.undoDescription ?? 'Undo'}
				disabled={!layoutStore.canUndo}
				onclick={handleUndo}
				data-testid="btn-undo"
			>
				<IconUndo size={16} />
				<span>Undo</span>
			</button>
		</Tooltip>

		<Tooltip text={layoutStore.redoDescription ?? 'Redo'} shortcut="Ctrl+Shift+Z" position="bottom">
			<button
				class="toolbar-action-btn"
				aria-label={layoutStore.redoDescription ?? 'Redo'}
				disabled={!layoutStore.canRedo}
				onclick={handleRedo}
				data-testid="btn-redo"
			>
				<IconRedo size={16} />
				<span>Redo</span>
			</button>
		</Tooltip>

		<Tooltip text="Delete Selected" shortcut="Del" position="bottom">
			<button
				class="toolbar-action-btn"
				aria-label="Delete"
				disabled={!hasSelection}
				onclick={handleDelete}
				data-testid="btn-delete"
			>
				<IconTrash size={16} />
				<span>Delete</span>
			</button>
		</Tooltip>

		<div class="separator" aria-hidden="true"></div>

		<!-- View Operations -->
		<Tooltip text="Display Mode: {displayModeLabel}" shortcut="I" position="bottom">
			<button
				class="toolbar-action-btn"
				aria-label="Display Mode: {displayModeLabel}"
				onclick={ontoggledisplaymode}
				data-testid="btn-toggle-display-mode"
			>
				{#if displayMode === 'label'}
					<IconLabel size={16} />
				{:else if displayMode === 'image'}
					<IconImage size={16} />
				{:else}
					<!-- image-label mode: show both icons stacked -->
					<IconImage size={16} />
				{/if}
				<span>{displayModeLabel}</span>
			</button>
		</Tooltip>

		<Tooltip text="Reset View" shortcut="F" position="bottom">
			<button
				class="toolbar-action-btn"
				aria-label="Reset View"
				onclick={handleFitAll}
				data-testid="btn-reset-view"
			>
				<IconFitAll size={16} />
				<span>Reset View</span>
			</button>
		</Tooltip>

		<Tooltip text="Toggle Theme" position="bottom">
			<button
				class="toolbar-action-btn"
				aria-label="Toggle Theme"
				onclick={handleToggleTheme}
				data-testid="btn-toggle-theme"
			>
				{#if theme === 'dark'}
					<IconSun size={16} />
					<span>Light</span>
				{:else}
					<IconMoon size={16} />
					<span>Dark</span>
				{/if}
			</button>
		</Tooltip>
	</div>

	<!-- Right section: Empty (previously held theme toggle) -->
	<div class="toolbar-section toolbar-right"></div>
</header>

<!-- Toolbar Drawer (hamburger menu) -->
<ToolbarDrawer
	open={drawerOpen}
	{displayMode}
	{theme}
	canUndo={layoutStore.canUndo}
	canRedo={layoutStore.canRedo}
	{hasSelection}
	{hasRacks}
	undoDescription={layoutStore.undoDescription ?? 'Undo'}
	redoDescription={layoutStore.redoDescription ?? 'Redo'}
	onclose={closeDrawer}
	{onnewrack}
	{onsave}
	{onload}
	{onexport}
	{onshare}
	{ondelete}
	{onfitall}
	{ontoggledisplaymode}
	{ontoggletheme}
	{onhelp}
	onundo={handleUndo}
	onredo={handleRedo}
/>

<style>
	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: var(--toolbar-height);
		padding: 0 var(--space-4);
		background: var(--colour-toolbar-bg, var(--toolbar-bg));
		border-bottom: 1px solid var(--colour-toolbar-border, var(--toolbar-border));
		flex-shrink: 0;
		position: relative;
	}

	.toolbar-section {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	.toolbar-left {
		flex: 0 0 var(--sidebar-width);
		justify-content: flex-start;
	}

	/* Mobile: make toolbar-left full width in hamburger mode */
	@media (max-width: 1024px) {
		.toolbar-left {
			flex: 1;
			justify-content: flex-start;
		}
	}

	.toolbar-center {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-1);
	}

	.toolbar-right {
		flex: 0 0 auto;
	}

	.toolbar-brand {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--colour-text);
		padding: var(--space-2);
		cursor: default;
		border-radius: var(--radius-md);
		transition: background-color var(--duration-fast) var(--ease-out);
		/* Reset button styles */
		background: transparent;
		border: none;
		font: inherit;
	}

	/* Clickable brand (opens About in non-hamburger mode) */
	.toolbar-brand--clickable {
		cursor: pointer;
		padding: 0 var(--space-2);
		transition:
			background-color var(--duration-fast) var(--ease-out),
			transform var(--duration-fast) var(--ease-out);
	}

	.toolbar-brand--clickable:hover {
		background: var(--colour-surface-hover);
		transform: scale(1.02);
	}

	.toolbar-brand--clickable:active {
		transform: scale(0.98);
		background: var(--colour-selection);
	}

	.toolbar-brand--clickable:focus-visible {
		outline: none;
		box-shadow:
			0 0 0 2px var(--colour-bg),
			0 0 0 4px var(--colour-focus-ring);
	}

	/* Hamburger icon next to logo */
	.hamburger-icon {
		display: none;
		align-items: center;
		justify-content: center;
		color: var(--colour-text-muted);
	}

	.toolbar-action-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--colour-border);
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--colour-text);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		cursor: pointer;
		white-space: nowrap;
		transition:
			background-color var(--duration-fast) var(--ease-out),
			border-color var(--duration-fast) var(--ease-out),
			opacity var(--duration-fast) var(--ease-out);
	}

	.toolbar-action-btn:hover:not(:disabled) {
		background-color: var(--colour-surface-hover);
	}

	.toolbar-action-btn:focus-visible {
		outline: none;
		box-shadow:
			0 0 0 2px var(--colour-bg),
			0 0 0 4px var(--colour-focus-ring);
	}

	.toolbar-action-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.toolbar-action-btn.primary {
		background: var(--colour-selection);
		border-color: var(--colour-selection);
		color: var(--colour-text-on-primary);
	}

	.toolbar-action-btn.primary:hover:not(:disabled) {
		background: var(--colour-selection-hover);
		border-color: var(--colour-selection-hover);
	}

	.separator {
		width: 1px;
		height: var(--space-6);
		background: var(--colour-border);
		margin: 0 var(--space-2);
	}

	/* Responsive: Medium screens - icon-only buttons */
	@media (max-width: 1000px) {
		.toolbar-action-btn span {
			display: none;
		}

		.toolbar-action-btn {
			padding: var(--space-2);
		}

		.separator {
			margin: 0 var(--space-1);
		}
	}

	/* Responsive: Hamburger mode - hide center toolbar and right section */
	@media (max-width: 1024px) {
		.toolbar-center {
			display: none;
		}

		.toolbar-right {
			display: none;
		}
	}

	/* Hamburger mode button styles (Lockin logo + text + hamburger icon) */
	.toolbar-brand.hamburger-mode {
		cursor: pointer;
		padding: var(--space-2);
		background: transparent;
		width: 100%;
		justify-content: space-between;
	}

	.toolbar-brand.hamburger-mode .hamburger-icon {
		display: flex;
	}

	.toolbar-brand.hamburger-mode:hover {
		background: var(--colour-surface-hover);
	}

	.toolbar-brand.hamburger-mode:focus-visible {
		outline: none;
		box-shadow: 0 0 0 2px var(--colour-focus-ring);
	}

	/* Responsive: Small screens - compact branding */
	@media (max-width: 600px) {
		.toolbar-brand {
			padding: var(--space-2);
		}
	}
</style>
