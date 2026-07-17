import { describe, it, expect, beforeEach } from "vitest";
import {
  getHistoryStore,
  resetHistoryStore,
  MAX_HISTORY_DEPTH,
} from "$lib/stores/history.svelte";
import { getToastStore, resetToastStore } from "$lib/stores/toast.svelte";
import { createMockCommand } from "./factories";

describe("History Store", () => {
  beforeEach(() => {
    resetHistoryStore();
  });

  describe("execute", () => {
    it("adds command to undoStack", () => {
      const store = getHistoryStore();
      const command = createMockCommand("Test command");

      store.execute(command);

      expect(store.canUndo).toBe(true);
      expect(store.historyLength).toBe(1);
    });

    it("clears redoStack when executing new command", () => {
      const store = getHistoryStore();
      const cmd1 = createMockCommand("Command 1");
      const cmd2 = createMockCommand("Command 2");
      const cmd3 = createMockCommand("Command 3");

      store.execute(cmd1);
      store.execute(cmd2);
      store.undo(); // cmd2 is now in redoStack

      expect(store.canRedo).toBe(true);

      store.execute(cmd3); // Should clear redoStack

      expect(store.canRedo).toBe(false);
    });

    it("calls command.execute()", () => {
      const store = getHistoryStore();
      const command = createMockCommand("Test");

      store.execute(command);

      expect(command.execute).toHaveBeenCalledTimes(1);
    });

    it("enforces max depth - drops oldest when exceeded", () => {
      const store = getHistoryStore();

      // Add MAX_HISTORY_DEPTH + 1 commands
      for (let i = 0; i <= MAX_HISTORY_DEPTH; i++) {
        store.execute(createMockCommand(`Command ${i}`));
      }

      // Should only have MAX_HISTORY_DEPTH commands
      expect(store.historyLength).toBe(MAX_HISTORY_DEPTH);

      // The first command should be "Command 1" (Command 0 was dropped)
      expect(store.undoDescription).toBe(`Undo: Command ${MAX_HISTORY_DEPTH}`);
    });
  });

  describe("undo", () => {
    it("returns false when undoStack is empty", () => {
      const store = getHistoryStore();

      const result = store.undo();

      expect(result).toBe(false);
    });

    it("pops from undoStack and pushes to redoStack", () => {
      const store = getHistoryStore();
      const command = createMockCommand("Test");

      store.execute(command);
      expect(store.canUndo).toBe(true);
      expect(store.canRedo).toBe(false);

      const result = store.undo();

      expect(result).toBe(true);
      expect(store.canUndo).toBe(false);
      expect(store.canRedo).toBe(true);
    });

    it("calls command.undo()", () => {
      const store = getHistoryStore();
      const command = createMockCommand("Test");

      store.execute(command);
      store.undo();

      expect(command.undo).toHaveBeenCalledTimes(1);
    });

    it("updates canUndo/canRedo correctly", () => {
      const store = getHistoryStore();
      const cmd1 = createMockCommand("Command 1");
      const cmd2 = createMockCommand("Command 2");

      expect(store.canUndo).toBe(false);
      expect(store.canRedo).toBe(false);

      store.execute(cmd1);
      expect(store.canUndo).toBe(true);
      expect(store.canRedo).toBe(false);

      store.execute(cmd2);
      expect(store.canUndo).toBe(true);
      expect(store.canRedo).toBe(false);

      store.undo();
      expect(store.canUndo).toBe(true); // cmd1 still there
      expect(store.canRedo).toBe(true); // cmd2 in redo

      store.undo();
      expect(store.canUndo).toBe(false); // empty
      expect(store.canRedo).toBe(true); // both in redo
    });
  });

  describe("redo", () => {
    it("returns false when redoStack is empty", () => {
      const store = getHistoryStore();

      const result = store.redo();

      expect(result).toBe(false);
    });

    it("pops from redoStack and pushes to undoStack", () => {
      const store = getHistoryStore();
      const command = createMockCommand("Test");

      store.execute(command);
      store.undo();

      expect(store.canRedo).toBe(true);
      expect(store.canUndo).toBe(false);

      const result = store.redo();

      expect(result).toBe(true);
      expect(store.canRedo).toBe(false);
      expect(store.canUndo).toBe(true);
    });

    it("calls command.execute() on redo", () => {
      const store = getHistoryStore();
      const command = createMockCommand("Test");

      store.execute(command);
      store.undo();
      store.redo();

      // execute called twice: once on initial execute, once on redo
      expect(command.execute).toHaveBeenCalledTimes(2);
    });

    it("updates canUndo/canRedo correctly", () => {
      const store = getHistoryStore();
      const cmd1 = createMockCommand("Command 1");
      const cmd2 = createMockCommand("Command 2");

      store.execute(cmd1);
      store.execute(cmd2);
      store.undo();
      store.undo();

      expect(store.canUndo).toBe(false);
      expect(store.canRedo).toBe(true);

      store.redo();
      expect(store.canUndo).toBe(true);
      expect(store.canRedo).toBe(true);

      store.redo();
      expect(store.canUndo).toBe(true);
      expect(store.canRedo).toBe(false);
    });
  });

  describe("clear", () => {
    it("empties both stacks", () => {
      const store = getHistoryStore();
      const cmd1 = createMockCommand("Command 1");
      const cmd2 = createMockCommand("Command 2");

      store.execute(cmd1);
      store.execute(cmd2);
      store.undo();

      expect(store.canUndo).toBe(true);
      expect(store.canRedo).toBe(true);

      store.clear();

      expect(store.canUndo).toBe(false);
      expect(store.canRedo).toBe(false);
      expect(store.historyLength).toBe(0);
    });
  });

  describe("derived values", () => {
    it("undoDescription shows last command description", () => {
      const store = getHistoryStore();

      expect(store.undoDescription).toBeNull();

      store.execute(createMockCommand("Add device"));
      expect(store.undoDescription).toBe("Undo: Add device");

      store.execute(createMockCommand("Move device"));
      expect(store.undoDescription).toBe("Undo: Move device");
    });

    it("redoDescription shows next redo description", () => {
      const store = getHistoryStore();

      expect(store.redoDescription).toBeNull();

      store.execute(createMockCommand("Add device"));
      store.execute(createMockCommand("Move device"));

      expect(store.redoDescription).toBeNull();

      store.undo();
      expect(store.redoDescription).toBe("Redo: Move device");

      store.undo();
      expect(store.redoDescription).toBe("Redo: Add device");
    });

    it("historyLength returns undoStack length", () => {
      const store = getHistoryStore();

      expect(store.historyLength).toBe(0);

      store.execute(createMockCommand("Command 1"));
      expect(store.historyLength).toBe(1);

      store.execute(createMockCommand("Command 2"));
      expect(store.historyLength).toBe(2);

      store.undo();
      expect(store.historyLength).toBe(1);
    });
  });

  describe("state machine edge cases", () => {
    it("handles rapid alternating undo/redo without corruption", () => {
      const store = getHistoryStore();
      const commands = Array.from({ length: 5 }, (_, i) =>
        createMockCommand(`Command ${i}`),
      );

      // Execute all commands
      commands.forEach((cmd) => store.execute(cmd));
      expect(store.historyLength).toBe(5);

      // Rapid alternating undo/redo (simulates keyboard mashing)
      for (let i = 0; i < 10; i++) {
        store.undo();
        store.redo();
      }

      // State should be stable - all commands still in undo stack
      expect(store.historyLength).toBe(5);
      expect(store.canUndo).toBe(true);
      expect(store.canRedo).toBe(false);
    });

    it("maintains consistency through interleaved execute/undo/redo", () => {
      const store = getHistoryStore();

      // Execute -> Undo -> Execute pattern (new command clears redo)
      store.execute(createMockCommand("A"));
      store.execute(createMockCommand("B"));
      store.undo(); // B in redo
      expect(store.canRedo).toBe(true);

      store.execute(createMockCommand("C")); // Should clear redo
      expect(store.canRedo).toBe(false);
      expect(store.historyLength).toBe(2); // A, C

      store.undo(); // C in redo
      store.undo(); // A in redo
      expect(store.historyLength).toBe(0);
      expect(store.canRedo).toBe(true);

      store.redo(); // A back
      store.redo(); // C back
      expect(store.historyLength).toBe(2);
      expect(store.undoDescription).toBe("Undo: C");
    });

    it("handles undo past start gracefully", () => {
      const store = getHistoryStore();
      store.execute(createMockCommand("Only command"));

      expect(store.undo()).toBe(true);
      expect(store.undo()).toBe(false);
      expect(store.undo()).toBe(false);
      expect(store.undo()).toBe(false);

      // State remains valid
      expect(store.canUndo).toBe(false);
      expect(store.canRedo).toBe(true);
    });

    it("handles redo past end gracefully", () => {
      const store = getHistoryStore();
      store.execute(createMockCommand("Command"));
      store.undo();

      expect(store.redo()).toBe(true);
      expect(store.redo()).toBe(false);
      expect(store.redo()).toBe(false);
      expect(store.redo()).toBe(false);

      // State remains valid
      expect(store.canUndo).toBe(true);
      expect(store.canRedo).toBe(false);
    });

    it("verifies command execution order during rapid operations", () => {
      const store = getHistoryStore();
      const executionLog: string[] = [];

      const makeLoggingCommand = (name: string) => ({
        description: name,
        execute: () => executionLog.push(`exec:${name}`),
        undo: () => executionLog.push(`undo:${name}`),
      });

      store.execute(makeLoggingCommand("A"));
      store.execute(makeLoggingCommand("B"));
      store.execute(makeLoggingCommand("C"));

      // Clear log to track undo/redo sequence
      executionLog.length = 0;

      store.undo(); // undo C
      store.undo(); // undo B
      store.redo(); // redo B
      store.undo(); // undo B
      store.redo(); // redo B
      store.redo(); // redo C

      expect(executionLog).toEqual([
        "undo:C",
        "undo:B",
        "exec:B",
        "undo:B",
        "exec:B",
        "exec:C",
      ]);
    });
  });

  // #2993, #3028: every undo-affordance toast's action calls
  // layoutStore.undo(), which always reverts the top of this history's undo
  // stack. Once execute() records a newer command, an existing toast no
  // longer describes what its Undo button would revert. Hooking dismissal
  // into execute() -- the single choke point every recorded mutation passes
  // through -- makes the affordance honest by construction rather than
  // patching each of the four call sites that raise one of these toasts.
  describe("execute() dismisses undo toasts", () => {
    beforeEach(() => {
      resetToastStore();
    });

    it("dismisses a live undo-affordance toast when a new command is recorded", () => {
      const store = getHistoryStore();
      const toastStore = getToastStore();
      toastStore.showUndoToast("Removed A", () => {});

      expect(toastStore.toasts.some((t) => t.message === "Removed A")).toBe(
        true,
      );

      // Repro: A is removed (toast shown), then an unrelated mutation (move
      // B) is recorded before the toast is clicked.
      store.execute(createMockCommand("Move B"));

      // The stale toast is gone -- nothing left to click that would silently
      // undo "Move B" instead of restoring "A".
      expect(toastStore.toasts.some((t) => t.message === "Removed A")).toBe(
        false,
      );
    });

    it("dismisses a custom-label undo toast the same way (DevicePalette's Undo All site, #3028)", () => {
      const store = getHistoryStore();
      const toastStore = getToastStore();
      toastStore.showUndoToast("Deleted 3 device types", () => {}, "Undo All");

      store.execute(createMockCommand("Place device"));

      expect(
        toastStore.toasts.some((t) => t.message === "Deleted 3 device types"),
      ).toBe(false);
    });

    it("does not dismiss toasts that carry no undo affordance", () => {
      const store = getHistoryStore();
      const toastStore = getToastStore();
      toastStore.showToast("Layout saved", "success");

      store.execute(createMockCommand("Move B"));

      expect(toastStore.toasts.some((t) => t.message === "Layout saved")).toBe(
        true,
      );
    });

    it("leaves the newest undo toast alone: only prior toasts are stale", () => {
      const store = getHistoryStore();
      const toastStore = getToastStore();

      // The site that just recorded a command shows its own toast afterward,
      // synchronously -- execute()'s dismissal already ran by then.
      store.execute(createMockCommand("Remove A"));
      toastStore.showUndoToast("Removed A", () => {});

      expect(toastStore.toasts.some((t) => t.message === "Removed A")).toBe(
        true,
      );
    });
  });
});
