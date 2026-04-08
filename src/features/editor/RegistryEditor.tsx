import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import CodeMirror, { EditorView, type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { yaml } from "@codemirror/lang-yaml";
import { githubDark, githubLight } from "@uiw/codemirror-theme-github";
import { lintGutter } from "@codemirror/lint";
import { openSearchPanel, search } from "@codemirror/search";

import type { ChecklistGroup, Theme, ValidationIssue } from "@domain/registry";
import { pointerToLabel } from "@domain/registry";
import {
  detectHintContextFromParsed,
  HINTS_BY_CONTEXT,
  parseHintDocument,
} from "./schemaHints";
import { syncEditorDiagnostics } from "./editorDiagnostics";
import { SchemaHintsPanel } from "./SchemaHintsPanel";
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

type SectionKey = "services" | "business_flows" | "data_flows";

function findSectionOffset(sourceText: string, sectionKey: SectionKey) {
  const escapedKey = sectionKey.replaceAll("_", "\\_");
  const pattern = new RegExp(`(^|\\n)${escapedKey}:\\s*(?=\\n|$)`);
  const match = pattern.exec(sourceText);

  if (!match || match.index == null) {
    return null;
  }

  return match.index + (match[1] ? match[1].length : 0);
}

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
  const [cursorOffset, setCursorOffset] = useState(0);

  const extensions = useMemo(
    () => [yaml(), search({ top: true }), lintGutter()],
    [],
  );

  const cmTheme = theme === "dark" ? githubDark : githubLight;
  const parsedHintDocument = useMemo(() => parseHintDocument(draftText), [draftText]);
  const hintContext = useMemo(
    () => detectHintContextFromParsed(parsedHintDocument, cursorOffset),
    [parsedHintDocument, cursorOffset],
  );
  const activeHint = hintContext === "none" ? null : HINTS_BY_CONTEXT[hintContext];

  useEffect(() => {
    const view = editorRef.current?.view;
    if (view) {
      syncEditorDiagnostics(view, issues);
    }
  }, [issues]);

  const handleOpenFindReplace = useCallback(() => {
    const view = editorRef.current?.view;

    if (!view) {
      return;
    }

    openSearchPanel(view);
    view.focus();
  }, []);

  const handleEditorUpdate = useCallback(
    (update: { state: { selection: { main: { head: number } } } }) => {
      const nextOffset = update.state.selection.main.head;
      setCursorOffset((currentOffset) =>
        currentOffset === nextOffset ? currentOffset : nextOffset,
      );
    },
    [],
  );

  const jumpToSection = useCallback(
    (sectionKey: SectionKey) => {
      const view = editorRef.current?.view;
      if (!view) {
        return;
      }

      const offset = findSectionOffset(view.state.doc.toString(), sectionKey);
      if (offset == null) {
        return;
      }

      view.dispatch({
        selection: { anchor: offset },
        effects: EditorView.scrollIntoView(offset, { y: "start" }),
      });
      view.focus();
      setCursorOffset(offset);
    },
    [],
  );

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
          <button
            className="secondary-button"
            onClick={() => inputRef.current?.click()}
            type="button"
          >
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
            <div className={styles.editorActions}>
              <button
                className={styles.findReplaceButton}
                onClick={() => jumpToSection("services")}
                type="button"
              >
                Services
              </button>
              <button
                className={styles.findReplaceButton}
                onClick={() => jumpToSection("business_flows")}
                type="button"
              >
                Business Flows
              </button>
              <button
                className={styles.findReplaceButton}
                onClick={() => jumpToSection("data_flows")}
                type="button"
              >
                Data Flows
              </button>
              <button
                className={styles.findReplaceButton}
                onClick={handleOpenFindReplace}
                type="button"
              >
                Find / Replace
              </button>
            </div>
          </div>
          <div className={styles.cmWrapper}>
            <CodeMirror
              basicSetup={{ foldGutter: false }}
              extensions={extensions}
              onChange={onChange}
              onUpdate={handleEditorUpdate}
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
          <SchemaHintsPanel hint={activeHint} />
          {issues.length === 0 ? (
            <div className={styles.validationOk}>
              <div className={styles.validationOkTitle}>Schema validation passed.</div>
              <div className={styles.validationOkBody}>
                The registry is syntactically valid, matches the schema, and all known references
                resolve.
              </div>
            </div>
          ) : (
            <div className={styles.validationList}>
              {issues.map((issue, index) => (
                <div
                  className={styles.validationItem}
                  key={`${issue.path}-${issue.message}-${index}`}
                >
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
