/**
 * Anchor registry (#3374)
 *
 * Canvas elements the verb bar can point at register themselves here under a
 * key, so the overlay resolves its anchor with a map lookup instead of an
 * attribute querySelector over the whole canvas subtree. At 100 racks that
 * subtree is ~80,000 SVG nodes.
 */
import type { Attachment } from "svelte/attachments";

/** The rack face a device anchor renders in. */
export type AnchorFace = "front" | "rear";

/** The selection fields that decide which element the verb bar anchors to. */
export interface AnchorSelection {
  deviceId: string | null;
  deviceFace: AnchorFace | null;
  rackId: string | null;
  isDeviceSelected: boolean;
  isRackOrGroupSelected: boolean;
}

const anchors = new Map<string, Element[]>();

/** Registry key for a placed device's element in one face view. */
export function deviceAnchorKey(deviceId: string, face: AnchorFace): string {
  return `device:${deviceId}:${face}`;
}

/** Registry key for a rack's container element. */
export function rackAnchorKey(rackId: string): string {
  return `rack:${rackId}`;
}

/** Register an element under a key. Returns the unregister function. */
export function registerAnchor(key: string, el: Element): () => void {
  const list = anchors.get(key);
  if (list) list.push(el);
  else anchors.set(key, [el]);
  return () => {
    const current = anchors.get(key);
    if (!current) return;
    const i = current.indexOf(el);
    if (i >= 0) current.splice(i, 1);
    if (current.length === 0) anchors.delete(key);
  };
}

/** Svelte attachment that registers the node under `key` while mounted. */
export function anchor(key: string | null): Attachment {
  return (node) => (key ? registerAnchor(key, node) : undefined);
}

/**
 * The connected element registered under `key`. When several share a key (a
 * bayed group renders each member in a front row and a rear row), the first
 * in document order wins, matching what querySelector used to return.
 */
export function lookupAnchor(key: string): Element | null {
  let best: Element | null = null;
  for (const el of anchors.get(key) ?? []) {
    if (!el.isConnected) continue;
    if (
      !best ||
      best.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING
    ) {
      best = el;
    }
  }
  return best;
}

/**
 * Registry keys to try, in order, for the current selection. A full-depth
 * device renders in both the front and rear views under one id, so the bar
 * anchors to the copy in the view the device was clicked (#2646) and falls
 * back to the front copy, then the rear, when that face is unknown (keyboard
 * or palette selection). A rack or bayed-group selection anchors to the rack.
 */
export function anchorKeysForSelection(sel: AnchorSelection): string[] {
  if (sel.isDeviceSelected && sel.deviceId) {
    const keys: string[] = [];
    if (sel.deviceFace)
      keys.push(deviceAnchorKey(sel.deviceId, sel.deviceFace));
    for (const face of ["front", "rear"] as const) {
      const key = deviceAnchorKey(sel.deviceId, face);
      if (!keys.includes(key)) keys.push(key);
    }
    return keys;
  }
  if (sel.isRackOrGroupSelected && sel.rackId) {
    return [rackAnchorKey(sel.rackId)];
  }
  return [];
}

/** Resolve the anchor element for a list of candidate keys. */
export function resolveAnchor(
  keys: string[],
  lookup: (key: string) => Element | null = lookupAnchor,
): Element | null {
  for (const key of keys) {
    const el = lookup(key);
    if (el) return el;
  }
  return null;
}
