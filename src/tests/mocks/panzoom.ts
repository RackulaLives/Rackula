import { vi } from "vitest";

export function createMockPanzoom(initialScale = 1) {
  let transform = { x: 0, y: 0, scale: initialScale };
  const listeners: Record<string, Array<() => void>> = {};

  const mock = {
    getTransform: () => ({ ...transform }),
    zoomAbs: vi.fn((x: number, y: number, scale: number) => {
      const oldScale = transform.scale || 1;
      const scaleRatio = scale / oldScale;
      transform = {
        x: x - (x - transform.x) * scaleRatio,
        y: y - (y - transform.y) * scaleRatio,
        scale,
      };
      listeners["zoom"]?.forEach((cb) => {
        cb();
      });
    }),
    smoothZoomAbs: vi.fn((x: number, y: number, scale: number) => {
      const oldScale = transform.scale || 1;
      const scaleRatio = scale / oldScale;
      transform = {
        x: x - (x - transform.x) * scaleRatio,
        y: y - (y - transform.y) * scaleRatio,
        scale,
      };
      listeners["zoom"]?.forEach((cb) => {
        cb();
      });
    }),
    moveTo: vi.fn((x: number, y: number) => {
      transform.x = x;
      transform.y = y;
    }),
    on: vi.fn((event: string, callback: () => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(callback);
    }),
    off: vi.fn((event: string, callback?: () => void) => {
      if (!listeners[event]) return;
      if (!callback) {
        delete listeners[event];
        return;
      }

      listeners[event] = listeners[event].filter((cb) => cb !== callback);
      if (listeners[event].length === 0) {
        delete listeners[event];
      }
    }),
    dispose: vi.fn(),
  };

  return mock as typeof mock & ReturnType<typeof import("panzoom").default>;
}
