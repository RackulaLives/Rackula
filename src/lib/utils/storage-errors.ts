/**
 * Plain-language copy for browser-storage write failures (#3375).
 *
 * A refused write is the one storage failure the user can act on, and until
 * now it was reported as "Saved". The copy has to say three things: that the
 * layout was not saved, why, and that exporting to a file is the way to keep
 * it. Raw error detail belongs on the console, never in this copy.
 */

import type { StorageWriteFailure } from "./safe-storage";

/**
 * Shown when the working copy could not be written to browser storage.
 * The quota case is recoverable by the user (export, or delete a layout they
 * no longer need); blocked storage is not, so it does not promise that
 * freeing space helps.
 */
export function storageWriteFailureMessage(
  failure: StorageWriteFailure,
  layoutName?: string,
): string {
  const subject = layoutName ? `"${layoutName}"` : "This layout";
  return failure === "quota"
    ? `${subject} was not saved: this browser is out of storage space. Export it to a file to keep your work, or delete a layout you no longer need.`
    : `${subject} was not saved: this browser is blocking storage. Export it to a file to keep your work.`;
}
