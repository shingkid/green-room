import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";

import { CatalogView } from "./features/catalog/CatalogView";
import { RegistryEditor } from "./features/editor/RegistryEditor";
import {
  addDataFlowStage,
  DEFAULT_REGISTRY_TEMPLATE,
  findYamlLine,
  getExplorerTitle,
  LOCAL_STORAGE_DRAFT_KEY,
  loadInitialRegistrySource,
  REGISTRY_URL_CANDIDATES,
  reorderDataFlowStages,
  type DataFlowAction,
  type DataFlowStage,
  type Registry,
  type Theme,
  validateRegistryText,
} from "./domain/registry";
import { downloadTextFile } from "./shared/browser";

const LOCAL_STORAGE_THEME_KEY = "service-catalog.theme";

type ViewLayout = "catalog" | "editor" | "split";

function getPreferredTheme(): Theme {
  if (typeof window === "undefined") {
    return "dark";
  }

  const storedTheme = window.localStorage.getItem(LOCAL_STORAGE_THEME_KEY);

  if (storedTheme === "light" || storedTheme === "dark") {
    return storedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => getPreferredTheme());
  const [sourceLabel, setSourceLabel] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [appliedRegistry, setAppliedRegistry] = useState<Registry | null>(null);
  const [viewLayout, setViewLayout] = useState<ViewLayout>("editor");
  const [editorFocusLine, setEditorFocusLine] = useState<number | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const validation = useMemo(() => validateRegistryText(draftText), [draftText]);
  const currentRegistry = validation.registry ?? appliedRegistry;
  const explorerTitle = getExplorerTitle(currentRegistry?.metadata.team);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.body.dataset.theme = theme;
    window.localStorage.setItem(LOCAL_STORAGE_THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    document.title = explorerTitle;
  }, [explorerTitle]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // Prefer a checked-in registry when available, then fall back to any unfinished
        // in-browser draft before showing the starter template.
        const initialSource = await loadInitialRegistrySource();
        const storedDraft = window.localStorage.getItem(LOCAL_STORAGE_DRAFT_KEY);

        if (cancelled) {
          return;
        }

        if (initialSource) {
          setSourceLabel(initialSource.sourceLabel);
          setDraftText(initialSource.sourceText);

          const initialValidation = validateRegistryText(initialSource.sourceText);

          if (initialValidation.registry) {
            setAppliedRegistry(initialValidation.registry);
            setViewLayout("catalog");
          } else {
            setAppliedRegistry(null);
            setViewLayout("editor");
          }
        } else if (storedDraft) {
          setSourceLabel("saved local draft");
          setDraftText(storedDraft);

          const storedValidation = validateRegistryText(storedDraft);

          if (storedValidation.registry) {
            setAppliedRegistry(storedValidation.registry);
          }

          setViewLayout("editor");
        } else {
          setSourceLabel(null);
          setDraftText(DEFAULT_REGISTRY_TEMPLATE);
          setAppliedRegistry(null);
          setViewLayout("editor");
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        setLoadError(error instanceof Error ? error.message : "Failed to load registry.");
        setSourceLabel(null);
        setDraftText(DEFAULT_REGISTRY_TEMPLATE);
        setViewLayout("editor");
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!draftText) {
      window.localStorage.removeItem(LOCAL_STORAGE_DRAFT_KEY);
      return;
    }

    window.localStorage.setItem(LOCAL_STORAGE_DRAFT_KEY, draftText);
  }, [draftText]);

  const handleApplyRegistry = useCallback(() => {
    if (!validation.registry) {
      return;
    }

    setAppliedRegistry(validation.registry);
    if (viewLayout === "editor") {
      setViewLayout("catalog");
    }

    // Once the user edits a file-backed registry in the browser, keep that provenance visible
    // instead of pretending the checked-in YAML is still the active source of truth.
    if (!sourceLabel) {
      setSourceLabel("in-browser draft");
    } else if (!REGISTRY_URL_CANDIDATES.includes(sourceLabel)) {
      setSourceLabel(sourceLabel);
    } else {
      setSourceLabel(`${sourceLabel} (edited in browser)`);
    }
  }, [sourceLabel, validation.registry, viewLayout]);

  const handleImport = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const text = await file.text();
    setDraftText(text);
    setSourceLabel(file.name);
    setViewLayout("editor");
    event.target.value = "";
  }, []);

  const handleDownload = useCallback(() => {
    downloadTextFile("service_registry.yaml", draftText, "text/yaml;charset=utf-8");
  }, [draftText]);

  const handleToggleTheme = useCallback(() => {
    setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"));
  }, []);

  const handleEditEntity = useCallback((keyPath: string[]) => {
    const line = findYamlLine(draftText, keyPath);
    setEditorFocusLine(line);
    setViewLayout("split");
  }, [draftText]);

  const handleOpenEditorFull = useCallback(() => {
    setEditorFocusLine(undefined);
    setViewLayout("editor");
  }, []);

  const handleCloseEditor = useCallback(() => {
    setViewLayout(appliedRegistry ? "catalog" : "editor");
  }, [appliedRegistry]);

  const handleToggleEditMode = useCallback(() => {
    setViewLayout((current) => {
      if (current === "split") return "catalog";
      setEditorFocusLine(undefined);
      return "split";
    });
  }, []);

  const handleReorderStages = useCallback((flowKey: string, newStages: DataFlowStage[]) => {
    const newText = reorderDataFlowStages(draftText, flowKey, newStages);
    setDraftText(newText);
    const newValidation = validateRegistryText(newText);
    if (newValidation.registry) {
      setAppliedRegistry(newValidation.registry);
    }
  }, [draftText]);

  const handleAddStage = useCallback((flowKey: string, stage: DataFlowStage, atIndex: number) => {
    const newText = addDataFlowStage(draftText, flowKey, stage, atIndex);
    setDraftText(newText);
    const newValidation = validateRegistryText(newText);
    if (newValidation.registry) {
      setAppliedRegistry(newValidation.registry);
    }
  }, [draftText]);

  if (isLoading) {
    return (
      <div className="startup-shell" data-theme={theme}>
        <div className="startup-card">
          <div className="app-title">{explorerTitle}</div>
          <div className="app-subtitle">Loading registry…</div>
        </div>
      </div>
    );
  }

  const showEditor = viewLayout === "editor" || viewLayout === "split";
  const showCatalog = viewLayout === "catalog" || viewLayout === "split";
  const editMode = viewLayout === "split";

  if (viewLayout === "split" && appliedRegistry) {
    return (
      <div
        data-theme={theme}
        style={{ display: "flex", height: "100vh", overflow: "hidden" }}
      >
        <div style={{ flex: "0 0 55%", overflowY: "auto", minWidth: 0 }}>
          <CatalogView
            editMode={editMode}
            onAddStage={handleAddStage}
            onEditEntity={handleEditEntity}
            onEditRegistry={handleOpenEditorFull}
            onReorderStages={handleReorderStages}
            onToggleEditMode={handleToggleEditMode}
            onToggleTheme={handleToggleTheme}
            registry={appliedRegistry}
            sourceLabel={sourceLabel}
            theme={theme}
          />
        </div>
        <div
          style={{
            borderLeft: "1px solid var(--border-muted, #334155)",
            flex: "0 0 45%",
            minWidth: 0,
            overflowY: "auto",
          }}
        >
          {loadError ? (
            <div className="load-error-banner">{loadError}</div>
          ) : null}
          <RegistryEditor
            canApply={validation.registry !== null}
            draftText={draftText}
            focusLine={editorFocusLine}
            issues={validation.issues}
            onApply={handleApplyRegistry}
            onChange={setDraftText}
            onClose={handleCloseEditor}
            onDownload={handleDownload}
            onImport={handleImport}
            onToggleTheme={handleToggleTheme}
            sourceLabel={sourceLabel}
            theme={theme}
            title={explorerTitle}
          />
        </div>
      </div>
    );
  }

  if (showEditor || !appliedRegistry) {
    return (
      <div className="app-shell" data-theme={theme}>
        {loadError ? (
          <div className="load-error-banner">
            {loadError}
          </div>
        ) : null}
        <RegistryEditor
          canApply={validation.registry !== null}
          draftText={draftText}
          focusLine={editorFocusLine}
          issues={validation.issues}
          onApply={handleApplyRegistry}
          onChange={setDraftText}
          onClose={appliedRegistry ? handleCloseEditor : undefined}
          onDownload={handleDownload}
          onImport={handleImport}
          onToggleTheme={handleToggleTheme}
          sourceLabel={sourceLabel}
          theme={theme}
          title={explorerTitle}
        />
      </div>
    );
  }

  return (
    <CatalogView
      editMode={false}
      onAddStage={handleAddStage}
      onEditEntity={handleEditEntity}
      onEditRegistry={handleOpenEditorFull}
      onReorderStages={handleReorderStages}
      onToggleEditMode={handleToggleEditMode}
      onToggleTheme={handleToggleTheme}
      registry={appliedRegistry}
      sourceLabel={sourceLabel}
      theme={theme}
    />
  );
}
