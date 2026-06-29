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
});

describe("buildYamlFilename (api)", () => {
  it("derives the filename from the consolidated slug", () => {
    expect(buildYamlFilename("Synology DS920+")).toBe(
      "synology-ds920-plus.rackula.yaml",
    );
  });
});
