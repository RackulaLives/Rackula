/**
 * NetBox import warnings reach the user (#3335)
 *
 * The importer warns instead of silently dropping fields it cannot map
 * (unknown airflow, unknown weight unit, and so on), but the Import from
 * NetBox flow used to close the dialog on a plain success toast and discard
 * those warnings. Renders the real DialogOrchestrator so the dialog and its
 * import handler are wired together as in production.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
import DialogOrchestrator from "$lib/components/DialogOrchestrator.svelte";
import { dialogStore } from "$lib/stores/dialogs.svelte";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { getToastStore, resetToastStore } from "$lib/stores/toast.svelte";

const YAML_WITH_WARNINGS = `manufacturer: Acme
model: Widget 9000
slug: acme-widget-9000
u_height: 1
airflow: sideways
weight: 3
weight_unit: furlongs`;

const YAML_WITHOUT_WARNINGS = `manufacturer: Acme
model: Widget 1000
slug: acme-widget-1000
u_height: 1`;

async function importYaml(yaml: string) {
  dialogStore.open("importNetBox");
  render(DialogOrchestrator);

  const textarea = await screen.findByPlaceholderText(
    /Paste NetBox device type YAML/,
  );
  await fireEvent.input(textarea, { target: { value: yaml } });
  await fireEvent.click(screen.getByRole("button", { name: "Parse YAML" }));

  const importButton = screen.getByRole("button", { name: "Import" });
  await waitFor(() => expect(importButton).toBeEnabled());
  await fireEvent.click(importButton);
}

function hasDeviceModel(model: string): boolean {
  return getLayoutStore().device_types.some((d) => d.model === model);
}

describe("NetBox import warnings (#3335)", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetToastStore();
    dialogStore.close();
  });

  afterEach(() => {
    dialogStore.close();
  });

  it("lists every importer warning in the dialog after an import with warnings", async () => {
    await importYaml(YAML_WITH_WARNINGS);

    expect(
      await screen.findByText(/Unknown airflow value: sideways/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Unknown weight_unit value: furlongs/),
    ).toBeInTheDocument();
    // The Import button that had focus is gone, so focus moves to the summary
    // and a screen reader reads the outcome instead of losing its place.
    await waitFor(() =>
      expect(
        screen.getByText(/Imported "Widget 9000" to Devices with 2 warnings/),
      ).toHaveFocus(),
    );
    expect(dialogStore.isOpen("importNetBox")).toBe(true);
    expect(hasDeviceModel("Widget 9000")).toBe(true);
  });

  it("closes the dialog when the user dismisses the warnings", async () => {
    await importYaml(YAML_WITH_WARNINGS);

    await fireEvent.click(await screen.findByRole("button", { name: "Done" }));

    expect(dialogStore.isOpen("importNetBox")).toBe(false);
    expect(hasDeviceModel("Widget 9000")).toBe(true);
  });

  it("starts a fresh import when reopened after an import with warnings", async () => {
    await importYaml(YAML_WITH_WARNINGS);
    await fireEvent.click(await screen.findByRole("button", { name: "Done" }));

    dialogStore.open("importNetBox");

    expect(
      await screen.findByPlaceholderText(/Paste NetBox device type YAML/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Unknown airflow value/)).not.toBeInTheDocument();
  });

  it("closes with a success toast when the import has no warnings", async () => {
    await importYaml(YAML_WITHOUT_WARNINGS);

    await waitFor(() => expect(dialogStore.isOpen("importNetBox")).toBe(false));
    expect(hasDeviceModel("Widget 1000")).toBe(true);
    expect(
      getToastStore().toasts.some(
        (t) => t.message === 'Imported "Widget 1000" to Devices',
      ),
    ).toBe(true);
  });
});
