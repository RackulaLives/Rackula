/**
 * Plain-language copy for import/decode failures (#2989).
 *
 * The file-import path (yaml.ts, loading a .yaml/.zip layout) and the
 * share-link decode path (share.ts, the `?l=` URL) hit the same three
 * failure shapes: the payload cannot be parsed at all, it parses but is not
 * a layout, or it parses as a layout with one invalid field. Both doors
 * route their failure copy through this module so they cannot drift apart
 * again (R4, docs/research/ui-friction-review-2026-07-11.md).
 */

export type ImportSource = "file" | "share-link";

/**
 * Shown when the payload cannot be parsed at all (a corrupt or binary file,
 * malformed compression, invalid JSON). Raw detail belongs on the console,
 * never in this copy.
 */
export function unreadableImportMessage(source: ImportSource): string {
  return source === "file"
    ? "Could not read layout file"
    : "Could not decode share link";
}

/**
 * Shown when the payload parses but does not resolve to a valid layout.
 * This is the share-link path's original curated copy, reused verbatim so a
 * user gets the same words for the same underlying problem through either
 * door.
 */
export const INVALID_LAYOUT_FORMAT_MESSAGE =
  "Layout format is invalid or outdated";

/**
 * The subset of a Zod issue this module reads. Kept independent of Zod's own
 * issue type so callers (and tests) can pass a plain object shaped like one.
 */
export interface ImportValidationIssue {
  path: PropertyKey[];
  message: string;
  code?: string;
  expected?: string;
}

/** Plain-language names for the Zod `expected` type strings used by the schema. */
const PLAIN_TYPE_NAMES: Record<string, string> = {
  number: "a number",
  string: "text",
  boolean: "true or false",
  array: "a list",
  object: "an object",
};

function humanizeSegment(segment: PropertyKey): string {
  return String(segment).replace(/_/g, " ");
}

function singularize(word: string): string {
  return word.endsWith("s") && word.length > 1 ? word.slice(0, -1) : word;
}

/**
 * Turn a Zod issue path (e.g. `["racks", 0, "devices", 0, "position"]`) into
 * a short plain-language field label (e.g. "device position"). Array indices
 * are dropped; only the field and its immediate named parent are kept so the
 * label stays short.
 */
function humanizeFieldPath(path: PropertyKey[]): string {
  const named = path.filter((segment) => typeof segment !== "number");
  if (named.length === 0) return "value";
  const field = humanizeSegment(named[named.length - 1]!);
  if (named.length === 1) return field;
  const parent = singularize(humanizeSegment(named[named.length - 2]!));
  return `${parent} ${field}`;
}

function capitalize(text: string): string {
  return text.length > 0 ? text[0]!.toUpperCase() + text.slice(1) : text;
}

/**
 * Format a single Zod validation issue as plain language, with no dotted
 * path prefix. An existing custom schema message (e.g. "Height cannot
 * exceed 100U") is already human-authored text, so it is preserved as-is; a
 * generic type-mismatch issue has no such message, so a plain-language
 * sentence is built from the field name instead.
 */
function describeSingleIssue(issue: ImportValidationIssue): string {
  if (issue.code === "invalid_type") {
    const expected = issue.expected
      ? (PLAIN_TYPE_NAMES[issue.expected] ?? `a ${issue.expected}`)
      : "a different value";
    return `${capitalize(humanizeFieldPath(issue.path))} must be ${expected}`;
  }
  return issue.message;
}

/**
 * Map a list of Zod validation issues to one plain-language toast message.
 * A single issue gets a field-aware message (see {@link describeSingleIssue}).
 * Zero or multiple issues fall back to {@link INVALID_LAYOUT_FORMAT_MESSAGE}:
 * a comma-joined raw issue list is never shown to the user.
 */
export function describeValidationIssues(
  issues: ImportValidationIssue[],
): string {
  if (issues.length === 1) {
    return describeSingleIssue(issues[0]!);
  }
  return INVALID_LAYOUT_FORMAT_MESSAGE;
}
