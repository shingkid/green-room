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
import { SidePanel } from './SidePanel'
import styles from './DependencyGraph.module.css'

const NODE_TYPES = { serviceNode: ServiceNode }

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

export function DependencyGraph({ services, graph }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<ServiceNodeData>>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Compute transitively-reachable sets when selection changes
  const affectedIds = useMemo(() => {
    if (!selectedId) return new Set<string>()
    const up   = collectReachable(selectedId, graph.upstream)
    const down = collectReachable(selectedId, graph.downstream)
    up.delete(selectedId)
    down.delete(selectedId)
    return new Set([...up, ...down])
  }, [selectedId, graph])

  // Downstream only → impact table
  const downstreamIds = useMemo(() => {
    if (!selectedId) return new Set<string>()
    const down = collectReachable(selectedId, graph.downstream)
    down.delete(selectedId)
    return down
  }, [selectedId, graph])

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

  // Update node state data whenever selection changes (preserve positions)
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

  // Build edges from graph, styled by selection state
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

  return (
    <div className={styles.container}>
      <div className={styles.canvas} data-no-transition>
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
      </div>

      {selectedService && selectedId && (
        <SidePanel
          serviceKey={selectedId}
          service={selectedService}
          downstreamIds={downstreamIds}
          affectedCount={affectedIds.size}
          services={services}
          graph={graph}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  )
}
