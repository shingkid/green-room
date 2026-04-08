import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { EditorView } from "@uiw/react-codemirror";
import { setDiagnostics } from "@codemirror/lint";

import { RegistryEditor } from "@features/editor/RegistryEditor";

const openSearchPanelMock = vi.fn();
const searchMock = vi.fn((config: { top?: boolean }) => ({ extension: "search", config }));

const mockDispatch = vi.fn();
const mockView = {
  dispatch: mockDispatch,
  focus: vi.fn(),
  state: {
    doc: {
      line: vi.fn((lineNum: number) => {
        if (lineNum === 1) {
          return { from: 0, to: 9 };
        }
        return { from: 0, to: 0 };
      }),
      lines: 1,
      toString: vi.fn(
        () =>
          `services:
  api: {}
business_flows:
  checkout: {}
data_flows:
  checkout_events: {}
`,
      ),
    },
  },
};

vi.mock("@codemirror/search", () => ({
  openSearchPanel: (view: unknown) => openSearchPanelMock(view),
  search: (config: { top?: boolean }) => searchMock(config),
}));

vi.mock("@codemirror/lint", () => ({
  lintGutter: vi.fn(() => ({ extension: "lintGutter" })),
  setDiagnostics: vi.fn((_state: unknown, diagnostics: unknown[]) => ({
    diagnostics,
  })),
}));

vi.mock("@uiw/react-codemirror", () => {
  return {
    __esModule: true,
    EditorView: {
      domEventHandlers: vi.fn(() => ({ extension: "domEventHandlers" })),
      scrollIntoView: vi.fn((offset: number) => ({ offset })),
    },
    default: ({
      ref,
      extensions,
      onUpdate,
    }: {
      ref?: { current: { view: unknown } | null };
      extensions?: unknown[];
      onUpdate?: (update: { state: { selection: { main: { head: number } } } }) => void;
    }) => {
      if (ref) {
        ref.current = { view: mockView };
      }

      return (
        <div data-testid="mock-codemirror">
          <button
            onClick={() => onUpdate?.({ state: { selection: { main: { head: 26 } } } })}
            type="button"
          >
            cursor-service
          </button>
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
  beforeEach(() => {
    mockDispatch.mockClear();
    mockView.focus.mockClear();
    vi.mocked(setDiagnostics).mockClear();
  });

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

  it("clears stale diagnostics when issues are resolved", () => {
    const { rerender } = render(
      <RegistryEditor
        canApply={false}
        checklist={[]}
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
        onDownload={() => {}}
        onImport={() => {}}
        onToggleTheme={() => {}}
        sourceLabel="service_registry.yaml"
        theme="dark"
        title="Green Room"
      />,
    );

    rerender(
      <RegistryEditor
        canApply
        checklist={[]}
        draftText="metadata:"
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

    expect(vi.mocked(setDiagnostics)).toHaveBeenLastCalledWith(mockView.state, []);
  });

  it("renders schema hints and updates context from editor cursor", async () => {
    const draftText = `services:
  api:
    name: API
    description: Backend API
    type: backend
    status: active
    upstream: []
    business_flows: [checkout]
    owner: platform
    runbook: https://example.com/runbook
    health_check: https://example.com/health
`;
    render(
      <RegistryEditor
        canApply
        checklist={[]}
        draftText={draftText}
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

    expect(
      screen.getByText(
        "Move the cursor inside a `services`, `business_flows`, or `data_flows` entry to see schema guidance.",
      ),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "cursor-service" }));

    expect(screen.getByText("Service Entry")).toBeInTheDocument();
    expect(screen.getByText("Required fields")).toBeInTheDocument();
    expect(screen.getByText("Optional fields")).toBeInTheDocument();
  });

  it("jumps to top-level sections from validation checklist jump buttons", async () => {
    render(
      <RegistryEditor
        canApply
        checklist={[
          {
            title: "Sections",
            items: [
              { label: "business_flows (min 1)", checked: false },
              { label: "data_flows (min 1)", checked: false },
              { label: "services (min 1)", checked: false },
            ],
          },
        ]}
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

    await userEvent.click(screen.getByRole("button", { name: "Jump to services section" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Jump to business_flows section" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Jump to data_flows section" }));

    expect(mockDispatch).toHaveBeenCalled();
    expect(mockView.focus).toHaveBeenCalled();
  });
});
