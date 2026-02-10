<!--
  CategoryIcon Component
  Lucide icons for each device category
-->
<script lang="ts">
	import type { DeviceCategory } from '$lib/types';
	import {
		Server,
		Network,
		EthernetPort,
		Zap,
		HardDrive,
		Monitor,
		Speaker,
		Fan,
		AlignEndHorizontal,
		CircleOff,
		Cable,
		CircleQuestionMark
	} from '@lucide/svelte';
	import type { Component } from 'svelte';
	import type { IconProps } from '@lucide/svelte';

	interface Props {
		category: DeviceCategory;
		size?: number;
	}

	let { category, size = 16 }: Props = $props();

	// Map categories to Lucide icon components
	const iconMap: Record<DeviceCategory, Component<IconProps>> = {
		server: Server,
		network: Network,
		'patch-panel': EthernetPort,
		power: Zap,
		storage: HardDrive,
		kvm: Monitor,
		'av-media': Speaker,
		cooling: Fan,
		shelf: AlignEndHorizontal,
		blank: CircleOff,
		'cable-management': Cable,
		chassis: Server,
		other: CircleQuestionMark
	};

	// Get the icon component for this category (fallback to CircleQuestionMark)
	const IconComponent = $derived(iconMap[category] ?? CircleQuestionMark);
</script>

<span class="category-icon">
	<IconComponent {size} aria-hidden="true" />
</span>

<style>
	.category-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		vertical-align: middle;
		color: currentColor;
	}

	.category-icon :global(svg) {
		display: block;
	}
</style>
