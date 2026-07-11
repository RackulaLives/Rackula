import { describe, expect, it } from "bun:test";
import { slugify, buildYamlFilename } from "./layout";

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
