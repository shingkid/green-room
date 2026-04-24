import { type NodeProps, Handle, Position } from '@xyflow/react'
import type { Service } from '@domain/registry'
import styles from './ServiceNode.module.css'

export type NodeState = 'default' | 'selected' | 'affected' | 'dim'

export type ServiceNodeData = {
  serviceKey: string
  service: Service | undefined
  state: NodeState
}

const BADGE_CLASS: Record<string, string> = {
  active:       styles.badgeActive,
  experimental: styles.badgeExp,
  deprecated:   styles.badgeDep,
  migrating:    styles.badgeDep,
}

export function ServiceNode({ data }: NodeProps) {
  const { serviceKey, service, state } = data as ServiceNodeData
  const name   = service?.name ?? serviceKey
  const type   = service?.type ?? '—'
  const status = service?.status ?? 'active'

  return (
    <div className={styles.node} data-state={state}>
      <Handle type="target" position={Position.Top}    className={styles.handle} />
      <Handle type="source" position={Position.Bottom} className={styles.handle} />

      <div className={styles.name} title={name}>{name}</div>
      <div className={styles.meta}>
        <span className={styles.type}>{type}</span>
        <span className={`${styles.badge} ${BADGE_CLASS[status] ?? styles.badgeDep}`}>
          {status}
        </span>
      </div>
    </div>
  )
}
