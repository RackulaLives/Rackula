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
  // import-devices trigger is component-owned (DialogOrchestrator.handleImportDevices
  // via bind:this ref in App.svelte) and not callable from the module dispatch.
  // Excluded until that trigger is lifted to a module-level action.
  "import-devices",
]);

/** Group heading order in the palette. */
const GROUP_ORDER = [
  "General",
  "Navigation",
  "Editing",
  "File",
  "Other",
] as const;
type GroupName = (typeof GROUP_ORDER)[number];

function groupOf(action: ActionDefinition): GroupName {
  return (action.helpGroup as GroupName | undefined) ?? "Other";
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
  const buckets = new Map<GroupName, PaletteCommand[]>();
  for (const action of ACTION_REGISTRY) {
    if (!isIncluded(action, ctx)) continue;
    const group = groupOf(action);
    const command = toPaletteCommand(action);
    const existing = buckets.get(group);
    if (existing) existing.push(command);
    else buckets.set(group, [command]);
  }
  const groups: PaletteCommandGroup[] = [];
  for (const heading of GROUP_ORDER) {
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
