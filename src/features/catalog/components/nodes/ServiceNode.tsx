import { memo } from "react";
import { type NodeProps, Handle, Position } from "@xyflow/react";

import type { Hosting, Service } from "@domain/registry";
import { HOSTING_ENVIRONMENT_COLORS, STATUS_STYLES, TYPE_ICONS } from "@domain/registry";
import { formatServiceLabel, getNodeRadius, type LayoutDirection } from "@domain/catalog";

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

const nodeW = 140;
const nodeH = 56;

export const ServiceNode = memo(function ServiceNode({
  data,
}: NodeProps & { data: ServiceNodeData }) {
  const {
    serviceKey,
    service,
    hostingConfig,
    isInternal,
    isHighlight,
    isAffected,
    isDimmed,
    layoutDirection,
    onSelect,
  } = data;
  const isLR = layoutDirection === "LR";

  if (!service) return null;
  const statusStyle = STATUS_STYLES[service.status] ?? STATUS_STYLES.active;
  const hostingColor = hostingConfig
    ? (HOSTING_ENVIRONMENT_COLORS[hostingConfig.environment] ?? statusStyle.border)
    : statusStyle.border;
  const stroke = isHighlight ? "#dc2626" : isAffected ? "#f97316" : hostingColor;
  const rx = getNodeRadius(service.type);

  return (
    <div
      onClick={() => onSelect(serviceKey)}
      style={{ opacity: isDimmed ? 0.15 : 1, cursor: "pointer", width: nodeW, height: nodeH }}
    >
      <Handle
        position={isLR ? Position.Left : Position.Top}
        style={{ opacity: 0, pointerEvents: "none" }}
        type="target"
      />
      <svg height={nodeH} width={nodeW}>
        <defs>
          <pattern
            id={`externalNodeStripe-${serviceKey}`}
            height="8"
            patternTransform="rotate(45)"
            patternUnits="userSpaceOnUse"
            width="8"
          >
            <rect fill="transparent" height="8" width="8" />
            <rect fill="var(--graph-external-stripe)" height="8" width="3" />
          </pattern>
        </defs>
        <rect
          fill={statusStyle.bg}
          height={nodeH}
          rx={rx}
          stroke={stroke}
          strokeWidth={isHighlight ? 3 : 2}
          width={nodeW}
        />
        {hostingConfig ? (
          <rect
            fill={hostingColor}
            height={4}
            pointerEvents="none"
            rx={rx}
            width={nodeW}
            y={nodeH - 4}
          />
        ) : null}
        {!isInternal ? (
          <rect
            fill={`url(#externalNodeStripe-${serviceKey})`}
            height={nodeH}
            opacity={0.35}
            pointerEvents="none"
            rx={getNodeRadius(service.type)}
            width={nodeW}
          />
        ) : null}
        <text
          fill={statusStyle.text}
          fontFamily="system-ui"
          fontSize="11"
          fontWeight="600"
          textAnchor="middle"
          x={nodeW / 2}
          y={nodeH / 2 - 6}
        >
          {TYPE_ICONS[service.type] ?? "?"} {formatServiceLabel(service.name, 16)}
        </text>
        <text
          fill="rgba(255,255,255,0.7)"
          fontFamily="system-ui"
          fontSize="9"
          textAnchor="middle"
          x={nodeW / 2}
          y={nodeH / 2 + 10}
        >
          {service.status !== "active" ? service.status.toUpperCase() : service.type}
        </text>
      </svg>
      <Handle
        position={isLR ? Position.Right : Position.Bottom}
        style={{ opacity: 0, pointerEvents: "none" }}
        type="source"
      />
    </div>
  );
});
