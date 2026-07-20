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
 *   store's Connection model does not carry direction, only the
 *   InterfaceTemplate does, and PortClickInfo already gives this handler both
 *   endpoints' templates. Computed here instead.
 */

import type {
  InterfaceTemplate,
  PortClickInfo,
  PortDirection,
} from "$lib/types";
import type {
  ConnectionValidationResult,
  CreateConnectionInput,
} from "$lib/stores/connection.svelte";
import type { Connection } from "$lib/types";
import { inferDirection } from "$lib/utils/port-utils";

/** The subset of the connection-creation store's API the handler needs. */
export interface ConnectionCreationStoreLike {
  readonly isCreating: boolean;
  readonly sourcePortId: string | null;
  readonly sourceIface: InterfaceTemplate | null;
  startConnection: (portId: string, iface: InterfaceTemplate) => void;
  cancelConnection: () => void;
  completeConnection: (summary?: string) => void;
}

export interface ConnectionCreationHandlerContext {
  connectionCreation: ConnectionCreationStoreLike;
  validateConnection: (
    input: CreateConnectionInput,
  ) => ConnectionValidationResult;
  addConnection: (
    input: CreateConnectionInput,
  ) => { connection: Connection } | { errors: string[] };
  showToast: (message: string, type: "error" | "warning") => void;
}

/**
 * Resolve the direction PortIndicators would display for this template:
 * its own override, or the type-inferred default. Matches
 * PortIndicators.svelte's getPortDirection() exactly, so a direction warning
 * here always agrees with what the user sees rendered as an arrow.
 */
function effectiveDirection(
  iface: InterfaceTemplate,
): PortDirection | undefined {
  return iface.direction ?? inferDirection(iface.type, iface.mgmt_only);
}

/**
 * Warn when both endpoints resolve to the same non-bidirectional direction
 * (output-to-output, or input-to-input). Undirected AV types (no default,
 * e.g. an XLR port with no explicit direction set) and bidirectional ports
 * never trigger this: there is nothing to mismatch.
 * @returns A warning message, or null when directions are compatible.
 */
export function getDirectionMismatchWarning(
  a: InterfaceTemplate,
  b: InterfaceTemplate,
): string | null {
  const aDirection = effectiveDirection(a);
  const bDirection = effectiveDirection(b);
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
  const { portId, iface } = info;
  if (!portId) return;

  const { connectionCreation } = ctx;

  if (!connectionCreation.isCreating) {
    connectionCreation.startConnection(portId, iface);
    return;
  }

  const sourcePortId = connectionCreation.sourcePortId;
  const sourceIface = connectionCreation.sourceIface;
  if (!sourcePortId || !sourceIface) {
    // Defensive: armed with no recorded source (should not happen); start
    // clean from this click rather than attempt an invalid connection.
    connectionCreation.startConnection(portId, iface);
    return;
  }

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

  const directionWarning = getDirectionMismatchWarning(sourceIface, iface);
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
