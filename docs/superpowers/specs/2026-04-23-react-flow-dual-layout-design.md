# React Flow Dual Layout Mode — Design Spec

**Date:** 2026-04-23
**Branch:** feat/service-registry-sections

---

## Problem

The graph canvas uses a hand-rolled SVG renderer with ELKjs for layout. ELK partitioning is always active, so nodes are always grouped by hosting environment whether or not the user wants to see that. There is no toggle, and nodes cannot be dragged. The compact dependency-driven layout and the hosting-grouped layout are conflated into one always-on mode.

## Goal

- **Default view:** nodes laid out compactly by dependency graph, no hosting bubbles
- **Hosting view (toggled):** nodes spread into named hosting groups with labeled dashed-border containers
- **Drag:** nodes are draggable in both modes; layout resets on mode/filter change
- **Pan/zoom:** standard canvas navigation

---

## Architecture

Replace the SVG canvas (`GraphCanvas.tsx`) with `@xyflow/react` (React Flow v12). ELKjs continues to compute positions; React Flow renders nodes and edges and handles drag, pan, and zoom natively.

```
useCatalogViewModel
  ├── showHosting: boolean              ← new toggle state
  ├── computeLayout(visibleServices, services, graph, showHosting)
  │     ├── false → ELK layered, no partitioning  → compact flat layout
  │     └── true  → ELK layered with partitioning
  │                 → post-process: add hostingGroupNode parent nodes
  └── rfNodes: Node[]                  ← passed to GraphCanvas
      rfEdges: Edge[]                  ← assembled in viewmodel from graph edges
        ↓
GraphCanvas  (ReactFlow component)
  ├── useNodesState / useEdgesState    ← drag handled automatically
  ├── serviceNode                      ← custom node: port of existing SVG ServiceNode
  ├── hostingGroupNode                 ← custom node: hosting bubble container
  └── serviceEdge                      ← custom edge: Bezier path with protocol label
```

---

## Layout Computation (`catalog.ts`)

### Type change

```typescript
// Remove: Layout with positions/svgW/svgH/nodeW/nodeH
// Add:
export type Layout = {
  rfNodes: Node[]; // @xyflow/react Node
};
// rfEdges assembled in viewmodel (depends on affectedSet/mode which live there)
```

### Compact mode (`showHosting = false`)

ELK layered algorithm, no partitioning, tighter spacing:

```typescript
layoutOptions: {
  "elk.algorithm": "layered",
  "elk.direction": "DOWN",
  "elk.spacing.nodeNode": "30",
  "elk.layered.spacing.nodeNodeBetweenLayers": "50",
}
// Nodes: { id, width: 140, height: 56 } — no partitioning.partition option
// Output: flat Node[] with type: "serviceNode"
```

### Hosting mode (`showHosting = true`)

1. Run ELK with current partitioning config (no change to ELK call)
2. Post-process ELK output to produce React Flow parent nodes:
   - Group service positions by `service.hosting` key
   - Compute bounding box per group (min/max x,y + 20px padding) — same logic as current `hostingBubbles` memo
   - Emit one `hostingGroupNode` per group: `{ position: bbox top-left, style: { width, height }, data: { hostingKey, color } }`
   - Each service node in that group: `parentId: hostingKey`, `position` converted to relative (subtract group top-left)
3. Ungrouped services: flat `serviceNode` with no `parentId`

This avoids ELK compound graph complexity — ELK still sees a flat graph; grouping is purely a React Flow concern applied in post-processing.

**Position reset:** when `showHosting` changes, `computeLayout` re-runs and `setNodes` replaces all positions. Manual drags are cleared on mode switch (intentional — the whole layout reorganises).

---

## Component Structure

### New files

**`src/features/catalog/components/nodes/ServiceNode.tsx`**

React Flow custom node. Data shape:

```typescript
type ServiceNodeData = {
  service: Service;
  hostingConfig: Hosting | undefined;
  isInternal: boolean;
  isHighlight: boolean;
  isAffected: boolean;
  isDimmed: boolean;
  onSelect: (id: string) => void;
};
```

Internally: same SVG as existing `ServiceNode` (status fill, hosting stripe, ownership stripe overlay, icon + name text). Outer `<g transform>` removed — React Flow applies the transform. Wrapped in a `<div style={{ width: 140, height: 56 }}>` so React Flow can measure it.

**`src/features/catalog/components/nodes/HostingGroupNode.tsx`**

```typescript
type HostingGroupNodeData = { hostingKey: string; color: string };
```

Renders the dashed rounded rect and label using the node's `style.width`/`style.height` (set during layout). No `NodeResizer` for now — keep simple.

**`src/features/catalog/components/edges/ServiceEdge.tsx`**

React Flow custom edge. Receives `sourceX/Y`, `targetX/Y` from React Flow. Ports existing Bezier path (`M sourceX,sourceY C ... targetX,targetY`) and active/dimmed opacity. Shows protocol label when `isActive=true`.

The SVG `<defs>` for `externalNodeStripe` and the `arrow` marker move into the respective node/edge components.

### Modified files

**`GraphCanvas.tsx`** — replace `<svg>` with:

```tsx
import { ReactFlow, useNodesState, useEdgesState, Controls } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

const nodeTypes = { serviceNode: ServiceNode, hostingGroupNode: HostingGroupNode };
const edgeTypes  = { serviceEdge: ServiceEdge };

export function GraphCanvas({ rfNodes, rfEdges, ... }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(rfNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdges);

  useEffect(() => setNodes(rfNodes), [rfNodes]);
  useEffect(() => setEdges(rfEdges), [rfEdges]);

  return (
    <ReactFlow nodes={nodes} edges={edges}
      onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes} edgeTypes={edgeTypes} fitView>
      <Controls />
    </ReactFlow>
  );
}
```

Remove: `hostingBubbles` memo, `renderedEdges`/`renderedNodes` memos, SVG wrapper and defs.

**`useCatalogViewModel.ts`**

- Add `const [showHosting, setShowHosting] = useState(false)`
- Pass `showHosting` to `computeLayout`; add to `useEffect` deps
- Assemble `rfEdges: Edge[]` from existing edge data (convert to React Flow format with `type: "serviceEdge"`, `data: { protocol, criticality, isActive }`)
- Expose `showHosting` and `setShowHosting`

**`CatalogView.tsx`**

- Add hosting toggle button in the footer legend section, styled consistently with existing status/type toggles

---

## What stays the same

- `buildGraph`, `collectReachable`, `getAffectedDataFlows`
- All filter/visibility logic in `useCatalogViewModel`
- `STATUS_STYLES`, `HOSTING_ENVIRONMENT_COLORS`, `TYPE_ICONS` in `registry.ts`
- `ServiceNode` visual design (same SVG internals, re-wrapped)
- Mermaid export functions
- `DataFlowPipeline` component

---

## Verification

1. Dev server running at `http://localhost:5173/green-room/`
2. **Compact mode (default):** nodes packed tightly, dependency edges visible, no bubbles
3. **Toggle hosting view on:** nodes spread into hosting groups, labeled dashed containers appear
4. **Toggle hosting view off:** collapses back to compact layout
5. **Drag a node:** moves freely; other nodes stay put
6. **Pan/zoom:** scroll to zoom, click-drag canvas to pan
7. **Filters:** toggling status/type filters re-runs layout in current mode
8. **Impact mode:** selecting a service still highlights affected nodes correctly
