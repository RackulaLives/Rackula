import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import type { Layout } from "$lib/types";
import * as yamlUtils from "$lib/utils/yaml";
import LayoutYamlPanel from "$lib/components/LayoutYamlPanel.svelte";
import { createTestLayout } from "./factories";

async function waitForValidation(pattern: RegExp): Promise<void> {
  await waitFor(() => {
    expect(screen.getByTestId("yaml-validation-message")).toHaveTextContent(
      pattern,
    );
  });
}

describe("LayoutYamlPanel", () => {
  let baseLayout: Layout;

  beforeEach(() => {
    baseLayout = createTestLayout({ name: "Baseline Layout" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("download", () => {
    let revokeObjectURL: ReturnType<typeof vi.fn>;
    let createObjectURL: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      revokeObjectURL = vi.fn();
      createObjectURL = vi.fn(() => "blob:mock-url");
      vi.stubGlobal("URL", {
        ...URL,
        createObjectURL,
        revokeObjectURL,
      });
      // happy-dom anchors throw on click navigation; suppress the no-op click.
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
        () => {},
      );
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it("defers revoking the download object URL to a later tick", async () => {
      render(LayoutYamlPanel, {
        props: { open: true, layout: baseLayout, onapply: vi.fn() },
      });

      await waitFor(() => {
        expect(screen.getByTestId("yaml-textarea")).toHaveDisplayValue(
          /name: Baseline Layout/,
        );
      });

      await fireEvent.click(
        screen.getByRole("button", { name: "Download YAML" }),
      );

      // The download may begin asynchronously after click(); revoking now
      // would invalidate the URL before the browser fetches it.
      expect(revokeObjectURL).not.toHaveBeenCalled();

      vi.runAllTimers();

      expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:mock-url");
    });

    it("saves the blob with plain text/yaml, no charset parameter (#2986)", async () => {
      render(LayoutYamlPanel, {
        props: { open: true, layout: baseLayout, onapply: vi.fn() },
      });

      await waitFor(() => {
        expect(screen.getByTestId("yaml-textarea")).toHaveDisplayValue(
          /name: Baseline Layout/,
        );
      });

      await fireEvent.click(
        screen.getByRole("button", { name: "Download YAML" }),
      );

      const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
      expect(blob.type).toBe("text/yaml");
    });
  });

  it("blocks invalid YAML apply and applies once content is valid", async () => {
    const onApply = vi.fn();
    render(LayoutYamlPanel, {
      props: { open: true, layout: baseLayout, onapply: onApply },
    });

    await waitFor(() => {
      expect(screen.getByTestId("yaml-textarea")).toHaveDisplayValue(
        /name: Baseline Layout/,
      );
    });

    await fireEvent.click(screen.getByRole("button", { name: "Edit YAML" }));
    const textarea = screen.getByTestId("yaml-textarea");

    await fireEvent.input(textarea, {
      target: {
        value:
          'name: Broken\nversion: "1.0"\nracks: nope\ndevice_types: []\nsettings:\n  display_mode: label\n  show_labels_on_images: false',
      },
    });
    await waitForValidation(/Schema error:/);

    const applyButton = screen.getByRole("button", { name: "Apply YAML" });
    expect(applyButton).toBeDisabled();

    const validYaml = await yamlUtils.serializeLayoutToYaml(
      createTestLayout({ name: "Applied Layout" }),
    );
    await fireEvent.input(textarea, { target: { value: validYaml } });
    await waitForValidation(/YAML is valid/i);

    await waitFor(() => {
      expect(applyButton).toBeEnabled();
    });

    await fireEvent.click(applyButton);
    await waitFor(() => {
      expect(onApply).toHaveBeenCalledTimes(1);
    });
    expect(onApply.mock.calls[0]?.[0]?.name).toBe("Applied Layout");
  });

  it("surfaces syntax errors and clears once YAML is repaired", async () => {
    render(LayoutYamlPanel, {
      props: { open: true, layout: baseLayout, onapply: vi.fn() },
    });

    await waitFor(() => {
      expect(screen.getByTestId("yaml-textarea")).toHaveDisplayValue(
        /name: Baseline Layout/,
      );
    });

    await fireEvent.click(screen.getByRole("button", { name: "Edit YAML" }));
    const textarea = screen.getByTestId("yaml-textarea");

    await fireEvent.input(textarea, {
      target: {
        value: "name: Broken:\n  nested: value",
      },
    });
    await waitForValidation(/Syntax error:/);

    const repairedYaml = await yamlUtils.serializeLayoutToYaml(baseLayout);
    await fireEvent.input(textarea, { target: { value: repairedYaml } });
    await waitForValidation(/YAML is valid/i);
  });

  it("shows revision conflict prompt when layout changed in parallel", async () => {
    const onApply = vi.fn();
    const originalSerialize = yamlUtils.serializeLayoutToYaml;
    let simulateConcurrentChange = false;
    // Start returning a changed baseline only once the test enters apply flow.
    vi.spyOn(yamlUtils, "serializeLayoutToYaml").mockImplementation(
      async (layout: Layout) => {
        const serialized = await originalSerialize(layout);
        if (simulateConcurrentChange && layout.name === "Baseline Layout") {
          return serialized.replace(
            "name: Baseline Layout",
            "name: Concurrent Layout",
          );
        }
        return serialized;
      },
    );

    const editedYaml = await yamlUtils.serializeLayoutToYaml(
      createTestLayout({ name: "Edited Layout" }),
    );

    render(LayoutYamlPanel, {
      props: { open: true, layout: baseLayout, onapply: onApply },
    });

    await waitFor(() => {
      expect(screen.getByTestId("yaml-textarea")).toHaveDisplayValue(
        /name: Baseline Layout/,
      );
    });

    await fireEvent.click(screen.getByRole("button", { name: "Edit YAML" }));
    const textarea = screen.getByTestId("yaml-textarea");
    await fireEvent.input(textarea, { target: { value: editedYaml } });
    await waitForValidation(/YAML is valid/i);

    simulateConcurrentChange = true;
    await fireEvent.click(screen.getByRole("button", { name: "Apply YAML" }));

    await waitFor(() => {
      expect(screen.getByTestId("yaml-conflict-prompt")).toBeInTheDocument();
    });
    expect(onApply).not.toHaveBeenCalled();

    await fireEvent.click(screen.getByRole("button", { name: "Apply anyway" }));

    await waitFor(() => {
      expect(onApply).toHaveBeenCalledTimes(1);
    });
    expect(onApply.mock.calls[0]?.[0]?.name).toBe("Edited Layout");
  });

  it("does not overwrite edits when hydration resolves after entering edit mode", async () => {
    const originalSerialize = yamlUtils.serializeLayoutToYaml;
    const baselineYaml = await originalSerialize(baseLayout);

    let releaseBaselineSync: ((value: string) => void) | null = null;
    const baselineSyncPromise = new Promise<string>((resolve) => {
      releaseBaselineSync = resolve;
    });

    let delayedBaselineSync = true;
    vi.spyOn(yamlUtils, "serializeLayoutToYaml").mockImplementation(
      async (layout: Layout) => {
        if (layout.name === "Baseline Layout" && delayedBaselineSync) {
          delayedBaselineSync = false;
          return baselineSyncPromise;
        }
        return originalSerialize(layout);
      },
    );

    render(LayoutYamlPanel, {
      props: { open: true, layout: baseLayout, onapply: vi.fn() },
    });

    await fireEvent.click(screen.getByRole("button", { name: "Edit YAML" }));
    const textarea = screen.getByTestId("yaml-textarea");

    const userDraft = 'name: User Draft\nversion: "1.0"';
    await fireEvent.input(textarea, {
      target: {
        value: userDraft,
      },
    });

    releaseBaselineSync?.(baselineYaml);

    await waitFor(() => {
      expect(screen.getByTestId("yaml-textarea")).toHaveDisplayValue(
        /name: User Draft/,
      );
    });
  });

  it("passes images decoded from a pasted YAML to onapply", async () => {
    const onApply = vi.fn();
    render(LayoutYamlPanel, {
      props: { open: true, layout: baseLayout, onapply: onApply },
    });

    await waitFor(() => {
      expect(screen.getByTestId("yaml-textarea")).toHaveDisplayValue(
        /name: Baseline Layout/,
      );
    });

    await fireEvent.click(screen.getByRole("button", { name: "Edit YAML" }));
    const textarea = screen.getByTestId("yaml-textarea");

    // A valid layout plus an embedded images section (real PNG magic bytes).
    const pngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 1, 2, 3,
    ]);
    let binary = "";
    for (const b of pngBytes) binary += String.fromCharCode(b);
    const pngDataUrl = `data:image/png;base64,${btoa(binary)}`;
    const baseYaml = await yamlUtils.serializeLayoutToYaml(
      createTestLayout({ name: "Pasted Layout" }),
    );
    const yamlWithImages = `${baseYaml}\nimages:\n  my-device:\n    front: "${pngDataUrl}"\n`;

    await fireEvent.input(textarea, { target: { value: yamlWithImages } });
    await waitForValidation(/YAML is valid/i);

    await fireEvent.click(screen.getByRole("button", { name: "Apply YAML" }));
    await waitFor(() => {
      expect(onApply).toHaveBeenCalledTimes(1);
    });
    const images = onApply.mock.calls[0]?.[1] as
      Map<string, unknown> | undefined;
    expect(images?.has("my-device")).toBe(true);
    // The widened callback contract also carries the failed-image count.
    expect(onApply.mock.calls[0]?.[2]).toBe(0);
  });
});
