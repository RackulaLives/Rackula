/**
 * Device-search projection for the command palette's "Add device..." sub-mode
 * (#2214). The palette pushes an in-place device-search sub-page; this seam
 * composes the same device library the Devices sidebar uses (starter library,
 * brand packs, and custom/placed device types) and reuses searchDevices (Fuse.js)
 * and filterPaletteDevicesByRackWidth so the sub-page never owns its own search
 * or width logic. Pure and unit-testable; the component supplies the live source
 * arrays and active-rack width.
 */
import type { DeviceType } from "$lib/types";
import {
  searchDevices,
  filterPaletteDevicesByRackWidth,
} from "$lib/utils/deviceFilters";

/** Live device sources the palette device-search reads, supplied by the component. */
export interface PaletteDeviceSources {
  /** Starter library devices. */
  starter: DeviceType[];
  /** Devices contributed by brand packs. */
  brandPackDevices: DeviceType[];
  /** Custom/placed device types from the active layout. */
  customDevices: DeviceType[];
}

/**
 * Compose the searchable device pool: custom devices win over starter/brand
 * entries that share a slug (the sidebar shadows starters with custom types of
 * the same slug), so each slug yields exactly one row.
 */
function composeLibrary(sources: PaletteDeviceSources): DeviceType[] {
  const bySlug = new Map<string, DeviceType>();
  for (const device of sources.starter) bySlug.set(device.slug, device);
  for (const device of sources.brandPackDevices)
    bySlug.set(device.slug, device);
  // Custom devices are applied last so they shadow same-slug starter/brand rows.
  for (const device of sources.customDevices) bySlug.set(device.slug, device);
  return [...bySlug.values()];
}

/**
 * Project the device-search results for the palette sub-page. Filters the
 * composed library by active rack width (when compatibleOnly is set) then runs
 * the shared fuzzy search. An empty query returns the width-filtered library.
 */
export function searchPaletteDevices(
  sources: PaletteDeviceSources,
  query: string,
  activeRackWidth: number,
  compatibleOnly: boolean,
): DeviceType[] {
  const library = composeLibrary(sources);
  const widthFiltered = filterPaletteDevicesByRackWidth(
    library,
    activeRackWidth,
    compatibleOnly,
  );
  return searchDevices(widthFiltered, query);
}
