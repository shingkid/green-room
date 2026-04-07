import { memo, useMemo } from "react";

import type { DependencyCriticality, Mode, Service } from "@domain/registry";
import { STATUS_STYLES, TYPE_ICONS } from "@domain/registry";
import { formatServiceLabel, getNodeRadius, type Layout } from "@domain/catalog";
import styles from "./GraphCanvas.module.css";

type ServiceNodeProps = {
  id: string;
  service: Service;
  position: { x: number; y: number };
  width: number;
  height: number;
  isInternal: boolean;
  isHighlight: boolean;
  isAffected: boolean;
  isDimmed: boolean;
  onSelect: (serviceKey: string) => void;
};

const ServiceNode = memo(function ServiceNode({
  id,
  service,
  position,
  width,
  height,
  isInternal,
  isHighlight,
  isAffected,
  isDimmed,
  onSelect,
}: ServiceNodeProps) {
  const statusStyle = STATUS_STYLES[service.status] ?? STATUS_STYLES.active;
  // Interaction state wins over status styling so selection/impact remains readable even when
  // ownership and status already contribute their own visual signals.
  const stroke = isHighlight ? "#dc2626" : isAffected ? "#f97316" : statusStyle.border;

  return (
    <g
      className={styles.serviceNode}
      onClick={() => onSelect(id)}
      opacity={isDimmed ? 0.15 : 1}
      transform={`translate(${position.x},${position.y})`}
    >
      <rect
        fill={statusStyle.bg}
        height={height}
        rx={getNodeRadius(service.type)}
        stroke={stroke}
        strokeWidth={isHighlight ? 3 : isAffected ? 2 : 1}
        width={width}
      />
      {!isInternal ? (
        <rect
          // Ownership uses an overlay instead of replacing the status fill so external services
          // still keep the same active/deprecated/migrating color language as internal ones.
          fill="url(#externalNodeStripe)"
          height={height}
          opacity={0.35}
          pointerEvents="none"
          rx={getNodeRadius(service.type)}
          width={width}
        />
      ) : null}
      <text
        fill={statusStyle.text}
        fontFamily="system-ui"
        fontSize="11"
        fontWeight="600"
        textAnchor="middle"
        x={width / 2}
        y={height / 2 - 6}
      >
        {TYPE_ICONS[service.type] ?? "?"} {formatServiceLabel(service.name, 16)}
      </text>
      <text
        fill="rgba(255,255,255,0.7)"
        fontFamily="system-ui"
        fontSize="9"
        textAnchor="middle"
        x={width / 2}
        y={height / 2 + 10}
      >
        {service.status !== "active" ? service.status.toUpperCase() : service.type}
      </text>
    </g>
  );
});

type ServiceEdgeProps = {
  from: { x: number; y: number };
  to: { x: number; y: number };
  protocol?: string;
  criticality?: DependencyCriticality;
  isActive: boolean;
  isDimmed: boolean;
};

const ServiceEdge = memo(function ServiceEdge({
  from,
  to,
  protocol,
  criticality,
  isActive,
  isDimmed,
}: ServiceEdgeProps) {
  const midY = (from.y + to.y) / 2;
  const path = `M${from.x},${from.y} C${from.x},${midY} ${to.x},${midY} ${to.x},${to.y}`;

  return (
    <g opacity={isDimmed ? 0.06 : isActive ? 0.9 : 0.35}>
      <path
        d={path}
        fill="none"
        markerEnd="url(#arrow)"
        stroke={isActive ? "var(--graph-edge-active)" : "var(--graph-edge)"}
        strokeDasharray={criticality === "soft" ? "4 3" : "none"}
        strokeWidth={isActive ? 2 : 1}
      />
      {protocol && isActive ? (
        <text
          fill="var(--graph-edge-label)"
          fontFamily="system-ui"
          fontSize="8"
          x={(from.x + to.x) / 2 + 8}
          y={midY - 4}
        >
          {protocol}
        </text>
      ) : null}
    </g>
  );
});

type GraphCanvasProps = {
  edges: Array<{
    from: string;
    to: string;
    protocol?: string;
    criticality?: DependencyCriticality;
    isActive: boolean;
  }>;
  layout: Layout;
  visibleServices: Set<string>;
  affectedSet: Set<string>;
  highlightKey: string | null;
  mode: Mode;
  services: Record<string, Service>;
  getOwnershipKind: (service: Service) => "internal" | "external";
  onSelectService: (serviceKey: string) => void;
};

export function GraphCanvas({
  edges,
  layout,
  visibleServices,
  affectedSet,
  highlightKey,
  mode,
  services,
  getOwnershipKind,
  onSelectService,
}: GraphCanvasProps) {
  const renderedEdges = useMemo(
    () =>
      edges.map((edge, index) => {
        const from = layout.positions[edge.from];
        const to = layout.positions[edge.to];

        if (!from || !to) {
          return null;
        }

        return (
          <ServiceEdge
            criticality={edge.criticality}
            from={{ x: from.x + layout.nodeW / 2, y: from.y + layout.nodeH }}
            isActive={edge.isActive}
            isDimmed={mode !== "overview" && !edge.isActive}
            key={`${edge.from}-${edge.to}-${index}`}
            protocol={edge.protocol}
            to={{ x: to.x + layout.nodeW / 2, y: to.y }}
          />
        );
      }),
    [edges, layout.nodeH, layout.nodeW, layout.positions, mode],
  );
  const visibleServiceKeys = useMemo(() => [...visibleServices], [visibleServices]);
  const renderedNodes = useMemo(
    () =>
      visibleServiceKeys.map((serviceKey) => {
        const position = layout.positions[serviceKey];

        if (!position) {
          return null;
        }

        const service = services[serviceKey];

        return (
          <ServiceNode
            height={layout.nodeH}
            id={serviceKey}
            isAffected={affectedSet.has(serviceKey)}
            isDimmed={mode !== "overview" && !affectedSet.has(serviceKey)}
            isHighlight={serviceKey === highlightKey}
            isInternal={getOwnershipKind(service) === "internal"}
            key={serviceKey}
            onSelect={onSelectService}
            position={position}
            service={service}
            width={layout.nodeW}
          />
        );
      }),
    [
      affectedSet,
      getOwnershipKind,
      highlightKey,
      layout.nodeH,
      layout.nodeW,
      layout.positions,
      mode,
      onSelectService,
      services,
      visibleServiceKeys,
    ],
  );

  return (
    <section className={styles.graphSection}>
      <svg className={styles.graphCanvas} height={layout.svgH} width={layout.svgW}>
        <defs>
          <pattern
            id="externalNodeStripe"
            height="8"
            patternTransform="rotate(45)"
            patternUnits="userSpaceOnUse"
            width="8"
          >
            <rect fill="transparent" height="8" width="8" />
            <rect fill="var(--graph-external-stripe)" height="8" width="3" />
          </pattern>
          <marker
            id="arrow"
            markerHeight="6"
            markerWidth="6"
            orient="auto-start-reverse"
            refX="10"
            refY="5"
            viewBox="0 0 10 10"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--graph-arrow)" />
          </marker>
        </defs>
        {renderedEdges}
        {renderedNodes}
      </svg>
    </section>
  );
}
