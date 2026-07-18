import { describe, expect, it } from "bun:test";
import {
  slugify,
  buildYamlFilename,
  buildFolderName,
  LayoutFileSchema,
} from "./layout";

const TEST_UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("slugify (api)", () => {
  it("maps a trailing plus to -plus, matching the frontend slugify", () => {
    expect(slugify("Synology DS920+")).toBe("synology-ds920-plus");
  });

  it("trims and collapses leading, trailing and repeated separators", () => {
    expect(slugify("--My  Homelab!!--")).toBe("my-homelab");
  });

  it("falls back to untitled when the name has no slug characters", () => {
    expect(slugify("...")).toBe("untitled");
  });

  // The frontend's slugifyForFilename (src/lib/utils/slug.ts) truncates to
  // the same SLUG_MAX_LENGTH (100 chars) so the two implementations agree on
  // long names (#2932). This name is chosen so the 100-char cut lands on a
  // hyphen, exercising the post-truncation trailing-hyphen trim both
  // implementations apply. Mirrors the frontend test in src/tests/slug.test.ts.
  it("truncates to the shared 100-character limit, matching the frontend slugifyForFilename", () => {
    const name =
      "Rack Layout Name With Words Of Various Length To Find A Boundary Hyphen Case For Truncation Testing Purposes";
    expect(slugify(name)).toBe(
      "rack-layout-name-with-words-of-various-length-to-find-a-boundary-hyphen-case-for-truncation-testing",
    );
  });
});

describe("buildYamlFilename (api)", () => {
  it("derives the filename from the consolidated slug", () => {
    expect(buildYamlFilename("Synology DS920+")).toBe(
      "synology-ds920-plus.rackula.yaml",
    );
  });
});

// #2942: sanitizeForPath (invoked via buildFolderName) previously left control
// characters like NUL untouched. A NUL byte survives to `path.join()` in the
// filesystem storage driver, which throws `ERR_INVALID_ARG_VALUE` and turns a
// bad layout name into a 500 rather than a clean rejection.
describe("buildFolderName control-character safety (#2942)", () => {
  it("strips control characters such as NUL before they reach the filesystem", () => {
    const folderName = buildFolderName("My\x00Rack", TEST_UUID);
    expect(folderName).toBe(`MyRack-${TEST_UUID}`);
  });

  it("strips other C0 control characters (tab, newline, escape)", () => {
    const folderName = buildFolderName("My\t\n\x1bRack", TEST_UUID);
    expect(folderName).toBe(`MyRack-${TEST_UUID}`);
  });

  it("strips leading and trailing dots so folder names cannot masquerade as hidden files", () => {
    const folderName = buildFolderName(".hidden.", TEST_UUID);
    expect(folderName.startsWith(".")).toBe(false);
    expect(folderName).toBe(`hidden-${TEST_UUID}`);
  });

  // The 100-char truncation must run before the leading/trailing dot strip, or
  // a dot sitting exactly at the truncation boundary is reintroduced as a new
  // trailing dot. Name is >100 chars with a dot at index 99.
  it("does not reintroduce a trailing dot when truncation lands on one", () => {
    const name = "a".repeat(99) + "." + "b".repeat(50);
    const sanitized = buildFolderName(name, TEST_UUID).slice(
      0,
      -`-${TEST_UUID}`.length,
    );
    expect(sanitized.endsWith(".")).toBe(false);
    expect(sanitized).toBe("a".repeat(99));
  });
});

// #2942: top-level `name`/`version` had no max length or charset restriction,
// unlike `metadata.name`/`metadata.description`, which cap length. A NUL in a
// name with no `metadata` section previously reached buildFolderName
// unvalidated; it must now be rejected by schema validation with a clean 400.
describe("LayoutFileSchema top-level name/version caps (#2942)", () => {
  it("rejects a top-level name containing a NUL byte", () => {
    const result = LayoutFileSchema.safeParse({
      version: "1.0.0",
      name: "My\x00Rack",
      racks: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a top-level name longer than 100 characters", () => {
    const result = LayoutFileSchema.safeParse({
      version: "1.0.0",
      name: "a".repeat(101),
      racks: [],
    });
    expect(result.success).toBe(false);
  });

  it("accepts a top-level name at the 100 character boundary", () => {
    const result = LayoutFileSchema.safeParse({
      version: "1.0.0",
      name: "a".repeat(100),
      racks: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a top-level version longer than 20 characters", () => {
    const result = LayoutFileSchema.safeParse({
      version: "1.".repeat(11), // 22 characters
      name: "Test",
      racks: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a top-level version containing a control character", () => {
    const result = LayoutFileSchema.safeParse({
      version: "1.0\x1b",
      name: "Test",
      racks: [],
    });
    expect(result.success).toBe(false);
  });

  it("still accepts a normal versioned layout name", () => {
    const result = LayoutFileSchema.safeParse({
      version: "1.0.0",
      name: "Homelab Rack",
      racks: [],
    });
    expect(result.success).toBe(true);
  });

  // Backward compatibility: the prior schema was a bare `z.string()` that
  // accepted an empty version, so the new max/charset caps must not start
  // rejecting it (a prior-release layout must still load).
  it("still accepts an empty top-level version", () => {
    const result = LayoutFileSchema.safeParse({
      version: "",
      name: "Homelab Rack",
      racks: [],
    });
    expect(result.success).toBe(true);
  });

  // metadata.name wins over the top-level name when a `metadata:` section is
  // present (filesystem.ts derives layoutName as metadata?.name ?? name), so it
  // feeds the same buildFolderName sink and must reject control characters too.
  it("rejects a metadata.name containing a NUL byte", () => {
    const result = LayoutFileSchema.safeParse({
      version: "1.0.0",
      name: "Homelab Rack",
      metadata: {
        id: TEST_UUID,
        name: "Bad\x00Name",
        schema_version: "1.0",
      },
      racks: [],
    });
    expect(result.success).toBe(false);
  });
});
