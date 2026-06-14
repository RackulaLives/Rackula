<!--
  WelcomeScreen Component
  Displayed when no racks exist - shows ghostly rack background
  Click anywhere to create a new rack
-->
<script lang="ts">
	import {
		U_HEIGHT_PX,
		BASE_RACK_WIDTH,
		RAIL_WIDTH,
		BASE_RACK_PADDING
	} from '$lib/constants/layout';

	interface Props {
		onclick?: () => void;
	}

	let { onclick }: Props = $props();

	// Welcome screen shows a 42U rack (standard full-height rack)
	const RACK_HEIGHT = 42;
	const totalHeight = RACK_HEIGHT * U_HEIGHT_PX;
	const interiorWidth = BASE_RACK_WIDTH - RAIL_WIDTH * 2;

	// Generate U labels (highest number at top, ascending from bottom)
	const uLabels = Array.from({ length: RACK_HEIGHT }, (_, i) => ({
		uNumber: RACK_HEIGHT - i,
		yPosition: i * U_HEIGHT_PX + U_HEIGHT_PX / 2 + BASE_RACK_PADDING + RAIL_WIDTH
	}));

	function handleClick() {
		onclick?.();
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			onclick?.();
		}
	}
</script>

<div
	class="welcome-screen"
	data-testid="welcome-screen"
	onclick={handleClick}
	onkeydown={handleKeyDown}
	role="button"
	tabindex="0"
	aria-label="Click to get started"
>
	<!-- Ghostly 42U rack background (matching Rack.svelte dimensions) -->
	<svg
		class="ghost-rack"
		viewBox="0 0 {BASE_RACK_WIDTH} {BASE_RACK_PADDING + RAIL_WIDTH * 2 + totalHeight}"
		aria-hidden="true"
	>
		<!-- Rack interior -->
		<rect
			x={RAIL_WIDTH}
			y={BASE_RACK_PADDING + RAIL_WIDTH}
			width={interiorWidth}
			height={totalHeight}
			class="rack-interior"
		/>

		<!-- Top bar (horizontal) -->
		<rect x="0" y={BASE_RACK_PADDING} width={BASE_RACK_WIDTH} height={RAIL_WIDTH} class="rack-rail" />

		<!-- Bottom bar (horizontal) -->
		<rect
			x="0"
			y={BASE_RACK_PADDING + RAIL_WIDTH + totalHeight}
			width={BASE_RACK_WIDTH}
			height={RAIL_WIDTH}
			class="rack-rail"
		/>

		<!-- Left rail (vertical) -->
		<rect
			x="0"
			y={BASE_RACK_PADDING + RAIL_WIDTH}
			width={RAIL_WIDTH}
			height={totalHeight}
			class="rack-rail"
		/>

		<!-- Right rail (vertical) -->
		<rect
			x={BASE_RACK_WIDTH - RAIL_WIDTH}
			y={BASE_RACK_PADDING + RAIL_WIDTH}
			width={RAIL_WIDTH}
			height={totalHeight}
			class="rack-rail"
		/>

		<!-- Horizontal grid lines (U dividers) -->
		{#each Array(RACK_HEIGHT + 1) as _, i (i)}
			<line
				x1={RAIL_WIDTH}
				y1={i * U_HEIGHT_PX + BASE_RACK_PADDING + RAIL_WIDTH}
				x2={BASE_RACK_WIDTH - RAIL_WIDTH}
				y2={i * U_HEIGHT_PX + BASE_RACK_PADDING + RAIL_WIDTH}
				class="rack-line"
			/>
		{/each}

		<!-- U labels on left rail -->
		{#each uLabels as { uNumber, yPosition } (uNumber)}
			<text x={RAIL_WIDTH / 2} y={yPosition} class="rack-unit-num" dominant-baseline="middle">
				{uNumber}
			</text>
		{/each}
	</svg>
</div>

<style>
	.welcome-screen {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100%;
		background: var(--canvas-bg);
		position: relative;
		overflow: hidden;
		cursor: pointer;
	}

	.welcome-screen:focus {
		outline: none;
	}

	.welcome-screen:focus-visible {
		outline: 2px solid var(--colour-focus-ring);
		outline-offset: -2px;
	}

	.ghost-rack {
		height: 90%;
		max-height: 976px; /* Match 42U rack viewBox height */
		opacity: 0.15;
	}

	.rack-interior {
		fill: var(--rack-interior);
	}

	.rack-line {
		stroke: var(--rack-grid);
		stroke-width: 1;
	}

	.rack-rail {
		fill: var(--rack-rail);
	}

	.rack-unit-num {
		fill: var(--rack-text);
		font-size: var(--font-size-2xs);
		text-anchor: middle;
		font-family: var(--font-mono, monospace);
		font-variant-numeric: tabular-nums;
		user-select: none;
	}
</style>
