import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { EditorView } from "@uiw/react-codemirror";

import { RegistryEditor } from "./RegistryEditor";

const openSearchPanelMock = vi.fn();
const searchMock = vi.fn((config: { top?: boolean }) => ({ extension: "search", config }));

const mockView = { focus: vi.fn() };

vi.mock("@codemirror/search", () => ({
  openSearchPanel: (view: unknown) => openSearchPanelMock(view),
  search: (config: { top?: boolean }) => searchMock(config),
}));

vi.mock("@codemirror/lint", () => ({
  forceLinting: vi.fn(),
  lintGutter: vi.fn(() => ({ extension: "lintGutter" })),
  linter: vi.fn(() => ({ extension: "linter" })),
}));

vi.mock("@uiw/react-codemirror", () => {
  return {
    __esModule: true,
    EditorView: {
      domEventHandlers: vi.fn(() => ({ extension: "domEventHandlers" })),
    },
    default: ({
      ref,
      extensions,
    }: {
      ref?: { current: { view: unknown } | null };
      extensions?: unknown[];
    }) => {
      if (ref) {
        ref.current = { view: mockView };
      }

      return (
        <div data-testid="mock-codemirror">
          {extensions?.some(
            (extension) => (extension as { extension?: string }).extension === "search",
          )
            ? "search-enabled"
            : "search-missing"}
        </div>
      );
    },
  };
});

describe("RegistryEditor", () => {
  it("opens the search panel from the Find / Replace control", async () => {
    render(
      <RegistryEditor
        canApply
        checklist={[]}
        draftText="metadata: {}"
        issues={[]}
        onApply={() => {}}
        onChange={() => {}}
        onDownload={() => {}}
        onImport={() => {}}
        onToggleTheme={() => {}}
        sourceLabel="service_registry.yaml"
        theme="dark"
        title="Green Room"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Find / Replace" }));

    expect(openSearchPanelMock).toHaveBeenCalledWith(mockView);
    expect(mockView.focus).toHaveBeenCalled();
  });

  it("configures CodeMirror search with a top panel", () => {
    render(
      <RegistryEditor
        canApply
        checklist={[]}
        draftText="metadata: {}"
        issues={[]}
        onApply={() => {}}
        onChange={() => {}}
        onDownload={() => {}}
        onImport={() => {}}
        onToggleTheme={() => {}}
        sourceLabel="service_registry.yaml"
        theme="light"
        title="Green Room"
      />,
    );

    expect(searchMock).toHaveBeenCalledWith({ top: true });
    expect(screen.getByTestId("mock-codemirror")).toHaveTextContent("search-enabled");
  });

  it("does not suppress default Tab behavior in editor key handlers", () => {
    const domEventHandlersMock = EditorView.domEventHandlers as unknown as ReturnType<typeof vi.fn>;
    render(
      <RegistryEditor
        canApply
        checklist={[]}
        draftText="metadata: {}"
        issues={[]}
        onApply={() => {}}
        onChange={() => {}}
        onDownload={() => {}}
        onImport={() => {}}
        onToggleTheme={() => {}}
        sourceLabel="service_registry.yaml"
        theme="dark"
        title="Green Room"
      />,
    );

    const firstCallArg = domEventHandlersMock.mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(firstCallArg).toBeUndefined();
  });

  it("renders validation issues and optional back button path", () => {
    render(
      <RegistryEditor
        canApply={false}
        checklist={[
          {
            title: "Metadata",
            items: [{ label: "team", checked: false }],
          },
        ]}
        draftText="metadata:"
        issues={[
          {
            message: "Missing team_id",
            path: "/metadata/team_id",
            location: "line 1, col 1",
            severity: "error",
          },
        ]}
        onApply={() => {}}
        onChange={() => {}}
        onClose={() => {}}
        onDownload={() => {}}
        onImport={() => {}}
        onToggleTheme={() => {}}
        sourceLabel={null}
        theme="dark"
        title="Green Room"
      />,
    );

    expect(screen.getByText("Missing team_id")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to explorer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fix validation errors" })).toBeDisabled();
  });
});
