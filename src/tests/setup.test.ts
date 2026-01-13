import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import App from "../App.svelte";

describe("Setup", () => {
  it("vitest is configured correctly", () => {
    expect(true).toBe(true);
  });

  it("can import Svelte component", async () => {
    // This test verifies that Svelte component imports work correctly
    expect(App).toBeDefined();
  });

  it("can render Svelte component", async () => {
    render(App);
    // 'Rackula' text appears in toolbar
    expect(screen.getByText("Rackula")).toBeInTheDocument();
  }, 60000); // App component is slow to render due to complex component tree
});
