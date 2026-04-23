import ELK from "elkjs/lib/elk.bundled.js";

import type { Node } from "@xyflow/react";
import type { DataFlow, DependencyCriticality, Hosting, Registry, Service, ServiceType } from "./registry";
import { getStageSubtypeLabel, HOSTING_ENVIRONMENT_COLORS } from "./registry";

const elk = new ELK();

export type GraphEdge = {
  service: string;
  protocol?: string;
  criticality?: DependencyCriticality;
};

export type Graph = {
  upstream: Record<string, GraphEdge[]>;
  downstream: Record<string, GraphEdge[]>;
};

export type Layout = {
  rfNodes: Node[];
};

export type MermaidExport = {
  filename: string;
  source: string;
};

export function buildGraph(services: Record<string, Service>): Graph {
  const graph: Graph = { upstream: {}, downstream: {} };

  for (const serviceKey of Object.keys(services)) {
    graph.upstream[serviceKey] = [];
    graph.downstream[serviceKey] = [];
  }

  for (const [serviceKey, service] of Object.entries(services)) {
    for (const dependency of service.upstream ?? []) {
      if (!services[dependency.service]) {
        // Broken references are surfaced by validation; the graph builder stays defensive so the
        // UI can still render partially valid drafts while the editor shows the problem.
        continue;
      }

      graph.upstream[serviceKey].push(dependency);
      graph.downstream[dependency.service].push({ ...dependency, service: serviceKey });
    }
  }

  return graph;
}

export function collectReachable(
  startKey: string,
  adjacency: Record<string, GraphEdge[]>,
  visited: Set<string> = new Set(),
): Set<string> {
  visited.add(startKey);

  for (const edge of adjacency[startKey] ?? []) {
    if (!visited.has(edge.service)) {
      collectReachable(edge.service, adjacency, visited);
    }
  }

  return visited;
}

export function getAffectedDataFlows(serviceKey: string, dataFlows: Record<string, DataFlow>) {
  return Object.entries(dataFlows).filter(([, flow]) =>
    flow.stages.some((stage) => stage.service === serviceKey),
  );
}

export type LayoutDirection = "LR" | "TB";

type ElkChild = { id?: string; x?: number; y?: number };

// Groups nodes by their primary-axis coordinate and redistributes secondary-axis positions so
// every layer (TB) or column (LR) fills the same total extent. Preserves ELK's within-group
// ordering to avoid reintroducing edge crossings. Single-pass: computes max and groups together.
function spreadLayerNodes(
  children: ElkChild[],
  primary: "x" | "y",
  secondary: "x" | "y",
  secondarySize: number,
): Map<string, { x: number; y: number }> {
  let maxSecondary = 0;
  const groups = new Map<number, ElkChild[]>();

  for (const child of children) {
    if (!child.id || child.x === undefined || child.y === undefined) continue;
    const primaryKey = Math.round(child[primary]!);
    if (!groups.has(primaryKey)) groups.set(primaryKey, []);
    groups.get(primaryKey)!.push(child);
    maxSecondary = Math.max(maxSecondary, child[secondary]! + secondarySize);
  }

  const positions = new Map<string, { x: number; y: number }>();
  for (const [primaryKey, group] of groups) {
    const sorted = [...group].sort((a, b) => (a[secondary] ?? 0) - (b[secondary] ?? 0));
    const n = sorted.length;
    sorted.forEach((node, i) => {
      const secondaryPos =
        n === 1
          ? (maxSecondary - secondarySize) / 2
          : (i * (maxSecondary - secondarySize)) / (n - 1);
      positions.set(node.id!, {
        x: primary === "x" ? primaryKey : secondaryPos,
        y: primary === "y" ? primaryKey : secondaryPos,
      });
    });
  }

  return positions;
}

export async function computeLayout(
  visibleServices: Set<string>,
  services: Record<string, Service>,
  graph: Graph,
  showHosting: boolean,
  hostingMap: Record<string, Hosting> = {},
  layoutDirection: LayoutDirection = "TB",
): Promise<Layout> {
  const nodeW = 140;
  const nodeH = 56;

  if (visibleServices.size === 0) {
    return { rfNodes: [] };
  }

  const keys = [...visibleServices];

  if (!showHosting || layoutDirection === "LR") {
    // LR (request-flow): consumers are ELK sources so entry-points land on the left; edges are
    // expressed consumer→dependency so arrows point left-to-right in the direction of requests.
    // TB (dependency/infra): dependencies are ELK sources so they land at the top; edges are
    // expressed dependency→consumer so arrows point downward.
    const isLR = layoutDirection === "LR";
    const elkGraph = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": isLR ? "RIGHT" : "DOWN",
        // In LR mode the secondary axis is vertical, so nodeNode is the within-column vertical
        // gap. Keep it compact (20) and let the redistribution step spread columns evenly.
        // Between-layers is the horizontal column gap — wider to give edges room to breathe.
        "elk.spacing.nodeNode": isLR ? "20" : "60",
        "elk.layered.spacing.nodeNodeBetweenLayers": isLR ? "80" : "50",
        "elk.padding": "[top=20, left=20, bottom=20, right=20]",
      },
      children: keys.map((key) => ({ id: key, width: nodeW, height: nodeH })),
      edges: keys.flatMap((key) =>
        (graph.upstream[key] ?? [])
          .filter((e) => visibleServices.has(e.service))
          .map((e, i) => ({
            id: `${e.service}->${key}:${i}`,
            sources: isLR ? [key] : [e.service],
            targets: isLR ? [e.service] : [key],
          })),
      ),
    };

    const result = await elk.layout(elkGraph);
    const elkChildren = result.children ?? [];

    const spreadPositions = isLR
      ? spreadLayerNodes(elkChildren, "x", "y", nodeH)
      : spreadLayerNodes(elkChildren, "y", "x", nodeW);

    const rfNodes: Node[] = elkChildren
      .filter((child) => child.id && spreadPositions.has(child.id))
      .map((child) => ({
        id: child.id!,
        type: "serviceNode",
        position: spreadPositions.get(child.id!)!,
        data: { serviceKey: child.id! },
        width: nodeW,
        height: nodeH,
      }));

    return { rfNodes };
  }

  // Hosting mode: partitioned ELK layout → post-process into RF parent nodes
  const hostingFrequency = new Map<string, number>();
  for (const key of keys) {
    const h = services[key]?.hosting;
    if (h) hostingFrequency.set(h, (hostingFrequency.get(h) ?? 0) + 1);
  }
  const hostingRank = new Map(
    [...hostingFrequency.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([h], i) => [h, i]),
  );
  const ungroupedPartition = hostingRank.size;

  const elkGraph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.partitioning.activate": "true",
      "elk.layered.spacing.nodeNodeBetweenLayers": "100",
      "elk.spacing.nodeNode": "60",
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

  // Compute bounding box per hosting group
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

  // Pre-compute bounds for each group (needed for both parent nodes and child offsets)
  type GroupBounds = { minX: number; minY: number; maxX: number; maxY: number; color: string };
  const groupBounds = new Map<string, GroupBounds>();
  for (const [hostingKey, { positions: gPositions, color }] of groups) {
    groupBounds.set(hostingKey, {
      minX: Math.min(...gPositions.map((p) => p.x)) - PADDING,
      minY: Math.min(...gPositions.map((p) => p.y)) - PADDING,
      maxX: Math.max(...gPositions.map((p) => p.x + nodeW)) + PADDING,
      maxY: Math.max(...gPositions.map((p) => p.y + nodeH)) + PADDING,
      color,
    });
  }

  // Build React Flow nodes: group parent nodes first, then service nodes
  const rfNodes: Node[] = [];

  for (const [hostingKey, { minX, minY, maxX, maxY, color }] of groupBounds) {
    rfNodes.push({
      id: `__hosting_${hostingKey}`,
      type: "hostingGroupNode",
      position: { x: minX, y: minY },
      data: { hostingKey, color },
      style: { width: maxX - minX, height: maxY - minY },
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
        extent: "parent" as const,
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

export function formatServiceLabel(name: string, limit: number) {
  return name.length > limit ? `${name.slice(0, limit - 1)}…` : name;
}

export function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, " ")
    .trim();
}

export function matchesFuzzy(label: string, query: string, extraSearchText?: string) {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return true;
  }

  const haystack = normalizeSearchText(`${label} ${extraSearchText ?? ""}`);
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);

  // Treat fuzzy search as unordered token containment. This is intentionally simple and stable
  // for short option lists without bringing in a heavier ranking library.
  return tokens.every((token) => haystack.includes(token));
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}

function toMermaidId(value: string) {
  const normalized = value.replaceAll(/[^a-zA-Z0-9]+/g, "_").replaceAll(/^_+|_+$/g, "");

  return normalized ? `node_${normalized}` : "node_unknown";
}

function escapeMermaidLabel(value: string) {
  return value.replaceAll(/"/g, '\\"');
}

function buildMermaidNodeLine(
  nodeId: string,
  label: string,
  shape: "rounded" | "stadium" | "subroutine" | "database",
) {
  const escapedLabel = escapeMermaidLabel(label);

  if (shape === "stadium") {
    return `${nodeId}(["${escapedLabel}"])`;
  }

  if (shape === "subroutine") {
    return `${nodeId}[["${escapedLabel}"]]`;
  }

  if (shape === "database") {
    return `${nodeId}[("${escapedLabel}")]`;
  }

  return `${nodeId}["${escapedLabel}"]`;
}

function getMermaidShape(type: ServiceType) {
  if (type === "frontend") {
    return "rounded" as const;
  }

  if (type === "backend") {
    return "subroutine" as const;
  }

  if (type === "datastore") {
    return "database" as const;
  }

  return "stadium" as const;
}

export function buildGraphMermaid(params: {
  registry: Registry;
  serviceKeys: Set<string>;
  edges: Array<{
    from: string;
    to: string;
    protocol?: string;
    criticality?: DependencyCriticality;
  }>;
  direction?: "LR" | "TD";
  title: string;
  filenameStem: string;
}) {
  const { registry, serviceKeys, edges, direction = "LR", title, filenameStem } = params;
  const lines = [`flowchart ${direction}`, `%% ${title}`];
  const sortedServiceKeys = [...serviceKeys].sort((left, right) => left.localeCompare(right));

  if (sortedServiceKeys.length === 0) {
    return null;
  }

  for (const serviceKey of sortedServiceKeys) {
    const service = registry.services[serviceKey];

    if (!service) {
      continue;
    }

    const ownerSuffix = service.owner === registry.metadata.team_id ? "team-owned" : "external";
    const label = `${service.name}\\n${service.type} • ${service.status} • ${ownerSuffix}`;
    lines.push(
      `  ${buildMermaidNodeLine(toMermaidId(serviceKey), label, getMermaidShape(service.type))}`,
    );
  }

  const sortedEdges = [...edges].sort((left, right) => {
    const fromComparison = left.from.localeCompare(right.from);

    if (fromComparison !== 0) {
      return fromComparison;
    }

    return left.to.localeCompare(right.to);
  });

  for (const edge of sortedEdges) {
    // Filter again here so callers can pass the broader visible edge list and let export tighten
    // it to the exact subgraph being emitted.
    if (!serviceKeys.has(edge.from) || !serviceKeys.has(edge.to)) {
      continue;
    }

    const fromId = toMermaidId(edge.from);
    const toId = toMermaidId(edge.to);
    const edgeLabelParts = [edge.protocol, edge.criticality].filter(Boolean);

    if (edgeLabelParts.length > 0) {
      lines.push(`  ${fromId} -->|${escapeMermaidLabel(edgeLabelParts.join(" · "))}| ${toId}`);
    } else {
      lines.push(`  ${fromId} --> ${toId}`);
    }
  }

  return {
    filename: `${filenameStem}.mmd`,
    source: `${lines.join("\n")}\n`,
  } satisfies MermaidExport;
}

export function buildDataFlowMermaid(params: {
  registry: Registry;
  dataFlowEntries: Array<[string, DataFlow]>;
  filenameStem: string;
  title: string;
}) {
  const { registry, dataFlowEntries, filenameStem, title } = params;

  if (dataFlowEntries.length === 0) {
    return null;
  }

  const lines = ["flowchart TD", `%% ${title}`];
  const sortedEntries = [...dataFlowEntries].sort(([leftKey], [rightKey]) =>
    leftKey.localeCompare(rightKey),
  );

  for (const [flowKey, dataFlow] of sortedEntries) {
    const flowId = toMermaidId(`flow_${flowKey}`);
    const flowLabel =
      registry.business_flows[dataFlow.business_flow]?.name ?? dataFlow.business_flow;

    // Emit each visible data flow as its own Mermaid subgraph so a single export can contain the
    // current filtered lineage view without merging unrelated pipelines into one chain.
    lines.push(`  subgraph ${flowId}["${escapeMermaidLabel(`${dataFlow.name} · ${flowLabel}`)}"]`);

    dataFlow.stages.forEach((stage, index) => {
      const stageId = toMermaidId(`${flowKey}_${index}_${stage.service}`);
      const serviceName = registry.services[stage.service]?.name ?? stage.service;
      const stageLabelParts = [serviceName, stage.action];
      const subtype = getStageSubtypeLabel(stage);

      if (subtype) {
        stageLabelParts.push(subtype);
      }

      if (stage.format) {
        stageLabelParts.push(stage.format);
      }

      lines.push(`    ${stageId}["${escapeMermaidLabel(stageLabelParts.join("\\n"))}"]`);

      if (index > 0) {
        const prevStageId = toMermaidId(
          `${flowKey}_${index - 1}_${dataFlow.stages[index - 1]?.service ?? "stage"}`,
        );
        lines.push(`    ${prevStageId} --> ${stageId}`);
      }
    });

    lines.push("  end");
  }

  return {
    filename: `${filenameStem}.mmd`,
    source: `${lines.join("\n")}\n`,
  } satisfies MermaidExport;
}

export function getNodeRadius(type: ServiceType) {
  if (type === "datastore") {
    return 20;
  }

  if (type === "frontend") {
    return 4;
  }

  return 10;
}
