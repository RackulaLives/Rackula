/**
 * Layout preview cache
 *
 * Backs the cached mini-renders shown per row in the Layouts sidebar tab
 * (#2083). A preview is a small SVG render of a layout that doubles as a thumb,
 * regenerated only when the layout's render-affecting content changes.
 *
 * Two pure pieces:
 *  - `layoutPreviewKey` derives a stable cache key from the fields that affect
 *    the render (racks, device types, groups). Anything else, including the
 *    layout name and display mode (previews always render in label mode), is
 *    excluded so a rename never invalidates the thumbnail.
 *  - `createLayoutPreviewCache` is a bounded, in-memory LRU keyed by tab id. It
 *    is session-only: durable persistence of previews belongs to the
 *    browser-mode storage schema slice (#2080) and is intentionally not built
 *    here.
 */

import type { Layout, Rack, DeviceType, RackGroup } from "$lib/types";

/**
 * Derive a stable cache key for a layout's preview.
 *
 * The key is a deterministic serialization of only the render-affecting
 * fields. Two layouts that render identically share a key; any edit that would
 * change the rendered image (placing or moving a device, resizing a rack,
 * recolouring a device type) changes it. The layout
 * name is deliberately excluded: it is shown as the row's text label, not in
 * the render, so renaming must not throw the cached thumbnail away.
 */
export function layoutPreviewKey(layout: Layout): string {
  const racks = (layout.racks ?? []).map(rackKeyParts);
  const deviceTypes = (layout.device_types ?? []).map(deviceTypeKeyParts);
  const groups = (layout.rack_groups ?? []).map(groupKeyParts);

  return JSON.stringify({ racks, deviceTypes, groups });
}

function rackKeyParts(rack: Rack) {
  return {
    id: rack.id,
    height: rack.height,
    width: rack.width,
    starting_unit: rack.starting_unit,
    desc_units: rack.desc_units,
    show_rear: rack.show_rear,
    devices: rack.devices.map((d) => ({
      id: d.id,
      device_type: d.device_type,
      position: d.position,
      face: d.face,
      slot_position: d.slot_position,
      name: d.name,
      colour_override: d.colour_override,
    })),
  };
}

function deviceTypeKeyParts(device: DeviceType) {
  return {
    slug: device.slug,
    u_height: device.u_height,
    slot_width: device.slot_width,
    colour: device.colour,
    category: device.category,
  };
}

function groupKeyParts(group: RackGroup) {
  return {
    id: group.id,
    layout_preset: group.layout_preset,
    rack_ids: group.rack_ids,
  };
}

/** A bounded, in-memory LRU cache of rendered previews keyed by tab id. */
export interface LayoutPreviewCache {
  /** Return the cached SVG for a tab when its key still matches, else undefined. */
  get(tabId: string, key: string): string | undefined;
  /** Store a rendered SVG for a tab under the given content key. */
  set(tabId: string, key: string, svg: string): void;
  /** Drop a tab's entry (e.g. when its layout closes). */
  delete(tabId: string): void;
  /** Tab ids with a cached entry, so callers can prune closed tabs. */
  keys(): IterableIterator<string>;
  /** Number of cached entries. */
  readonly size: number;
}

interface CacheEntry {
  key: string;
  svg: string;
}

/**
 * Create a bounded preview cache.
 *
 * Entries are keyed by tab id and hold the content key they were rendered for,
 * so a stale render is never served after an edit. The cache is least-recently-
 * used: reading or writing a tab marks it most-recent, and when the entry count
 * exceeds `limit` the least-recently-used tab is evicted. A `Map` preserves
 * insertion order, which the eviction relies on.
 */
export function createLayoutPreviewCache(limit = 24): LayoutPreviewCache {
  const entries = new Map<string, CacheEntry>();

  function touch(tabId: string, entry: CacheEntry): void {
    entries.delete(tabId);
    entries.set(tabId, entry);
  }

  return {
    get(tabId, key) {
      const entry = entries.get(tabId);
      if (!entry || entry.key !== key) return undefined;
      touch(tabId, entry);
      return entry.svg;
    },
    set(tabId, key, svg) {
      touch(tabId, { key, svg });
      while (entries.size > limit) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
    },
    delete(tabId) {
      entries.delete(tabId);
    },
    keys() {
      // Snapshot the ids so a caller can delete entries while iterating.
      return [...entries.keys()][Symbol.iterator]();
    },
    get size() {
      return entries.size;
    },
  };
}
