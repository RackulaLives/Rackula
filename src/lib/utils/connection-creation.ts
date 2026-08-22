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
 */

import type { InterfaceTemplate, PlacedPort, PortClickInfo } from "$lib/types";
import type {
  ConnectionValidationResult,
  CreateConnectionInput,
} from "$lib/stores/connection.svelte";
import type { Connection } from "$lib/types";
import { resolveConnectionPortDirection } from "$lib/utils/connection-path";

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
 * - A port with no id (grouped/high-density device, or a legacy port with no
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

  const directionWarning = getDirectionMismatchWarning(
    sourcePort ?? undefined,
    sourceIface,
    port,
    iface,
  );
  const warnings = directionWarning
    ? [...validation.warnings, directionWarning]
    : validation.warnings;

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
