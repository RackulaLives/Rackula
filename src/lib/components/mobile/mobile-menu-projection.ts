/**
 * Mobile app-menu projection (#2597).
 *
 * The mobile menu sheet is a touch presentation of the same app menu the
 * desktop dropdown renders (#2596). To keep the sheet provably registry-driven,
 * it binds to this thin pass-through rather than calling getAppMenuSections with
 * its own arguments inline. There is exactly one source of truth (the registry
 * projection) and one place the sheet reads it, so the sheet cannot hardcode an
 * item set, ordering, label, or icon: adding or reordering a registry action
 * updates the sheet with zero changes in the component.
 *
 * This is deliberately not a new projection. It forwards to getAppMenuSections
 * unchanged; the indirection exists only so the contract (sheet renders exactly
 * the projection, in both storage modes, disabled states included) is unit
 * testable as behaviour without querying the rendered DOM.
 */
import {
  getAppMenuSections,
  type ActionEnabledContext,
  type AppMenuSection,
} from "$lib/actions/registry";
import type { StorageMode } from "$lib/storage";

export function projectMobileMenuSections(
  mode: StorageMode,
  context?: ActionEnabledContext,
): AppMenuSection[] {
  return getAppMenuSections(mode, context);
}
