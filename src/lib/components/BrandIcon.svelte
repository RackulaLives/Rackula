<!--
  BrandIcon Component
  Brand logos from simple-icons for device library sections
-->
<script lang="ts">
	import {
		siUbiquiti,
		siMikrotik,
		siSynology,
		siDell,
		siSupermicro,
		siTplink,
		siHp,
		siSchneiderelectric,
		siFortinet,
		siNetgear,
		siPaloaltonetworks,
		siCisco,
		siQnap,
		siLenovo,
		siBlackmagicdesign,
		siApple
	} from 'simple-icons';
	import { Zap } from '@lucide/svelte';

	interface Props {
		/** simple-icons slug */
		slug?: string;
		size?: number;
	}

	let { slug, size = 16 }: Props = $props();

	// Map slugs to simple-icons objects
	const iconMap: Record<string, { path: string; hex: string }> = {
		ubiquiti: siUbiquiti,
		mikrotik: siMikrotik,
		synology: siSynology,
		dell: siDell,
		supermicro: siSupermicro,
		tplink: siTplink,
		hp: siHp,
		schneiderelectric: siSchneiderelectric,
		fortinet: siFortinet,
		netgear: siNetgear,
		paloaltonetworks: siPaloaltonetworks,
		cisco: siCisco,
		qnap: siQnap,
		lenovo: siLenovo,
		blackmagicdesign: siBlackmagicdesign,
		apple: siApple
	};

	const icon = $derived(slug ? iconMap[slug] : undefined);
</script>

{#if icon}
	<span class="brand-icon" style="--icon-size: {size}px">
		<svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path d={icon.path} />
		</svg>
	</span>
{:else}
	<!-- Fallback for brands not in simple-icons (e.g., APC) -->
	<span class="brand-icon brand-icon-fallback">
		<Zap {size} aria-hidden="true" />
	</span>
{/if}

<style>
	.brand-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		vertical-align: middle;
		color: currentColor;
		flex-shrink: 0;
	}

	.brand-icon :global(svg) {
		display: block;
	}

	.brand-icon-fallback {
		opacity: 0.7;
	}
</style>
