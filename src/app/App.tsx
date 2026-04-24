import './index.css'
import { lazy, Suspense, useState, useEffect, useMemo } from 'react'
import { ThemeProvider } from '@themes/ThemeContext'
import { ThemeSwitcher } from '@components/ThemeSwitcher'
import {
  DEFAULT_REGISTRY_TEMPLATE,
  LOCAL_STORAGE_DRAFT_KEY,
  loadInitialRegistrySource,
  validateRegistryText,
  type Mode,
  type Registry,
} from '@domain/registry'
import { buildGraph } from '@domain/catalog'
import styles from './App.module.css'

const DependencyGraph = lazy(() =>
  import('@features/graph/DependencyGraph').then(m => ({ default: m.DependencyGraph }))
)

const TABS: { id: Mode; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'impact',   label: 'Dependency Impact' },
  { id: 'flow',     label: 'Business Flow' },
  { id: 'data',     label: 'Data Lineage' },
]

// ─── Registry loader hook ─────────────────────────────────────────────────────

function useRegistry() {
  const [registry, setRegistry]       = useState<Registry | null>(null)
  const [sourceLabel, setSourceLabel] = useState<string | null>(null)
  const [isLoading, setIsLoading]     = useState(true)
  const [loadError, setLoadError]     = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const draft = localStorage.getItem(LOCAL_STORAGE_DRAFT_KEY)

        let text: string
        let label: string | null

        if (draft) {
          text  = draft
          label = 'local draft'
        } else {
          const source = await loadInitialRegistrySource()
          text  = source?.sourceText ?? DEFAULT_REGISTRY_TEMPLATE
          label = source?.sourceLabel ?? null
        }

        if (cancelled) return

        const { registry: parsed } = validateRegistryText(text)
        setRegistry(parsed)
        setSourceLabel(label)
      } catch (err) {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : 'Failed to load registry')
        const { registry: fallback } = validateRegistryText(DEFAULT_REGISTRY_TEMPLATE)
        setRegistry(fallback)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [])

  return { registry, sourceLabel, isLoading, loadError }
}

// ─── App shell ───────────────────────────────────────────────────────────────

function AppShell({ registry, sourceLabel, loadError }: {
  registry: Registry | null
  sourceLabel: string | null
  loadError: string | null
}) {
  const [mode, setMode] = useState<Mode>('overview')

  const services = registry?.services ?? {}
  const graph    = useMemo(() => buildGraph(services), [services])

  const serviceCount = Object.keys(services).length
  const edgeCount    = useMemo(
    () => Object.values(graph.upstream).reduce((n, arr) => n + arr.length, 0),
    [graph]
  )

  const showGraph = (mode === 'overview' || mode === 'impact') && registry !== null

  return (
    <div className={styles.shell}>

      {/* ── Header ── */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.logo}>◈ green-room</span>
          <span className={styles.subtitle}>service dependency explorer</span>
          {sourceLabel && (
            <span className={styles.sourceChip}>{sourceLabel}</span>
          )}
        </div>
        <div className={styles.headerRight}>
          <ThemeSwitcher />
        </div>
      </header>

      {/* ── Error banner ── */}
      {loadError && (
        <div className={styles.errorBanner} role="alert">
          {loadError}
        </div>
      )}

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

      {/* ── Main ── */}
      <main className={styles.body}>
        {showGraph ? (
          <Suspense fallback={<div className={styles.graphLoading} />}>
            <DependencyGraph services={services} graph={graph} />
          </Suspense>
        ) : (
          <div className={styles.placeholder}>
            <div className={styles.placeholderLabel}>
              {TABS.find(t => t.id === mode)?.label}
            </div>
            <div className={styles.placeholderHint}>Coming in a future phase</div>
          </div>
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
          <span className={styles.statusMode}>
            {TABS.find(t => t.id === mode)?.label ?? mode}
          </span>
        </span>
      </footer>
    </div>
  )
}

// ─── Root ────────────────────────────────────────────────────────────────────

export default function App() {
  const { registry, sourceLabel, isLoading, loadError } = useRegistry()

  return (
    <ThemeProvider defaultThemeId="d-light">
      {isLoading ? (
        <div className={styles.loadingShell}>
          <div className={styles.loadingCard}>
            <div className={styles.logo}>◈ green-room</div>
            <div className={styles.loadingHint}>Loading registry…</div>
          </div>
        </div>
      ) : (
        <AppShell
          registry={registry}
          sourceLabel={sourceLabel}
          loadError={loadError}
        />
      )}
    </ThemeProvider>
  )
}
