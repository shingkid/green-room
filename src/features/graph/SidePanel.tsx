import type { Service } from '@domain/registry'
import type { Graph } from '@domain/catalog'
import styles from './SidePanel.module.css'

interface Props {
  serviceKey: string
  service: Service
  downstreamIds: Set<string>
  affectedCount: number
  services: Record<string, Service>
  graph: Graph
  onClose: () => void
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  experimental: 'Experimental',
  deprecated: 'Deprecated',
  migrating: 'Migrating',
}

const STATUS_MOD: Record<string, string> = {
  active:       'statusOk',
  experimental: 'statusWarn',
  deprecated:   'statusMuted',
  migrating:    'statusInfo',
}

export function SidePanel({ serviceKey, service, downstreamIds, affectedCount, services, graph, onClose }: Props) {
  const upstreamCount   = graph.upstream[serviceKey]?.length   ?? 0
  const downstreamCount = graph.downstream[serviceKey]?.length ?? 0

  const affectedList = [...downstreamIds]
    .map(k => services[k])
    .filter(Boolean)
    .slice(0, 8)

  const overflow = downstreamIds.size - affectedList.length

  return (
    <aside className={styles.panel}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.headerMain}>
          <span className={styles.name}>{service.name ?? serviceKey}</span>
          <span className={`${styles.statusBadge} ${styles[STATUS_MOD[service.status] ?? 'statusMuted']}`}>
            {STATUS_LABEL[service.status] ?? service.status}
          </span>
        </div>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close panel">✕</button>
      </div>

      <div className={styles.body}>
        {/* ── Meta ── */}
        {service.owner && (
          <div className={styles.row}>
            <span className={styles.label}>Owner</span>
            <span className={styles.value}>{service.owner}</span>
          </div>
        )}
        <div className={styles.row}>
          <span className={styles.label}>Type</span>
          <span className={styles.value} style={{ textTransform: 'capitalize' }}>{service.type}</span>
        </div>
        {service.description && (
          <div className={styles.row}>
            <span className={styles.label}>Description</span>
            <span className={`${styles.value} ${styles.description}`}>{service.description}</span>
          </div>
        )}

        {/* ── Stats ── */}
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statNum}>{upstreamCount}</span>
            <span className={styles.statLabel}>upstream</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <span className={styles.statNum}>{downstreamCount}</span>
            <span className={styles.statLabel}>downstream</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <span className={styles.statNum}>{affectedCount}</span>
            <span className={styles.statLabel}>in reach</span>
          </div>
        </div>

        {/* ── Links ── */}
        {(service.runbook || service.dashboard || service.on_call) && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Quick Links</div>
            <div className={styles.links}>
              {service.runbook    && <a className={styles.link} href={service.runbook}    target="_blank" rel="noreferrer">Runbook</a>}
              {service.dashboard  && <a className={styles.link} href={service.dashboard}  target="_blank" rel="noreferrer">Dashboard</a>}
              {service.on_call    && <a className={styles.link} href={service.on_call}    target="_blank" rel="noreferrer">On-call</a>}
              {service.slo        && <a className={styles.link} href={service.slo}        target="_blank" rel="noreferrer">SLO</a>}
            </div>
          </div>
        )}

        {/* ── Impact Table ── */}
        {downstreamIds.size > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              Impact — {downstreamIds.size} downstream service{downstreamIds.size !== 1 ? 's' : ''}
            </div>
            <div className={styles.impactList}>
              {affectedList.map(svc => (
                <div key={svc.name} className={styles.impactRow}>
                  <span className={styles.impactName}>{svc.name}</span>
                  <span className={`${styles.impactBadge} ${styles[STATUS_MOD[svc.status] ?? 'statusMuted']}`}>
                    {svc.status}
                  </span>
                </div>
              ))}
              {overflow > 0 && (
                <div className={styles.impactOverflow}>+ {overflow} more</div>
              )}
            </div>
          </div>
        )}

        {/* ── Legend ── */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Legend</div>
          <div className={styles.legend}>
            <div className={styles.legendGroup}>
              <div className={styles.legendItem}>
                <span className={styles.legendDot} data-state="selected" />
                <span>Selected</span>
              </div>
              <div className={styles.legendItem}>
                <span className={styles.legendDot} data-state="affected" />
                <span>In reach</span>
              </div>
              <div className={styles.legendItem}>
                <span className={styles.legendDot} data-state="dim" />
                <span>Unrelated</span>
              </div>
            </div>
            <div className={styles.legendGroup}>
              <div className={styles.legendItem}>
                <span className={styles.legendLine} data-variant="dep" />
                <span>Hard dependency</span>
              </div>
              <div className={styles.legendItem}>
                <span className={styles.legendLine} data-variant="call" />
                <span>Soft dependency</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
