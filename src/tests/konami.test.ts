import { describe, it, expect, vi } from "vitest";
import { createKonamiDetector, KONAMI_HINT } from "$lib/utils/konami";

describe("Konami Detector", () => {
  // Helper to create a mock keyboard event
  function createKeyEvent(code: string): KeyboardEvent {
    return new KeyboardEvent("keydown", { code });
  }

  // Full Konami sequence
  const SEQUENCE = [
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
  ];

  describe("Sequence Detection", () => {
    it("calls onActivate when full sequence is entered", () => {
      const onActivate = vi.fn();
      const detector = createKonamiDetector(onActivate);

      // Enter the full sequence
      for (const code of SEQUENCE) {
        detector.handleKeyDown(createKeyEvent(code));
      }

      expect(onActivate).toHaveBeenCalledTimes(1);
    });

    it("returns true when sequence is completed", () => {
      const detector = createKonamiDetector(() => {});

      // Enter all but last key
      for (let i = 0; i < SEQUENCE.length - 1; i++) {
        const result = detector.handleKeyDown(createKeyEvent(SEQUENCE[i]));
        expect(result).toBe(false);
      }

      // Last key should return true
      const result = detector.handleKeyDown(
        createKeyEvent(SEQUENCE[SEQUENCE.length - 1]),
      );
      expect(result).toBe(true);
    });

    it("resets after successful activation", () => {
      const onActivate = vi.fn();
      const detector = createKonamiDetector(onActivate);

      // Complete the sequence twice
      for (const code of SEQUENCE) {
        detector.handleKeyDown(createKeyEvent(code));
      }
      for (const code of SEQUENCE) {
        detector.handleKeyDown(createKeyEvent(code));
      }

      expect(onActivate).toHaveBeenCalledTimes(2);
    });
  });

  describe("Progress Tracking", () => {
    it("starts at position 0", () => {
      const detector = createKonamiDetector(() => {});
      expect(detector.getProgress()).toBe(0);
    });

    it("increments progress with correct keys", () => {
      const detector = createKonamiDetector(() => {});

      detector.handleKeyDown(createKeyEvent("ArrowUp"));
      expect(detector.getProgress()).toBe(1);

      detector.handleKeyDown(createKeyEvent("ArrowUp"));
      expect(detector.getProgress()).toBe(2);
    });

    it("resets progress on wrong key", () => {
      const detector = createKonamiDetector(() => {});

      detector.handleKeyDown(createKeyEvent("ArrowUp"));
      detector.handleKeyDown(createKeyEvent("ArrowUp"));
      expect(detector.getProgress()).toBe(2);

      // Wrong key
      detector.handleKeyDown(createKeyEvent("KeyX"));
      expect(detector.getProgress()).toBe(0);
    });

    it("starts new sequence if wrong key matches first key", () => {
      const detector = createKonamiDetector(() => {});

      detector.handleKeyDown(createKeyEvent("ArrowUp"));
      detector.handleKeyDown(createKeyEvent("ArrowUp"));
      expect(detector.getProgress()).toBe(2);

      // Wrong key that happens to be the first key of sequence
      detector.handleKeyDown(createKeyEvent("ArrowUp"));
      expect(detector.getProgress()).toBe(1);
    });
  });

  describe("Reset", () => {
    it("resets progress to 0", () => {
      const detector = createKonamiDetector(() => {});

      detector.handleKeyDown(createKeyEvent("ArrowUp"));
      detector.handleKeyDown(createKeyEvent("ArrowUp"));
      expect(detector.getProgress()).toBe(2);

      detector.reset();
      expect(detector.getProgress()).toBe(0);
    });
  });

  describe("Edge Cases", () => {
    it("does not activate on partial sequence", () => {
      const onActivate = vi.fn();
      const detector = createKonamiDetector(onActivate);

      // Enter partial sequence
      for (let i = 0; i < 5; i++) {
        detector.handleKeyDown(createKeyEvent(SEQUENCE[i]));
      }

      expect(onActivate).not.toHaveBeenCalled();
    });

    it("ignores unrelated keys without breaking sequence", () => {
      const onActivate = vi.fn();
      const detector = createKonamiDetector(onActivate);

      // Start sequence
      detector.handleKeyDown(createKeyEvent("ArrowUp"));
      expect(detector.getProgress()).toBe(1);

      // Unrelated key breaks it
      detector.handleKeyDown(createKeyEvent("Space"));
      expect(detector.getProgress()).toBe(0);
    });
  });

  describe("Constants", () => {
    it("exports KONAMI_HINT", () => {
      expect(KONAMI_HINT).toBe("↑↑↓↓←→←→BA");
    });
  });
});
