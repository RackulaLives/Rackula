/**
 * Debounce utility
 * Delays function execution until after a period of inactivity
 */

/** A debounced function, plus a way to cancel a pending invocation. */
export type DebouncedFunction<T extends (...args: Parameters<T>) => void> = ((
  ...args: Parameters<T>
) => void) & {
  /** Cancel a pending invocation, if one is scheduled. A no-op otherwise. */
  cancel: () => void;
};

/**
 * Creates a debounced version of a function
 * @param fn - Function to debounce
 * @param ms - Delay in milliseconds
 * @returns Debounced function, with a `.cancel()` to drop a pending call
 * (needed when a caller replaces the debounced state directly and must stop
 * a stale pending invocation from later overwriting it, #3007).
 */
export function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  ms: number,
): DebouncedFunction<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  function debounced(...args: Parameters<T>): void {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, ms);
  }

  debounced.cancel = (): void => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return debounced;
}
