import type {
  DataFlow,
  DependencyCriticality,
  Registry,
  Service,
  ServiceType,
} from "./registry";

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
  positions: Record<string, { x: number; y: number }>;
  svgW: number;
  svgH: number;
  nodeW: number;
  nodeH: number;
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

export function computeLayout(
  visibleServices: Set<string>,
  services: Record<string, Service>,
  graph: Graph,
): Layout {
  const keys = [...visibleServices];
  const inDegree: Record<string, number> = {};

  for (const key of keys) {
    inDegree[key] = 0;
  }

  for (const key of keys) {
    for (const dependency of services[key]?.upstream ?? []) {
      if (visibleServices.has(dependency.service)) {
        inDegree[key] += 1;
      }
    }
  }

  const layers: string[][] = [];
  const remaining = new Set(keys);

  while (remaining.size > 0) {
    const layer = [...remaining].filter((key) => inDegree[key] === 0);

    if (layer.length === 0) {
      layers.push([...remaining]);
      break;
    }

    layers.push(layer);

    for (const key of layer) {
      remaining.delete(key);

      for (const dependency of graph.downstream[key] ?? []) {
        if (remaining.has(dependency.service)) {
          inDegree[dependency.service] -= 1;
        }
      }
    }
  }

  const nodeW = 140;
  const nodeH = 56;
  const gapX = 40;
  const gapY = 80;
  const maxLayerWidth = Math.max(...layers.map((layer) => layer.length), 1);
  const totalWidth = Math.max(800, maxLayerWidth * (nodeW + gapX));
  const positions: Layout["positions"] = {};

  layers.forEach((layer, layerIndex) => {
    const layerWidth = layer.length * (nodeW + gapX) - gapX;
    const offsetX = (totalWidth - layerWidth) / 2;

    layer.forEach((key, columnIndex) => {
      positions[key] = {
        x: offsetX + columnIndex * (nodeW + gapX),
        y: 60 + layerIndex * (nodeH + gapY),
      };
    });
  });

  return {
    positions,
    svgH: 60 + layers.length * (nodeH + gapY) + 40,
    svgW: totalWidth + 40,
    nodeH,
    nodeW,
  };
}

export function formatServiceLabel(name: string, limit: number) {
  return name.length > limit ? `${name.slice(0, limit - 1)}…` : name;
}

export function normalizeSearchText(value: string) {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, " ").trim();
}

export function matchesFuzzy(label: string, query: string, extraSearchText?: string) {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return true;
  }

  const haystack = normalizeSearchText(`${label} ${extraSearchText ?? ""}`);
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);

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

    const ownerSuffix =
      service.owner === registry.metadata.team_id ? "team-owned" : "external";
    const label = `${service.name}\\n${service.type} • ${service.status} • ${ownerSuffix}`;
    lines.push(`  ${buildMermaidNodeLine(toMermaidId(serviceKey), label, getMermaidShape(service.type))}`);
  }

  const sortedEdges = [...edges].sort((left, right) => {
    const fromComparison = left.from.localeCompare(right.from);

    if (fromComparison !== 0) {
      return fromComparison;
    }

    return left.to.localeCompare(right.to);
  });

  for (const edge of sortedEdges) {
    if (!serviceKeys.has(edge.from) || !serviceKeys.has(edge.to)) {
      continue;
    }

    const fromId = toMermaidId(edge.from);
    const toId = toMermaidId(edge.to);
    const edgeLabelParts = [edge.protocol, edge.criticality].filter(Boolean);

    if (edgeLabelParts.length > 0) {
      lines.push(
        `  ${fromId} -->|${escapeMermaidLabel(edgeLabelParts.join(" · "))}| ${toId}`,
      );
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
    const flowLabel = registry.business_flows[dataFlow.business_flow]?.name ?? dataFlow.business_flow;

    lines.push(`  subgraph ${flowId}["${escapeMermaidLabel(`${dataFlow.name} · ${flowLabel}`)}"]`);

    dataFlow.stages.forEach((stage, index) => {
      const stageId = toMermaidId(`${flowKey}_${index}_${stage.service}`);
      const serviceName = registry.services[stage.service]?.name ?? stage.service;
      const stageLabelParts = [serviceName, stage.action];

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
