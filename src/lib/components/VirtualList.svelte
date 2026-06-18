<!--
  VirtualList Component
  Fixed-height windowed list. Renders only the rows intersecting the scroll
  viewport (plus an overscan margin) so long device lists stay smooth. The
  windowing geometry lives in $lib/utils/virtualList; this component owns the
  scroll element, the spacer, and the rendered slice.
-->
<script lang="ts" generics="T">
  import {
    computeVisibleWindow,
    type VisibleWindow,
  } from "$lib/utils/virtualList";
  import type { Snippet } from "svelte";

  interface Props {
    /** Items to render. */
    items: T[];
    /** Fixed row height in pixels. */
    itemHeight: number;
    /** Rows rendered beyond the viewport on each side. */
    overscan?: number;
    /** Renders a single row. Receives the item and its absolute index. */
    row: Snippet<[T, number]>;
    /** Stable identity for an item, used as the {#each} key so the same DOM
     *  node is never reused for a different item when the slice shifts. */
    key: (item: T) => string | number;
    /** Optional accessible label for the scroll region. */
    ariaLabel?: string;
  }

  let {
    items,
    itemHeight,
    overscan = 4,
    row,
    key,
    ariaLabel,
  }: Props = $props();

  let scrollTop = $state(0);
  let viewportHeight = $state(0);

  // Before the first layout pass clientHeight reports 0; fall back to a single
  // viewport's worth of rows so the initial paint is never empty.
  const effectiveViewportHeight = $derived(
    viewportHeight > 0 ? viewportHeight : itemHeight * (overscan * 2 + 1),
  );

  const visibleWindow = $derived<VisibleWindow>(
    computeVisibleWindow({
      scrollTop,
      viewportHeight: effectiveViewportHeight,
      itemHeight,
      itemCount: items.length,
      overscan,
    }),
  );

  const visibleItems = $derived(
    items.slice(visibleWindow.startIndex, visibleWindow.endIndex),
  );

  function handleScroll(event: Event) {
    scrollTop = (event.currentTarget as HTMLElement).scrollTop;
  }
</script>

<div
  class="virtual-list"
  role="list"
  aria-label={ariaLabel}
  onscroll={handleScroll}
  bind:clientHeight={viewportHeight}
>
  <div class="virtual-list-spacer" style:height="{visibleWindow.totalHeight}px">
    <div
      class="virtual-list-window"
      style:transform="translateY({visibleWindow.offsetY}px)"
    >
      {#each visibleItems as item, i (key(item))}
        {@render row(item, visibleWindow.startIndex + i)}
      {/each}
    </div>
  </div>
</div>

<style>
  .virtual-list {
    overflow-y: auto;
    /* Cap the windowed viewport so the spacer can scroll within it. */
    max-height: 100%;
  }

  .virtual-list-spacer {
    position: relative;
    width: 100%;
  }

  .virtual-list-window {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    display: flex;
    flex-direction: column;
  }
</style>
