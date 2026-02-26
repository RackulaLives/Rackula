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
});
