/**
 * Actions registry: the single source of truth for command metadata across the
 * app. The keyboard handler, the help overlay, and (later) the app menu (#2073)
 * and floating verb bars (#2075) all read from this one list so they cannot
 * drift apart.
 *
 * This module is data plus pure functions only. It declares each command's
 * identity, label, scope, keybindings, and help placement. The runnable
 * behaviour (the `run` closures over stores and app callbacks) is bound by the
 * consumer at the call site, keyed by action id - see KeyboardHandler.svelte.
 *
 * Named "actions" (not "commands") deliberately: `src/lib/stores/commands/` is
 * the undo/redo Command Pattern and is a different concept.
 */

import { matchesShortcut, type ShortcutHandler } from "$lib/utils/keyboard";
import { formatShortcut } from "$lib/utils/platform";
import type { StorageMode } from "$lib/storage";

/**
 * Where a command applies. Consumers use this to place a command on the right
 * surface: global and layout commands fold into the command palette and view
 * controls, selection commands onto the floating verb bars.
 */
export type ActionScope = "global" | "layout" | "selection";

/** Stable identifiers for every registered action. */
export type ActionId =
  | "save"
  | "save-as"
  | "export-backup"
  | "export-all"
  | "restore-file"
  | "new-layout"
  | "new-layout-template-home-lab"
  | "new-layout-template-network-closet"
  | "new-layout-template-media-server"
  | "create-rack"
  | "load"
  | "import-devices"
  | "import-netbox"
  | "new-custom-device"
  | "view-yaml"
  | "export"
  | "share"
  | "undo"
  | "redo"
  | "duplicate-selection"
  | "delete-selection"
  | "fit-all"
  | "toggle-display-mode"
  | "toggle-annotations"
  | "move-device-up"
  | "move-device-down"
  | "move-device-slot"
  | "flip-device-face"
  | "focus-rack"
  | "export-rack"
  | "move-rack-left"
  | "move-rack-right"
  | "bay-rack"
  | "cycle-rack-prev"
  | "cycle-rack-next"
  | "escape"
  | "show-help"
  | "settings"
  | "command-palette";

/**
 * A single keyboard binding. Mirrors the modifier shape of ShortcutHandler so
 * the existing matchesShortcut logic resolves events identically.
 */
export interface KeyBinding {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
}

/** Named groups for the help overlay, rendered in this declared order. */
export type HelpGroup = "Navigation" | "General" | "Editing" | "File";

/**
 * Intent groups an action can opt into via `appMenuGroup`. Originally the
 * sections of the app menu behind the logo (#2596); that dropdown and its mobile
 * sheet were retired by the unified command surface (#2775/#2779). The field is
 * retained because the command palette folds each action's intent group onto its
 * own grouping scheme (see APP_MENU_GROUP_TO_PALETTE in palette-commands.ts).
 *
 * The intent groups:
 * - "layout": layout lifecycle (new, open, and server-mode save)
 * - "output": get something out of this layout (image export, share link)
 * - "layout-data": this layout's own data (backup export, restore, view source)
 * - "devices": the device library (import, NetBox, new custom device)
 * - "workspace": workspace-wide backup (export all layouts)
 * - "app": application-level entries (about/shortcuts, settings)
 */
export type AppMenuGroup =
  "layout" | "output" | "layout-data" | "devices" | "workspace" | "app";

export interface ActionDefinition {
  /** Stable identifier; the dispatch map and consumers key off this. */
  id: ActionId;
  /** Human-readable label for menus, verb bars, and the help overlay. */
  label: string;
  /** Where the command applies. */
  scope: ActionScope;
  /**
   * Keyboard bindings. A command may have several (e.g. Ctrl and Cmd variants,
   * or Delete and Backspace). May be empty for commands with no shortcut.
   */
  bindings: KeyBinding[];
  /**
   * Optional predicate deciding whether the command is currently runnable,
   * given a selection/history snapshot. Consumers (verb bars, palette) call
   * this to enable or hide the command. Selection-scoped commands typically
   * define it; global commands typically do not.
   */
  enabledWhen?: (ctx: ActionEnabledContext) => boolean;
  /**
   * Optional override for `label`, used when one action id serves more than
   * one selection kind and the static label reads wrong for one of them (for
   * example "Remove selected" reads as device-only when a rack is selected;
   * #2994). Returns undefined to fall through to `label`. Consumers should
   * resolve through `resolveActionLabel` rather than reading `label` directly
   * so this override can't be missed at a new call site.
   */
  labelForContext?: (ctx: ActionEnabledContext) => string | undefined;
  /** The help overlay group this command appears under, if any. */
  helpGroup?: HelpGroup;
  /**
   * The intent group this command belongs to, if any. Used by the command
   * palette projection to fold the command onto its grouping scheme.
   */
  appMenuGroup?: AppMenuGroup;
  /**
   * Restricts an app-menu action to a single storage mode. "server" shows only
   * in the server build, "browser" only in the browser build. Mode-agnostic
   * items (the default) show in both. Full mode-aware enable/disable is #2187;
   * this field only handles the static server-vs-browser item split (#2073).
   */
  storageMode?: StorageMode;
  /** Fuzzy-search synonyms for the future command palette (#2020). */
  keywords?: string[];
}

/** Snapshot consumed by enabledWhen predicates. */
export interface ActionEnabledContext {
  hasSelection: boolean;
  isDeviceSelected: boolean;
  isRackSelected: boolean;
  canUndo: boolean;
  canRedo: boolean;
  /** Whether the active layout has at least one rack to act on. */
  hasRacks: boolean;
  /**
   * Whether the layout has two or more racks, so rack-cycling commands
   * (Previous / Next rack) have somewhere to go. Optional: surfaces that never
   * project the rack-cycling commands (verb bars, mobile inspector) may omit it.
   */
  hasMultipleRacks?: boolean;
  /** The active storage mode, for mode-aware commands. */
  mode: StorageMode;
  /**
   * Whether the selected device is a half-width child whose carrier has more
   * than one cell it could occupy, so the slot control can shuffle it between
   * cells. False for full-width devices and single-cell carriers (#2322).
   */
  canMoveDeviceSlot: boolean;
  /**
   * Whether the layout is in read-only mode (presentation safety valve). When
   * true, all mutation verbs are disabled regardless of selection state. Omit
   * or set to false for normal edit mode.
   */
  readOnly?: boolean;
}

/**
 * The registry. Order within a help group is the order rows appear in the help
 * overlay. Cross-platform Ctrl/Cmd commands list both bindings so the keyboard
 * handler resolves either modifier.
 */
export const ACTION_REGISTRY: ActionDefinition[] = [
  // --- Navigation -----------------------------------------------------------
  {
    id: "fit-all",
    label: "Fit all (zoom to fit)",
    scope: "layout",
    bindings: [{ key: "f" }],
    helpGroup: "Navigation",
    keywords: ["zoom", "fit", "reset view"],
  },
  {
    id: "cycle-rack-prev",
    label: "Previous rack",
    scope: "layout",
    bindings: [{ key: "[" }],
    // Cycling needs somewhere to go: hidden from the palette browse list until
    // there are two or more racks (#2778). The keyboard shortcut is unaffected -
    // findActionForEvent does not consult enabledWhen.
    enabledWhen: (ctx) => ctx.hasMultipleRacks === true,
    helpGroup: "Navigation",
    keywords: ["previous rack", "cycle"],
  },
  {
    id: "cycle-rack-next",
    label: "Next rack",
    scope: "layout",
    bindings: [{ key: "]" }],
    enabledWhen: (ctx) => ctx.hasMultipleRacks === true,
    helpGroup: "Navigation",
    keywords: ["next rack", "cycle"],
  },

  // --- General --------------------------------------------------------------
  {
    id: "escape",
    label: "Clear selection / close dialog",
    scope: "global",
    bindings: [{ key: "Escape" }],
    helpGroup: "General",
    keywords: ["cancel", "deselect", "close"],
  },
  {
    id: "toggle-display-mode",
    label: "Toggle display mode",
    scope: "layout",
    bindings: [{ key: "i" }],
    helpGroup: "General",
    keywords: ["image", "label", "view"],
  },
  {
    id: "toggle-annotations",
    label: "Toggle annotations",
    scope: "layout",
    bindings: [{ key: "a" }, { key: "n" }],
    helpGroup: "General",
    keywords: ["annotation", "notes", "column"],
  },
  {
    id: "show-help",
    label: "About and shortcuts",
    scope: "global",
    // Producing "?" requires Shift on most layouts, so the real keydown event
    // carries shiftKey=true. Bind both states so the shortcut fires whether or
    // not Shift is reported.
    bindings: [{ key: "?" }, { key: "?", shift: true }],
    helpGroup: "General",
    appMenuGroup: "app",
    keywords: ["shortcuts", "about", "keyboard", "version"],
  },
  {
    id: "settings",
    label: "Settings",
    scope: "global",
    bindings: [],
    // Settings is an application-level entry, so it joins About and shortcuts in
    // the trailing "app" group. #2406 originally made it a standalone trailing
    // group; the intent reorg (#2596) gives "app" a coherent home for both the
    // about/shortcuts entry and the settings gear, keeping the gear in the
    // conventional final slot without a lone single-item group.
    appMenuGroup: "app",
    keywords: ["settings", "preferences", "options", "theme"],
  },
  {
    id: "command-palette",
    label: "Command palette",
    scope: "global",
    bindings: [
      { key: "k", ctrl: true },
      { key: "k", meta: true },
    ],
    helpGroup: "General",
    keywords: ["palette", "commands", "search", "jump to"],
  },

  // --- Editing --------------------------------------------------------------
  {
    id: "delete-selection",
    // "Remove" for placement removal, reserving "Delete" for library-type
    // deletion (#2993); "delete" stays a keyword so search-by-that-term still
    // finds this action. A rack is the library-type case even though it
    // shares this action id with device removal, so labelForContext swaps in
    // "Delete rack" when the live selection is a rack: the trigger the user
    // clicks (verb bar, palette) must read the same verb as the confirm
    // dialog it opens, not the device-oriented default (#2994).
    label: "Remove selected",
    labelForContext: (ctx) => (ctx.isRackSelected ? "Delete rack" : undefined),
    scope: "selection",
    bindings: [{ key: "Delete" }, { key: "Backspace" }],
    enabledWhen: (ctx) => !ctx.readOnly && ctx.hasSelection,
    helpGroup: "Editing",
    keywords: ["delete"],
  },
  {
    id: "move-device-up",
    label: "Move device up",
    scope: "selection",
    bindings: [{ key: "ArrowUp" }],
    enabledWhen: (ctx) => !ctx.readOnly && ctx.isDeviceSelected,
    helpGroup: "Editing",
    keywords: ["nudge", "up"],
  },
  {
    id: "move-device-down",
    label: "Move device down",
    scope: "selection",
    bindings: [{ key: "ArrowDown" }],
    enabledWhen: (ctx) => !ctx.readOnly && ctx.isDeviceSelected,
    helpGroup: "Editing",
    keywords: ["nudge", "down"],
  },
  {
    id: "move-device-slot",
    label: "Move to next cell",
    scope: "selection",
    bindings: [],
    enabledWhen: (ctx) => !ctx.readOnly && ctx.canMoveDeviceSlot,
    keywords: ["cell", "carrier", "slot", "shuffle"],
  },
  {
    id: "duplicate-selection",
    label: "Duplicate selection",
    scope: "selection",
    bindings: [
      { key: "d", ctrl: true },
      { key: "d", meta: true },
    ],
    enabledWhen: (ctx) =>
      !ctx.readOnly && (ctx.isDeviceSelected || ctx.isRackSelected),
    helpGroup: "Editing",
    keywords: ["copy", "clone"],
  },
  {
    id: "flip-device-face",
    label: "Flip face",
    scope: "selection",
    bindings: [],
    enabledWhen: (ctx) => !ctx.readOnly && ctx.isDeviceSelected,
    keywords: ["rotate", "front", "rear", "face"],
  },
  {
    id: "focus-rack",
    label: "Focus",
    scope: "selection",
    bindings: [],
    enabledWhen: (ctx) => ctx.isRackSelected,
    keywords: ["zoom", "centre", "center"],
  },
  {
    id: "export-rack",
    label: "Export",
    scope: "selection",
    bindings: [],
    enabledWhen: (ctx) => ctx.isRackSelected,
    keywords: ["download", "svg", "pdf", "png"],
  },
  // Rack reorder and bay verbs live only on the floating verb bar (#2822).
  // Their availability depends on row geometry (row length, empty-vs-populated,
  // bay group) that ActionEnabledContext does not carry, so the verb bar gates
  // them from the row model and they are excluded from the command palette.
  {
    id: "move-rack-left",
    label: "Move rack left",
    scope: "selection",
    bindings: [],
    enabledWhen: (ctx) => !ctx.readOnly,
  },
  {
    id: "move-rack-right",
    label: "Move rack right",
    scope: "selection",
    bindings: [],
    enabledWhen: (ctx) => !ctx.readOnly,
  },
  {
    id: "bay-rack",
    label: "Bay rack",
    scope: "selection",
    bindings: [],
    enabledWhen: (ctx) => !ctx.readOnly,
  },

  // --- File -----------------------------------------------------------------
  {
    id: "export-backup",
    // Browser mode's equivalent of Ctrl+S: downloadYamlFile (archive.ts)
    // writes a single .yaml file, never a .zip, so the label names that real
    // output and leads with the same verb ("Save") the Ctrl+S toast and the
    // onboarding copy use (#2995, R5).
    label: "Save layout (.yaml)",
    scope: "global",
    bindings: [],
    appMenuGroup: "layout-data",
    storageMode: "browser",
    keywords: ["download", "backup", "yaml", "save", "export"],
  },
  {
    id: "save-as",
    label: "Save As (ZIP)",
    scope: "global",
    bindings: [
      { key: "s", ctrl: true, shift: true },
      { key: "s", meta: true, shift: true },
    ],
    helpGroup: "File",
    appMenuGroup: "layout-data",
    storageMode: "server",
    keywords: ["download", "backup", "zip", "export"],
  },
  {
    id: "export-all",
    // Backs up the whole workspace to a ZIP: persisting layouts, so it leads
    // with "Save" like export-backup and save-as above, not the derived-
    // artifact "Export" export/export-rack use below (#3061, #2995/#3007).
    label: "Save all layouts (.zip)",
    scope: "global",
    bindings: [],
    appMenuGroup: "workspace",
    keywords: ["backup", "export all", "back up", "zip", "archive", "copy"],
  },
  {
    id: "export",
    label: "Export image",
    scope: "global",
    bindings: [
      { key: "e", ctrl: true },
      { key: "e", meta: true },
    ],
    helpGroup: "File",
    appMenuGroup: "output",
    keywords: ["png", "svg", "pdf", "image"],
  },
  {
    id: "share",
    label: "Share",
    scope: "global",
    // Ctrl+H only: Cmd+H is intercepted by macOS as "Hide" before the browser
    // ever sees the keydown, so a meta binding here would be dead on Mac
    // (#2995, R16c). Ctrl+H still works cross-platform, including the literal
    // Control key on a Mac keyboard.
    bindings: [{ key: "h", ctrl: true }],
    // Sharing needs a rack to encode in the link; disabled on an empty layout.
    enabledWhen: (ctx) => ctx.hasRacks,
    helpGroup: "File",
    appMenuGroup: "output",
    keywords: ["link", "url", "qr"],
  },
  {
    id: "restore-file",
    label: "Restore from backup (.zip)",
    scope: "global",
    bindings: [],
    // Mutating command: replaces the working copy with the restored file, so
    // it is gated like undo/redo/create-rack rather than New layout/Open/
    // imports, which do not mutate a locked layout (they replace or add via
    // their own confirm dialogs) (#2804).
    enabledWhen: (ctx) => !ctx.readOnly,
    appMenuGroup: "layout-data",
    keywords: [
      "restore",
      "load",
      "open",
      "import",
      "replace",
      "file",
      "backup",
    ],
  },
  {
    id: "view-yaml",
    label: "View YAML",
    scope: "global",
    bindings: [],
    // The YAML view has nothing to show until a rack exists.
    enabledWhen: (ctx) => ctx.hasRacks,
    appMenuGroup: "layout-data",
    keywords: ["yaml", "source", "raw", "edit"],
  },

  // --- Layout (app menu) ----------------------------------------------------
  {
    id: "new-layout",
    label: "New layout",
    scope: "global",
    bindings: [],
    appMenuGroup: "layout",
    keywords: ["new", "rack", "create", "blank"],
  },
  // Starter-template entries (#2829). One per shipped starter, opening it in a
  // new tab via the shared starter-open path. No bindings; palette/search only.
  {
    id: "new-layout-template-home-lab",
    label: "New layout from template: Home Lab",
    scope: "global",
    bindings: [],
    appMenuGroup: "layout",
    keywords: ["template", "starter", "home lab", "homelab", "new"],
  },
  {
    id: "new-layout-template-network-closet",
    label: "New layout from template: Network Closet",
    scope: "global",
    bindings: [],
    appMenuGroup: "layout",
    keywords: ["template", "starter", "network closet", "new"],
  },
  {
    id: "new-layout-template-media-server",
    label: "New layout from template: Media Server",
    scope: "global",
    bindings: [],
    appMenuGroup: "layout",
    keywords: ["template", "starter", "media server", "new"],
  },
  // Adds a rack to the CURRENT layout (non-destructive), unlike New layout
  // (replaces the working copy) or the starter templates (open in a new tab).
  // Dispatches the same handleNewRack the "+" toolbar control and the mobile
  // Racks sheet's "New rack" button already use, so the palette stops being
  // the one surface with no way to add a rack (#2995, R13).
  {
    id: "create-rack",
    label: "New rack",
    scope: "global",
    bindings: [],
    // Mutating command: gated on !ctx.readOnly like move-rack-left,
    // move-rack-right, and bay-rack. No hasRacks requirement - unlike
    // share/view-yaml, create-rack must stay enabled with zero racks so it
    // can create the first one (#2995).
    enabledWhen: (ctx) => !ctx.readOnly,
    appMenuGroup: "layout",
    keywords: ["rack", "add rack", "new rack", "create"],
  },
  {
    id: "load",
    label: "Open layout",
    scope: "global",
    bindings: [
      { key: "o", ctrl: true },
      { key: "o", meta: true },
    ],
    helpGroup: "File",
    appMenuGroup: "layout",
    keywords: ["open", "load", "import"],
  },
  {
    // Server-only. Placed after New and Open so the lifecycle group reads
    // new -> open -> save; the projection follows registry order within a
    // section (#2596).
    id: "save",
    label: "Save layout",
    scope: "global",
    bindings: [
      { key: "s", ctrl: true },
      { key: "s", meta: true },
    ],
    helpGroup: "File",
    appMenuGroup: "layout",
    storageMode: "server",
    keywords: ["store", "persist"],
  },

  // --- Devices (app menu) ---------------------------------------------------
  {
    id: "import-devices",
    label: "Import devices",
    scope: "global",
    bindings: [],
    appMenuGroup: "devices",
    keywords: ["import", "devices", "library"],
  },
  {
    id: "import-netbox",
    label: "Import from NetBox",
    scope: "global",
    bindings: [],
    appMenuGroup: "devices",
    keywords: ["netbox", "import", "dcim"],
  },
  {
    id: "new-custom-device",
    label: "New custom device",
    scope: "global",
    bindings: [],
    appMenuGroup: "devices",
    keywords: ["custom", "device", "create"],
  },

  // --- App --------------------------------------------------------------------
  // show-help ("About and shortcuts") is defined in the General group above with
  // appMenuGroup: "app"; the palette projection folds it into the trailing App
  // group alongside Settings. Its dialog (HelpPanel) is the About panel and
  // includes the shortcut list, so one entry covers both about and shortcuts.
  {
    id: "undo",
    label: "Undo",
    scope: "global",
    bindings: [
      { key: "z", ctrl: true },
      { key: "z", meta: true },
    ],
    // Mutating command: can undo past the point the layout was locked, so it
    // is gated on !ctx.readOnly like the selection verbs, in addition to
    // needing history to undo (#2804).
    enabledWhen: (ctx) => !ctx.readOnly && ctx.canUndo,
    helpGroup: "File",
    keywords: ["revert", "back"],
  },
  {
    id: "redo",
    label: "Redo",
    scope: "global",
    bindings: [
      { key: "z", ctrl: true, shift: true },
      { key: "z", meta: true, shift: true },
      { key: "y", ctrl: true },
      { key: "y", meta: true },
    ],
    enabledWhen: (ctx) => !ctx.readOnly && ctx.canRedo,
    helpGroup: "File",
    keywords: ["forward", "repeat"],
  },
];

/**
 * Display-only help rows that document mouse gestures rather than keyboard
 * shortcuts. They live in the help overlay but are not dispatchable commands,
 * so they are not registry actions.
 */
const HELP_GESTURE_ROWS: { key: string; action: string }[] = [
  { key: "Scroll Wheel", action: "Zoom in/out (at cursor)" },
  { key: "Shift + Scroll", action: "Pan horizontally" },
  { key: "Click + Drag", action: "Pan canvas" },
];

/** Look up an action definition by its id. */
export function getActionById(id: ActionId): ActionDefinition | undefined {
  return ACTION_REGISTRY.find((action) => action.id === id);
}

/**
 * Resolve an action's display label for the given context, applying its
 * labelForContext override (if any and if it returns a value) before falling
 * back to the static label. Every projection that renders a command's label
 * (verb bars, palette, mobile inspector) should call this instead of reading
 * `action.label` directly, so a future context-sensitive label can't be added
 * to the registry without also reaching every surface (#2994).
 */
export function resolveActionLabel(
  action: ActionDefinition,
  ctx: ActionEnabledContext,
): string {
  return action.labelForContext?.(ctx) ?? action.label;
}

/** Tooltip content for a control bound to a registry action (#117). */
export interface ActionTooltip {
  /** The action's label, used as the tooltip text. */
  label: string;
  /**
   * The platform-formatted primary shortcut, if the action has a keybinding.
   * Omitted when the action has no shortcut so the tooltip shows the label
   * alone rather than an empty badge.
   */
  shortcut?: string;
}

/**
 * Resolve an action id to its tooltip content (label plus formatted shortcut).
 * Lets a control source its tooltip from the registry rather than hand-authored
 * copy, so the tooltip cannot drift from the keyboard handler or help overlay.
 * Returns undefined for an unknown id so the caller can fall back to its own
 * label.
 */
export function getActionTooltip(id: ActionId): ActionTooltip | undefined {
  const action = getActionById(id);
  if (!action) return undefined;
  return {
    label: action.label,
    shortcut: formatMenuShortcut(action),
  };
}

/**
 * Resolve a keyboard event to the action it should trigger. Returns the first
 * action whose any binding matches, or undefined if none do. Uses the same
 * matchesShortcut logic the keyboard handler has always used, so resolution is
 * identical to the prior hand-wired list.
 */
export function findActionForEvent(
  event: KeyboardEvent,
): ActionDefinition | undefined {
  for (const action of ACTION_REGISTRY) {
    for (const binding of action.bindings) {
      const shortcut: ShortcutHandler = {
        key: binding.key,
        ctrl: binding.ctrl,
        meta: binding.meta,
        shift: binding.shift,
        action: () => {},
      };
      if (matchesShortcut(event, shortcut)) {
        return action;
      }
    }
  }
  return undefined;
}

/** A single row in the help overlay. */
export interface HelpRow {
  key: string;
  action: string;
}

/** A named group of help rows. */
export interface HelpGroupSection {
  name: string;
  rows: HelpRow[];
}

/**
 * Whether an action offers a genuine cross-platform Ctrl/Cmd pair (a meta
 * binding registered somewhere alongside the ctrl one), so its shortcut can
 * safely render via the platform-aware "mod" label. An action with only a
 * ctrl binding and no meta alternative - Share's Ctrl+H after dropping the
 * macOS-Hide-colliding Cmd+H (#2995, R16c) - must display its literal
 * modifier instead: showing "Cmd" on a Mac would advertise a combo that
 * cannot fire.
 */
function hasMetaVariant(action: ActionDefinition): boolean {
  return action.bindings.some((b) => b.meta);
}

/**
 * Render a single binding with platform-correct modifier labels (e.g. "Ctrl+S"
 * or "Cmd+S") when a cross-platform pair exists, or the literal modifier
 * ("Ctrl" or "Cmd") when it does not. Shared by the help overlay and the
 * registry tooltip/shortcut formatting so all surfaces format keys
 * identically.
 */
function formatBinding(binding: KeyBinding, crossPlatform: boolean): string {
  const parts: string[] = [];
  if (crossPlatform) {
    parts.push("mod");
  } else if (binding.ctrl) {
    parts.push("Ctrl");
  } else if (binding.meta) {
    parts.push("Cmd");
  }
  if (binding.shift) parts.push("shift");
  parts.push(formatBindingKey(binding.key));
  return formatShortcut(...parts);
}

/** Render a raw binding key into a display glyph. */
function formatBindingKey(key: string): string {
  if (key.length === 1) return key.toUpperCase();
  return key;
}

/** Heading for the mouse-gesture section in the help overlay. */
const HELP_GESTURE_SECTION_NAME = "Canvas";

/**
 * Order the generated keyboard-shortcut groups render in, matching the
 * declared order on the HelpGroup type itself.
 */
const HELP_GROUP_ORDER: readonly HelpGroup[] = [
  "Navigation",
  "General",
  "Editing",
  "File",
];

/**
 * Build the help overlay's keyboard-shortcut groups straight from the
 * registry: every action with a helpGroup and at least one binding becomes a
 * row, formatted with the same formatBinding the palette/tooltip shortcuts
 * use. Generated at render time so the list cannot drift from the actual
 * bindings (#3000, replacing the hand-maintained list #2808 removed).
 */
function getKeyboardShortcutGroups(): HelpGroupSection[] {
  return HELP_GROUP_ORDER.map((name) => {
    const rows: HelpRow[] = [];
    for (const action of ACTION_REGISTRY) {
      if (action.helpGroup !== name) continue;
      const shortcut = formatMenuShortcut(action);
      if (!shortcut) continue;
      rows.push({ key: shortcut, action: action.label });
    }
    return { name, rows };
  }).filter((group) => group.rows.length > 0);
}

/**
 * Build the help overlay's full row set: keyboard shortcuts generated from
 * the registry, followed by the mouse gestures the palette has no equivalent
 * for.
 */
export function getHelpGroups(): HelpGroupSection[] {
  const gestureRows: HelpRow[] = HELP_GESTURE_ROWS.map(({ key, action }) => ({
    key,
    action,
  }));
  const gestureGroups: HelpGroupSection[] =
    gestureRows.length > 0
      ? [{ name: HELP_GESTURE_SECTION_NAME, rows: gestureRows }]
      : [];

  return [...getKeyboardShortcutGroups(), ...gestureGroups];
}

/**
 * Format an action's primary keybinding as a menu shortcut (e.g. "Ctrl+S" or
 * "Cmd+S"). Returns undefined when the action has no keybinding, so a consumer
 * omits the shortcut chip rather than rendering an empty one. Exported so the
 * command palette projection (palette-commands.ts) reuses this exact
 * formatting instead of re-deriving it, so the two surfaces cannot drift.
 */
export function formatMenuShortcut(
  action: ActionDefinition,
): string | undefined {
  const binding = action.bindings[0];
  if (!binding) return undefined;
  return formatBinding(binding, hasMetaVariant(action));
}
