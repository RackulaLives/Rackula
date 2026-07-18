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
  int: "a whole number",
};

/** Prefixes an unrecognized `expected` type name with "a"/"an" (e.g. "an int", "a bigint") for the {@link PLAIN_TYPE_NAMES} fallback. */
function withIndefiniteArticle(word: string): string {
  return /^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`;
}

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
  const field = singularize(humanizeSegment(named[named.length - 1]!));
  if (named.length === 1) return field;
  const parent = singularize(humanizeSegment(named[named.length - 2]!));
  return `${parent} ${field}`;
}

function capitalize(text: string): string {
  return text.length > 0 ? text[0]!.toUpperCase() + text.slice(1) : text;
}

/**
 * Zod 4's built-in English error map (node_modules/zod/src/v4/locales/en.ts,
 * verified against the installed zod@4.4.3) produces a fixed, recognizable
 * message shape for a field with no custom message on the schema. A schema
 * author's own message is free-form text and never happens to start with
 * these machine-generated prefixes in this codebase (checked every bare
 * `.min()`/`.max()`/`.url()` in src/lib/schemas/index.ts and share.ts).
 *
 * ImportValidationIssue deliberately does not carry the extra fields
 * (`origin`, `minimum`, `maximum`, `inclusive`) the real error map needs to
 * regenerate these messages exactly, so detection matches by prefix/shape
 * instead of reconstructing and comparing the default text. Trade-off: a
 * future custom message that happens to start with the same words (e.g.
 * "Too big: this file cannot be shared") would be misdetected as
 * machine-generated and replaced with the generic clause below.
 */
const ZOD_DEFAULT_MESSAGE_PATTERNS: Partial<Record<string, RegExp>> = {
  too_small: /^Too small: /,
  too_big: /^Too big: /,
  invalid_format: /^Invalid /,
};

/** Plain-language clause appended after the humanized field name (e.g. "Name is invalid") for a field that has no custom schema message. */
const PLAIN_CODE_CLAUSES: Partial<Record<string, string>> = {
  too_small: "does not meet the minimum requirement",
  too_big: "exceeds the maximum allowed",
  invalid_format: "is not formatted correctly",
};

const DEFAULT_ISSUE_CLAUSE = "is invalid";

function isZodDefaultMessage(issue: ImportValidationIssue): boolean {
  const pattern = issue.code
    ? ZOD_DEFAULT_MESSAGE_PATTERNS[issue.code]
    : undefined;
  return pattern ? pattern.test(issue.message) : false;
}

/**
 * Format a single Zod validation issue as plain language, with no dotted
 * path prefix. An existing custom schema message (e.g. "Height cannot
 * exceed 100U") is already human-authored text, so it is preserved as-is.
 * A generic type-mismatch issue has no such message, so a plain-language
 * sentence is built from the field name instead. Other bare constraints
 * (`.min()`, `.max()`, `.url()`, etc. with no message argument) ship Zod's
 * own internal wording (e.g. "Too small: expected string to have >=1
 * characters") - {@link isZodDefaultMessage} detects that case and swaps in
 * plain copy instead of leaking it to the user.
 */
function describeSingleIssue(issue: ImportValidationIssue): string {
  if (issue.code === "invalid_type") {
    const expected = issue.expected
      ? (PLAIN_TYPE_NAMES[issue.expected] ??
        withIndefiniteArticle(issue.expected))
      : "a different value";
    return `${capitalize(humanizeFieldPath(issue.path))} must be ${expected}`;
  }
  if (isZodDefaultMessage(issue)) {
    const clause = issue.code
      ? (PLAIN_CODE_CLAUSES[issue.code] ?? DEFAULT_ISSUE_CLAUSE)
      : DEFAULT_ISSUE_CLAUSE;
    return `${capitalize(humanizeFieldPath(issue.path))} ${clause}`;
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
