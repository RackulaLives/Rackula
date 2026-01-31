/**
 * Cisco Brand Pack
 * Pre-defined device types for Cisco networking, security, and compute equipment
 * Source: NetBox community devicetype-library
 *
 * Slugs follow NetBox naming convention for compatibility:
 * Pattern: cisco-{product-line}-{model}
 */

import type { DeviceType } from '$lib/types';
import { CATEGORY_COLOURS } from '$lib/types/constants';

/**
 * Cisco device definitions (30 rack-mountable devices)
 * Covers: Catalyst switches, Nexus switches, ISR/ASR routers, ASA/Firepower security, UCS servers
 */
export const ciscoDevices: DeviceType[] = [
	// ============================================
	// Catalyst 9200 Series Switches
	// ============================================
	{
		slug: 'cisco-catalyst-9200-24t',
		u_height: 1,
		manufacturer: 'Cisco',
		model: 'Catalyst 9200-24T',
		is_full_depth: false,
		airflow: 'front-to-rear',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'cisco-catalyst-9200-48t',
		u_height: 1,
		manufacturer: 'Cisco',
		model: 'Catalyst 9200-48T',
		is_full_depth: false,
		airflow: 'front-to-rear',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'cisco-catalyst-9200-24p',
		u_height: 1,
		manufacturer: 'Cisco',
		model: 'Catalyst 9200-24P',
		is_full_depth: false,
		airflow: 'front-to-rear',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'cisco-catalyst-9200-48p',
		u_height: 1,
		manufacturer: 'Cisco',
		model: 'Catalyst 9200-48P',
		is_full_depth: false,
		airflow: 'front-to-rear',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},

	// ============================================
	// Catalyst 9300 Series Switches
	// ============================================
	{
		slug: 'cisco-catalyst-9300-24t',
		u_height: 1,
		manufacturer: 'Cisco',
		model: 'Catalyst 9300-24T',
		is_full_depth: true,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'cisco-catalyst-9300-48t',
		u_height: 1,
		manufacturer: 'Cisco',
		model: 'Catalyst 9300-48T',
		is_full_depth: true,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'cisco-catalyst-9300-24p',
		u_height: 1,
		manufacturer: 'Cisco',
		model: 'Catalyst 9300-24P',
		is_full_depth: true,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'cisco-catalyst-9300-48p',
		u_height: 1,
		manufacturer: 'Cisco',
		model: 'Catalyst 9300-48P',
		is_full_depth: true,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},

	// ============================================
	// Catalyst 9500 Series Switches
	// ============================================
	{
		slug: 'cisco-catalyst-9500-24y4c',
		u_height: 1,
		manufacturer: 'Cisco',
		model: 'Catalyst 9500-24Y4C',
		is_full_depth: true,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'cisco-catalyst-9500-48y4c',
		u_height: 1,
		manufacturer: 'Cisco',
		model: 'Catalyst 9500-48Y4C',
		is_full_depth: true,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},

	// ============================================
	// Catalyst 3650 Series Switches (Homelab Popular)
	// ============================================
	{
		slug: 'cisco-catalyst-3650-24ts',
		u_height: 1,
		manufacturer: 'Cisco',
		model: 'Catalyst 3650-24TS',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'cisco-catalyst-3650-48ts',
		u_height: 1,
		manufacturer: 'Cisco',
		model: 'Catalyst 3650-48TS',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},

	// ============================================
	// Catalyst 2960-X Series Switches (Homelab Popular)
	// ============================================
	{
		slug: 'cisco-catalyst-2960x-24ps-l',
		u_height: 1,
		manufacturer: 'Cisco',
		model: 'Catalyst 2960X-24PS-L',
		is_full_depth: false,
		airflow: 'front-to-rear',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'cisco-catalyst-2960x-48fps-l',
		u_height: 1,
		manufacturer: 'Cisco',
		model: 'Catalyst 2960X-48FPS-L',
		is_full_depth: false,
		airflow: 'front-to-rear',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},

	// ============================================
	// Nexus 9000 Series Switches
	// ============================================
	{
		slug: 'cisco-nexus-9336c-fx2',
		u_height: 1,
		manufacturer: 'Cisco',
		model: 'Nexus 9336C-FX2',
		is_full_depth: true,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'cisco-nexus-93180yc-fx',
		u_height: 1,
		manufacturer: 'Cisco',
		model: 'Nexus 93180YC-FX',
		is_full_depth: true,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'cisco-nexus-9372px',
		u_height: 1,
		manufacturer: 'Cisco',
		model: 'Nexus 9372PX',
		is_full_depth: true,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},

	// ============================================
	// ISR 4000 Series Routers
	// ============================================
	{
		slug: 'cisco-isr4331',
		u_height: 1,
		manufacturer: 'Cisco',
		model: 'ISR4331',
		is_full_depth: true,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'cisco-isr4351',
		u_height: 2,
		manufacturer: 'Cisco',
		model: 'ISR4351',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'cisco-isr4431',
		u_height: 2,
		manufacturer: 'Cisco',
		model: 'ISR4431',
		is_full_depth: true,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},

	// ============================================
	// ASR 1000 Series Routers
	// ============================================
	{
		slug: 'cisco-asr1001-x',
		u_height: 1,
		manufacturer: 'Cisco',
		model: 'ASR1001-X',
		is_full_depth: true,
		airflow: 'front-to-rear',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'cisco-asr1002-x',
		u_height: 2,
		manufacturer: 'Cisco',
		model: 'ASR1002-X',
		is_full_depth: true,
		airflow: 'front-to-rear',
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},

	// ============================================
	// ASA 5500-X Series Firewalls
	// ============================================
	{
		slug: 'cisco-asa5516-x',
		u_height: 1,
		manufacturer: 'Cisco',
		model: 'ASA5516-X',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'cisco-asa5525-x',
		u_height: 1,
		manufacturer: 'Cisco',
		model: 'ASA5525-X',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'cisco-asa5545-x',
		u_height: 1,
		manufacturer: 'Cisco',
		model: 'ASA5545-X',
		is_full_depth: true,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'cisco-asa5555-x',
		u_height: 1,
		manufacturer: 'Cisco',
		model: 'ASA5555-X',
		is_full_depth: true,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},

	// ============================================
	// Firepower Series (Next-Gen Firewalls)
	// ============================================
	{
		slug: 'cisco-firepower-1010',
		u_height: 1,
		manufacturer: 'Cisco',
		model: 'Firepower 1010',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},
	{
		slug: 'cisco-firepower-2110',
		u_height: 1,
		manufacturer: 'Cisco',
		model: 'Firepower 2110',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.network,
		category: 'network'
	},

	// ============================================
	// UCS C-Series Rack Servers
	// ============================================
	{
		slug: 'cisco-ucs-c220-m5sx',
		u_height: 1,
		manufacturer: 'Cisco',
		model: 'UCS C220 M5SX',
		is_full_depth: true,
		airflow: 'front-to-rear',
		colour: CATEGORY_COLOURS.server,
		category: 'server'
	},
	{
		slug: 'cisco-ucs-c240-m5sx',
		u_height: 2,
		manufacturer: 'Cisco',
		model: 'UCS C240 M5SX',
		is_full_depth: true,
		airflow: 'front-to-rear',
		colour: CATEGORY_COLOURS.server,
		category: 'server'
	}
];
