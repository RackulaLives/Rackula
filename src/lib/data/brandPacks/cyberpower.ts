/**
 * CyberPower Brand Pack
 * Pre-defined device types for CyberPower rack-mountable devices
 * Source: NetBox community devicetype-library
 */

import type { DeviceType } from '$lib/types';
import { CATEGORY_COLOURS } from '$lib/types/constants';

/**
 * CyberPower device definitions (10 devices)
 */
export const cyberpowerDevices: DeviceType[] = [
	{
		slug: 'cyberpower-cps-1220rms',
		u_height: 1,
		manufacturer: 'CyberPower',
		model: 'CPS-1220RMS',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.power,
		category: 'power'
	},
	{
		slug: 'cyberpower-cps1215rm',
		u_height: 1,
		manufacturer: 'CyberPower',
		model: 'CPS1215RM',
		is_full_depth: false,
		airflow: 'passive',
		colour: CATEGORY_COLOURS.power,
		category: 'power'
	},
	{
		slug: 'cyberpower-cps1215rms',
		u_height: 1,
		manufacturer: 'CyberPower',
		model: 'CPS1215RMS',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.power,
		category: 'power'
	},
	{
		slug: 'cyberpower-or1000lcdrm1u',
		u_height: 1,
		manufacturer: 'CyberPower',
		model: 'OR1000LCDRM1U',
		colour: CATEGORY_COLOURS.power,
		category: 'power'
	},
	{
		slug: 'cyberpower-or1500lcdrtxl2u',
		u_height: 2,
		manufacturer: 'CyberPower',
		model: 'OR1500LCDRTXL2U',
		colour: CATEGORY_COLOURS.power,
		category: 'power'
	},
	{
		slug: 'cyberpower-or2200lcdrt2u',
		u_height: 2,
		manufacturer: 'CyberPower',
		model: 'OR2200LCDRT2U',
		colour: CATEGORY_COLOURS.power,
		category: 'power'
	},
	{
		slug: 'cyberpower-or600elcdrm1u',
		u_height: 1,
		manufacturer: 'CyberPower',
		model: 'OR600ELCDRM1U',
		is_full_depth: false,
		airflow: 'passive',
		colour: CATEGORY_COLOURS.power,
		category: 'power'
	},
	{
		slug: 'cyberpower-pdu15m2f12r',
		u_height: 1,
		manufacturer: 'CyberPower',
		model: 'PDU15M2F12R',
		is_full_depth: false,
		colour: CATEGORY_COLOURS.power,
		category: 'power'
	},
	{
		slug: 'cyberpower-pdu20bhviec12r',
		u_height: 1,
		manufacturer: 'CyberPower',
		model: 'PDU20BHVIEC12R',
		is_full_depth: false,
		airflow: 'passive',
		colour: CATEGORY_COLOURS.power,
		category: 'power'
	},
	{
		slug: 'cyberpower-pdu81005',
		u_height: 1,
		manufacturer: 'CyberPower',
		model: 'PDU81005',
		is_full_depth: false,
		airflow: 'passive',
		colour: CATEGORY_COLOURS.power,
		category: 'power'
	}
];
