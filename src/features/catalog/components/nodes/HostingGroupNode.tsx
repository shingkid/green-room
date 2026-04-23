import { memo } from "react";
import type { NodeProps } from "@xyflow/react";

export type HostingGroupNodeData = {
  hostingKey: string;
  color: string;
};

export const HostingGroupNode = memo(function HostingGroupNode({
  data,
  style,
}: NodeProps & { data: HostingGroupNodeData; style?: React.CSSProperties }) {
  const width = typeof style?.width === "number" ? style.width : 0;
  const height = typeof style?.height === "number" ? style.height : 0;

  return (
    <svg height={height} width={width}>
      <rect
        fill={data.color}
        fillOpacity={0.07}
        height={height}
        rx={14}
        stroke={data.color}
        strokeDasharray="6 3"
        strokeOpacity={0.25}
        strokeWidth={1.5}
        width={width}
        x={0}
        y={0}
      />
      <text
        fill={data.color}
        fillOpacity={0.7}
        fontFamily="system-ui"
        fontSize={9}
        fontWeight={600}
        x={10}
        y={14}
      >
        {data.hostingKey}
      </text>
    </svg>
  );
});
