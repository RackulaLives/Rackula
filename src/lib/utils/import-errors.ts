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

/** Escapes regex metacharacters so a literal string can be embedded in a larger pattern. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The exact set of format labels Zod 4's default English error map emits for
 * `invalid_format` (node_modules/zod/src/v4/locales/en.ts `FormatDictionary`,
 * verified against the installed zod@4.4.3). Only formats this codebase's
 * schemas use bare (no custom message) matter in practice - currently just
 * `.url()` ("Invalid URL") - but the full dictionary is listed so this stays
 * correct if a future bare `.email()`/`.uuid()`/etc. is added.
 */
const INVALID_FORMAT_DEFAULT_LABELS = [
  "input",
  "email address",
  "URL",
  "emoji",
  "UUID",
  "UUIDv4",
  "UUIDv6",
  "nanoid",
  "GUID",
  "cuid",
  "cuid2",
  "ULID",
  "XID",
  "KSUID",
  "ISO datetime",
  "ISO date",
  "ISO time",
  "ISO duration",
  "IPv4 address",
  "IPv6 address",
  "MAC address",
  "IPv4 range",
  "IPv6 range",
  "base64-encoded string",
  "base64url-encoded string",
  "JSON string",
  "E.164 number",
  "JWT",
];

/**
 * A single Zod-generated `values` token: a double-quoted string (from
 * `z.enum(...)`) or a bare number (from `z.literal(<number>)`). Used to
 * match `invalid_value`'s default message, which lists one or more of these
 * joined by `|`.
 */
const INVALID_VALUE_TOKEN = String.raw`(?:"[^"]*"|-?\d+(?:\.\d+)?)`;

/**
 * Zod 4's built-in English error map (node_modules/zod/src/v4/locales/en.ts,
 * verified against the installed zod@4.4.3) produces a fixed, recognizable
 * message shape for a field with no custom message on the schema. Each
 * pattern below is anchored (`^...$`) and matches the *full* generated
 * template for that issue code, not just its leading words, so a custom
 * message that merely starts with "Invalid " or "Too big: " is not
 * misdetected as machine-generated (verified against every bare
 * `.min()`/`.max()`/`.url()`/`.enum()`/`.union()`/`.literal()`/etc. in
 * src/lib/schemas/index.ts and share.ts, and against a set of custom
 * messages that share those prefixes).
 *
 * `invalid_value` covers both `z.enum(...)` failures ("Invalid option:
 * expected one of ...") and a standalone `z.literal(...)` failure ("Invalid
 * input: expected ..."). `invalid_union` covers `z.union([z.literal(...),
 * ...])` failures (e.g. `RackWidthSchema`, `SlotWidthSchema`, the share
 * format's `w`): Zod reports these as a single top-level issue whose message
 * is the fixed string "Invalid input" (no discriminator info, since none of
 * this codebase's unions are `z.discriminatedUnion`).
 *
 * ImportValidationIssue deliberately does not carry the extra fields
 * (`origin`, `minimum`, `maximum`, `inclusive`, `received`, `values`) the
 * real error map needs to regenerate these messages exactly, so detection
 * matches the template's fixed structure (words, punctuation, comparison
 * operators) around a `\S+`/`\d+` placeholder for the variable parts,
 * instead of reconstructing and comparing the default text field-by-field.
 * Trade-off: a future custom message that happens to fully match one of
 * these templates (e.g. a custom `too_big` message literally shaped like
 * "Too big: expected string to have <=5 characters") would be misdetected
 * as machine-generated. That shape is specific enough that no current
 * schema message collides with it.
 */
const ZOD_DEFAULT_MESSAGE_PATTERNS: Partial<Record<string, RegExp>> = {
  invalid_type: /^Invalid input: expected \S+, received \S+$/,
  too_small:
    /^Too small: expected \S+ to (?:have [<>]=?\d+(?:\.\d+)? (?:characters|bytes|items|entries)|be [<>]=?\d+(?:\.\d+)?)$/,
  too_big:
    /^Too big: expected \S+ to (?:have [<>]=?\d+(?:\.\d+)? (?:characters|bytes|items|entries)|be [<>]=?\d+(?:\.\d+)?)$/,
  invalid_format: new RegExp(
    `^Invalid (?:${INVALID_FORMAT_DEFAULT_LABELS.map(escapeRegExp).join("|")}|string: must (?:start with|end with|include) ".*"|string: must match pattern .+)$`,
  ),
  invalid_value: new RegExp(
    String.raw`^Invalid (?:option: expected one of ${INVALID_VALUE_TOKEN}(?:\|${INVALID_VALUE_TOKEN})+|input: expected ${INVALID_VALUE_TOKEN})$`,
  ),
  invalid_union: /^Invalid input$/,
};

/** Plain-language clause appended after the humanized field name (e.g. "Name is invalid") for a field that has no custom schema message. */
const PLAIN_CODE_CLAUSES: Partial<Record<string, string>> = {
  too_small: "does not meet the minimum requirement",
  too_big: "exceeds the maximum allowed",
  invalid_format: "is not formatted correctly",
  invalid_value: "must be one of the supported options",
  invalid_union: "must be one of the supported options",
};

const DEFAULT_ISSUE_CLAUSE = "is invalid";

/**
 * True when `issue.message` is exactly the machine-generated default text
 * Zod 4 ships for `issue.code` (see {@link ZOD_DEFAULT_MESSAGE_PATTERNS}).
 * False for any issue code this module has no default template for, and for
 * any message that doesn't fully match the template - including an
 * author-written custom message, even one that happens to start with the
 * same words as a default.
 */
function isZodDefaultMessage(issue: ImportValidationIssue): boolean {
  const pattern = issue.code
    ? ZOD_DEFAULT_MESSAGE_PATTERNS[issue.code]
    : undefined;
  return pattern ? pattern.test(issue.message) : false;
}

/**
 * Format a single Zod validation issue as plain language, with no dotted
 * path prefix. Any message that is not Zod's own machine-generated default
 * for its issue code - including a custom `invalid_type` message - is
 * already human-authored text, so it is preserved as-is (see
 * {@link isZodDefaultMessage}). A generic type-mismatch issue with no
 * custom message has a plain-language sentence built from the field name
 * instead. Other bare constraints (`.min()`, `.max()`, `.url()`, etc. with
 * no message argument) ship Zod's own internal wording (e.g. "Too small:
 * expected string to have >=1 characters") that is swapped for plain copy
 * the same way.
 */
function describeSingleIssue(issue: ImportValidationIssue): string {
  if (!isZodDefaultMessage(issue)) {
    return issue.message;
  }
  if (issue.code === "invalid_type") {
    const expected = issue.expected
      ? (PLAIN_TYPE_NAMES[issue.expected] ??
        withIndefiniteArticle(issue.expected))
      : "a different value";
    return `${capitalize(humanizeFieldPath(issue.path))} must be ${expected}`;
  }
  const clause = issue.code
    ? (PLAIN_CODE_CLAUSES[issue.code] ?? DEFAULT_ISSUE_CLAUSE)
    : DEFAULT_ISSUE_CLAUSE;
  return `${capitalize(humanizeFieldPath(issue.path))} ${clause}`;
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
