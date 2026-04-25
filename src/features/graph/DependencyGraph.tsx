import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeMouseHandler,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { computeLayout, collectReachable, type Graph } from '@domain/catalog'
import type { Service } from '@domain/registry'
import { ServiceNode, type ServiceNodeData, type NodeState } from './nodes/ServiceNode'
import styles from './DependencyGraph.module.css'

const NODE_TYPES = { serviceNode: ServiceNode }

type ViewMode = 'all' | 'impact' | 'upstream'

interface Props {
  services: Record<string, Service>
  graph: Graph
}

function nodeState(id: string, selectedId: string | null, affectedIds: Set<string>): NodeState {
  if (!selectedId) return 'default'
  if (id === selectedId) return 'selected'
  if (affectedIds.has(id)) return 'affected'
  return 'dim'
}

const STATUS_MOD: Record<string, string> = {
  active:       'statusOk',
  experimental: 'statusWarn',
  deprecated:   'statusMuted',
  migrating:    'statusMuted',
}

export function DependencyGraph({ services, graph }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<ServiceNodeData>>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selectedId, setSelectedId]       = useState<string | null>(null)
  const [viewMode, setViewMode]           = useState<ViewMode>('all')

  // Compute affected set based on view mode
  const affectedIds = useMemo(() => {
    if (!selectedId) return new Set<string>()

    if (viewMode === 'upstream') {
      // Show nodes that depend on the selected service
      const down = collectReachable(selectedId, graph.downstream)
      down.delete(selectedId)
      return down
    }
    if (viewMode === 'impact') {
      // Show what the selected service depends on
      const up = collectReachable(selectedId, graph.upstream)
      up.delete(selectedId)
      return up
    }
    // All: both directions
    const up   = collectReachable(selectedId, graph.upstream)
    const down = collectReachable(selectedId, graph.downstream)
    up.delete(selectedId)
    down.delete(selectedId)
    return new Set([...up, ...down])
  }, [selectedId, viewMode, graph])

  // Impact table data (direct upstream deps + downstream callers)
  const upstreamDeps  = useMemo(() => selectedId ? (graph.upstream[selectedId]   ?? []) : [], [selectedId, graph])
  const downstreamDeps = useMemo(() => selectedId ? (graph.downstream[selectedId] ?? []) : [], [selectedId, graph])

  // ELK layout — re-runs when services/graph change
  useEffect(() => {
    const visible = new Set(Object.keys(services))
    if (visible.size === 0) {
      setNodes([])
      setEdges([])
      setSelectedId(null)
      return
    }

    computeLayout(visible, services, graph, false, {}, 'TB')
      .then(({ rfNodes }) => {
        setNodes(
          rfNodes.map(n => ({
            ...n,
            type: 'serviceNode',
            data: { serviceKey: n.id, service: services[n.id], state: 'default' } as ServiceNodeData,
          }))
        )
        setSelectedId(null)
      })
      .catch(console.error)
  }, [services, graph])  // eslint-disable-line react-hooks/exhaustive-deps

  // Update node states on selection change
  useEffect(() => {
    setNodes(prev =>
      prev.map(n => ({
        ...n,
        data: {
          ...(n.data as ServiceNodeData),
          state: nodeState(n.id, selectedId, affectedIds),
        },
      }))
    )
  }, [selectedId, affectedIds])  // eslint-disable-line react-hooks/exhaustive-deps

  // Build edges
  useEffect(() => {
    const result: Edge[] = []

    for (const [svcKey, upstreams] of Object.entries(graph.upstream)) {
      for (const dep of upstreams) {
        const isDim =
          selectedId !== null &&
          svcKey !== selectedId &&
          dep.service !== selectedId &&
          !affectedIds.has(svcKey) &&
          !affectedIds.has(dep.service)

        const isActive = svcKey === selectedId || dep.service === selectedId
        const variant  = dep.criticality === 'hard' ? 'dep' : 'call'
        const color    = isDim
          ? 'var(--color-edge-dim)'
          : variant === 'dep'
            ? 'var(--color-edge-dep)'
            : 'var(--color-edge-call)'

        result.push({
          id:     `${dep.service}->${svcKey}`,
          source: dep.service,
          target: svcKey,
          type:   'smoothstep',
          animated: isActive,
          style: {
            stroke:      color,
            strokeWidth: dep.criticality === 'hard' ? 2 : 1.5,
            opacity:     isDim ? 0.2 : 1,
          },
          markerEnd: { type: MarkerType.ArrowClosed, color },
        })
      }
    }

    setEdges(result)
  }, [graph, selectedId, affectedIds])  // eslint-disable-line react-hooks/exhaustive-deps

  const onNodeClick: NodeMouseHandler = useCallback((_evt, node) => {
    setSelectedId(prev => (prev === node.id ? null : node.id))
  }, [])

  const onPaneClick = useCallback(() => setSelectedId(null), [])

  const selectedService = selectedId ? services[selectedId] : null

  const impactTableRows = useMemo(() => {
    if (!selectedId || viewMode === 'upstream') {
      return downstreamDeps.map(dep => ({
        key: dep.service,
        svc: services[dep.service],
        relation: 'caller',
        criticality: dep.criticality,
      })).filter(r => r.svc)
    }
    return upstreamDeps.map(dep => ({
      key: dep.service,
      svc: services[dep.service],
      relation: 'depends-on',
      criticality: dep.criticality,
    })).filter(r => r.svc)
  }, [selectedId, viewMode, upstreamDeps, downstreamDeps, services])

  return (
    <div className={styles.container}>
      {/* ── Toolbar ── */}
      <div className={styles.toolbar}>
        <span className={styles.toolLabel}>Dependency Graph</span>
        {(['all', 'impact', 'upstream'] as ViewMode[]).map(m => (
          <button
            key={m}
            className={`${styles.tbtn} ${viewMode === m ? styles.tbtnAct : ''}`}
            onClick={() => setViewMode(m)}
          >
            {m === 'all' ? 'All' : m === 'impact' ? 'Impact' : 'Upstream'}
          </button>
        ))}
      </div>

      {/* ── Body ── */}
      <div className={styles.body}>
        {/* ── Main: graph + optional impact table ── */}
        <div className={styles.mainArea}>
          <div className={styles.canvas}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={NODE_TYPES}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              proOptions={{ hideAttribution: true }}
              colorMode="light"
            >
              <Background color="var(--color-border)" gap={24} size={1} />
              <Controls />
            </ReactFlow>
            {!selectedId && (
              <div className={styles.hint}>
                Click a node to analyse its impact
              </div>
            )}
          </div>

          {/* Impact table — only when a node is selected */}
          {selectedId && impactTableRows.length > 0 && (
            <div className={styles.impactTableWrap}>
              <table className={styles.tbl}>
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Relation</th>
                    <th>Criticality</th>
                    <th>Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {impactTableRows.map(row => (
                    <tr key={row.key}>
                      <td><strong>{row.svc?.name ?? row.key}</strong></td>
                      <td>{row.relation}</td>
                      <td>
                        <span className={`${styles.badge} ${row.criticality === 'hard' ? styles.badgeCrit : styles.badgeExp}`}>
                          {row.criticality}
                        </span>
                      </td>
                      <td>{row.svc?.owner ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Right pane ── */}
        <div className={styles.rightPane}>
          {selectedService && selectedId ? (
            <>
              <div className={styles.paneSection}>
                <div className={styles.paneHd}>
                  {viewMode === 'upstream' ? 'Upstream Summary' : 'Impact Summary'}
                </div>
                <div className={styles.statRow}>
                  <span className={styles.statLbl}>Affected</span>
                  <span className={`${styles.statVal} ${styles.statEr}`}>{affectedIds.size}</span>
                </div>
                <div className={styles.statRow}>
                  <span className={styles.statLbl}>
                    {viewMode === 'upstream' ? 'Dependants' : 'Dependencies'}
                  </span>
                  <span className={`${styles.statVal} ${styles.statWn}`}>
                    {viewMode === 'upstream' ? downstreamDeps.length : upstreamDeps.length}
                  </span>
                </div>
              </div>
              <div className={styles.paneSection}>
                <div className={styles.paneHd}>Selected</div>
                <div className={styles.selName}>{selectedService.name ?? selectedId}</div>
                <span className={`${styles.badge} ${styles[STATUS_MOD[selectedService.status] ?? 'badgeDep']}`}>
                  {selectedService.status}
                </span>
                {selectedService.owner && (
                  <div className={styles.selOwner}>{selectedService.owner}</div>
                )}
              </div>
            </>
          ) : (
            <div className={styles.paneSectionEmpty}>
              <div className={styles.emptyHint}>◎</div>
              <div className={styles.emptyText}>Select a node to see impact analysis</div>
            </div>
          )}

          <div className={styles.paneSection}>
            <div className={styles.paneHd}>Legend</div>
            <div className={styles.legRow}>
              <span className={styles.legLine} data-variant="dep" />
              <span>depends-on</span>
            </div>
            <div className={styles.legRow}>
              <span className={styles.legLine} data-variant="call" />
              <span>calls</span>
            </div>
            <div className={styles.legRow}>
              <span className={styles.legDot} data-state="selected" />
              <span>selected</span>
            </div>
            <div className={styles.legRow}>
              <span className={styles.legDot} data-state="affected" />
              <span>affected</span>
            </div>
            <div className={styles.legRow}>
              <span className={styles.legDot} data-state="dim" />
              <span>unrelated</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
