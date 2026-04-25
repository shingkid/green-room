import { useState, useMemo } from 'react'
import type { Registry, Service, ValidationIssue } from '@domain/registry'
import type { Graph } from '@domain/catalog'
import { collectReachable } from '@domain/catalog'
import styles from './OverviewView.module.css'

interface Props {
  registry: Registry
  graph: Graph
  validationIssues: ValidationIssue[]
  onEditRegistry: () => void
}

type FilterState = 'all' | 'active' | 'deprecated'

function getHostingEnv(registry: Registry, hostingKey: string | undefined): string {
  if (!hostingKey) return '—'
  const h = registry.hosting[hostingKey]
  return h?.environment ?? hostingKey
}

function BadgeMod(status: string): string {
  if (status === 'active')       return styles.badgeActive
  if (status === 'experimental') return styles.badgeExp
  if (status === 'deprecated')   return styles.badgeDep
  if (status === 'migrating')    return styles.badgeDep
  return styles.badgeDep
}

function ServiceBadge({ status }: { status: string }) {
  return (
    <span className={`${styles.badge} ${BadgeMod(status)}`}>
      {status}
    </span>
  )
}

function PaneHd({ children }: { children: React.ReactNode }) {
  return <div className={styles.paneHd}>{children}</div>
}

export function OverviewView({ registry, graph, validationIssues, onEditRegistry }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterState>('all')

  const services = registry.services
  const serviceEntries = useMemo(() => Object.entries(services), [services])

  const visibleEntries = useMemo(() => {
    return serviceEntries.filter(([key, svc]) => {
      if (filter === 'active'     && svc.status !== 'active')     return false
      if (filter === 'deprecated' && svc.status !== 'deprecated') return false
      if (search) {
        const q = search.toLowerCase()
        const haystack = [key, svc.name, svc.owner ?? '', svc.type, ...(svc.tags ?? [])]
          .join(' ').toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [serviceEntries, filter, search])

  const stats = useMemo(() => {
    const total        = serviceEntries.length
    const active       = serviceEntries.filter(([, s]) => s.status === 'active').length
    const experimental = serviceEntries.filter(([, s]) => s.status === 'experimental').length
    const deprecated   = serviceEntries.filter(([, s]) => s.status === 'deprecated').length
    const byOwner: Record<string, number> = {}
    serviceEntries.forEach(([, s]) => {
      if (s.owner) byOwner[s.owner] = (byOwner[s.owner] ?? 0) + 1
    })
    const ownerList = Object.entries(byOwner).sort((a, b) => b[1] - a[1]).slice(0, 5)
    return { total, active, experimental, deprecated, ownerList }
  }, [serviceEntries])

  const selectedService: Service | null = selectedId ? (services[selectedId] ?? null) : null

  const affectedIds = useMemo(() => {
    if (!selectedId) return new Set<string>()
    return collectReachable(selectedId, graph.downstream)
  }, [selectedId, graph])

  const handleSelect = (key: string) => setSelectedId(prev => prev === key ? null : key)
  const handleClear  = () => setSelectedId(null)

  const upstream   = selectedId ? (graph.upstream[selectedId]   ?? []) : []
  const downstream = selectedId ? (graph.downstream[selectedId] ?? []) : []

  return (
    <div className={styles.shell}>
      {/* ── Search bar ── */}
      <div className={styles.searchBar}>
        <input
          className={styles.searchInput}
          placeholder="Search services, owners, tags…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {selectedId && (
          <button className={styles.btnGhost} onClick={handleClear}>
            ✕ Clear selection
          </button>
        )}
      </div>

      {/* ── Body: 3-col when selected, 2-col otherwise ── */}
      <div className={selectedId ? styles.body3col : styles.body2col}>

        {/* ── Left pane: service list (only when selected) ── */}
        {selectedId && (
          <div className={styles.leftPane}>
            <PaneHd>Services</PaneHd>
            {visibleEntries.map(([key, svc]) => {
              const isSel = key === selectedId
              const isAff = affectedIds.has(key)
              return (
                <div
                  key={key}
                  className={`${styles.nodeItem} ${isSel ? styles.nodeItemSel : isAff ? styles.nodeItemAff : ''}`}
                  onClick={() => handleSelect(key)}
                >
                  <div className={styles.nodeNm}>{svc.name ?? key}</div>
                  <div className={styles.nodeMeta}>
                    {svc.owner ?? '—'} · {getHostingEnv(registry, svc.hosting)}
                  </div>
                  <ServiceBadge status={svc.status} />
                </div>
              )
            })}
          </div>
        )}

        {/* ── Main pane ── */}
        <div className={styles.mainPane}>
          {selectedService && selectedId ? (
            /* ── Service detail view ── */
            <>
              <div className={styles.toolbar}>
                <span className={styles.toolLabel}>{selectedService.name ?? selectedId}</span>
              </div>
              <div className={styles.detailGrid}>
                <div className={styles.detRow}>
                  <div className={styles.detLbl}>Owner</div>
                  <div className={styles.detVal}>{selectedService.owner ?? '—'}</div>
                </div>
                <div className={styles.detRow}>
                  <div className={styles.detLbl}>Type</div>
                  <div className={styles.detVal}>{selectedService.type}</div>
                </div>
                <div className={styles.detRow}>
                  <div className={styles.detLbl}>Status</div>
                  <div className={styles.detVal}><ServiceBadge status={selectedService.status} /></div>
                </div>
                <div className={styles.detRow}>
                  <div className={styles.detLbl}>Environment</div>
                  <div className={styles.detVal}>{getHostingEnv(registry, selectedService.hosting)}</div>
                </div>
              </div>

              {selectedService.description && (
                <div className={`${styles.detRow} ${styles.detRowFull}`}>
                  <div className={styles.detLbl}>Description</div>
                  <div className={`${styles.detVal} ${styles.detDesc}`}>{selectedService.description}</div>
                </div>
              )}

              {(selectedService.tags ?? []).length > 0 && (
                <div className={`${styles.detRow} ${styles.detRowFull}`}>
                  <div className={styles.detLbl}>Tags</div>
                  <div className={styles.tagList}>
                    {(selectedService.tags ?? []).map(t => (
                      <span key={t} className={styles.tag}>{t}</span>
                    ))}
                  </div>
                </div>
              )}

              {upstream.length > 0 && (
                <div className={styles.depsSection}>
                  <PaneHd>Dependencies ({upstream.length})</PaneHd>
                  <table className={styles.tbl}>
                    <thead>
                      <tr>
                        <th>Service</th>
                        <th>Criticality</th>
                      </tr>
                    </thead>
                    <tbody>
                      {upstream.map(dep => (
                        <tr
                          key={dep.service}
                          className={styles.tblRowLink}
                          onClick={() => handleSelect(dep.service)}
                        >
                          <td><strong>{services[dep.service]?.name ?? dep.service}</strong></td>
                          <td>
                            <span className={`${styles.badge} ${dep.criticality === 'hard' ? styles.badgeCrit : styles.badgeExp}`}>
                              {dep.criticality}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            /* ── Table view ── */
            <>
              <div className={styles.toolbar}>
                <span className={styles.toolLabel}>Service Registry</span>
                {(['all', 'active', 'deprecated'] as FilterState[]).map(f => (
                  <button
                    key={f}
                    className={`${styles.tbtn} ${filter === f ? styles.tbtnAct : ''}`}
                    onClick={() => setFilter(f)}
                  >
                    {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.tbl}>
                  <thead>
                    <tr>
                      <th>Service</th>
                      <th>Owner</th>
                      <th>Type</th>
                      <th>Environment</th>
                      <th>Status</th>
                      <th>Tags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleEntries.map(([key, svc]) => (
                      <tr key={key} className={styles.tblRow} onClick={() => handleSelect(key)}>
                        <td><strong>{svc.name ?? key}</strong></td>
                        <td>{svc.owner ?? '—'}</td>
                        <td style={{ textTransform: 'capitalize' }}>{svc.type}</td>
                        <td>{getHostingEnv(registry, svc.hosting)}</td>
                        <td><ServiceBadge status={svc.status} /></td>
                        <td>
                          {(svc.tags ?? []).slice(0, 3).map(t => (
                            <span key={t} className={styles.tag}>{t}</span>
                          ))}
                          {(svc.tags ?? []).length > 3 && (
                            <span className={styles.tagMore}>+{(svc.tags ?? []).length - 3}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {visibleEntries.length === 0 && (
                      <tr>
                        <td colSpan={6} className={styles.emptyRow}>No services match your filter</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* ── Right pane ── */}
        <div className={styles.rightPane}>
          {selectedService && selectedId ? (
            /* ── Selected: actions + health + links ── */
            <>
              <div className={styles.paneSection}>
                <PaneHd>Quick Actions</PaneHd>
                {selectedService.runbook && (
                  <a className={styles.actionLink} href={selectedService.runbook} target="_blank" rel="noreferrer">
                    <span className={styles.linkArrow}>↗</span> View runbook
                  </a>
                )}
                {selectedService.dashboard && (
                  <a className={styles.actionLink} href={selectedService.dashboard} target="_blank" rel="noreferrer">
                    <span className={styles.linkArrow}>↗</span> View dashboard
                  </a>
                )}
                <button className={styles.actionBtn} onClick={onEditRegistry}>
                  Edit metadata
                </button>
              </div>
              <div className={styles.paneSection}>
                <PaneHd>Connections</PaneHd>
                <div className={styles.statRow}>
                  <span className={styles.statLbl}>Upstream deps</span>
                  <span className={styles.statVal}>{upstream.length}</span>
                </div>
                <div className={styles.statRow}>
                  <span className={styles.statLbl}>Downstream</span>
                  <span className={styles.statVal}>{downstream.length}</span>
                </div>
                <div className={styles.statRow}>
                  <span className={styles.statLbl}>In reach</span>
                  <span className={styles.statVal}>{affectedIds.size}</span>
                </div>
              </div>
              {(selectedService.runbook || selectedService.dashboard || selectedService.on_call || selectedService.slo) && (
                <div className={styles.paneSection}>
                  <PaneHd>Links</PaneHd>
                  {selectedService.runbook    && <div className={styles.linkItem}><span className={styles.linkArrow}>↗</span> Runbook</div>}
                  {selectedService.dashboard  && <div className={styles.linkItem}><span className={styles.linkArrow}>↗</span> Dashboard</div>}
                  {selectedService.on_call    && <div className={styles.linkItem}><span className={styles.linkArrow}>↗</span> On-call</div>}
                  {selectedService.slo        && <div className={styles.linkItem}><span className={styles.linkArrow}>↗</span> SLO</div>}
                </div>
              )}
            </>
          ) : (
            /* ── Default: registry stats + validation ── */
            <>
              <div className={styles.paneSection}>
                <PaneHd>Registry Summary</PaneHd>
                <div className={styles.statRow}>
                  <span className={styles.statLbl}>Total services</span>
                  <span className={styles.statVal}>{stats.total}</span>
                </div>
                <div className={styles.statRow}>
                  <span className={styles.statLbl}>Active</span>
                  <span className={`${styles.statVal} ${styles.statOk}`}>{stats.active}</span>
                </div>
                <div className={styles.statRow}>
                  <span className={styles.statLbl}>Experimental</span>
                  <span className={`${styles.statVal} ${styles.statWn}`}>{stats.experimental}</span>
                </div>
                <div className={styles.statRow}>
                  <span className={styles.statLbl}>Deprecated</span>
                  <span className={`${styles.statVal} ${styles.statEr}`}>{stats.deprecated}</span>
                </div>
              </div>

              {stats.ownerList.length > 0 && (
                <div className={styles.paneSection}>
                  <PaneHd>By owner</PaneHd>
                  {stats.ownerList.map(([owner, count]) => (
                    <div key={owner} className={styles.ownerRow}>
                      <span className={styles.ownerName}>{owner}</span>
                      <span className={styles.ownerCount}>{count}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className={styles.paneSection}>
                <PaneHd>Validation</PaneHd>
                {validationIssues.length > 0 ? (
                  validationIssues.slice(0, 6).map((issue, i) => (
                    <div key={i} className={styles.valError}>
                      ✕ {issue.message}
                    </div>
                  ))
                ) : (
                  <div className={styles.valOk}>✓ All schemas valid</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
