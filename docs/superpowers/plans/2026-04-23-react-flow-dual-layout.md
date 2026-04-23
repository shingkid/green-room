# React Flow Dual Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the SVG graph canvas with React Flow, adding a compact default layout and a hosting-grouped layout toggled by the user.

**Architecture:** ELKjs computes positions in two modes (compact flat / hosted partitioned). The output is a `Node[]` array fed into React Flow's `useNodesState`, which handles drag automatically. Hosting groups become React Flow parent nodes post-processed from ELK's flat output.

**Tech Stack:** `@xyflow/react` v12, ELKjs, Vitest, React Testing Library, TypeScript

---

## File Map

| Path                                                         | Action | Responsibility                                                                                   |
| ------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------ |
| `src/domain/catalog.ts`                                      | Modify | `Layout` type → `{ rfNodes: Node[] }`; `computeLayout` gains `showHosting` + `hostingMap` params |
| `tests/domain/catalog.test.ts`                               | Modify | Update existing `computeLayout` test; add compact + hosting mode tests                           |
| `src/features/catalog/components/nodes/ServiceNode.tsx`      | Create | React Flow custom node — port of existing SVG ServiceNode                                        |
| `src/features/catalog/components/nodes/HostingGroupNode.tsx` | Create | Hosting bubble container (dashed rect + label)                                                   |
| `src/features/catalog/components/edges/ServiceEdge.tsx`      | Create | Custom edge with Bezier path, protocol label, active/dimmed                                      |
| `src/features/catalog/components/GraphCanvas.tsx`            | Modify | Replace `<svg>` with `<ReactFlow>`; remove bubble/edge/node memos                                |
| `src/features/catalog/components/GraphCanvas.module.css`     | Modify | Set explicit height for React Flow container                                                     |
| `src/features/catalog/useCatalogViewModel.ts`                | Modify | Add `showHosting` state; build `rfEdges`; expose toggle                                          |
| `src/features/catalog/CatalogView.tsx`                       | Modify | Add hosting toggle button in footer; update GraphCanvas props                                    |

---

### Task 1: Install @xyflow/react

**Files:**

- Modify: `package.json` (via npm)

- [ ] **Step 1: Install the package**

```bash
cd /Users/jane/Repos/green-room && npm install @xyflow/react
```

Expected: package added to `dependencies` in package.json.

- [ ] **Step 2: Verify typecheck still passes**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add @xyflow/react"
```

---

### Task 2: Update `catalog.ts` — Layout type and `computeLayout`

**Files:**

- Modify: `src/domain/catalog.ts`
- Modify: `tests/domain/catalog.test.ts`

- [ ] **Step 1: Update the existing computeLayout test to use the new API and add new tests**

Replace the `"computes layout even when a cycle exists"` test in `tests/domain/catalog.test.ts` and add two new tests. The full updated `describe` block (keep all other tests unchanged):

```typescript
// Add this import at the top of the file alongside the existing catalog imports:
import type { Service } from "@domain/registry";
// (it may already be imported — do not duplicate)
```

Replace this test:

```typescript
it("computes layout even when a cycle exists", async () => {
  const cyclicServices: Record<string, Service> = {
    a: { ...services.api, upstream: [{ service: "b", criticality: "hard" }] },
    b: { ...services.api, upstream: [{ service: "a", criticality: "hard" }] },
  };
  const graph = buildGraph(cyclicServices);
  const layout = await computeLayout(new Set(["a", "b"]), cyclicServices, graph);

  expect(Object.keys(layout.positions).sort()).toEqual(["a", "b"]);
  expect(layout.svgW).toBeGreaterThanOrEqual(800);
  expect(layout.svgH).toBeGreaterThan(0);
});
```

With:

```typescript
it("compact mode: produces flat serviceNodes for all visible services", async () => {
  const cyclicServices: Record<string, Service> = {
    a: { ...services.api, upstream: [{ service: "b", criticality: "hard" }] },
    b: { ...services.api, upstream: [{ service: "a", criticality: "hard" }] },
  };
  const graph = buildGraph(cyclicServices);
  const layout = await computeLayout(new Set(["a", "b"]), cyclicServices, graph, false);

  const ids = layout.rfNodes.map((n) => n.id).sort();
  expect(ids).toEqual(["a", "b"]);
  expect(layout.rfNodes.every((n) => n.type === "serviceNode")).toBe(true);
  expect(layout.rfNodes.every((n) => !n.parentId)).toBe(true);
});

it("hosting mode: groups hosted services under a parent node", async () => {
  const hostedServices: Record<string, Service> = {
    a: { name: "A", description: "", type: "backend", status: "active", hosting: "cloud_prod" },
    b: { name: "B", description: "", type: "backend", status: "active", hosting: "cloud_prod" },
    c: { name: "C", description: "", type: "datastore", status: "active" },
  };
  const graph = buildGraph(hostedServices);
  const layout = await computeLayout(new Set(["a", "b", "c"]), hostedServices, graph, true);

  const groupNodes = layout.rfNodes.filter((n) => n.type === "hostingGroupNode");
  expect(groupNodes).toHaveLength(1);
  expect(groupNodes[0]?.id).toBe("__hosting_cloud_prod");

  const groupedServiceNodes = layout.rfNodes.filter((n) => n.parentId === "__hosting_cloud_prod");
  expect(groupedServiceNodes).toHaveLength(2);
  expect(groupedServiceNodes.map((n) => n.id).sort()).toEqual(["a", "b"]);

  const ungrouped = layout.rfNodes.find((n) => n.id === "c");
  expect(ungrouped?.parentId).toBeUndefined();
  expect(ungrouped?.type).toBe("serviceNode");
});

it("returns empty rfNodes for no visible services", async () => {
  const layout = await computeLayout(new Set(), {}, { upstream: {}, downstream: {} }, false);
  expect(layout.rfNodes).toEqual([]);
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
npm test -- tests/domain/catalog.test.ts
```

Expected: FAIL — `layout.rfNodes` is not defined (old API still in place), `layout.positions` undefined.

- [ ] **Step 3: Update `src/domain/catalog.ts`**

At the top of the file, change imports:

```typescript
// Before:
import ELK from "elkjs/lib/elk.bundled.js";
import type { DataFlow, DependencyCriticality, Registry, Service, ServiceType } from "./registry";
import { getStageSubtypeLabel } from "./registry";

// After:
import ELK from "elkjs/lib/elk.bundled.js";
import type { Node } from "@xyflow/react";
import type {
  DataFlow,
  DependencyCriticality,
  Hosting,
  Registry,
  Service,
  ServiceType,
} from "./registry";
import { getStageSubtypeLabel, HOSTING_ENVIRONMENT_COLORS } from "./registry";
```

Replace the `Layout` type (lines 19–25):

```typescript
export type Layout = {
  rfNodes: Node[];
};
```

Replace the entire `computeLayout` function (lines 78–157) with:

```typescript
export async function computeLayout(
  visibleServices: Set<string>,
  services: Record<string, Service>,
  graph: Graph,
  showHosting: boolean,
  hostingMap: Record<string, Hosting> = {},
): Promise<Layout> {
  const nodeW = 140;
  const nodeH = 56;

  if (visibleServices.size === 0) {
    return { rfNodes: [] };
  }

  const keys = [...visibleServices];

  if (!showHosting) {
    // Compact mode: flat layered layout with no partitioning
    const elkGraph = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "DOWN",
        "elk.spacing.nodeNode": "30",
        "elk.layered.spacing.nodeNodeBetweenLayers": "50",
        "elk.padding": "[top=20, left=20, bottom=20, right=20]",
      },
      children: keys.map((key) => ({ id: key, width: nodeW, height: nodeH })),
      edges: keys.flatMap((key) =>
        (graph.upstream[key] ?? [])
          .filter((e) => visibleServices.has(e.service))
          .map((e, i) => ({
            id: `${e.service}->${key}:${i}`,
            sources: [e.service],
            targets: [key],
          })),
      ),
    };

    const result = await elk.layout(elkGraph);
    const rfNodes: Node[] = (result.children ?? [])
      .filter((child) => child.id && child.x !== undefined && child.y !== undefined)
      .map((child) => ({
        id: child.id!,
        type: "serviceNode",
        position: { x: child.x!, y: child.y! },
        data: { serviceKey: child.id! },
        width: nodeW,
        height: nodeH,
      }));

    return { rfNodes };
  }

  // Hosting mode: partitioned layout → post-process into RF parent nodes
  const hostingFrequency = new Map<string, number>();
  for (const key of keys) {
    const h = services[key]?.hosting;
    if (h) hostingFrequency.set(h, (hostingFrequency.get(h) ?? 0) + 1);
  }
  const hostingRank = new Map(
    [...hostingFrequency.entries()].sort((a, b) => b[1] - a[1]).map(([h], i) => [h, i]),
  );
  const ungroupedPartition = hostingRank.size;

  const elkGraph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.partitioning.activate": "true",
      "elk.layered.spacing.nodeNodeBetweenLayers": "80",
      "elk.spacing.nodeNode": "40",
      "elk.padding": "[top=60, left=40, bottom=40, right=40]",
    },
    children: keys.map((key) => {
      const h = services[key]?.hosting;
      const partition =
        h !== undefined ? (hostingRank.get(h) ?? ungroupedPartition) : ungroupedPartition;
      return {
        id: key,
        width: nodeW,
        height: nodeH,
        layoutOptions: { "partitioning.partition": String(partition) },
      };
    }),
    edges: keys.flatMap((key) =>
      (graph.upstream[key] ?? [])
        .filter((e) => visibleServices.has(e.service))
        .map((e, i) => ({
          id: `${e.service}->${key}:${i}`,
          sources: [e.service],
          targets: [key],
        })),
    ),
  };

  const result = await elk.layout(elkGraph);

  // Collect flat positions from ELK output
  const positions: Record<string, { x: number; y: number }> = {};
  for (const child of result.children ?? []) {
    if (child.id && child.x !== undefined && child.y !== undefined) {
      positions[child.id] = { x: child.x, y: child.y };
    }
  }

  // Compute bounding boxes per hosting group
  const PADDING = 20;
  type GroupInfo = { positions: { x: number; y: number }[]; color: string };
  const groups = new Map<string, GroupInfo>();
  for (const key of keys) {
    const hostingKey = services[key]?.hosting;
    const position = positions[key];
    if (!hostingKey || !position) continue;
    if (!groups.has(hostingKey)) {
      const config = hostingMap[hostingKey];
      const color = config
        ? (HOSTING_ENVIRONMENT_COLORS[config.environment] ?? "#6b7280")
        : "#6b7280";
      groups.set(hostingKey, { positions: [], color });
    }
    groups.get(hostingKey)!.positions.push(position);
  }

  type GroupBounds = { minX: number; minY: number; color: string };
  const groupBounds = new Map<string, GroupBounds>();
  for (const [hostingKey, { positions: gPositions, color }] of groups) {
    const minX = Math.min(...gPositions.map((p) => p.x)) - PADDING;
    const minY = Math.min(...gPositions.map((p) => p.y)) - PADDING;
    const maxX = Math.max(...gPositions.map((p) => p.x + nodeW)) + PADDING;
    const maxY = Math.max(...gPositions.map((p) => p.y + nodeH)) + PADDING;
    groupBounds.set(hostingKey, { minX, minY, color });

    // Parent nodes must appear before their children in the RF nodes array
    // (pushed first in this loop, service nodes pushed below)
    groups.get(hostingKey)!.positions = gPositions; // retain for service node offset calc
    // Store bounds keyed so we can look them up below
    groups.set(hostingKey, { positions: gPositions, color });
    groupBounds.set(hostingKey, { minX, minY, color });
  }

  // Build React Flow nodes: group nodes first, then service nodes
  const rfNodes: Node[] = [];

  for (const [hostingKey, { color }] of groups) {
    const bounds = groupBounds.get(hostingKey)!;
    const gPositions = groups.get(hostingKey)!.positions;
    const maxX = Math.max(...gPositions.map((p) => p.x + nodeW)) + PADDING;
    const maxY = Math.max(...gPositions.map((p) => p.y + nodeH)) + PADDING;
    rfNodes.push({
      id: `__hosting_${hostingKey}`,
      type: "hostingGroupNode",
      position: { x: bounds.minX, y: bounds.minY },
      data: { hostingKey, color },
      style: { width: maxX - bounds.minX, height: maxY - bounds.minY },
      selectable: false,
    });
  }

  for (const key of keys) {
    const hostingKey = services[key]?.hosting;
    const position = positions[key];
    if (!position) continue;

    if (hostingKey && groupBounds.has(hostingKey)) {
      const { minX, minY } = groupBounds.get(hostingKey)!;
      rfNodes.push({
        id: key,
        type: "serviceNode",
        position: { x: position.x - minX, y: position.y - minY },
        parentId: `__hosting_${hostingKey}`,
        data: { serviceKey: key },
        width: nodeW,
        height: nodeH,
      });
    } else {
      rfNodes.push({
        id: key,
        type: "serviceNode",
        position,
        data: { serviceKey: key },
        width: nodeW,
        height: nodeH,
      });
    }
  }

  return { rfNodes };
}
```

- [ ] **Step 4: Run the tests**

```bash
npm test -- tests/domain/catalog.test.ts
```

Expected: all 4 catalog tests PASS. If the `mermaidExport` test or other tests fail due to import changes, fix those — do not proceed until all tests in this file pass.

- [ ] **Step 5: Commit**

```bash
git add src/domain/catalog.ts tests/domain/catalog.test.ts
git commit -m "feat: update computeLayout to return rfNodes with compact and hosting modes"
```

---

### Task 3: Create `ServiceNode.tsx`

**Files:**

- Create: `src/features/catalog/components/nodes/ServiceNode.tsx`

- [ ] **Step 1: Create the file**

```tsx
// src/features/catalog/components/nodes/ServiceNode.tsx
import { memo } from "react";
import { type NodeProps, Handle, Position } from "@xyflow/react";

import type { Hosting, Service } from "@domain/registry";
import { HOSTING_ENVIRONMENT_COLORS, STATUS_STYLES, TYPE_ICONS } from "@domain/registry";
import { formatServiceLabel, getNodeRadius } from "@domain/catalog";

export type ServiceNodeData = {
  serviceKey: string;
  service: Service;
  hostingConfig: Hosting | undefined;
  isInternal: boolean;
  isHighlight: boolean;
  isAffected: boolean;
  isDimmed: boolean;
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
    onSelect,
  } = data;

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
      <Handle position={Position.Top} style={{ opacity: 0, pointerEvents: "none" }} type="target" />
      <svg height={nodeH} width={nodeW}>
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
            fill="url(#externalNodeStripe)"
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
        position={Position.Bottom}
        style={{ opacity: 0, pointerEvents: "none" }}
        type="source"
      />
    </div>
  );
});
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/catalog/components/nodes/ServiceNode.tsx
git commit -m "feat: add ServiceNode React Flow custom node"
```

---

### Task 4: Create `HostingGroupNode.tsx`

**Files:**

- Create: `src/features/catalog/components/nodes/HostingGroupNode.tsx`

- [ ] **Step 1: Create the file**

```tsx
// src/features/catalog/components/nodes/HostingGroupNode.tsx
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
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/catalog/components/nodes/HostingGroupNode.tsx
git commit -m "feat: add HostingGroupNode React Flow custom node"
```

---

### Task 5: Create `ServiceEdge.tsx`

**Files:**

- Create: `src/features/catalog/components/edges/ServiceEdge.tsx`

- [ ] **Step 1: Create the file**

```tsx
// src/features/catalog/components/edges/ServiceEdge.tsx
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
  targetX,
  targetY,
  data,
  id,
}: EdgeProps & { data: ServiceEdgeData }) {
  const [edgePath] = getBezierPath({ sourceX, sourceY, targetX, targetY });
  const { protocol, criticality, isActive, isDimmed } = data;

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
        strokeDasharray={criticality === "soft" ? "4 3" : "none"}
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
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/catalog/components/edges/ServiceEdge.tsx
git commit -m "feat: add ServiceEdge React Flow custom edge"
```

---

### Task 6: Rewrite `GraphCanvas.tsx` and update CSS

**Files:**

- Modify: `src/features/catalog/components/GraphCanvas.tsx`
- Modify: `src/features/catalog/components/GraphCanvas.module.css`

- [ ] **Step 1: Update the CSS module**

Replace the contents of `GraphCanvas.module.css` with:

```css
.graphSection {
  position: relative;
  width: 100%;
  height: 600px;
}
```

- [ ] **Step 2: Rewrite `GraphCanvas.tsx`**

Replace the entire file with:

```tsx
// src/features/catalog/components/GraphCanvas.tsx
import { useEffect } from "react";
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  Controls,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { ServiceNode, type ServiceNodeData } from "./nodes/ServiceNode";
import { HostingGroupNode } from "./nodes/HostingGroupNode";
import { ServiceEdge } from "./edges/ServiceEdge";
import styles from "./GraphCanvas.module.css";

const nodeTypes = {
  serviceNode: ServiceNode as React.ComponentType<never>,
  hostingGroupNode: HostingGroupNode as React.ComponentType<never>,
};

const edgeTypes = {
  serviceEdge: ServiceEdge as React.ComponentType<never>,
};

type GraphCanvasProps = {
  rfNodes: Node[];
  rfEdges: Edge[];
};

export function GraphCanvas({ rfNodes, rfEdges }: GraphCanvasProps) {
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
        <Controls />
      </ReactFlow>
    </section>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: errors in `useCatalogViewModel.ts` and `CatalogView.tsx` because they still use the old `Layout` type and old `GraphCanvas` props — that's expected. Fix only if errors are inside the files modified in this task.

- [ ] **Step 4: Commit**

```bash
git add src/features/catalog/components/GraphCanvas.tsx src/features/catalog/components/GraphCanvas.module.css
git commit -m "feat: replace SVG canvas with React Flow in GraphCanvas"
```

---

### Task 7: Update `useCatalogViewModel.ts`

**Files:**

- Modify: `src/features/catalog/useCatalogViewModel.ts`

- [ ] **Step 1: Add `showHosting` state and wire `computeLayout`**

At the top of the file, add `Edge` to the xyflow import and `ServiceEdgeData`:

```typescript
import type { Edge, Node } from "@xyflow/react";
import type { ServiceEdgeData } from "@features/catalog/components/edges/ServiceEdge";
```

Add `showHosting` state after the existing `useState` declarations (after `selectedDataFlow`/`expandedDataFlow`, before `const graph`):

```typescript
const [showHosting, setShowHosting] = useState(false);
```

Replace the `emptyLayout` and `layout` state (lines around 271–282):

```typescript
// Remove:
const emptyLayout: Layout = { positions: {}, svgW: 800, svgH: 200, nodeW: 140, nodeH: 56 };
const [layout, setLayout] = useState<Layout>(emptyLayout);

useEffect(() => {
  let cancelled = false;
  computeLayout(visibleServices, services, graph).then((result) => {
    if (!cancelled) setLayout(result);
  });
  return () => {
    cancelled = true;
  };
}, [graph, services, visibleServices]);

// Replace with:
const [rfNodes, setRfNodes] = useState<Node[]>([]);

useEffect(() => {
  let cancelled = false;
  computeLayout(visibleServices, services, graph, showHosting, registry.hosting).then(
    ({ rfNodes: nodes }) => {
      if (!cancelled) setRfNodes(nodes);
    },
  );
  return () => {
    cancelled = true;
  };
}, [graph, registry.hosting, services, showHosting, visibleServices]);
```

Replace the `edges` memo (lines around 284–315) with `rfEdges`:

```typescript
// Remove the existing `edges` useMemo and replace with:
const rfEdges = useMemo<Edge<ServiceEdgeData>[]>(() => {
  const visibleNodeIds = new Set(rfNodes.map((n) => n.id));
  const result: Edge<ServiceEdgeData>[] = [];

  for (const [serviceKey, service] of serviceEntries) {
    for (const [index, dependency] of (service.upstream ?? []).entries()) {
      if (!visibleServices.has(serviceKey) || !visibleServices.has(dependency.service)) {
        continue;
      }
      if (!visibleNodeIds.has(serviceKey) || !visibleNodeIds.has(dependency.service)) {
        continue;
      }
      const isActive = affectedSet.has(serviceKey) && affectedSet.has(dependency.service);
      result.push({
        id: `${serviceKey}:${index}:${dependency.service}`,
        source: dependency.service,
        target: serviceKey,
        type: "serviceEdge",
        data: {
          protocol: dependency.protocol,
          criticality: dependency.criticality,
          isActive,
          isDimmed: mode !== "overview" && !isActive,
        },
      });
    }
  }

  return result;
}, [affectedSet, mode, rfNodes, serviceEntries, visibleServices]);
```

Add `handleToggleHosting` callback after `handleToggleOwnership`:

```typescript
const handleToggleHosting = useCallback(() => {
  setShowHosting((prev) => !prev);
}, []);
```

Update the return object — remove `edges` and `layout`, add new fields:

```typescript
// Remove from return: edges, layout
// Add to return:
handleToggleHosting,
rfEdges,
rfNodes,
showHosting,
```

Also remove the `Layout` import from `@domain/catalog` since it is no longer used in the viewmodel (only `Node[]` is used now):

```typescript
// In the @domain/catalog import, remove: type Layout, Layout
// Keep: buildDataFlowMermaid, buildGraph, buildGraphMermaid, collectReachable,
//        computeLayout, getAffectedDataFlows, slugify
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Fix any remaining errors in this file. Common issues:

- `registry.hosting` — the `registry` variable is already in scope as `useCatalogViewModel(registry: Registry)` param
- Import path for `ServiceEdgeData` — use `"@features/catalog/components/edges/ServiceEdge"` (check that `@features` alias is in `vite.config.js`)

- [ ] **Step 3: Commit**

```bash
git add src/features/catalog/useCatalogViewModel.ts
git commit -m "feat: add showHosting state and rfNodes/rfEdges to catalog viewmodel"
```

---

### Task 8: Update `CatalogView.tsx`

**Files:**

- Modify: `src/features/catalog/CatalogView.tsx`

- [ ] **Step 1: Find the GraphCanvas usage in CatalogView**

Search for `<GraphCanvas` in the file. It will look something like:

```tsx
<GraphCanvas
  edges={viewModel.edges}
  layout={viewModel.layout}
  visibleServices={viewModel.visibleServices}
  affectedSet={viewModel.affectedSet}
  highlightKey={viewModel.highlightKey}
  hostingMap={registry.hosting}
  mode={viewModel.mode}
  services={viewModel.services}
  getOwnershipKind={viewModel.getOwnershipKind}
  onSelectService={viewModel.handleServiceClick}
/>
```

Replace with:

```tsx
<GraphCanvas rfEdges={viewModel.rfEdges} rfNodes={viewModel.rfNodes} />
```

Note: interaction props (`onSelect`, `isHighlight`, etc.) are now passed via node `data` — this is handled when we update `rfNodes` enrichment in Step 2 below.

- [ ] **Step 2: Enrich rfNodes with interaction data**

The `rfNodes` from `useCatalogViewModel` currently carry only `{ serviceKey }` in their `data` field. The full `ServiceNodeData` (service object, hosting config, interaction flags, onSelect) needs to be injected before passing to `GraphCanvas`.

The best place is in `CatalogView` itself, since it has access to both `viewModel` and `registry`. Add a `useMemo` in `CatalogView`:

```tsx
import { useMemo } from "react";
// (already imported or add it)

// Inside CatalogView, after calling useCatalogViewModel:
const enrichedNodes = useMemo(
  () =>
    viewModel.rfNodes.map((node) => {
      if (node.type !== "serviceNode") return node;
      const serviceKey = (node.data as { serviceKey: string }).serviceKey;
      const service = registry.services[serviceKey];
      if (!service) return node;
      const hostingConfig = service.hosting ? registry.hosting[service.hosting] : undefined;
      return {
        ...node,
        data: {
          serviceKey,
          service,
          hostingConfig,
          isInternal: viewModel.getOwnershipKind(service) === "internal",
          isHighlight: serviceKey === viewModel.highlightKey,
          isAffected: viewModel.affectedSet.has(serviceKey),
          isDimmed: viewModel.mode !== "overview" && !viewModel.affectedSet.has(serviceKey),
          onSelect: viewModel.handleServiceClick,
        },
      };
    }),
  [
    viewModel.rfNodes,
    viewModel.affectedSet,
    viewModel.highlightKey,
    viewModel.mode,
    viewModel.getOwnershipKind,
    viewModel.handleServiceClick,
    registry.services,
    registry.hosting,
  ],
);
```

Update the `<GraphCanvas>` call to use `enrichedNodes`:

```tsx
<GraphCanvas rfEdges={viewModel.rfEdges} rfNodes={enrichedNodes} />
```

- [ ] **Step 3: Add the hosting toggle button to the footer**

In the footer section (around line 452), add a hosting toggle button inside the `viewModel.mode !== "data"` branch, after the type icon toggles. It should go after the last `TYPE_ICON_ENTRIES` map:

```tsx
<button
  className={`${styles.legendItem} ${styles.legendToggle}${viewModel.showHosting ? "" : ` ${styles.legendToggleOff}`}`}
  key="hosting-view"
  onClick={viewModel.handleToggleHosting}
  type="button"
>
  ☁ hosting
</button>
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: no errors. If `edges` or `layout` are referenced elsewhere in `CatalogView.tsx` (e.g. mermaid export), update those references — the mermaid export uses `viewModel.mermaidExport` which is unchanged.

- [ ] **Step 5: Run all tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/features/catalog/CatalogView.tsx
git commit -m "feat: wire React Flow GraphCanvas and add hosting toggle to CatalogView"
```

---

### Task 9: Visual Verification

**Files:** none (browser testing)

- [ ] **Step 1: Confirm dev server is running at http://localhost:5173/green-room/**

If not running:

```bash
npm run dev
```

- [ ] **Step 2: Compact mode (default)**

Open http://localhost:5173/green-room/. The graph should show all services in a compact dependency-driven layout with no hosting bubbles. Nodes should be closer together than before.

- [ ] **Step 3: Toggle hosting view**

Click the "☁ hosting" button in the footer. Nodes should reorganise into hosting groups with labeled dashed-border containers. Groups should be clearly separated.

- [ ] **Step 4: Toggle back**

Click "☁ hosting" again. Layout should collapse back to compact mode.

- [ ] **Step 5: Drag a node**

Click and drag a service node. It should move freely. Other nodes should stay in place.

- [ ] **Step 6: Pan and zoom**

Scroll to zoom in/out. Click-drag on empty canvas area to pan.

- [ ] **Step 7: Status/type filter toggles**

Toggle a status or type filter in the footer. Layout should recompute in the current mode (compact or hosting).

- [ ] **Step 8: Service selection / impact mode**

Click a node. Use impact mode. Verify that affected nodes are highlighted and unaffected nodes are dimmed.

- [ ] **Step 9: Fix any regressions, then final commit**

```bash
git add -p  # stage only intentional changes
git commit -m "fix: address visual regressions from React Flow migration"
```

---

## Self-Review Notes

**Spec coverage check:**

- ✅ Compact layout (no bubbles, dependency-driven) — Task 2 compact mode
- ✅ Hosting layout (grouped bubbles, toggle) — Tasks 2 + 8
- ✅ Draggable nodes — React Flow `useNodesState` handles automatically
- ✅ Pan/zoom — React Flow built-in with `<Controls />`
- ✅ Layout resets on toggle — `useEffect` dep on `showHosting` triggers recompute
- ✅ Filters still work — `visibleServices` dep unchanged

**Type consistency across tasks:**

- `ServiceNodeData` defined in `ServiceNode.tsx`, used in `CatalogView.tsx` enrichment
- `ServiceEdgeData` defined in `ServiceEdge.tsx`, used in `useCatalogViewModel.ts`
- `HostingGroupNodeData` defined in `HostingGroupNode.tsx`, consumed by `catalog.ts`
- `Layout.rfNodes: Node[]` defined in `catalog.ts`, consumed by viewmodel + CatalogView
- `rfEdges` type in viewmodel: `Edge<ServiceEdgeData>[]`

**Known adaptation point:**
The `GraphCanvas` container height is hardcoded to `600px` in the CSS module. If the surrounding layout gives the graph section a flex-grow, change the CSS to `height: 100%` and ensure the parent has `min-height: 0`.
