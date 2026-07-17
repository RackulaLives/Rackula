/**
 * Keyboard-placement controller (#106).
 *
 * Wires the keyboard placement flow over the placement store and the layout
 * store. While a device is armed (placement mode) it owns the arrow / Tab /
 * Enter / Escape keys:
 *
 *   - Up / Down       move the U-slot cursor within the focused rack
 *   - Tab / Shift+Tab move between racks (Left / Right are aliases)
 *   - Enter / Space   place the armed device at the cursor
 *   - Escape          cancel placement with no side effects
 *
 * The cursor only lands on a valid (placeable) slot, mirroring how the drag
 * preview snaps. The controller drives the placement store's cursor and
 * announcements; the rack preview and the SR announcer read that store, so this
 * module never touches the DOM. The navigation maths lives in the pure
 * `placement-keyboard` helpers so it stays unit-testable.
 */

import type { Rack, DeviceType, DeviceFace } from "$lib/types";
import { requiresChassisBay } from "./collision";
import {
  validStartPositions,
  initialCursorPosition,
  nextCursorPosition,
  pickUpAnnouncement,
  pickUpNoSpaceAnnouncement,
  pickUpNeedsChassisAnnouncement,
  positionAnnouncement,
  noSpaceAnnouncement,
  singleRackAnnouncement,
  noRacksAnnouncement,
  placedAnnouncement,
} from "./placement-keyboard";

import { NO_ROOM_MESSAGE } from "$lib/constants/toast-messages";

export interface PlacementKeyboardDeps {
  /** All racks in canvas order. */
  getRacks: () => Rack[];
  /** Device library for collision lookups. */
  getDeviceLibrary: () => DeviceType[];
  /** The currently focused rack id (drives which rack the cursor lives in). */
  getActiveRackId: () => string | null;
  /** Placement store state. */
  isPlacing: () => boolean;
  getPendingDevice: () => DeviceType | null;
  getTargetFace: () => DeviceFace;
  getCursorPosition: () => number | null;
  /** Placement store actions. */
  setActiveRack: (id: string) => void;
  setCursor: (rackId: string, position: number | null) => void;
  announce: (text: string) => void;
  cancelPlacement: () => void;
  /** Silently exit placement mode (no "cancelled" announcement). */
  abandonPlacement: () => void;
  /** Place the armed device. Returns true on success. */
  placeDevice: (
    rackId: string,
    slug: string,
    position: number,
    face: DeviceFace,
  ) => boolean;
  completePlacement: (summary: string) => void;
  /**
   * Show a visible "no room" cue matching the drag path's toast. Optional so
   * callers that don't wire a toast store (e.g. tests) still work; the
   * aria-live announcement always fires regardless.
   */
  showToast?: (message: string) => void;
  /** Called after a successful placement (e.g. to re-fit the canvas). */
  onPlaced?: () => void;
  /** Called when the focused rack changes, so focus can follow it (e.g. on Tab). */
  onFocusRack?: (rackId: string) => void;
}

/** Collapse the rack's view filter to a placement face (front/rear). */
function resolveFace(face: DeviceFace): DeviceFace {
  return face === "rear" ? "rear" : "front";
}

/**
 * Move keyboard focus to a rack container by its `data-rack-id`. Used by the
 * palette pick-up (so the next Enter places on the rack, not the palette item)
 * and the Tab rack-switch (so the focus ring follows the cursor). The rack
 * element is already in the DOM, so this runs synchronously. No-op if not found.
 * `CSS.escape` guards against ids that carry selector-special characters (e.g.
 * imported or legacy layouts), which would otherwise throw in querySelector.
 */
export function focusRackContainer(rackId: string): void {
  document
    .querySelector<HTMLElement>(`[data-rack-id="${CSS.escape(rackId)}"]`)
    ?.focus();
}

/** Deps needed to prime the keyboard cursor (a subset of the controller deps). */
export type PlacementPrimeDeps = Pick<
  PlacementKeyboardDeps,
  | "getRacks"
  | "getDeviceLibrary"
  | "getActiveRackId"
  | "getTargetFace"
  | "setActiveRack"
  | "setCursor"
  | "announce"
  | "abandonPlacement"
>;

function resolveActiveRack(deps: PlacementPrimeDeps): Rack | null {
  const id = deps.getActiveRackId();
  if (!id) return deps.getRacks()[0] ?? null;
  return deps.getRacks().find((r) => r.id === id) ?? null;
}

function validFor(
  deps: PlacementPrimeDeps,
  rack: Rack,
  device: DeviceType,
): number[] {
  return validStartPositions(
    rack,
    deps.getDeviceLibrary(),
    device,
    resolveFace(deps.getTargetFace()),
  );
}

/**
 * Seed the keyboard cursor when placement begins. Sets the focused rack as the
 * target, picks its first valid slot, and announces both the pick-up
 * instructions and the initial position. Shared by the controller and the
 * desktop palette pick-up so both arm an identical, navigable cursor.
 */
export function primeKeyboardPlacement(
  deps: PlacementPrimeDeps,
  device: DeviceType,
): void {
  // A device that can only mount inside a chassis bay (a chassis child, or a
  // half-width device with no rail carrier) has no rail target in any rack.
  // State the honest requirement and exit placement mode rather than arming a
  // futile cursor the user could only Escape out of (#2854).
  if (requiresChassisBay(device)) {
    deps.abandonPlacement();
    deps.announce(pickUpNeedsChassisAnnouncement(device));
    return;
  }

  const rack = resolveActiveRack(deps);
  if (!rack) {
    // Armed with no rack to place into: say so rather than fall silent.
    deps.announce(noRacksAnnouncement(device));
    return;
  }
  deps.setActiveRack(rack.id);
  const positions = validFor(deps, rack, device);
  const start = initialCursorPosition(positions);
  if (start == null) {
    deps.announce(pickUpNoSpaceAnnouncement(device, rack.name));
    return;
  }
  deps.setCursor(rack.id, start);
  // One combined utterance: mode + instructions + seeded slot. A separate
  // instructions-then-position pair would be collapsed by the live region.
  deps.announce(pickUpAnnouncement(device, rack.name, start));
}

export function createPlacementKeyboardController(deps: PlacementKeyboardDeps) {
  function activeRack(): Rack | null {
    return resolveActiveRack(deps);
  }

  function primeCursor(device: DeviceType): void {
    primeKeyboardPlacement(deps, device);
  }

  function moveCursor(device: DeviceType, direction: 1 | -1): void {
    const rack = activeRack();
    if (!rack) return;
    const positions = validFor(deps, rack, device);
    const current = deps.getCursorPosition();
    const next = nextCursorPosition(positions, current, direction);
    if (next == null) {
      deps.announce(noSpaceAnnouncement(rack.name));
      return;
    }
    deps.setCursor(rack.id, next);
    // At a boundary nextCursorPosition returns the same slot. Announce a
    // distinct "no further slots" cue so the live region text changes (an
    // identical string would not be re-read) and the user knows they hit an end.
    deps.announce(
      next === current
        ? positionAnnouncement(rack.name, next, true)
        : positionAnnouncement(rack.name, next),
    );
  }

  /** Switch the focused rack by `step` (+1 next, -1 previous), wrapping. */
  function switchRack(device: DeviceType, step: 1 | -1): void {
    const racks = deps.getRacks();
    if (racks.length === 0) {
      deps.announce(noRacksAnnouncement(device));
      return;
    }
    if (racks.length === 1) {
      // Tab is consumed during placement (so focus stays on the canvas), so a
      // single-rack layout would otherwise swallow it silently. Announce instead.
      deps.announce(singleRackAnnouncement());
      return;
    }
    const currentId = deps.getActiveRackId() ?? racks[0]?.id;
    const currentIndex = racks.findIndex((r) => r.id === currentId);
    const nextIndex = (currentIndex + step + racks.length) % racks.length;
    const nextRack = racks[nextIndex];
    if (!nextRack) return;
    deps.setActiveRack(nextRack.id);
    deps.onFocusRack?.(nextRack.id);
    // Keep the cursor near the same height across the switch.
    const positions = validFor(deps, nextRack, device);
    const start = initialCursorPosition(positions, deps.getCursorPosition());
    // Point the cursor at the new rack either way (start may be null for a full
    // rack) so targetRackId and cursorPosition stay consistent with the active
    // rack; a null cursor shows no preview and the user can Tab on to find space.
    deps.setCursor(nextRack.id, start);
    deps.announce(
      start == null
        ? noSpaceAnnouncement(nextRack.name)
        : positionAnnouncement(nextRack.name, start),
    );
  }

  function place(device: DeviceType): void {
    const rack = activeRack();
    const position = deps.getCursorPosition();
    if (!rack) return;
    if (position == null) {
      // No valid slot in this rack (e.g. it is full). Tell the user rather than
      // letting Enter silently do nothing.
      deps.announce(noSpaceAnnouncement(rack.name));
      deps.showToast?.(NO_ROOM_MESSAGE);
      return;
    }
    const face = resolveFace(deps.getTargetFace());
    const success = deps.placeDevice(rack.id, device.slug, position, face);
    if (!success) {
      deps.announce(noSpaceAnnouncement(rack.name));
      deps.showToast?.(NO_ROOM_MESSAGE);
      return;
    }
    deps.completePlacement(placedAnnouncement(device, rack.name, position));
    deps.onPlaced?.();
  }

  /**
   * Handle a keydown while placement is armed. Returns true when the event was
   * consumed (the caller should stop further handling and preventDefault).
   */
  function handleKeyDown(event: KeyboardEvent): boolean {
    if (!deps.isPlacing()) return false;
    const device = deps.getPendingDevice();
    if (!device) return false;

    // Escape always cancels, even before the cursor is primed.
    if (event.key === "Escape") {
      deps.cancelPlacement();
      return true;
    }

    const navOrPlaceKeys = [
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Tab",
      "Enter",
      " ",
    ];

    // The cursor is primed on a keyboard pick-up. A pointer pick-up (mobile
    // tap-to-place) leaves it null and shows no preview, and we don't hijack its
    // keys unless one of ours arrives. A device armed via the command palette is
    // also null until the first key. On that first key, prime the cursor: an
    // up/down arrow's only job is then to establish it (priming already
    // announced the seeded slot, so don't also step away from a slot the user
    // has not heard yet); Tab / Left / Right / Enter fall through to act, so a
    // full active rack can still be Tabbed away from.
    if (deps.getCursorPosition() == null) {
      if (!navOrPlaceKeys.includes(event.key)) return false;
      primeCursor(device);
      // Priming may have exited placement mode (e.g. a chassis child has no rail
      // target): consume the key and stop rather than fall through to place(),
      // which would re-announce a misleading "No space" (#2854).
      if (!deps.isPlacing()) return true;
      if (event.key === "ArrowUp" || event.key === "ArrowDown") return true;
    }

    switch (event.key) {
      case "ArrowUp":
        moveCursor(device, 1);
        return true;
      case "ArrowDown":
        moveCursor(device, -1);
        return true;
      case "ArrowRight":
        switchRack(device, 1);
        return true;
      case "ArrowLeft":
        switchRack(device, -1);
        return true;
      case "Tab":
        switchRack(device, event.shiftKey ? -1 : 1);
        return true;
      case "Enter":
      case " ":
        place(device);
        return true;
      default:
        return false;
    }
  }

  return { handleKeyDown };
}
