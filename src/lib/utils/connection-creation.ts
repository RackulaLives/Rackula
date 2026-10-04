/**
 * Connection Creation Handler (#1932)
 * Pure routing logic for the desktop click-to-click connection creation
 * workflow: click a source port, then click a target port to create a
 * connection. Mirrors rack-interaction-handlers.ts's placement handlers -
 * dependencies are injected via a context object so this is testable without
 * mounting any component.
 *
 * Validation split:
 * - Self-connection, port-not-found, port-already-in-use, duplicate
 *   connection, and category/type mismatch (e.g. XLR to HDMI) all come from
 *   the connection store's own validateConnection() (#369) - not
 *   reimplemented here.
 * - Direction mismatch (e.g. output to output) has no store-side check: the
 *   store's Connection model does not carry direction, only PlacedPort and
 *   InterfaceTemplate do, and PortClickInfo already gives this handler both
 *   endpoints' PlacedPort/InterfaceTemplate pairs. Computed here instead,
 *   using the same override-then-template-then-inferred resolution
 *   connection rendering uses (resolveConnectionPortDirection).
 * - Signal mismatch (e.g. mic level to line level, #1936) is computed here for
 *   the same reason: InterfaceTemplate.signal_type is not reachable from the
 *   store's PlacedPort-only validation.
 */

import type {
  InterfaceTemplate,
  PlacedPort,
  PortClickInfo,
  SignalType,
} from "$lib/types";
import type {
  ConnectionValidationResult,
  CreateConnectionInput,
} from "$lib/stores/connection.svelte";
import type { Connection } from "$lib/types";
import {
  resolveConnectionPortDirection,
  resolveConnectionPortSignal,
} from "$lib/utils/connection-path";
import { getPortCategory, getSignalLabel } from "$lib/utils/port-utils";

/** The subset of the connection-creation store's API the handler needs. */
export interface ConnectionCreationStoreLike {
  readonly isCreating: boolean;
  readonly sourcePortId: string | null;
  readonly sourceIface: InterfaceTemplate | null;
  readonly sourcePort: PlacedPort | null;
  startConnection: (
    portId: string,
    iface: InterfaceTemplate,
    port: PlacedPort | null,
  ) => void;
  cancelConnection: () => void;
  completeConnection: (summary?: string) => void;
}

export interface ConnectionCreationHandlerContext {
  connectionCreation: ConnectionCreationStoreLike;
  /**
   * Whether tap-to-place is currently armed (placementStore.isPlacing).
   * Placement owns the click gesture while armed (it already suppresses
   * device selection the same way, see RackDevice.svelte's handlePointerUp),
   * so a port click is a no-op here rather than also arming connection
   * creation and leaving both modes active at once.
   */
  isPlacementActive: boolean;
  validateConnection: (
    input: CreateConnectionInput,
  ) => ConnectionValidationResult;
  addConnection: (
    input: CreateConnectionInput,
  ) => { connection: Connection } | { errors: string[] };
  showToast: (message: string, type: "error" | "warning") => void;
}

/**
 * Warn when both endpoints resolve to the same non-bidirectional direction
 * (output-to-output, or input-to-input). Direction is resolved the same way
 * connection rendering resolves it for its arrows
 * (resolveConnectionPortDirection: PlacedPort.direction override, then
 * InterfaceTemplate.direction, then the type-inferred default), so a warning
 * here always agrees with what the user sees drawn. Undirected AV types (no
 * default, e.g. an XLR port with no explicit direction set anywhere) and
 * bidirectional ports never trigger this: there is nothing to mismatch.
 * @returns A warning message, or null when directions are compatible.
 */
export function getDirectionMismatchWarning(
  aPort: PlacedPort | undefined,
  aIface: InterfaceTemplate,
  bPort: PlacedPort | undefined,
  bIface: InterfaceTemplate,
): string | null {
  const aDirection = resolveConnectionPortDirection(aPort, aIface);
  const bDirection = resolveConnectionPortDirection(bPort, bIface);
  if (!aDirection || !bDirection) return null;
  if (aDirection === "bidirectional" || bDirection === "bidirectional") {
    return null;
  }
  if (aDirection === bDirection) {
    return `Both ports are ${aDirection}s: signal direction mismatch`;
  }
  return null;
}

const SIGNAL_FAMILIES: Record<SignalType, string> = {
  "analog-audio-mic": "analog-audio",
  "analog-audio-line": "analog-audio",
  "analog-audio-speaker": "analog-audio",
  "digital-audio-aes3": "digital-audio",
  "digital-audio-dante": "digital-audio",
  "digital-audio-avb": "digital-audio",
  "digital-video-hdmi": "video",
  "digital-video-sdi": "video",
  "clock-word": "clock",
  "control-midi": "control",
};

/**
 * Warn when the two endpoints carry different signals (#1936). Each signal is
 * resolved by resolveConnectionPortSignal (override, then template, then
 * inferred from type and direction).
 *
 * - Either side has no signal, or both carry the same one: no warning.
 * - Different families (e.g. analog audio to video): warning.
 * - Same family, different signal: warning only when both sides are explicit.
 *   Inference alone would warn on every ordinary patch, since an XLR input
 *   infers mic level and an XLR output infers line level.
 * - A port category mismatch is already reported by the store's
 *   validateConnection, so no signal warning is added on top of it.
 * @returns A warning message, or null when signals are compatible.
 */
export function getSignalMismatchWarning(
  aPort: PlacedPort | undefined,
  aIface: InterfaceTemplate,
  bPort: PlacedPort | undefined,
  bIface: InterfaceTemplate,
): string | null {
  const a = resolveConnectionPortSignal(aPort, aIface);
  const b = resolveConnectionPortSignal(bPort, bIface);
  if (!a || !b || a.signal === b.signal) return null;
  if (
    getPortCategory(aPort?.type ?? aIface.type) !==
    getPortCategory(bPort?.type ?? bIface.type)
  ) {
    return null;
  }
  const sameFamily = SIGNAL_FAMILIES[a.signal] === SIGNAL_FAMILIES[b.signal];
  if (sameFamily && !(a.explicit && b.explicit)) return null;
  return `Signal types do not match: ${getSignalLabel(a.signal)} vs ${getSignalLabel(b.signal)}`;
}

/**
 * Route a port click through connection-creation mode.
 *
 * State machine (mirrors tap-to-place's arm/complete/cancel shape):
 * - Placement mode armed -> no-op. Placement owns the click gesture until
 *   it is placed or cancelled; arming connection creation on top of it would
 *   leave two global modes active at once with conflicting cancel paths.
 * - Idle + click a port with an id -> arm the mode with that port as source.
 * - Armed + click any port (including the source port again) -> validate,
 *   then create. Clicking the same port twice reaches the store's own
 *   self-connection check (ConnectionSchema refine, #369) rather than a
 *   bespoke short-circuit here, so its "Cannot connect a port to itself"
 *   message surfaces as the cancellation's feedback instead of a silent
 *   no-op.
 * - A validation error surfaces as a toast and exits the mode (the target the
 *   user just clicked was invalid; staying armed on it would repeat the same
 *   error). A non-blocking warning (category/type/direction mismatch) still
 *   creates the connection and surfaces as its own toast.
 * - A port with no id (a legacy port with no
 *   PlacedPort match, #3089) has no click target to begin with in practice;
 *   this is a defensive no-op, not a UI state.
 */
export function handleConnectionPortClick(
  info: PortClickInfo,
  ctx: ConnectionCreationHandlerContext,
): void {
  if (ctx.isPlacementActive) return;

  const { portId, iface, port } = info;
  if (!portId) return;

  const { connectionCreation } = ctx;

  if (!connectionCreation.isCreating) {
    connectionCreation.startConnection(portId, iface, port ?? null);
    return;
  }

  const sourcePortId = connectionCreation.sourcePortId;
  const sourceIface = connectionCreation.sourceIface;
  if (!sourcePortId || !sourceIface) {
    // Defensive: armed with no recorded source (should not happen); start
    // clean from this click rather than attempt an invalid connection.
    connectionCreation.startConnection(portId, iface, port ?? null);
    return;
  }
  const sourcePort = connectionCreation.sourcePort;

  const input: CreateConnectionInput = {
    a_port_id: sourcePortId,
    b_port_id: portId,
  };

  const validation = ctx.validateConnection(input);
  if (!validation.valid) {
    ctx.showToast(validation.errors.join("; "), "error");
    connectionCreation.cancelConnection();
    return;
  }

  const warnings = [
    ...validation.warnings,
    getDirectionMismatchWarning(
      sourcePort ?? undefined,
      sourceIface,
      port,
      iface,
    ),
    getSignalMismatchWarning(sourcePort ?? undefined, sourceIface, port, iface),
  ].filter((warning) => warning !== null);

  const result = ctx.addConnection(input);
  if ("errors" in result) {
    // TOCTOU guard: validateConnection() passed but addConnection() still
    // failed. Not expected in the synchronous store, but never leave the UI
    // stuck armed on a target that a failed attempt already consumed.
    ctx.showToast(result.errors.join("; "), "error");
    connectionCreation.cancelConnection();
    return;
  }

  if (warnings.length > 0) {
    ctx.showToast(warnings.join("; "), "warning");
  }
  connectionCreation.completeConnection();
}
