import './index.css'
import { lazy, Suspense, useState, useEffect, useMemo, useCallback, type ChangeEvent } from 'react'
import { ThemeProvider, useTheme } from '@themes/ThemeContext'
import {
  DEFAULT_REGISTRY_TEMPLATE,
  LOCAL_STORAGE_DRAFT_KEY,
  loadInitialRegistrySource,
  validateRegistryText,
  getExplorerTitle,
  REGISTRY_URL_CANDIDATES,
  type Mode,
  type Registry,
  type Theme,
} from '@domain/registry'
import { buildGraph } from '@domain/catalog'
import { downloadTextFile } from '@shared/browser'
import styles from './App.module.css'

const CatalogView = lazy(() =>
  import('@features/catalog/CatalogView').then(m => ({ default: m.CatalogView }))
)
const RegistryEditor = lazy(() =>
  import('@features/editor/RegistryEditor').then(m => ({ default: m.RegistryEditor }))
)
const DependencyGraph = lazy(() =>
  import('@features/graph/DependencyGraph').then(m => ({ default: m.DependencyGraph }))
)
const OverviewView = lazy(() =>
  import('@features/overview/OverviewView').then(m => ({ default: m.OverviewView }))
)

const TABS: { id: Mode; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'impact',   label: 'Dependency Impact' },
  { id: 'flow',     label: 'Business Flow' },
  { id: 'data',     label: 'Data Lineage' },
]

// ─── Startup helpers (mirrors old App logic) ──────────────────────────────────

type StartupState = {
  appliedRegistry: Registry | null
  draftText: string
  loadError: string | null
  showEditor: boolean
  sourceLabel: string | null
}

function buildTemplateState(loadError: string | null): StartupState {
  return {
    appliedRegistry: null,
    draftText: DEFAULT_REGISTRY_TEMPLATE,
    loadError,
    showEditor: true,
    sourceLabel: null,
  }
}

function resolveStartup(
  source: Awaited<ReturnType<typeof loadInitialRegistrySource>>,
  storedDraft: string | null,
): StartupState {
  if (storedDraft) {
    const { registry } = validateRegistryText(storedDraft)
    return {
      appliedRegistry: registry,
      draftText: storedDraft,
      loadError: null,
      showEditor: !registry,
      sourceLabel: 'local draft',
    }
  }
  if (source) {
    const { registry } = validateRegistryText(source.sourceText)
    return {
      appliedRegistry: registry,
      draftText: source.sourceText,
      loadError: null,
      showEditor: !registry,
      sourceLabel: source.sourceLabel,
    }
  }
  return buildTemplateState(null)
}

// ─── Theme bridge: Phase 1 ↔ old Theme type ──────────────────────────────────

function useThemeBridge(): { theme: Theme; toggleTheme: () => void } {
  const { themeId, setThemeId } = useTheme()
  const theme: Theme = themeId.includes('dark') ? 'dark' : 'light'

  const toggleTheme = useCallback(() => {
    const pairs: Record<string, string> = {
      'd-light': 'd-dark', 'd-dark': 'd-light',
      'c-light': 'c-dark', 'c-dark': 'c-light',
    }
    setThemeId(pairs[themeId] ?? 'd-light')
  }, [themeId, setThemeId])

  return { theme, toggleTheme }
}

// ─── Main app content (inside ThemeProvider) ──────────────────────────────────

function AppContent() {
  const { theme, toggleTheme } = useThemeBridge()

  // ── Registry state ──
  const [appliedRegistry, setAppliedRegistry] = useState<Registry | null>(null)
  const [draftText, setDraftText]             = useState('')
  const [validationText, setValidationText]   = useState('')
  const [sourceLabel, setSourceLabel]         = useState<string | null>(null)
  const [showEditor, setShowEditor]           = useState(false)
  const [isLoading, setIsLoading]             = useState(true)
  const [loadError, setLoadError]             = useState<string | null>(null)

  // ── Tab state ──
  const [mode, setMode] = useState<Mode>('overview')

  // ── Validation (debounced) ──
  const validation = useMemo(() => validateRegistryText(validationText), [validationText])
  const currentRegistry = validation.registry ?? appliedRegistry

  useEffect(() => {
    const t = window.setTimeout(() => setValidationText(draftText), 180)
    return () => window.clearTimeout(t)
  }, [draftText])

  // ── Draft persistence ──
  useEffect(() => {
    if (!draftText) { localStorage.removeItem(LOCAL_STORAGE_DRAFT_KEY); return }
    localStorage.setItem(LOCAL_STORAGE_DRAFT_KEY, draftText)
  }, [draftText])

  // ── Document title ──
  useEffect(() => {
    document.title = getExplorerTitle(currentRegistry?.metadata.team)
  }, [currentRegistry])

  // ── Initial load ──
  useEffect(() => {
    let cancelled = false

    async function load() {
      const storedDraft = localStorage.getItem(LOCAL_STORAGE_DRAFT_KEY)

      if (storedDraft) {
        if (!cancelled) {
          const s = resolveStartup(null, storedDraft)
          apply(s)
          setIsLoading(false)
        }
        return
      }

      try {
        const source = await loadInitialRegistrySource()
        if (!cancelled) {
          apply(resolveStartup(source, null))
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Failed to load registry.'
          apply(buildTemplateState(msg))
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    function apply(s: StartupState) {
      setAppliedRegistry(s.appliedRegistry)
      setDraftText(s.draftText)
      setValidationText(s.draftText)
      setSourceLabel(s.sourceLabel)
      setShowEditor(s.showEditor)
      setLoadError(s.loadError)
    }

    void load()
    return () => { cancelled = true }
  }, [])

  // ── Handlers ──
  const handleApply = useCallback(() => {
    if (!validation.registry) return
    setAppliedRegistry(validation.registry)
    setShowEditor(false)
    if (!sourceLabel) {
      setSourceLabel('in-browser draft')
    } else if (!REGISTRY_URL_CANDIDATES.includes(sourceLabel as typeof REGISTRY_URL_CANDIDATES[number])) {
      setSourceLabel(sourceLabel)
    } else {
      setSourceLabel(`${sourceLabel} (edited in browser)`)
    }
  }, [validation.registry, sourceLabel])

  const handleImport = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const text = await file.text()
    setDraftText(text)
    setValidationText(text)
    setSourceLabel(file.name)
    setShowEditor(true)
    event.target.value = ''
  }, [])

  const handleDownload = useCallback(() => {
    downloadTextFile('service_registry.yaml', draftText, 'text/yaml;charset=utf-8')
  }, [draftText])

  const handleEditRegistry = useCallback(() => setShowEditor(true), [])
  const handleCloseEditor   = useCallback(() => setShowEditor(false), [])

  // ── Graph data (for DependencyGraph) ──
  const services    = currentRegistry?.services ?? {}
  const graph       = useMemo(() => buildGraph(services), [services])
  const serviceCount = Object.keys(services).length
  const edgeCount    = useMemo(
    () => Object.values(graph.upstream).reduce((n, arr) => n + arr.length, 0),
    [graph]
  )

  if (isLoading) {
    return (
      <div className={styles.loadingShell}>
        <div className={styles.loadingCard}>
          <div className={styles.logo}>◈ green-room</div>
          <div className={styles.loadingHint}>Loading registry…</div>
        </div>
      </div>
    )
  }

  // ── Editor mode ──
  if (showEditor) {
    return (
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.logo}>◈ green-room</span>
            {sourceLabel && <span className={styles.sourceChip}>{sourceLabel}</span>}
          </div>
          <div className={styles.headerRight}>
            <button className={styles.actionBtn} onClick={toggleTheme}>
              {theme === 'dark' ? '○ Light' : '● Dark'}
            </button>
          </div>
        </header>
        {loadError && <div className={styles.errorBanner} role="alert">{loadError}</div>}
        <div className={styles.body}>
          <Suspense fallback={<div className={styles.graphLoading} />}>
            <RegistryEditor
              theme={theme}
              title={getExplorerTitle(currentRegistry?.metadata.team)}
              checklist={validation.checklist}
              draftText={draftText}
              issues={validation.issues}
              onApply={handleApply}
              onChange={setDraftText}
              onClose={handleCloseEditor}
              onDownload={handleDownload}
              onImport={handleImport}
              onToggleTheme={toggleTheme}
              canApply={!!validation.registry}
              sourceLabel={sourceLabel}
            />
          </Suspense>
        </div>
      </div>
    )
  }

  // ── Catalog mode ──
  const validationIssues = validation.issues

  return (
    <div className={styles.shell}>

      {/* ── Header ── */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.logo}>◈ green-room</span>
          <span className={styles.subtitle}>service dependency explorer</span>
          {sourceLabel && <span className={styles.sourceChip}>{sourceLabel}</span>}
        </div>
        <div className={styles.headerRight}>
          <button className={styles.actionBtn} onClick={handleEditRegistry}>
            Edit registry
          </button>
          <button className={styles.actionBtn} onClick={toggleTheme}>
            {theme === 'dark' ? '○ Light' : '● Dark'}
          </button>
        </div>
      </header>

      {loadError && <div className={styles.errorBanner} role="alert">{loadError}</div>}

      {/* ── Tab nav ── */}
      <nav className={styles.tabs} role="tablist">
        {TABS.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={mode === tab.id}
            className={`${styles.tab} ${mode === tab.id ? styles.tabActive : ''}`}
            onClick={() => setMode(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* ── Content ── */}
      <main className={styles.body}>
        {mode === 'overview' && (
          currentRegistry ? (
            <Suspense fallback={<div className={styles.graphLoading} />}>
              <OverviewView
                registry={currentRegistry}
                graph={graph}
                validationIssues={validationIssues}
                onEditRegistry={handleEditRegistry}
              />
            </Suspense>
          ) : (
            <div className={styles.placeholder}>
              <div className={styles.placeholderLabel}>No registry loaded</div>
              <div className={styles.placeholderHint}>
                <button className={styles.placeholderAction} onClick={handleEditRegistry}>
                  Open registry editor
                </button>
              </div>
            </div>
          )
        )}

        {mode === 'impact' && (
          currentRegistry ? (
            <Suspense fallback={<div className={styles.graphLoading} />}>
              <DependencyGraph services={services} graph={graph} hosting={currentRegistry?.hosting ?? {}} />
            </Suspense>
          ) : (
            <div className={styles.placeholder}>
              <div className={styles.placeholderLabel}>No registry loaded</div>
              <div className={styles.placeholderHint}>
                <button className={styles.placeholderAction} onClick={handleEditRegistry}>
                  Open registry editor
                </button>
              </div>
            </div>
          )
        )}

        {(mode === 'flow' || mode === 'data') && (
          currentRegistry ? (
            <Suspense fallback={<div className={styles.graphLoading} />}>
              <CatalogView
                key={mode}
                theme={theme}
                registry={currentRegistry}
                sourceLabel={sourceLabel}
                onEditRegistry={handleEditRegistry}
                onToggleTheme={toggleTheme}
                initialMode={mode}
                hideShell
              />
            </Suspense>
          ) : (
            <div className={styles.placeholder}>
              <div className={styles.placeholderLabel}>No registry loaded</div>
            </div>
          )
        )}
      </main>

      {/* ── Status bar ── */}
      <footer className={styles.statusBar}>
        <span className={styles.statusLeft}>
          <span className={styles.statusDot} />
          <span className={styles.statusText}>
            {serviceCount} service{serviceCount !== 1 ? 's' : ''}
          </span>
          <span className={styles.statusSep}>·</span>
          <span className={styles.statusText}>
            {edgeCount} connection{edgeCount !== 1 ? 's' : ''}
          </span>
        </span>
        <span className={styles.statusRight}>
          <span className={styles.statusMode}>{TABS.find(t => t.id === mode)?.label}</span>
        </span>
      </footer>
    </div>
  )
}

// ─── Root ────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <ThemeProvider defaultThemeId="d-dark">
      <AppContent />
    </ThemeProvider>
  )
}
