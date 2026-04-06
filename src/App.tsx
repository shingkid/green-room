import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";

import { CatalogView } from "./features/catalog/CatalogView";
import { RegistryEditor } from "./features/editor/RegistryEditor";
import {
  DEFAULT_REGISTRY_TEMPLATE,
  getExplorerTitle,
  LOCAL_STORAGE_DRAFT_KEY,
  loadInitialRegistrySource,
  REGISTRY_URL_CANDIDATES,
  type Registry,
  type Theme,
  validateRegistryText,
} from "./domain/registry";
import { downloadTextFile } from "./shared/browser";

const LOCAL_STORAGE_THEME_KEY = "service-catalog.theme";

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
  const [showEditor, setShowEditor] = useState(false);
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
            setShowEditor(false);
          } else {
            setAppliedRegistry(null);
            setShowEditor(true);
          }
        } else if (storedDraft) {
          setSourceLabel("saved local draft");
          setDraftText(storedDraft);

          const storedValidation = validateRegistryText(storedDraft);

          if (storedValidation.registry) {
            setAppliedRegistry(storedValidation.registry);
          }

          setShowEditor(true);
        } else {
          setSourceLabel(null);
          setDraftText(DEFAULT_REGISTRY_TEMPLATE);
          setAppliedRegistry(null);
          setShowEditor(true);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        setLoadError(error instanceof Error ? error.message : "Failed to load registry.");
        setSourceLabel(null);
        setDraftText(DEFAULT_REGISTRY_TEMPLATE);
        setShowEditor(true);
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
    setShowEditor(false);

    // Once the user edits a file-backed registry in the browser, keep that provenance visible
    // instead of pretending the checked-in YAML is still the active source of truth.
    if (!sourceLabel) {
      setSourceLabel("in-browser draft");
    } else if (!REGISTRY_URL_CANDIDATES.includes(sourceLabel)) {
      setSourceLabel(sourceLabel);
    } else {
      setSourceLabel(`${sourceLabel} (edited in browser)`);
    }
  }, [sourceLabel, validation.registry]);

  const handleImport = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const text = await file.text();
    setDraftText(text);
    setSourceLabel(file.name);
    setShowEditor(true);
    event.target.value = "";
  }, []);

  const handleDownload = useCallback(() => {
    downloadTextFile("service_registry.yaml", draftText, "text/yaml;charset=utf-8");
  }, [draftText]);

  const handleToggleTheme = useCallback(() => {
    setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"));
  }, []);

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
          checklist={validation.checklist}
          draftText={draftText}
          issues={validation.issues}
          onApply={handleApplyRegistry}
          onChange={setDraftText}
          onClose={appliedRegistry ? () => setShowEditor(false) : undefined}
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
      onEditRegistry={() => setShowEditor(true)}
      onToggleTheme={handleToggleTheme}
      registry={appliedRegistry}
      sourceLabel={sourceLabel}
      theme={theme}
    />
  );
}
