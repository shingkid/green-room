import { useCallback, useEffect, useMemo, useRef, type ChangeEvent } from "react";
import CodeMirror, { EditorView, type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { yaml } from "@codemirror/lang-yaml";
import { githubDark, githubLight } from "@uiw/codemirror-theme-github";
import { type Diagnostic, forceLinting, lintGutter, linter } from "@codemirror/lint";
import { openSearchPanel, search } from "@codemirror/search";

import type { ChecklistGroup, Theme, ValidationIssue } from "../../domain/registry";
import { pointerToLabel } from "../../domain/registry";
import styles from "./RegistryEditor.module.css";

type RegistryEditorProps = {
  theme: Theme;
  title: string;
  checklist: ChecklistGroup[];
  draftText: string;
  issues: ValidationIssue[];
  onApply: () => void;
  onChange: (value: string) => void;
  onClose?: () => void;
  onDownload: () => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onToggleTheme: () => void;
  canApply: boolean;
  sourceLabel: string | null;
};

function parseLocation(
  doc: { line: (n: number) => { from: number; to: number }; lines: number },
  location: string | null,
): { from: number; to: number } | null {
  if (!location) return null;
  const match = /line (\d+), col (\d+)/.exec(location);
  if (!match) return null;
  const lineNum = parseInt(match[1], 10);
  const col = parseInt(match[2], 10);
  if (lineNum < 1 || lineNum > doc.lines) return null;
  const line = doc.line(lineNum);
  const from = Math.min(line.from + col - 1, line.to);
  return { from, to: Math.min(from + 1, line.to) };
}

// Prevent CM from capturing Tab so keyboard users can move focus normally.
const noTabCapture = EditorView.domEventHandlers({
  keydown(event) {
    if (event.key === "Tab") event.preventDefault();
  },
});

export function RegistryEditor({
  theme,
  title,
  checklist,
  draftText,
  issues,
  onApply,
  onChange,
  onClose,
  onDownload,
  onImport,
  onToggleTheme,
  canApply,
  sourceLabel,
}: RegistryEditorProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<ReactCodeMirrorRef>(null);

  // Keep a ref so the stable lintSource callback always sees current issues.
  const issuesRef = useRef<ValidationIssue[]>(issues);
  issuesRef.current = issues;

  const lintSource = useCallback((view: EditorView): Diagnostic[] => {
    return issuesRef.current.flatMap((issue) => {
      const pos = parseLocation(view.state.doc, issue.location);
      if (!pos) return [];
      return [{ from: pos.from, to: pos.to, severity: "error" as const, message: issue.message }];
    });
  }, []);

  const extensions = useMemo(
    () => [yaml(), search({ top: true }), lintGutter(), linter(lintSource, { delay: 0 }), noTabCapture],
    [lintSource],
  );

  const cmTheme = theme === "dark" ? githubDark : githubLight;

  // Force CM to re-run linting immediately whenever the React-computed issues change.
  useEffect(() => {
    const view = editorRef.current?.view;
    if (view) forceLinting(view);
  }, [issues]);

  const handleOpenFindReplace = useCallback(() => {
    const view = editorRef.current?.view;

    if (!view) {
      return;
    }

    openSearchPanel(view);
    view.focus();
  }, []);

  return (
    <div className={styles.shell}>
      <div className={styles.header}>
        <div>
          <div className="app-title">{title}</div>
          <div className="app-subtitle">
            {sourceLabel
              ? `Editing ${sourceLabel}. Validation runs on every change.`
              : "No registry file was found. Paste or upload one below."}
          </div>
        </div>
        <div className="header-actions">
          <button className="secondary-button" onClick={() => inputRef.current?.click()} type="button">
            Import YAML
          </button>
          <button className="secondary-button" onClick={onDownload} type="button">
            Download YAML
          </button>
          {onClose ? (
            <button className="secondary-button" onClick={onClose} type="button">
              Back to explorer
            </button>
          ) : null}
          <button className="primary-button" disabled={!canApply} onClick={onApply} type="button">
            {canApply ? "Use this registry" : "Fix validation errors"}
          </button>
          <button
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            aria-pressed={theme === "dark"}
            className="secondary-button theme-toggle-button"
            onClick={onToggleTheme}
            type="button"
          >
            <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
          </button>
          <input
            accept=".yaml,.yml,text/yaml,text/x-yaml"
            className={styles.hiddenFileInput}
            onChange={onImport}
            ref={inputRef}
            type="file"
          />
        </div>
      </div>

      <div className={styles.layout}>
        <section className={styles.pane}>
          <div className={styles.paneTitleRow}>
            <div className={styles.paneTitle}>YAML</div>
            <button
              className={styles.findReplaceButton}
              onClick={handleOpenFindReplace}
              type="button"
            >
              Find / Replace
            </button>
          </div>
          <div className={styles.cmWrapper}>
            <CodeMirror
              basicSetup={{ foldGutter: false }}
              extensions={extensions}
              onChange={onChange}
              ref={editorRef}
              theme={cmTheme}
              value={draftText}
            />
          </div>
        </section>

        <section className={styles.pane}>
          <div className={styles.paneTitle}>Validation</div>
          <div className={styles.checklist}>
            {checklist.map((group) => (
              <div className={styles.checklistGroup} key={group.title}>
                <div className={styles.checklistGroupTitle}>{group.title}</div>
                {group.items.map((item) => (
                  <div
                    className={`${styles.checklistItem} ${item.checked ? styles.checklistItemChecked : styles.checklistItemUnchecked}`}
                    key={item.label}
                  >
                    <span aria-hidden="true" className={styles.checklistIcon}>
                      {item.checked ? "✓" : "○"}
                    </span>
                    <span className={styles.checklistLabel}>{item.label}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          {issues.length === 0 ? (
            <div className={styles.validationOk}>
              <div className={styles.validationOkTitle}>Schema validation passed.</div>
              <div className={styles.validationOkBody}>
                The registry is syntactically valid, matches the schema, and all known references resolve.
              </div>
            </div>
          ) : (
            <div className={styles.validationList}>
              {issues.map((issue, index) => (
                <div className={styles.validationItem} key={`${issue.path}-${issue.message}-${index}`}>
                  <div className={styles.validationItemHeader}>
                    <span className={styles.validationSeverity}>Error</span>
                    {issue.location ? (
                      <span className={styles.validationLocation}>{issue.location}</span>
                    ) : null}
                  </div>
                  <div className={styles.validationMessage}>{issue.message}</div>
                  <div className={styles.validationPath}>{pointerToLabel(issue.path)}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
