import type { DeviceType, Rack } from "$lib/types";
import { requiresChassisBay } from "$lib/utils/carrier-rules";
import { findDeviceType } from "$lib/utils/device-lookup";

export interface MountRecommendation {
  slugs: string[];
  names: string[];
  summary: string;
  requirement: string;
}

const DEFAULT_RECOMMENDATIONS: Record<string, string[]> = {
  "lenovo-thinkcentre-m720q-tiny": ["deskpi-rackmate-tiny-1u-mount"],
  "ubiquiti-unifi-cloud-gateway-max": [
    "deskpi-rackmate-1u-dual-utility-tray",
    "deskpi-rackmate-1u-utility-tray",
  ],
  "netgear-gs305": [
    "deskpi-rackmate-1u-dual-utility-tray",
    "deskpi-rackmate-1u-utility-tray",
  ],
  "pecron-e300lfp": ["deskpi-rackmate-4u-power-station-tray"],
  "ecoflow-river-3": ["deskpi-rackmate-3u-power-station-tray"],
  "ecoflow-river-3-plus": ["deskpi-rackmate-4u-power-station-tray"],
};

interface RackulaFitFields {
  recommended_mount_slugs?: unknown;
  recommended_tray_slugs?: unknown;
}

function rackulaFit(device: DeviceType): RackulaFitFields {
  const fit = device.custom_fields?.rackula_fit;
  return fit && typeof fit === "object" ? (fit as RackulaFitFields) : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function getRecommendedMountSlugs(device: DeviceType): string[] {
  const fit = rackulaFit(device);
  const explicit = [
    ...stringArray(fit.recommended_mount_slugs),
    ...stringArray(fit.recommended_tray_slugs),
  ];
  if (explicit.length > 0) return [...new Set(explicit)];
  return DEFAULT_RECOMMENDATIONS[device.slug] ?? [];
}

export function getMountRecommendation(
  device: DeviceType,
  rackWidth: Rack["width"] | number,
  deviceLibrary: DeviceType[],
): MountRecommendation | null {
  if (!requiresChassisBay(device, rackWidth as Rack["width"])) return null;

  const slugs = getRecommendedMountSlugs(device);
  const names = slugs
    .map((slug) => findDeviceType(slug, deviceLibrary))
    .filter((match): match is DeviceType => !!match)
    .map((match) => match.model ?? match.slug);

  const name = device.model ?? device.slug;
  const summary =
    names.length > 0
      ? `Requires bay: use ${names.join(" or ")}`
      : "Requires bay: place in a compatible mount or tray";

  return {
    slugs,
    names,
    summary,
    requirement:
      names.length > 0
        ? `${name} must be placed in a chassis bay; use ${names.join(" or ")}.`
        : `${name} must be placed in a chassis bay or compatible tray.`,
  };
}
