import Debug from "debug";

const contextMenuDebug = Debug("rackula:ui:context-menu");

function describeTarget(target: Element): string {
  const idSuffix = target.id ? `#${target.id}` : "";
  if (!(target instanceof HTMLElement)) {
    return `${target.tagName.toLowerCase()}${idSuffix}`;
  }

  const classList =
    typeof target.className === "string" ? target.className.trim() : "";
  const classSuffix = classList
    ? `.${classList.split(/\s+/).filter(Boolean).join(".")}`
    : "";

  return `${target.tagName.toLowerCase()}${idSuffix}${classSuffix}`;
}

/**
 * Dispatch a synthetic contextmenu event at viewport (client) coordinates.
 * Returns the event target used, or null when no suitable target exists.
 */
export function dispatchContextMenuAtPoint(
  x: number,
  y: number,
  fallbackTarget?: Element | null,
): Element | null {
  if (typeof document === "undefined") return null;
  const target = document.elementFromPoint(x, y) ?? fallbackTarget ?? null;
  if (!target) return null;

  contextMenuDebug(
    "dispatch contextmenu x=%d y=%d target=%s",
    x,
    y,
    describeTarget(target),
  );

  target.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: 2,
      buttons: 2,
      view: window,
    }),
  );

  return target;
}
