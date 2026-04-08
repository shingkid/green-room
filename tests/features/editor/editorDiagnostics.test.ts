import { setDiagnostics } from "@codemirror/lint";
import { diagnosticsFromIssues, syncEditorDiagnostics } from "@features/editor/editorDiagnostics";
import { vi } from "vitest";

vi.mock("@codemirror/lint", () => ({
  setDiagnostics: vi.fn((_state: unknown, diagnostics: unknown[]) => ({ diagnostics })),
}));

describe("editorDiagnostics", () => {
  const doc = {
    line: (n: number) => {
      if (n === 1) {
        return { from: 0, to: 10 };
      }
      return { from: 11, to: 20 };
    },
    lines: 2,
  };

  it("maps valid line/col issues to CodeMirror diagnostics", () => {
    const diagnostics = diagnosticsFromIssues(doc, [
      {
        location: "line 1, col 3",
        message: "Missing field",
        path: "/metadata/team_id",
        severity: "error",
      },
    ]);

    expect(diagnostics).toEqual([{ from: 2, to: 3, severity: "error", message: "Missing field" }]);
  });

  it("ignores issues with null/malformed/out-of-range locations and clamps large columns", () => {
    const diagnostics = diagnosticsFromIssues(doc, [
      {
        location: null,
        message: "no location",
        path: "",
        severity: "error",
      },
      {
        location: "line X, col Y",
        message: "bad format",
        path: "",
        severity: "error",
      },
      {
        location: "line 3, col 1",
        message: "outside doc",
        path: "",
        severity: "error",
      },
      {
        location: "line 2, col 999",
        message: "clamped",
        path: "",
        severity: "error",
      },
    ]);

    expect(diagnostics).toEqual([{ from: 20, to: 20, severity: "error", message: "clamped" }]);
  });

  it("dispatches editor diagnostics through setDiagnostics", () => {
    const dispatch = vi.fn();
    const view = {
      dispatch,
      state: { doc, marker: "state" },
    } as unknown as Parameters<typeof syncEditorDiagnostics>[0];

    syncEditorDiagnostics(view, [
      {
        location: "line 1, col 1",
        message: "Issue",
        path: "/x",
        severity: "error",
      },
    ]);

    expect(setDiagnostics).toHaveBeenCalledWith(view.state, [
      { from: 0, to: 1, severity: "error", message: "Issue" },
    ]);
    expect(dispatch).toHaveBeenCalledWith({
      diagnostics: [{ from: 0, to: 1, severity: "error", message: "Issue" }],
    });
  });
});
