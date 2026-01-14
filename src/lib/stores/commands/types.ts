/**
 * Command Types for Undo/Redo System
 *
 * Uses the Command Pattern to encapsulate actions as objects
 * that can be executed, undone, and redone.
 */

/**
 * All supported command types
 */
export type CommandType =
  | "ADD_DEVICE_TYPE"
  | "UPDATE_DEVICE_TYPE"
  | "DELETE_DEVICE_TYPE"
  | "PLACE_DEVICE"
  | "MOVE_DEVICE"
  | "REMOVE_DEVICE"
  | "UPDATE_DEVICE_FACE"
  | "UPDATE_DEVICE_NAME"
  | "UPDATE_RACK"
  | "REPLACE_RACK"
  | "CLEAR_RACK"
  | "CREATE_RACK_GROUP"
  | "UPDATE_RACK_GROUP"
  | "DELETE_RACK_GROUP"
  | "BATCH";

/**
 * Base command interface
 *
 * Each command encapsulates an action that can be executed and undone.
 * Commands should store the minimal data needed to perform both operations.
 */
export interface Command {
  /** Command type identifier */
  type: CommandType;

  /** Human-readable description for UI (e.g., "Add device") */
  description: string;

  /** Timestamp when command was created */
  timestamp: number;

  /** Execute the command (apply changes) */
  execute(): void;

  /** Reverse the command (undo changes) */
  undo(): void;
}

/**
 * Batch command for grouping multiple commands as a single undoable unit
 *
 * Used for compound operations like deleting a device type with placed instances.
 */
export interface BatchCommand extends Command {
  type: "BATCH";

  /** The grouped commands */
  commands: Command[];
}

/**
 * Helper to create a batch command
 */
export function createBatchCommand(
  description: string,
  commands: Command[],
): BatchCommand {
  return {
    type: "BATCH",
    description,
    timestamp: Date.now(),
    commands,
    execute() {
      this.commands.forEach((cmd) => cmd.execute());
    },
    undo() {
      // Undo in reverse order
      [...this.commands].reverse().forEach((cmd) => cmd.undo());
    },
  };
}
