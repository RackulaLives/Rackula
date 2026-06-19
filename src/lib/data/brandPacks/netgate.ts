/**
 * Netgate Brand Pack
 * Pre-defined device types for Netgate rack-mountable devices
 * Source: NetBox community devicetype-library
 */

import type { DeviceType } from "$lib/types";
import { CATEGORY_COLOURS } from "$lib/types/constants";

/**
 * Netgate device definitions (8 devices)
 */
export const netgateDevices: DeviceType[] = [
  {
    slug: "netgate-1100-security-gateway",
    u_height: 1,
    manufacturer: "Netgate",
    model: "1100 Security Gateway",
    is_full_depth: false,
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.firewall,
    category: "firewall",
  },
  {
    slug: "netgate-1537-security-gateway",
    u_height: 1,
    manufacturer: "Netgate",
    model: "1537 Security Gateway",
    is_full_depth: false,
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.firewall,
    category: "firewall",
  },
  {
    slug: "netgate-3100-security-gateway",
    u_height: 1,
    manufacturer: "Netgate",
    model: "3100 Security Gateway",
    is_full_depth: false,
    airflow: "passive",
    colour: CATEGORY_COLOURS.firewall,
    category: "firewall",
  },
  {
    slug: "netgate-4100-security-gateway",
    u_height: 1,
    manufacturer: "Netgate",
    model: "4100 Security Gateway",
    is_full_depth: false,
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.firewall,
    category: "firewall",
  },
  {
    slug: "netgate-6100-security-gateway",
    u_height: 1,
    manufacturer: "Netgate",
    model: "6100 Security Gateway",
    is_full_depth: false,
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.firewall,
    category: "firewall",
  },
  {
    slug: "netgate-7100-security-gateway",
    u_height: 1,
    manufacturer: "Netgate",
    model: "7100 Security Gateway",
    is_full_depth: false,
    colour: CATEGORY_COLOURS.firewall,
    category: "firewall",
  },
  {
    slug: "netgate-8200-max-pfsense-plus-security-gateway",
    u_height: 1,
    manufacturer: "Netgate",
    model: "8200 Max PFSense+ Security Gateway",
    is_full_depth: false,
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.firewall,
    category: "firewall",
  },
  {
    slug: "netgate-8300-security-gateway",
    u_height: 1,
    manufacturer: "Netgate",
    model: "8300 Security Gateway",
    is_full_depth: false,
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.firewall,
    category: "firewall",
  },
];
