import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import App from "./App";
import * as registryDomain from "./domain/registry";

describe("App", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads into editor mode when no registry source is available", async () => {
    vi.spyOn(registryDomain, "loadInitialRegistrySource").mockResolvedValue(null);
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("YAML")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Use this registry" })).toBeInTheDocument();
    });
  });

  it("loads directly into explorer mode when source validates", async () => {
    vi.spyOn(registryDomain, "loadInitialRegistrySource").mockResolvedValue({
      sourceLabel: "/service_registry.yaml",
      sourceText: registryDomain.DEFAULT_REGISTRY_TEMPLATE,
    });
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Copy Mermaid" })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "Edit registry" }));
    expect(screen.getByText("YAML")).toBeInTheDocument();
  });

  it("shows load error banner when initial load fails", async () => {
    vi.spyOn(registryDomain, "loadInitialRegistrySource").mockRejectedValue(new Error("boom"));
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("boom")).toBeInTheDocument();
      expect(screen.getByText("YAML")).toBeInTheDocument();
    });
  });
});
