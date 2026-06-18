/**
 * Konami Code Detector
 * Detects the classic Konami code sequence: ↑↑↓↓←→←→BA
 * Used to trigger Party Mode easter egg
 */

const KONAMI_SEQUENCE = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "KeyB",
  "KeyA",
] as const;

export type KonamiCallback = () => void;

export interface KonamiDetector {
  /** Handle a keyboard event - returns true if sequence completed */
  handleKeyDown: (event: KeyboardEvent) => boolean;
  /** Reset the detector state */
  reset: () => void;
  /** Get the current progress (0-10) */
  getProgress: () => number;
}

/**
 * Creates a Konami code detector
 * @param onActivate - Callback to invoke when the sequence is completed
 * @returns Detector object with handleKeyDown and reset methods
 */
export function createKonamiDetector(
  onActivate: KonamiCallback,
): KonamiDetector {
  let position = 0;

  function handleKeyDown(event: KeyboardEvent): boolean {
    // Only check if the key matches the expected position in the sequence
    if (event.code === KONAMI_SEQUENCE[position]) {
      position++;

      // Check if the full sequence has been entered
      if (position === KONAMI_SEQUENCE.length) {
        position = 0; // Reset for next time
        onActivate();
        return true;
      }
    } else {
      // Wrong key - reset position
      // But check if this key starts a new sequence
      position = event.code === KONAMI_SEQUENCE[0] ? 1 : 0;
    }

    return false;
  }

  function reset(): void {
    position = 0;
  }

  function getProgress(): number {
    return position;
  }

  return {
    handleKeyDown,
    reset,
    getProgress,
  };
}

/**
 * Konami sequence as a readable string for documentation
 */
export const KONAMI_HINT = "↑↑↓↓←→←→BA";
