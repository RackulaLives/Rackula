/**
 * Virtual List Windowing
 *
 * Pure geometry for fixed-height list virtualization. Given the current scroll
 * offset and viewport size, work out which contiguous slice of rows needs to be
 * rendered and where the rendered block sits inside a full-height spacer. The
 * palette uses this to keep long device lists (500+ rows) scrolling smoothly
 * without mounting every row.
 */

export interface VisibleWindowInput {
  /** Current scroll offset of the viewport, in pixels. */
  scrollTop: number;
  /** Visible height of the scroll viewport, in pixels. */
  viewportHeight: number;
  /** Fixed height of each row, in pixels. */
  itemHeight: number;
  /** Total number of rows in the list. */
  itemCount: number;
  /** Extra rows rendered above and below the viewport to mask fast scrolling. */
  overscan: number;
}

export interface VisibleWindow {
  /** Index of the first rendered row (inclusive). */
  startIndex: number;
  /** Index just past the last rendered row (exclusive). */
  endIndex: number;
  /** Top offset of the rendered block within the full list, in pixels. */
  offsetY: number;
  /** Full scroll height of the list, in pixels. */
  totalHeight: number;
}

/**
 * Compute the slice of rows to render for the given scroll state.
 *
 * A non-positive `itemHeight` is treated as "unmeasured" and renders every row
 * in one batch, which keeps the component correct before the first layout pass.
 */
export function computeVisibleWindow({
  scrollTop,
  viewportHeight,
  itemHeight,
  itemCount,
  overscan,
}: VisibleWindowInput): VisibleWindow {
  if (itemCount <= 0) {
    return { startIndex: 0, endIndex: 0, offsetY: 0, totalHeight: 0 };
  }

  if (itemHeight <= 0) {
    return {
      startIndex: 0,
      endIndex: itemCount,
      offsetY: 0,
      totalHeight: 0,
    };
  }

  const totalHeight = itemCount * itemHeight;

  // +1 covers the row straddled by the viewport's bottom edge when scrollTop
  // is not an exact multiple of itemHeight, so the last visible row is never
  // left unrendered.
  const visibleCount = Math.ceil(viewportHeight / itemHeight) + 1;

  // Clamp the scroll offset to the current content's max scroll. When a long
  // list shrinks (e.g. search filtering) the scroll container can still report
  // a stale, oversized scrollTop; without this clamp firstVisible would exceed
  // itemCount and produce startIndex > endIndex, rendering a blank list.
  const maxScrollTop = Math.max(0, totalHeight - viewportHeight);
  const safeScrollTop = Math.min(Math.max(0, scrollTop), maxScrollTop);

  const firstVisible = Math.floor(safeScrollTop / itemHeight);

  const startIndex = Math.max(0, firstVisible - overscan);
  const endIndex = Math.min(itemCount, firstVisible + visibleCount + overscan);

  return {
    startIndex,
    endIndex,
    offsetY: startIndex * itemHeight,
    totalHeight,
  };
}
