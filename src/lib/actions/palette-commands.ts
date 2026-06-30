/**
 * Projects the actions registry into the grouped command list the command
 * palette renders. #2212 shows command mode only: global + layout commands
 * always (gated by their own enabledWhen if present), selection commands only
 * when their enabledWhen passes against the live context. The palette itself
 * and the escape "command" are excluded - they are not list-pickable.
 *
 * #2213 extends this seam with recents and a selection-aware empty state.
 */
import {
  ACTION_REGISTRY,
  getActionById,
  type ActionDefinition,
  type ActionEnabledContext,
  type ActionId,
  type AppMenuGroup,
  type HelpGroup,
} from "$lib/actions/registry";
import { formatShortcut } from "$lib/utils/platform";

export interface PaletteCommand {
  id: ActionId;
  label: string;
  /** Platform-formatted primary shortcut, if any (for the row badge). */
  shortcut?: string;
  /** Registry keywords, fed to Command.Item for fuzzy matching. */
  keywords: string[];
}

export interface PaletteCommandGroup {
  /** Display heading for the group. */
  heading: string;
  commands: PaletteCommand[];
}

/** Actions that are never offered as palette rows. */
const EXCLUDED: ReadonlySet<ActionId> = new Set<ActionId>([
  "command-palette",
  "escape",
]);

/**
 * The single palette grouping scheme (#2775). One ordered list of real groups
 * replaces the palette's old helpGroup buckets and the app menu's intent groups,
 * so every projected action lands in a named group and nothing falls into a
 * generic "Other" bucket. Order runs context -> frequency -> admin: the
 * now-relevant and frequent groups sit on top, rare and admin ones sink to the
 * bottom (the locked order from the unified command surface design).
 */
const PALETTE_GROUP_ORDER = [
  "Selection",
  "Create / Add device",
  "Navigation / View",
  "File / Document",
  "Devices",
  "Workspace",
  "App",
] as const;
type PaletteGroup = (typeof PALETTE_GROUP_ORDER)[number];

/**
 * Actions whose palette group differs from what their registry metadata would
 * imply. Kept tiny on purpose; every other action folds through its scope,
 * appMenuGroup, or helpGroup in paletteGroupOf below.
 */
const GROUP_OVERRIDES: Partial<Record<ActionId, PaletteGroup>> = {
  // "New custom device" creates a device type, so it sits in Create / Add device
  // alongside the palette's "Add device..." entry, not in the Devices
  // (import/library) group its app-menu placement uses.
  "new-custom-device": "Create / Add device",
  // View toggles carry no help or menu group; they are view controls.
  "toggle-annotations": "Navigation / View",
  "toggle-sidebar": "Navigation / View",
};

/** Fold an action's app-menu intent group onto the unified scheme. */
const APP_MENU_GROUP_TO_PALETTE: Record<AppMenuGroup, PaletteGroup> = {
  layout: "File / Document",
  output: "File / Document",
  "layout-data": "File / Document",
  devices: "Devices",
  workspace: "Workspace",
  app: "App",
};

/** Fold an action's help-overlay group onto the unified scheme. */
const HELP_GROUP_TO_PALETTE: Record<HelpGroup, PaletteGroup> = {
  Navigation: "Navigation / View",
  General: "Navigation / View",
  Editing: "Selection",
  File: "File / Document",
};

/**
 * Resolve the unified palette group for an action. The mapping is total: an
 * explicit override wins, then selection scope, then the app-menu intent group,
 * then the help group, and finally a defensive fallback so a future action with
 * no grouping metadata still lands in a real group rather than an "Other" bucket.
 */
function paletteGroupOf(action: ActionDefinition): PaletteGroup {
  const override = GROUP_OVERRIDES[action.id];
  if (override) return override;
  if (action.scope === "selection") return "Selection";
  if (action.appMenuGroup)
    return APP_MENU_GROUP_TO_PALETTE[action.appMenuGroup];
  if (action.helpGroup) return HELP_GROUP_TO_PALETTE[action.helpGroup];
  return "Navigation / View";
}

function shortcutOf(action: ActionDefinition): string | undefined {
  const binding = action.bindings[0];
  if (!binding) return undefined;
  const parts: string[] = [];
  if (binding.ctrl || binding.meta) parts.push("mod");
  if (binding.shift) parts.push("shift");
  parts.push(
    binding.key.length === 1 ? binding.key.toUpperCase() : binding.key,
  );
  return formatShortcut(...parts);
}

function isIncluded(
  action: ActionDefinition,
  ctx: ActionEnabledContext,
): boolean {
  if (EXCLUDED.has(action.id)) return false;
  // Storage-mode split: a server-only action (Save, Save As) and a browser-only
  // action (Export layout .zip) are the same intent split by mode, so only the
  // one matching the active mode is offered - they never both appear (#2775).
  if (action.storageMode && action.storageMode !== ctx.mode) return false;
  // selection commands appear only when enabled; global/layout always appear,
  // but still respect their own enabledWhen when they declare one.
  if (action.enabledWhen) return action.enabledWhen(ctx);
  return true;
}

function toPaletteCommand(action: ActionDefinition): PaletteCommand {
  return {
    id: action.id,
    label: action.label,
    shortcut: shortcutOf(action),
    keywords: action.keywords ?? [],
  };
}

/** Build the grouped, context-gated palette command list. */
export function getPaletteCommands(
  ctx: ActionEnabledContext,
): PaletteCommandGroup[] {
  const buckets = new Map<PaletteGroup, PaletteCommand[]>();
  for (const action of ACTION_REGISTRY) {
    if (!isIncluded(action, ctx)) continue;
    const group = paletteGroupOf(action);
    const command = toPaletteCommand(action);
    const existing = buckets.get(group);
    if (existing) existing.push(command);
    else buckets.set(group, [command]);
  }
  const groups: PaletteCommandGroup[] = [];
  for (const heading of PALETTE_GROUP_ORDER) {
    const commands = buckets.get(heading);
    if (commands && commands.length > 0) groups.push({ heading, commands });
  }
  return groups;
}

/**
 * Empty-state payload rendered before the user types:
 * - `recent`: MRU commands currently eligible in this context
 * - `selection`: enabled selection-scoped verbs for the current selection
 * - `commands`: grouped fallback commands, excluding rows already in
 *   `recent` or `selection`
 */
export interface PaletteEmptyState {
  recent: PaletteCommand[];
  selection: PaletteCommand[];
  commands: PaletteCommandGroup[];
}

/**
 * Project the palette empty state (before typing): Recent, the current
 * selection's verbs, then a short grouped command list. Never blank: the
 * grouped list always carries the remaining included commands even when recent
 * and selection are empty. Pure and unit-testable (#2214 extends this).
 */
export function getPaletteEmptyState(
  ctx: ActionEnabledContext,
  recentIds: ActionId[],
): PaletteEmptyState {
  const recent: PaletteCommand[] = [];
  for (const id of recentIds) {
    const action = getActionById(id);
    if (!action || !isIncluded(action, ctx)) continue;
    recent.push(toPaletteCommand(action));
  }

  const selection: PaletteCommand[] = [];
  for (const action of ACTION_REGISTRY) {
    if (action.scope !== "selection") continue;
    if (!isIncluded(action, ctx)) continue;
    selection.push(toPaletteCommand(action));
  }

  const shown = new Set<ActionId>([
    ...recent.map((c) => c.id),
    ...selection.map((c) => c.id),
  ]);
  const commands = getPaletteCommands(ctx)
    .map((group) => ({
      heading: group.heading,
      commands: group.commands.filter((c) => !shown.has(c.id)),
    }))
    .filter((group) => group.commands.length > 0);

  return { recent, selection, commands };
}
