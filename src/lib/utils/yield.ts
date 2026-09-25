interface SchedulerWithYield {
  yield: () => Promise<void>;
}

function getScheduler(): SchedulerWithYield | undefined {
  const scheduler = (globalThis as { scheduler?: Partial<SchedulerWithYield> })
    .scheduler;
  return typeof scheduler?.yield === "function"
    ? (scheduler as SchedulerWithYield)
    : undefined;
}

/**
 * Yield to the event loop so the browser can paint and handle input between
 * long synchronous stages (#3368).
 *
 * Uses `scheduler.yield()` where available, which resumes ahead of other
 * queued tasks. Elsewhere it falls back to a macrotask via `setTimeout(0)`.
 */
export function yieldToMain(): Promise<void> {
  const scheduler = getScheduler();
  if (scheduler) return scheduler.yield();
  return new Promise((resolve) => setTimeout(resolve, 0));
}
