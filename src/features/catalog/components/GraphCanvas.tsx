import { useEffect } from "react";
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  useReactFlow,
  Controls,
  type Edge,
  type Node,
  type NodeTypes,
  type EdgeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { ServiceNode } from "./nodes/ServiceNode";
import { HostingGroupNode } from "./nodes/HostingGroupNode";
import { ServiceEdge } from "./edges/ServiceEdge";
import styles from "./GraphCanvas.module.css";

const nodeTypes: NodeTypes = {
  serviceNode: ServiceNode,
  hostingGroupNode: HostingGroupNode,
};

const edgeTypes: EdgeTypes = {
  serviceEdge: ServiceEdge,
};

function FitViewOnChange({ layoutNodes, panelOpen }: { layoutNodes: Node[]; panelOpen: boolean }) {
  const { fitView } = useReactFlow();

  useEffect(() => {
    requestAnimationFrame(() => {
      fitView({ duration: 200 });
    });
  }, [layoutNodes, panelOpen, fitView]);

  return null;
}

type GraphCanvasProps = {
  rfNodes: Node[];
  rfEdges: Edge[];
  layoutNodes: Node[];
  panelOpen: boolean;
};

export function GraphCanvas({ rfNodes, rfEdges, layoutNodes, panelOpen }: GraphCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(rfNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdges);

  useEffect(() => {
    setNodes(rfNodes);
  }, [rfNodes, setNodes]);

  useEffect(() => {
    setEdges(rfEdges);
  }, [rfEdges, setEdges]);

  return (
    <section className={styles.graphSection}>
      <ReactFlow
        deleteKeyCode={null}
        edgeTypes={edgeTypes}
        edges={edges}
        fitView
        nodeTypes={nodeTypes}
        nodes={nodes}
        nodesConnectable={false}
        onEdgesChange={onEdgesChange}
        onNodesChange={onNodesChange}
      >
        <FitViewOnChange layoutNodes={layoutNodes} panelOpen={panelOpen} />
        <Controls />
      </ReactFlow>
    </section>
  );
}
