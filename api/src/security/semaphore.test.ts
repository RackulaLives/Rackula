import { describe, expect, it } from "bun:test";
import { createSemaphore, SemaphoreSaturatedError } from "./semaphore";

/** A controllable async task: resolves only when `release()` is called. */
function deferredTask(): { promise: Promise<void>; release: () => void } {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe("createSemaphore", () => {
  it("throws when maxConcurrent is less than 1", () => {
    expect(() => createSemaphore(0)).toThrow();
  });

  it("throws when maxConcurrent is not an integer", () => {
    expect(() => createSemaphore(1.5)).toThrow();
    expect(() => createSemaphore(Number.NaN)).toThrow();
    expect(() => createSemaphore(Number.POSITIVE_INFINITY)).toThrow();
  });

  it("throws when maxQueued is negative or not an integer", () => {
    expect(() => createSemaphore(1, -1)).toThrow();
    expect(() => createSemaphore(1, 1.5)).toThrow();
    expect(() => createSemaphore(1, Number.NaN)).toThrow();
  });

  it("runs a single task immediately", async () => {
    const semaphore = createSemaphore(2);
    const result = await semaphore.run(async () => "done");
    expect(result).toBe("done");
  });

  it("allows up to maxConcurrent tasks to run at once", () => {
    const semaphore = createSemaphore(2);
    const tasks = [deferredTask(), deferredTask(), deferredTask()];

    for (const task of tasks) {
      void semaphore.run(() => task.promise);
    }

    // Only the first 2 should have acquired a slot; the 3rd queues.
    expect(semaphore.active).toBe(2);
    expect(semaphore.pending).toBe(1);
  });

  it("runs a queued task once a slot frees up", async () => {
    const semaphore = createSemaphore(1);
    const first = deferredTask();
    const second = deferredTask();

    const firstRun = semaphore.run(() => first.promise);
    const secondRun = semaphore.run(() => second.promise);

    expect(semaphore.active).toBe(1);
    expect(semaphore.pending).toBe(1);

    first.release();
    await firstRun;

    // Releasing the first slot should immediately hand it to the queued task.
    expect(semaphore.active).toBe(1);
    expect(semaphore.pending).toBe(0);

    second.release();
    await secondRun;

    expect(semaphore.active).toBe(0);
    expect(semaphore.pending).toBe(0);
  });

  it("releases the slot even when the task throws", async () => {
    const semaphore = createSemaphore(1);

    await expect(
      semaphore.run(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(semaphore.active).toBe(0);
    expect(semaphore.pending).toBe(0);

    // A slot must still be available after the failure.
    const result = await semaphore.run(async () => "ok");
    expect(result).toBe("ok");
  });

  it("rejects immediately when the queue is full (load shedding)", async () => {
    // 1 slot + room for 1 queued task; a 3rd concurrent caller is shed.
    const semaphore = createSemaphore(1, 1);
    const running = deferredTask();
    const queued = deferredTask();

    const runningTask = semaphore.run(() => running.promise); // takes the slot
    const queuedTask = semaphore.run(() => queued.promise); // fills the queue

    expect(semaphore.active).toBe(1);
    expect(semaphore.pending).toBe(1);

    // Third caller has nowhere to go: rejected synchronously, no slot consumed.
    await expect(semaphore.run(async () => "shed")).rejects.toBeInstanceOf(
      SemaphoreSaturatedError,
    );
    expect(semaphore.active).toBe(1);
    expect(semaphore.pending).toBe(1);

    running.release();
    queued.release();
    await Promise.all([runningTask, queuedTask]);

    expect(semaphore.active).toBe(0);
    expect(semaphore.pending).toBe(0);
  });

  it("runs queued tasks in FIFO order", async () => {
    const semaphore = createSemaphore(1);
    const order: number[] = [];
    const blocker = deferredTask();

    const holdRun = semaphore.run(() => blocker.promise);
    const secondRun = semaphore.run(async () => {
      order.push(2);
    });
    const thirdRun = semaphore.run(async () => {
      order.push(3);
    });

    blocker.release();
    await Promise.all([holdRun, secondRun, thirdRun]);

    expect(order).toEqual([2, 3]);
  });
});
