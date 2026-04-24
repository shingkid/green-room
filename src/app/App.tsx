import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";

import {
  DEFAULT_REGISTRY_TEMPLATE,
  getExplorerTitle,
  LOCAL_STORAGE_DRAFT_KEY,
  loadInitialRegistrySource,
  REGISTRY_URL_CANDIDATES,
  type Registry,
  type Theme,
  validateRegistryText,
} from "@domain/registry";
import { downloadTextFile } from "@shared/browser";

const LOCAL_STORAGE_THEME_KEY = "green-room.theme";
const CatalogView = lazy(() =>
  import("@features/catalog/CatalogView").then((module) => ({ default: module.CatalogView })),
);
const RegistryEditor = lazy(() =>
  import("@features/editor/RegistryEditor").then((module) => ({ default: module.RegistryEditor })),
);

type AppStartupState = {
  appliedRegistry: Registry | null;
  draftText: string;
  loadError: string | null;
  showEditor: boolean;
  sourceLabel: string | null;
  validationText: string;
};

function buildTemplateStartupState(loadError: string | null): AppStartupState {
  return {
    appliedRegistry: null,
    draftText: DEFAULT_REGISTRY_TEMPLATE,
    loadError,
    showEditor: true,
    sourceLabel: null,
    validationText: DEFAULT_REGISTRY_TEMPLATE,
  };
}

function resolveStartupState(
  initialSource: Awaited<ReturnType<typeof loadInitialRegistrySource>>,
  storedDraft: string | null,
): AppStartupState {
  if (storedDraft) {
    const storedValidation = validateRegistryText(storedDraft);

    return {
      appliedRegistry: storedValidation.registry,
      draftText: storedDraft,
      loadError: null,
      showEditor: !storedValidation.registry,
      sourceLabel: "saved local draft",
      validationText: storedDraft,
    };
  }

  if (initialSource) {
    const initialValidation = validateRegistryText(initialSource.sourceText);

    return {
      appliedRegistry: initialValidation.registry,
      draftText: initialSource.sourceText,
      loadError: null,
      showEditor: !initialValidation.registry,
      sourceLabel: initialSource.sourceLabel,
      validationText: initialSource.sourceText,
    };
  }

  return buildTemplateStartupState(null);
}

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
  const [validationText, setValidationText] = useState("");
  const [appliedRegistry, setAppliedRegistry] = useState<Registry | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const validation = useMemo(() => validateRegistryText(validationText), [validationText]);
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
    const debounceTimer = window.setTimeout(() => {
      setValidationText(draftText);
    }, 180);

    return () => {
      window.clearTimeout(debounceTimer);
    };
  }, [draftText]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const storedDraft = window.localStorage.getItem(LOCAL_STORAGE_DRAFT_KEY);

      // Apply any unfinished in-browser draft immediately, without waiting for the remote source.
      if (storedDraft) {
        if (!cancelled) {
          const startupState = resolveStartupState(null, storedDraft);
          setSourceLabel(startupState.sourceLabel);
          setDraftText(startupState.draftText);
          setValidationText(startupState.validationText);
          setAppliedRegistry(startupState.appliedRegistry);
          setShowEditor(startupState.showEditor);
          setLoadError(startupState.loadError);
          setIsLoading(false);
        }
        return;
      }

      try {
        // No local draft — fetch from checked-in registry sources, then fall back to the starter template.
        const initialSource = await loadInitialRegistrySource();

        if (cancelled) {
          return;
        }

        const startupState = resolveStartupState(initialSource, null);
        setSourceLabel(startupState.sourceLabel);
        setDraftText(startupState.draftText);
        setValidationText(startupState.validationText);
        setAppliedRegistry(startupState.appliedRegistry);
        setShowEditor(startupState.showEditor);
        setLoadError(startupState.loadError);
      } catch (error) {
        if (cancelled) {
          return;
        }

        const errorMessage = error instanceof Error ? error.message : "Failed to load registry.";
        const startupState = buildTemplateStartupState(errorMessage);
        setSourceLabel(startupState.sourceLabel);
        setDraftText(startupState.draftText);
        setValidationText(startupState.validationText);
        setAppliedRegistry(startupState.appliedRegistry);
        setShowEditor(startupState.showEditor);
        setLoadError(startupState.loadError);
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
    setValidationText(text);
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
        {loadError ? <div className="load-error-banner">{loadError}</div> : null}
        <Suspense fallback={<div className="app-subtitle">Loading editor…</div>}>
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
        </Suspense>
      </div>
    );
  }

  return (
    <Suspense fallback={<div className="app-subtitle">Loading explorer…</div>}>
      <CatalogView
        onEditRegistry={() => setShowEditor(true)}
        onToggleTheme={handleToggleTheme}
        registry={appliedRegistry}
        sourceLabel={sourceLabel}
        theme={theme}
      />
    </Suspense>
  );
}
