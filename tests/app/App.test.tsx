import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import App from "@app/App";
import * as registryDomain from "@domain/registry";
import * as browser from "@shared/browser";

vi.mock("@uiw/react-codemirror", () => {
  return {
    __esModule: true,
    EditorView: {
      domEventHandlers: vi.fn(() => ({ extension: "domEventHandlers" })),
    },
    default: () => <div data-testid="mock-codemirror">editor</div>,
  };
});

describe("App", () => {
  beforeEach(() => {
    const localStorageRef = window.localStorage as Partial<Storage> | undefined;
    const storage = new Map<string, string>();
    const shim: Pick<Storage, "getItem" | "setItem" | "removeItem" | "clear"> = {
      getItem: (key) => storage.get(String(key)) ?? null,
      setItem: (key, value) => {
        storage.set(String(key), String(value));
      },
      removeItem: (key) => {
        storage.delete(String(key));
      },
      clear: () => {
        storage.clear();
      },
    };

    if (!localStorageRef) {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        value: shim,
      });
      return;
    }

    const hasAllStorageMethods =
      typeof localStorageRef.getItem === "function" &&
      typeof localStorageRef.setItem === "function" &&
      typeof localStorageRef.removeItem === "function" &&
      typeof localStorageRef.clear === "function";

    let nativeStorageUsable = false;
    if (hasAllStorageMethods) {
      try {
        const probeKey = "__app_test_local_storage_probe__";
        localStorageRef.setItem?.(probeKey, "ok");
        nativeStorageUsable = localStorageRef.getItem?.(probeKey) === "ok";
        localStorageRef.removeItem?.(probeKey);
      } catch {
        nativeStorageUsable = false;
      }
    }

    if (!hasAllStorageMethods || !nativeStorageUsable) {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        value: shim,
      });
      return;
    }

    const clearLocalStorage = localStorageRef.clear;
    if (typeof clearLocalStorage === "function") {
      clearLocalStorage.call(localStorageRef);
    }
  });

  function stubMatchMedia() {
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
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads into editor mode when no registry source is available", async () => {
    vi.spyOn(registryDomain, "loadInitialRegistrySource").mockResolvedValue(null);
    stubMatchMedia();

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
    stubMatchMedia();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Copy Mermaid" })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "Edit registry" }));
    expect(screen.getByText("YAML")).toBeInTheDocument();
  });

  it("shows load error banner when initial load fails", async () => {
    vi.spyOn(registryDomain, "loadInitialRegistrySource").mockRejectedValue(new Error("boom"));
    stubMatchMedia();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("boom")).toBeInTheDocument();
      expect(screen.getByText("YAML")).toBeInTheDocument();
    });
  });

  it("loads saved local draft and uses it as startup source", async () => {
    vi.spyOn(registryDomain, "loadInitialRegistrySource").mockResolvedValue(null);
    window.localStorage.setItem(
      registryDomain.LOCAL_STORAGE_DRAFT_KEY,
      registryDomain.DEFAULT_REGISTRY_TEMPLATE,
    );
    stubMatchMedia();

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByText(
          "Loaded from saved local draft. Edit the registry to validate and preview changes in-browser.",
        ),
      ).toBeInTheDocument();
    });
  });

  it("prefers saved local draft over file-backed source on startup", async () => {
    vi.spyOn(registryDomain, "loadInitialRegistrySource").mockResolvedValue({
      sourceLabel: "/service_registry.yaml",
      sourceText: registryDomain.DEFAULT_REGISTRY_TEMPLATE,
    });
    window.localStorage.setItem(
      registryDomain.LOCAL_STORAGE_DRAFT_KEY,
      registryDomain.DEFAULT_REGISTRY_TEMPLATE.replace("Example Team", "Draft Team"),
    );
    stubMatchMedia();

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByText(
          "Loaded from saved local draft. Edit the registry to validate and preview changes in-browser.",
        ),
      ).toBeInTheDocument();
    });
  });

  it("prefers saved valid local draft when initial source loading throws", async () => {
    vi.spyOn(registryDomain, "loadInitialRegistrySource").mockRejectedValue(new Error("boom"));
    window.localStorage.setItem(
      registryDomain.LOCAL_STORAGE_DRAFT_KEY,
      registryDomain.DEFAULT_REGISTRY_TEMPLATE.replace("Example Team", "Draft Team"),
    );
    stubMatchMedia();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Copy Mermaid" })).toBeInTheDocument();
      expect(
        screen.getByText(
          "Loaded from saved local draft. Edit the registry to validate and preview changes in-browser.",
        ),
      ).toBeInTheDocument();
    });
  });

  it("opens editor when saved local draft is invalid even if file-backed source exists", async () => {
    vi.spyOn(registryDomain, "loadInitialRegistrySource").mockResolvedValue({
      sourceLabel: "/service_registry.yaml",
      sourceText: registryDomain.DEFAULT_REGISTRY_TEMPLATE,
    });
    window.localStorage.setItem(registryDomain.LOCAL_STORAGE_DRAFT_KEY, "metadata:\n  team:");
    stubMatchMedia();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("YAML")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Fix validation errors" })).toBeDisabled();
    });
  });

  it("prefers saved invalid local draft when initial source loading throws", async () => {
    vi.spyOn(registryDomain, "loadInitialRegistrySource").mockRejectedValue(new Error("boom"));
    window.localStorage.setItem(registryDomain.LOCAL_STORAGE_DRAFT_KEY, "metadata:\n  team:");
    stubMatchMedia();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("YAML")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Fix validation errors" })).toBeDisabled();
    });
  });

  it("marks source label as edited in browser after applying changes", async () => {
    vi.spyOn(registryDomain, "loadInitialRegistrySource").mockResolvedValue({
      sourceLabel: "/service_registry.yaml",
      sourceText: registryDomain.DEFAULT_REGISTRY_TEMPLATE,
    });
    stubMatchMedia();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Copy Mermaid" })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "Edit registry" }));
    await userEvent.click(screen.getByRole("button", { name: "Use this registry" }));

    await waitFor(() => {
      expect(
        screen.getByText(
          "Loaded from /service_registry.yaml (edited in browser). Edit the registry to validate and preview changes in-browser.",
        ),
      ).toBeInTheDocument();
    });
  });

  it("handles import, download, and theme toggle actions in editor mode", async () => {
    vi.spyOn(registryDomain, "loadInitialRegistrySource").mockResolvedValue(null);
    const downloadSpy = vi.spyOn(browser, "downloadTextFile").mockImplementation(() => {});
    stubMatchMedia();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("YAML")).toBeInTheDocument();
    });

    const input = document.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Expected file input to be rendered.");
    }

    const importedYaml = `${registryDomain.DEFAULT_REGISTRY_TEMPLATE}\n`;
    const file = new File([importedYaml], "imported.yaml", { type: "text/yaml" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(
        screen.getByText("Editing imported.yaml. Validation runs on every change."),
      ).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "Download YAML" }));
    expect(downloadSpy).toHaveBeenCalledWith(
      "service_registry.yaml",
      expect.stringContaining("metadata:"),
      "text/yaml;charset=utf-8",
    );

    const themeButton = screen.getByRole("button", { name: "Switch to dark theme" });
    await userEvent.click(themeButton);
    expect(screen.getByRole("button", { name: "Switch to light theme" })).toBeInTheDocument();
  });

  it("can apply from template and marks source as in-browser draft", async () => {
    vi.spyOn(registryDomain, "loadInitialRegistrySource").mockResolvedValue(null);
    stubMatchMedia();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Use this registry" })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "Use this registry" }));

    await waitFor(() => {
      expect(
        screen.getByText(
          "Loaded from in-browser draft. Edit the registry to validate and preview changes in-browser.",
        ),
      ).toBeInTheDocument();
    });
  });

  it("returns to explorer from editor when a validated registry is already applied", async () => {
    vi.spyOn(registryDomain, "loadInitialRegistrySource").mockResolvedValue({
      sourceLabel: "/service_registry.yaml",
      sourceText: registryDomain.DEFAULT_REGISTRY_TEMPLATE,
    });
    stubMatchMedia();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Copy Mermaid" })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "Edit registry" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Back to explorer" })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: "Back to explorer" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Copy Mermaid" })).toBeInTheDocument();
    });
  });

  it("preserves imported filename as source after apply", async () => {
    vi.spyOn(registryDomain, "loadInitialRegistrySource").mockResolvedValue(null);
    stubMatchMedia();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("YAML")).toBeInTheDocument();
    });

    const input = document.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Expected file input to be rendered.");
    }

    const file = new File([registryDomain.DEFAULT_REGISTRY_TEMPLATE], "imported.yaml", {
      type: "text/yaml",
    });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(
        screen.getByText("Editing imported.yaml. Validation runs on every change."),
      ).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "Use this registry" }));

    await waitFor(() => {
      expect(
        screen.getByText(
          "Loaded from imported.yaml. Edit the registry to validate and preview changes in-browser.",
        ),
      ).toBeInTheDocument();
    });
  });

  it("ignores import events with no selected file", async () => {
    vi.spyOn(registryDomain, "loadInitialRegistrySource").mockResolvedValue(null);
    stubMatchMedia();

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByText("No registry file was found. Paste or upload one below."),
      ).toBeInTheDocument();
    });

    const input = document.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Expected file input to be rendered.");
    }

    fireEvent.change(input, { target: { files: [] } });

    await waitFor(() => {
      expect(
        screen.getByText("No registry file was found. Paste or upload one below."),
      ).toBeInTheDocument();
    });
  });
});
