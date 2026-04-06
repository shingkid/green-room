import { useCallback, useMemo, useRef, type ChangeEvent } from "react";

import type { Theme, ValidationIssue } from "../../domain/registry";
import { pointerToLabel } from "../../domain/registry";

type RegistryEditorProps = {
  theme: Theme;
  title: string;
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

export function RegistryEditor({
  theme,
  title,
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
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lineNumberRef = useRef<HTMLDivElement | null>(null);
  const lineNumbers = useMemo(
    () => Array.from({ length: draftText.split("\n").length }, (_, index) => index + 1),
    [draftText],
  );

  const handleEditorScroll = useCallback(() => {
    if (!textareaRef.current || !lineNumberRef.current) {
      return;
    }

    lineNumberRef.current.scrollTop = textareaRef.current.scrollTop;
  }, []);

  return (
    <div className="editor-shell">
      <div className="editor-header">
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
            className="hidden-file-input"
            onChange={onImport}
            ref={inputRef}
            type="file"
          />
        </div>
      </div>

      <div className="editor-layout">
        <section className="editor-pane">
          <div className="pane-title">YAML</div>
          <div className="editor-codeframe">
            <div aria-hidden="true" className="editor-line-numbers" ref={lineNumberRef}>
              {lineNumbers.map((lineNumber) => (
                <div className="editor-line-number" key={lineNumber}>
                  {lineNumber}
                </div>
              ))}
            </div>
            <textarea
              className="editor-textarea"
              onChange={(event) => onChange(event.target.value)}
              onScroll={handleEditorScroll}
              ref={textareaRef}
              spellCheck={false}
              value={draftText}
            />
          </div>
        </section>

        <section className="editor-pane">
          <div className="pane-title">Validation</div>
          {issues.length === 0 ? (
            <div className="validation-ok">
              <div className="validation-ok-title">Schema validation passed.</div>
              <div className="validation-ok-body">
                The registry is syntactically valid, matches the schema, and all known references resolve.
              </div>
            </div>
          ) : (
            <div className="validation-list">
              {issues.map((issue, index) => (
                <div className="validation-item" key={`${issue.path}-${issue.message}-${index}`}>
                  <div className="validation-item-header">
                    <span className="validation-severity">Error</span>
                    {issue.location ? (
                      <span className="validation-location">{issue.location}</span>
                    ) : null}
                  </div>
                  <div className="validation-message">{issue.message}</div>
                  <div className="validation-path">{pointerToLabel(issue.path)}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
