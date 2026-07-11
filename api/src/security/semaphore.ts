/**
 * Counting semaphore bounding concurrent execution of async work.
 *
 * Used to cap globally expensive operations (e.g. Argon2id verification)
 * independent of any per-client identity, so a bound holds regardless of how
 * many distinct sources the work is requested from.
 *
 * @module semaphore
 */

/**
 * Error thrown by {@link Semaphore.run} when the wait queue is full.
 *
 * A full queue means the semaphore is shedding load: callers beyond the
 * configured `maxQueued` are rejected immediately rather than parked
 * indefinitely, which bounds worst-case memory and latency under a flood.
 */
export class SemaphoreSaturatedError extends Error {
  constructor(message = "Semaphore queue is full") {
    super(message);
    this.name = "SemaphoreSaturatedError";
  }
}

/**
 * A semaphore instance limiting how many callers of `run` execute at once.
 */
export interface Semaphore {
  /** Number of callers currently holding a slot and running. */
  readonly active: number;
  /** Number of callers waiting for a slot to free up. */
  readonly pending: number;
  /**
   * Run `fn` once a slot is available. Additional callers beyond the
   * configured concurrency limit queue in FIFO order and run as slots free up.
   * When the queue is already at `maxQueued`, the call is rejected immediately
   * with a {@link SemaphoreSaturatedError} instead of being enqueued. The slot
   * is always released, whether `fn` resolves or rejects.
   */
  run<T>(fn: () => Promise<T>): Promise<T>;
}

/**
 * Create a semaphore that allows at most `maxConcurrent` callers to run
 * concurrently, queueing up to `maxQueued` additional callers.
 *
 * @param maxConcurrent - Maximum concurrent executions. Must be an integer >= 1.
 * @param maxQueued - Maximum callers allowed to wait for a slot. Must be an
 *   integer >= 0, or `Infinity` (the default) for an unbounded queue. When the
 *   queue is full, `run` rejects with {@link SemaphoreSaturatedError}.
 */
export function createSemaphore(
  maxConcurrent: number,
  maxQueued: number = Number.POSITIVE_INFINITY,
): Semaphore {
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
    throw new Error("maxConcurrent must be an integer of at least 1");
  }
  if (
    maxQueued !== Number.POSITIVE_INFINITY &&
    (!Number.isInteger(maxQueued) || maxQueued < 0)
  ) {
    throw new Error("maxQueued must be a non-negative integer or Infinity");
  }

  let active = 0;
  const queue: Array<() => void> = [];

  function acquire(): Promise<void> {
    if (active < maxConcurrent) {
      active++;
      return Promise.resolve();
    }
    if (queue.length >= maxQueued) {
      return Promise.reject(new SemaphoreSaturatedError());
    }
    return new Promise((resolve) => {
      queue.push(() => {
        active++;
        resolve();
      });
    });
  }

  function release(): void {
    active--;
    const next = queue.shift();
    if (next) {
      next();
    }
  }

  return {
    get active() {
      return active;
    },
    get pending() {
      return queue.length;
    },
    async run<T>(fn: () => Promise<T>): Promise<T> {
      await acquire();
      try {
        return await fn();
      } finally {
        release();
      }
    },
  };
}
