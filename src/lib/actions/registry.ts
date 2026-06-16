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
 * surface: global commands live on the app menu, layout commands on view
 * controls, selection commands on the floating verb bars.
 */
export type ActionScope = "global" | "layout" | "selection";

/** Stable identifiers for every registered action. */
export type ActionId =
  | "save"
  | "save-as"
  | "export-backup"
  | "new-layout"
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
  | "toggle-sidebar"
  | "move-device-up"
  | "move-device-down"
  | "flip-device-face"
  | "focus-rack"
  | "export-rack"
  | "cycle-rack-prev"
  | "cycle-rack-next"
  | "escape"
  | "show-help"
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
 * Sections of the app menu (the menu behind the logo), rendered in this
 * declared order with separators between them. Actions opt into the menu by
 * declaring an appMenuGroup; the menu is projected from the registry so it
 * cannot drift from the keyboard handler or help overlay (#2073).
 */
export type AppMenuGroup = "file" | "layout" | "devices" | "help";

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
  /** The help overlay group this command appears under, if any. */
  helpGroup?: HelpGroup;
  /**
   * The app-menu section this command appears under, if any. Actions without
   * an appMenuGroup are not shown in the menu behind the logo.
   */
  appMenuGroup?: AppMenuGroup;
  /**
   * Restricts an app-menu action to a single storage mode. "server" shows only
   * in the server build, "browser" only in the browser build. Mode-agnostic
   * items (the default) show in both. Full mode-aware enable/disable is #2187;
   * this field only handles the static server-vs-browser item split (#2073).
   */
  storageMode?: StorageMode;
  /**
   * Display label for the help overlay key cell, used only when the command has
   * no keyboard binding (e.g. mouse gestures documented in help). When omitted,
   * the key is formatted from the primary binding.
   */
  helpKeyLabel?: string;
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
  /** The active storage mode, for mode-aware app-menu items. */
  mode: StorageMode;
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
    helpGroup: "Navigation",
    keywords: ["previous rack", "cycle"],
  },
  {
    id: "cycle-rack-next",
    label: "Next rack",
    scope: "layout",
    bindings: [{ key: "]" }],
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
    keywords: ["annotation", "notes", "column"],
  },
  {
    id: "toggle-sidebar",
    label: "Toggle device sidebar",
    scope: "global",
    bindings: [{ key: "d" }],
    keywords: ["devices", "palette", "drawer"],
  },
  {
    id: "show-help",
    label: "About and shortcuts",
    scope: "global",
    // Producing "?" requires Shift on most layouts, so the real keydown event
    // carries shiftKey=true. Bind both states so the shortcut fires whether or
    // not Shift is reported.
    bindings: [{ key: "?" }, { key: "?", shift: true }],
    appMenuGroup: "help",
    keywords: ["shortcuts", "about", "keyboard", "version"],
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
    label: "Delete selected",
    scope: "selection",
    bindings: [{ key: "Delete" }, { key: "Backspace" }],
    enabledWhen: (ctx) => ctx.hasSelection,
    helpGroup: "Editing",
    keywords: ["remove"],
  },
  {
    id: "move-device-up",
    label: "Move device up",
    scope: "selection",
    bindings: [{ key: "ArrowUp" }],
    enabledWhen: (ctx) => ctx.isDeviceSelected,
    helpGroup: "Editing",
    helpKeyLabel: "↑ / ↓",
    keywords: ["nudge", "up"],
  },
  {
    id: "move-device-down",
    label: "Move device down",
    scope: "selection",
    bindings: [{ key: "ArrowDown" }],
    enabledWhen: (ctx) => ctx.isDeviceSelected,
    keywords: ["nudge", "down"],
  },
  {
    id: "duplicate-selection",
    label: "Duplicate selection",
    scope: "selection",
    bindings: [
      { key: "d", ctrl: true },
      { key: "d", meta: true },
    ],
    enabledWhen: (ctx) => ctx.isDeviceSelected || ctx.isRackSelected,
    keywords: ["copy", "clone"],
  },
  {
    id: "flip-device-face",
    label: "Flip face",
    scope: "selection",
    bindings: [],
    enabledWhen: (ctx) => ctx.isDeviceSelected,
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

  // --- File -----------------------------------------------------------------
  {
    id: "export-backup",
    label: "Export backup",
    scope: "global",
    bindings: [],
    appMenuGroup: "file",
    storageMode: "browser",
    keywords: ["download", "backup", "zip", "save"],
  },
  {
    id: "save",
    label: "Save layout",
    scope: "global",
    bindings: [
      { key: "s", ctrl: true },
      { key: "s", meta: true },
    ],
    helpGroup: "File",
    appMenuGroup: "file",
    storageMode: "server",
    keywords: ["store", "persist"],
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
    appMenuGroup: "file",
    storageMode: "server",
    keywords: ["download", "backup", "zip"],
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
    appMenuGroup: "file",
    keywords: ["png", "svg", "pdf", "image"],
  },
  {
    id: "share",
    label: "Share",
    scope: "global",
    bindings: [
      { key: "h", ctrl: true },
      { key: "h", meta: true },
    ],
    // Sharing needs a rack to encode in the link; disabled on an empty layout.
    enabledWhen: (ctx) => ctx.hasRacks,
    helpGroup: "File",
    appMenuGroup: "file",
    keywords: ["link", "url", "qr"],
  },
  {
    id: "view-yaml",
    label: "View YAML",
    scope: "global",
    bindings: [],
    // The YAML view has nothing to show until a rack exists.
    enabledWhen: (ctx) => ctx.hasRacks,
    appMenuGroup: "file",
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

  // --- Help (app menu) ------------------------------------------------------
  // show-help ("About and shortcuts") is defined in the General group above
  // with appMenuGroup: "help"; the menu projection places it in this section.
  // Its dialog (HelpPanel) is the About panel and includes the shortcut list,
  // so one entry covers both about and shortcuts.
  {
    id: "undo",
    label: "Undo",
    scope: "global",
    bindings: [
      { key: "z", ctrl: true },
      { key: "z", meta: true },
    ],
    enabledWhen: (ctx) => ctx.canUndo,
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
    enabledWhen: (ctx) => ctx.canRedo,
    helpGroup: "File",
    keywords: ["forward", "repeat"],
  },
];

/** The order help groups appear in the overlay. */
const HELP_GROUP_ORDER: HelpGroup[] = [
  "Navigation",
  "General",
  "Editing",
  "File",
];

/**
 * Display-only help rows that document mouse gestures rather than keyboard
 * shortcuts. They live in the help overlay but are not dispatchable commands,
 * so they are not registry actions.
 */
const HELP_GESTURE_ROWS: { group: HelpGroup; key: string; action: string }[] = [
  {
    group: "Navigation",
    key: "Scroll Wheel",
    action: "Zoom in/out (at cursor)",
  },
  { group: "Navigation", key: "Shift + Scroll", action: "Pan horizontally" },
  { group: "Navigation", key: "Click + Drag", action: "Pan canvas" },
];

/** Look up an action definition by its id. */
export function getActionById(id: ActionId): ActionDefinition | undefined {
  return ACTION_REGISTRY.find((action) => action.id === id);
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
  name: HelpGroup;
  rows: HelpRow[];
}

/**
 * Render a single binding with platform-correct modifier labels (e.g. "Ctrl+S"
 * or "Cmd+S"). Shared by the help overlay and the app menu so both surfaces
 * format keys identically.
 */
function formatBinding(binding: KeyBinding): string {
  const parts: string[] = [];
  if (binding.ctrl || binding.meta) parts.push("mod");
  if (binding.shift) parts.push("shift");
  parts.push(formatBindingKey(binding.key));
  return formatShortcut(...parts);
}

/**
 * Format the help-overlay key cell for an action. Prefers an explicit
 * helpKeyLabel; otherwise renders the primary (first) binding with
 * platform-correct modifier labels.
 */
function formatHelpKey(action: ActionDefinition): string {
  if (action.helpKeyLabel) return action.helpKeyLabel;
  const binding = action.bindings[0];
  if (!binding) return "";
  return formatBinding(binding);
}

/** Render a raw binding key into a display glyph. */
function formatBindingKey(key: string): string {
  if (key.length === 1) return key.toUpperCase();
  return key;
}

/**
 * Build the help overlay's grouped shortcut list from the registry. Only
 * actions that opt into a help group are shown, plus the documented mouse
 * gestures. Groups appear in HELP_GROUP_ORDER; rows follow registry order.
 */
export function getHelpGroups(): HelpGroupSection[] {
  const sections: HelpGroupSection[] = [];

  for (const groupName of HELP_GROUP_ORDER) {
    const rows: HelpRow[] = [];

    // Documented mouse gestures first (Navigation only, in practice).
    for (const gesture of HELP_GESTURE_ROWS) {
      if (gesture.group === groupName) {
        rows.push({ key: gesture.key, action: gesture.action });
      }
    }

    // Registry actions flagged for this help group.
    for (const action of ACTION_REGISTRY) {
      if (action.helpGroup !== groupName) continue;
      const key = formatHelpKey(action);
      if (!key) continue;
      rows.push({ key, action: action.label });
    }

    if (rows.length > 0) {
      sections.push({ name: groupName, rows });
    }
  }

  return sections;
}

/** The order app-menu sections appear in, with separators between them. */
const APP_MENU_GROUP_ORDER: AppMenuGroup[] = [
  "layout",
  "file",
  "devices",
  "help",
];

/** A single projected app-menu item. */
export interface AppMenuItem {
  /** The registry action id this item dispatches. */
  id: ActionId;
  /** The display label, taken from the registry. */
  label: string;
  /** The platform-formatted keyboard shortcut, if the action has one. */
  shortcut?: string;
  /**
   * Whether the item is currently disabled. Computed from the action's
   * enabledWhen predicate against the supplied context; false when no context
   * is given or the action declares no predicate. Disabled items stay in the
   * menu (rendered aria-disabled) rather than being hidden.
   */
  disabled?: boolean;
}

/** A named section of the app menu. */
export interface AppMenuSection {
  group: AppMenuGroup;
  items: AppMenuItem[];
}

/**
 * Format an action's primary keybinding as a menu shortcut (e.g. "Ctrl+S" or
 * "Cmd+S"). Returns undefined when the action has no keybinding, so the menu
 * omits the shortcut chip rather than rendering an empty one.
 */
function formatMenuShortcut(action: ActionDefinition): string | undefined {
  const binding = action.bindings[0];
  if (!binding) return undefined;
  return formatBinding(binding);
}

/**
 * Project the app menu (the menu behind the logo) from the registry. Items are
 * every action that declares an appMenuGroup, grouped into sections in
 * APP_MENU_GROUP_ORDER and following registry order within each section.
 *
 * The menu is storage-mode aware in two layers. The item set splits by mode: a
 * server-only action (Save, Save As) is dropped in browser mode and a
 * browser-only action (Export backup) is dropped in server mode. When a live
 * context is supplied, each item's `disabled` is also derived from its action's
 * enabledWhen predicate (e.g. share and view-yaml need a rack), so the menu is
 * the registry's first runtime consumer of enabledWhen. Disabled items stay in
 * the menu (rendered aria-disabled) rather than being hidden. Called with the
 * mode alone, every item is enabled.
 */
export function getAppMenuSections(
  mode: StorageMode,
  context?: ActionEnabledContext,
): AppMenuSection[] {
  const sections: AppMenuSection[] = [];

  for (const group of APP_MENU_GROUP_ORDER) {
    const items: AppMenuItem[] = [];

    for (const action of ACTION_REGISTRY) {
      if (action.appMenuGroup !== group) continue;
      if (action.storageMode && action.storageMode !== mode) continue;
      items.push({
        id: action.id,
        label: action.label,
        shortcut: formatMenuShortcut(action),
        disabled:
          context && action.enabledWhen ? !action.enabledWhen(context) : false,
      });
    }

    if (items.length > 0) {
      sections.push({ group, items });
    }
  }

  return sections;
}
