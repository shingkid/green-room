import type { EditorView } from "@uiw/react-codemirror";
import { setDiagnostics, type Diagnostic } from "@codemirror/lint";

import type { ValidationIssue } from "@domain/registry";

function parseLocation(
  doc: { line: (n: number) => { from: number; to: number }; lines: number },
  location: string | null,
): { from: number; to: number } | null {
  if (!location) {
    return null;
  }

  const match = /line (\d+), col (\d+)/.exec(location);
  if (!match) {
    return null;
  }

  const lineNum = parseInt(match[1], 10);
  const col = parseInt(match[2], 10);
  if (lineNum < 1 || lineNum > doc.lines) {
    return null;
  }

  const line = doc.line(lineNum);
  const from = Math.min(line.from + col - 1, line.to);

  return { from, to: Math.min(from + 1, line.to) };
}

export function diagnosticsFromIssues(
  doc: { line: (n: number) => { from: number; to: number }; lines: number },
  issues: ValidationIssue[],
): Diagnostic[] {
  return issues.flatMap((issue) => {
    const pos = parseLocation(doc, issue.location);
    if (!pos) {
      return [];
    }

    return [{ from: pos.from, to: pos.to, severity: "error" as const, message: issue.message }];
  });
}

export function syncEditorDiagnostics(view: EditorView, issues: ValidationIssue[]) {
  const diagnostics = diagnosticsFromIssues(view.state.doc, issues);
  view.dispatch(setDiagnostics(view.state, diagnostics));
}
