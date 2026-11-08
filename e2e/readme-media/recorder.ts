import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";

export interface Point {
  x: number;
  y: number;
}

const CURSOR_ID = "media-cursor";
const CURSOR_SVG =
  '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 2l16 10-7 1.6L9.5 21z" fill="#fff" stroke="#111" stroke-width="1.5" stroke-linejoin="round"/></svg>';

/**
 * Records an animation one screenshot per unique frame.
 *
 * Output time comes from the frame count, not the clock, so a slow runner gives
 * the same animation. Every frame is the same size. Headless Chromium has no
 * pointer, so a fake cursor is injected for the viewer.
 *
 * With a null dir nothing is recorded and steps are skipped, so a shot can reuse
 * the same flow to reach a final state.
 */
export class FrameRecorder {
  private frame = 0;
  private cursor: Point = { x: 150, y: 148 };

  constructor(
    private readonly page: Page,
    private readonly dir: string | null,
  ) {
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
    }
  }

  async installCursor(): Promise<void> {
    if (!this.dir) return;
    await this.page.evaluate(
      ({ id, svg }) => {
        const el = document.createElement("div");
        el.id = id;
        el.style.cssText =
          "position:fixed;left:0;top:0;z-index:99999;pointer-events:none;width:22px;height:22px";
        el.innerHTML = svg;
        document.body.append(el);
      },
      { id: CURSOR_ID, svg: CURSOR_SVG },
    );
    await this.placeCursor(this.cursor);
  }

  /** Capture the page and hold it for this many output frames. */
  async snap(holdFrames = 1): Promise<void> {
    if (!this.dir) return;
    const first = this.path(this.frame + 1);
    await this.page.screenshot({
      path: first,
      animations: "disabled",
      caret: "hide",
    });
    this.frame += 1;
    for (let held = 1; held < holdFrames; held += 1) {
      this.frame += 1;
      copyFileSync(first, this.path(this.frame));
    }
  }

  /**
   * Glide the cursor over this many frames, snapping each. onStep runs before
   * each snap, so a drag can update the page at every position.
   */
  async moveCursor(
    to: Point,
    frames: number,
    onStep?: (point: Point) => Promise<void>,
  ): Promise<void> {
    const from = this.cursor;
    for (let step = 1; step <= frames; step += 1) {
      const t = easeInOut(step / frames);
      const point = {
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
      };
      if (this.dir) await this.placeCursor(point);
      if (onStep) await onStep(point);
      await this.snap();
    }
    this.cursor = to;
  }

  private placeCursor(point: Point): Promise<void> {
    return this.page.evaluate(
      ({ id, x, y }) => {
        const el = document.getElementById(id);
        if (el) el.style.transform = `translate(${x}px,${y}px)`;
      },
      { id: CURSOR_ID, ...point },
    );
  }

  private path(frame: number): string {
    return join(this.dir ?? "", `f${String(frame).padStart(4, "0")}.png`);
  }
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}
