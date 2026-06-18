/**
 * Keyboard shortcut utilities
 */

export interface ShortcutHandler {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  action: () => void;
}

/**
 * Check if keyboard events should be ignored
 * Returns true when focus is in an input field or contenteditable
 */
export function shouldIgnoreKeyboard(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement;

  if (!target || !target.tagName) return false;

  // Check for input elements
  const tagName = target.tagName.toLowerCase();
  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return true;
  }

  // Check for contenteditable
  if (target.isContentEditable) {
    return true;
  }

  return false;
}

/**
 * Check if a keyboard event matches a shortcut definition
 * Key comparison is case-insensitive for letter keys
 */
export function matchesShortcut(
  event: KeyboardEvent,
  shortcut: ShortcutHandler,
): boolean {
  // Compare keys (case-insensitive for letters)
  const eventKey = event.key.toLowerCase();
  const shortcutKey = shortcut.key.toLowerCase();

  if (eventKey !== shortcutKey) {
    return false;
  }

  // Check ctrl modifier
  if (shortcut.ctrl && !event.ctrlKey) {
    return false;
  }
  if (!shortcut.ctrl && event.ctrlKey) {
    // Allow Ctrl+key to match if meta is also defined (cross-platform)
    if (!shortcut.meta) {
      return false;
    }
  }

  // Check meta modifier (Cmd on Mac)
  if (shortcut.meta && !event.metaKey) {
    // Allow meta shortcut to work with Ctrl on non-Mac
    if (!event.ctrlKey) {
      return false;
    }
  }
  if (!shortcut.meta && event.metaKey) {
    // Allow meta key to match if ctrl is also defined (cross-platform)
    if (!shortcut.ctrl) {
      return false;
    }
  }

  // Check shift modifier
  if (shortcut.shift && !event.shiftKey) {
    return false;
  }
  if (!shortcut.shift && event.shiftKey) {
    return false;
  }

  return true;
}
