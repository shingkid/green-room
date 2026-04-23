import { memo } from "react";
import { type EdgeProps, getBezierPath } from "@xyflow/react";

export type ServiceEdgeData = {
  protocol?: string;
  criticality?: "hard" | "soft";
  isActive: boolean;
  isDimmed: boolean;
};

export const ServiceEdge = memo(function ServiceEdge({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  data,
  id,
}: EdgeProps & { data: ServiceEdgeData }) {
  const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const { protocol, criticality, isActive = false, isDimmed = false } = data ?? {};

  return (
    <g opacity={isDimmed ? 0.06 : isActive ? 0.9 : 0.35}>
      <defs>
        <marker
          id={`arrow-${id}`}
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
      <path
        d={edgePath}
        fill="none"
        markerEnd={`url(#arrow-${id})`}
        stroke={isActive ? "var(--graph-edge-active)" : "var(--graph-edge)"}
        strokeDasharray={criticality === "soft" ? "4 3" : undefined}
        strokeWidth={isActive ? 2 : 1}
      />
      {protocol && isActive ? (
        <text
          fill="var(--graph-edge-label)"
          fontFamily="system-ui"
          fontSize="8"
          x={(sourceX + targetX) / 2 + 8}
          y={(sourceY + targetY) / 2 - 4}
        >
          {protocol}
        </text>
      ) : null}
    </g>
  );
});
