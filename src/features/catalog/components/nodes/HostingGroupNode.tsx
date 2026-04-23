import { memo } from "react";
import type { NodeProps } from "@xyflow/react";

export type HostingGroupNodeData = {
  hostingKey: string;
  color: string;
};

export const HostingGroupNode = memo(function HostingGroupNode({
  data,
}: NodeProps & { data: HostingGroupNodeData }) {
  return (
    <svg height="100%" width="100%">
      <rect
        fill={data.color}
        fillOpacity={0.07}
        height="100%"
        rx={14}
        stroke={data.color}
        strokeDasharray="6 3"
        strokeOpacity={0.25}
        strokeWidth={1.5}
        width="100%"
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
