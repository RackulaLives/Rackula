/**
 * Roving-tabindex index math for horizontal toolbars (#2075).
 *
 * A roving toolbar keeps exactly one button in the tab order (tabindex 0) and
 * moves that active index with the arrow keys, wrapping at the ends, while
 * Home/End jump to the first/last button. This is the pure index calculation;
 * the component is responsible for applying focus to the resulting index.
 *
 * `count` is the number of focusable items. The returned index is always in
 * `[0, count)` for a non-empty toolbar, or `0` when the toolbar is empty.
 */
export function nextRovingIndex(
  current: number,
  key: string,
  count: number,
): number {
  if (count <= 0) return 0;

  // Clamp a possibly stale current index into range so arrow math wraps
  // predictably even if the caller passes an out-of-range value.
  const index = Math.min(Math.max(current, 0), count - 1);

  switch (key) {
    case "ArrowRight":
      return (index + 1) % count;
    case "ArrowLeft":
      return (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return index;
  }
}
