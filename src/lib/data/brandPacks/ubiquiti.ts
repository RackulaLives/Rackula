/**
 * Ubiquiti Brand Pack
 * Pre-defined device types for Ubiquiti networking equipment
 * Source: NetBox community devicetype-library
 *
 * Slugs follow NetBox naming convention for compatibility:
 * Pattern: {manufacturer}-{product-line}-{model}
 */

import type { DeviceType } from '$lib/types';
import { CATEGORY_COLOURS } from '$lib/types/constants';

/**
 * Ubiquiti device definitions (51 rack-mountable devices)
 * Slugs updated to match NetBox devicetype-library for image compatibility
 */
export const ubiquitiDevices: DeviceType[] = [
	// ============================================
	// UniFi Switches - Pro Series
	// ============================================
	{
		slug: 'ubiquiti-unifi-switch-24-pro',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'USW-Pro-24',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network',
		front_image: true,
		rear_image: true
	},
	{
		slug: 'ubiquiti-unifi-switch-48-pro',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'USW-Pro-48',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network',
		front_image: true,
		rear_image: true
	},
	{
		slug: 'ubiquiti-unifi-switch-24-pro-poe-gen2',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'USW-Pro-24-PoE',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network',
		front_image: true,
		rear_image: true
	},
	{
		slug: 'ubiquiti-unifi-switch-48-pro-poe-gen2',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'USW-Pro-48-PoE',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network',
		front_image: true,
		rear_image: true
	},

	// ============================================
	// UniFi Switches - Pro Max Series
	// ============================================
	{
		slug: 'ubiquiti-unifi-switch-pro-max-24',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'USW-Pro-Max-24',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network',
		front_image: true,
		rear_image: true
	},
	{
		slug: 'ubiquiti-unifi-switch-pro-max-24-poe',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'USW-Pro-Max-24-PoE',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network',
		front_image: true,
		rear_image: true
	},
	{
		slug: 'ubiquiti-unifi-switch-pro-max-48',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'USW-Pro-Max-48',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network',
		front_image: true,
		rear_image: true
	},
	{
		slug: 'ubiquiti-unifi-switch-pro-max-48-poe',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'USW-Pro-Max-48-PoE',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network',
		front_image: true,
		rear_image: true
	},
	{
		slug: 'ubiquiti-unifi-switch-pro-max-16',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'USW-Pro-Max-16',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-unifi-switch-pro-max-16-poe',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'USW-Pro-Max-16-PoE',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},

	// ============================================
	// UniFi Switches - Aggregation & Enterprise
	// ============================================
	{
		slug: 'ubiquiti-unifi-switch-aggregation',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'USW-Aggregation',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network',
		front_image: true
	},
	{
		slug: 'ubiquiti-unifi-switch-pro-aggregation',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'USW-Pro-Aggregation',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network',
		front_image: true,
		rear_image: true
	},
	{
		slug: 'ubiquiti-unifi-switch-enterprise-24-poe',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'USW-Enterprise-24-PoE',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network',
		front_image: true,
		rear_image: true
	},
	{
		slug: 'ubiquiti-unifi-switch-enterprise-48-poe',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'USW-Enterprise-48-PoE',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network',
		front_image: true,
		rear_image: true
	},

	// ============================================
	// UniFi Switches - Standard Series
	// ============================================
	{
		slug: 'ubiquiti-unifi-switch-24',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'USW-24',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-unifi-switch-48-gen1',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'USW-48',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network',
		front_image: true
	},
	{
		slug: 'ubiquiti-unifi-switch-24-poe',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'USW-24-PoE',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-unifi-switch-48-poe',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'USW-48-PoE',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-unifi-switch-16-poe-gen2',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'USW-16-PoE',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network',
		front_image: true
	},

	// ============================================
	// UniFi Switches - Lite Series
	// ============================================
	{
		slug: 'ubiquiti-unifi-switch-lite-16-poe',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'USW-Lite-16-PoE',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-unifi-switch-lite-8-poe',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'USW-Lite-8-PoE',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network',
		front_image: true,
		rear_image: true
	},

	// ============================================
	// UniFi Switches - XG Series
	// ============================================
	{
		slug: 'ubiquiti-unifi-switch-pro-xg-8-poe',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'USW-Pro-XG-8-PoE',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-unifi-switch-16-xg',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'US-16-XG',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network',
		front_image: true
	},
	{
		slug: 'ubiquiti-unifi-switch-xg-6poe',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'US-XG-6PoE',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},

	// ============================================
	// Legacy UniFi Switches (US Series)
	// ============================================
	{
		slug: 'ubiquiti-unifi-switch-24-250w',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'US-24-250W',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-unifi-switch-24-500w',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'US-24-500W',
		is_full_depth: true,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-unifi-switch-48-500w',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'US-48-500W',
		is_full_depth: true,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},

	// ============================================
	// EdgeSwitch Series
	// ============================================
	{
		slug: 'ubiquiti-edgeswitch-16-150w',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'ES-16-150W',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-edgeswitch-24-250w',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'ES-24-250W',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-edgeswitch-24-500w',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'ES-24-500W',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-edgeswitch-24-lite',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'ES-24-Lite',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-edgeswitch-48-500w',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'ES-48-500W',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-edgeswitch-48-750w',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'ES-48-750W',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-edgeswitch-48-lite',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'ES-48-Lite',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-edgeswitch-16-xg',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'ES-16-XG',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},

	// ============================================
	// Dream Machines
	// ============================================
	{
		slug: 'ubiquiti-unifi-dream-machine-pro',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'UDM-Pro',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network',
		front_image: true,
		rear_image: true
	},
	{
		slug: 'ubiquiti-unifi-dream-machine-pro-special-edition',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'UDM-SE',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network',
		front_image: true,
		rear_image: true
	},
	{
		slug: 'ubiquiti-unifi-dream-machine-pro-max',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'UDM-Pro-Max',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network',
		front_image: true,
		rear_image: true
	},

	// ============================================
	// Gateways
	// ============================================
	{
		slug: 'ubiquiti-unifi-security-gateway-pro',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'USG-Pro-4',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network',
		front_image: true,
		rear_image: true
	},
	{
		slug: 'ubiquiti-unifi-gateway-pro',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'UXG-Pro',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network',
		front_image: true
	},
	{
		slug: 'ubiquiti-unifi-gateway-max',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'UXG-Max',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},

	// ============================================
	// EdgeRouter Series
	// ============================================
	{
		slug: 'ubiquiti-edgerouter-4',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'ER-4',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-edgerouter-6p',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'ER-6P',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-edgerouter-8',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'ER-8',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-edgerouter-12',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'ER-12',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-edgerouter-12p',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'ER-12P',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-edgerouter-pro-8',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'ERPro-8',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-edgerouter-8-xg',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'ER-8-XG',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},

	// ============================================
	// NVRs (Network Video Recorders)
	// ============================================
	{
		slug: 'ubiquiti-unifi-protect-network-video-recorder',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'UNVR',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.storage,
		category: 'storage',
		front_image: true,
		rear_image: true
	},
	{
		slug: 'ubiquiti-unifi-protect-network-video-recorder-pro',
		u_height: 2,
		manufacturer: 'Ubiquiti',
		model: 'UNVR-Pro',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.storage,
		category: 'storage',
		front_image: true,
		rear_image: true
	},
	{
		slug: 'ubiquiti-enterprise-network-video-recorder',
		u_height: 4,
		manufacturer: 'Ubiquiti',
		model: 'ENVR',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.storage,
		category: 'storage',
		front_image: true,
		rear_image: true
	},

	// ============================================
	// Power
	// ============================================
	{
		slug: 'ubiquiti-usp-pdu-pro',
		u_height: 2,
		manufacturer: 'Ubiquiti',
		model: 'USP-PDU-Pro',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.power,
		category: 'power',
		front_image: true,
		rear_image: true
	},

	// Additional devices from NetBox library
	{
		slug: 'ubiquiti-uacc-rack-panel-patch-blank-24',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: '24-Port Blank Keystone Patch Panel',
		is_full_depth: false,
		airflow: 'passive',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-uf-olt',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: '8-Port GPON Optical Line Terminal',
		is_full_depth: false,
		airflow: 'side-to-rear',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-uacc-ai-port-rm',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'AI Port Rack Mount',
		is_full_depth: false,
		airflow: 'passive',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-ckg2-rm',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'CloudKey Rack Mount',
		is_full_depth: false,
		airflow: 'passive',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-er-10x',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'EdgeRouter 10X',
		is_full_depth: false,
		airflow: 'passive',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-er-12',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'EdgeRouter 12',
		is_full_depth: false,
		airflow: 'passive',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-er-12p',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'EdgeRouter 12P',
		is_full_depth: false,
		airflow: 'passive',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-er-4',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'EdgeRouter 4',
		is_full_depth: false,
		airflow: 'passive',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-er-6p',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'EdgeRouter 6P',
		is_full_depth: false,
		airflow: 'passive',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-er-8',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'EdgeRouter 8',
		is_full_depth: false,
		airflow: 'side-to-rear',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-edgerouter-infinity',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'EdgeRouter Infinity',
		is_full_depth: false,
		airflow: 'side-to-rear',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-erlite-3',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'EdgeRouter Lite',
		is_full_depth: false,
		airflow: 'passive',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-erpoe-5',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'EdgeRouter PoE 5-Port',
		is_full_depth: false,
		airflow: 'passive',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-edgerouter-pro',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'EdgeRouter Pro',
		is_full_depth: false,
		airflow: 'side-to-rear',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-es-16-150w',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'EdgeSwitch 16 150W',
		is_full_depth: false,
		airflow: 'side-to-rear',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-es-16-xg',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'EdgeSwitch 16 XG',
		is_full_depth: false,
		airflow: 'side-to-rear',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-es-24-250w',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'EdgeSwitch 24 250W',
		is_full_depth: false,
		airflow: 'left-to-right',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-es-24-500w',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'EdgeSwitch 24 500W',
		is_full_depth: false,
		airflow: 'left-to-right',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-es-24-lite',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'EdgeSwitch 24 Lite',
		is_full_depth: false,
		airflow: 'side-to-rear',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-es-48-500w',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'EdgeSwitch 48 500W',
		is_full_depth: false,
		airflow: 'left-to-right',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-es-48-750w',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'EdgeSwitch 48 750W',
		is_full_depth: false,
		airflow: 'left-to-right',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-es-48-lite',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'EdgeSwitch 48 Lite',
		is_full_depth: false,
		airflow: 'side-to-rear',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-enterprise-campus-aggregation',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'Enterprise Campus Aggregation',
		is_full_depth: false,
		airflow: 'front-to-rear',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-enterprise-campus-switch-24-port-poe',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'Enterprise Campus Switch 24-Port PoE',
		airflow: 'front-to-rear',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-enterprise-fortress-gateway',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'Enterprise Fortress Gateway',
		is_full_depth: false,
		airflow: 'front-to-rear',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-er-x',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'ER-X',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-er-x-sfp',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'ER-X-SFP',
		is_full_depth: false,
		airflow: 'passive',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-es-10x',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'ES-10X',
		is_full_depth: false,
		airflow: 'passive',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-es-10xp',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'ES-10XP',
		is_full_depth: false,
		airflow: 'passive',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-es-12f',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'ES-12F',
		is_full_depth: false,
		airflow: 'passive',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-unifi-application-server',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'UniFi Application Server',
		airflow: 'front-to-rear',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-uc-ck',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'UniFi Cloud Key',
		is_full_depth: false,
		airflow: 'passive',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-unifi-switch-16-poe-150w-gen1',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'UniFi Switch 16 PoE 150W Gen1',
		is_full_depth: false,
		airflow: 'front-to-rear',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-unifi-switch-24-gen1',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'UniFi Switch 24 Gen1',
		is_full_depth: false,
		airflow: 'side-to-rear',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-unifi-switch-24-poe-250w-gen1',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'UniFi Switch 24 PoE 250W Gen1',
		is_full_depth: false,
		airflow: 'side-to-rear',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-unifi-switch-24-poe-500w-gen1',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'UniFi Switch 24 PoE 500W Gen1',
		airflow: 'side-to-rear',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-unifi-switch-48-poe-500w-gen1',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'UniFi Switch 48 PoE 500W Gen1',
		airflow: 'side-to-rear',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-unifi-switch-48-poe-750w-gen1',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'UniFi Switch 48 PoE 750W Gen1',
		airflow: 'side-to-rear',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-usg',
		u_height: 1,
		manufacturer: 'Ubiquiti',
		model: 'USG',
		is_full_depth: false,
		airflow: 'passive',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'ubiquiti-unas-pro',
		u_height: 2,
		manufacturer: 'Ubiquiti',
		model: 'UNAS Pro',
		is_full_depth: false,
		airflow: 'front-to-rear',
		colour: CATEGORY_COLOURS.storage,
		category: 'storage'
	}
];
