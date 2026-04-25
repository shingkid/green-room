import { memo, type CSSProperties } from "react";
import { type NodeProps, Handle, Position } from "@xyflow/react";

import type { Hosting, Service } from "@domain/registry";
import { formatServiceLabel, type LayoutDirection } from "@domain/catalog";
import styles from "./ServiceNode.module.css";

export type ServiceNodeData = {
  serviceKey: string;
  service: Service;
  hostingConfig: Hosting | undefined;
  isInternal: boolean;
  isHighlight: boolean;
  isAffected: boolean;
  isDimmed: boolean;
  layoutDirection: LayoutDirection;
  onSelect: (serviceKey: string) => void;
};

// Maps hosting environment to a CSS variable color for the bottom accent bar.
const HOSTING_ENV_COLORS: Record<string, string> = {
  cloud:         "var(--color-accent)",
  on_premises:   "var(--color-text-muted)",
  dmz:           "var(--color-status-warn)",
  private_cloud: "var(--color-accent2)",
  colocation:    "var(--color-edge-call)",
  edge:          "var(--color-status-err)",
};

const BADGE_CLASS: Record<string, string> = {
  active:       styles.badgeActive,
  experimental: styles.badgeExp,
  deprecated:   styles.badgeDep,
  migrating:    styles.badgeDep,
};

export const ServiceNode = memo(function ServiceNode({
  data,
}: NodeProps & { data: ServiceNodeData }) {
  const {
    serviceKey,
    service,
    hostingConfig,
    isHighlight,
    isAffected,
    isDimmed,
    layoutDirection,
    onSelect,
  } = data;
  const isLR = layoutDirection === "LR";

  if (!service) return null;

  const state = isDimmed ? "dim" : isHighlight ? "selected" : isAffected ? "affected" : "default";
  const hostingColor = hostingConfig
    ? (HOSTING_ENV_COLORS[hostingConfig.environment] ?? "var(--color-text-muted)")
    : null;

  return (
    <div
      className={styles.node}
      data-state={state}
      style={hostingColor ? { "--hosting-color": hostingColor } as CSSProperties : undefined}
      onClick={() => onSelect(serviceKey)}
    >
      <Handle
        type="target"
        position={isLR ? Position.Left : Position.Top}
        className={styles.handle}
      />

      <div className={styles.name} title={service.name}>
        {formatServiceLabel(service.name, 17)}
      </div>
      <div className={styles.meta}>
        <span className={styles.type}>{service.type}</span>
        <span className={`${styles.badge} ${BADGE_CLASS[service.status] ?? styles.badgeDep}`}>
          {service.status}
        </span>
      </div>

      {hostingColor && <div className={styles.hostingBar} />}

      <Handle
        type="source"
        position={isLR ? Position.Right : Position.Bottom}
        className={styles.handle}
      />
    </div>
  );
});
