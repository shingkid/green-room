import {
  useCallback,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import rawRegistry from "./service_registry.yaml";

type ServiceStatus = "active" | "deprecated" | "migrating";
type ServiceType = "frontend" | "backend" | "datastore" | "infrastructure";
type DependencyCriticality = "hard" | "soft";
type DataFlowAction =
  | "produces"
  | "transforms"
  | "stores"
  | "indexes"
  | "enriches"
  | "caches"
  | "serves"
  | "consumes";
type DataType = "dataset" | "event" | "metric" | "config" | "auth_token";
type Sensitivity = "public" | "internal" | "confidential" | "restricted";

type Mode = "overview" | "blast" | "upstream" | "flow" | "data";

type Dependency = {
  service: string;
  protocol?: string;
  criticality?: DependencyCriticality;
};

type Service = {
  name: string;
  description: string;
  type: ServiceType;
  status: ServiceStatus;
  upstream?: Dependency[];
  business_flows?: string[];
  owner?: string;
  runbook?: string;
  health_check?: string;
  port?: number;
};

type BusinessFlow = {
  name: string;
  description: string;
  priority: string;
  stakeholders: string[];
};

type DataFlowStage = {
  service: string;
  action: DataFlowAction;
  format?: string;
  notes?: string;
};

type DataFlow = {
  name: string;
  description: string;
  business_flow: string;
  data_type: DataType;
  sensitivity: Sensitivity;
  freshness: string;
  stages: DataFlowStage[];
};

type Registry = {
  metadata: {
    team: string;
    last_updated: string;
    maintainers: Array<{ name: string; slack: string }>;
  };
  business_flows: Record<string, BusinessFlow>;
  data_flows: Record<string, DataFlow>;
  services: Record<string, Service>;
};

type GraphEdge = Dependency & { service: string };

type Graph = {
  upstream: Record<string, GraphEdge[]>;
  downstream: Record<string, GraphEdge[]>;
};

type Layout = {
  positions: Record<string, { x: number; y: number }>;
  svgW: number;
  svgH: number;
  nodeW: number;
  nodeH: number;
};

type StatusStyle = {
  bg: string;
  border: string;
  text: string;
};

const REGISTRY = rawRegistry as Registry;
const SERVICES = REGISTRY.services;
const BUSINESS_FLOWS = REGISTRY.business_flows;
const DATA_FLOWS = REGISTRY.data_flows;

const STATUS_STYLES: Record<ServiceStatus, StatusStyle> = {
  active: { bg: "#16a34a", border: "#15803d", text: "#fff" },
  deprecated: { bg: "#d97706", border: "#b45309", text: "#fff" },
  migrating: { bg: "#2563eb", border: "#1d4ed8", text: "#fff" },
};

const ACTION_COLORS: Record<DataFlowAction, string> = {
  produces: "#059669",
  transforms: "#7c3aed",
  stores: "#0369a1",
  indexes: "#0369a1",
  enriches: "#d97706",
  caches: "#64748b",
  serves: "#059669",
  consumes: "#dc2626",
};

const FLOW_COLORS: Record<string, string> = {
  research_search: "#8b5cf6",
  data_ingestion: "#06b6d4",
  report_generation: "#f59e0b",
  admin_monitoring: "#6b7280",
};

const TYPE_ICONS: Record<ServiceType, string> = {
  frontend: "◻",
  backend: "⚙",
  datastore: "⛁",
  infrastructure: "△",
};

const DATA_TYPE_ICONS: Record<DataType, string> = {
  dataset: "📊",
  event: "⚡",
  metric: "📈",
  config: "⚙",
  auth_token: "🔑",
};

const SENSITIVITY_COLORS: Record<Sensitivity, string> = {
  public: "#22c55e",
  internal: "#3b82f6",
  confidential: "#f59e0b",
  restricted: "#ef4444",
};

const TABS: Array<{ key: Mode; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "blast", label: "Blast Radius" },
  { key: "upstream", label: "Upstream Causes" },
  { key: "flow", label: "Business Flow" },
  { key: "data", label: "📊 Data Flows" },
];

const graphModes: Mode[] = ["overview", "blast", "upstream", "flow"];

function buildGraph(services: Record<string, Service>): Graph {
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

function collectReachable(
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

function getAffectedDataFlows(serviceKey: string, dataFlows: Record<string, DataFlow>) {
  return Object.entries(dataFlows).filter(([, flow]) =>
    flow.stages.some((stage) => stage.service === serviceKey),
  );
}

function computeLayout(
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
    svgW: totalWidth + 40,
    svgH: 60 + layers.length * (nodeH + gapY) + 40,
    nodeW,
    nodeH,
  };
}

function formatServiceLabel(name: string, limit: number) {
  return name.length > limit ? `${name.slice(0, limit - 1)}…` : name;
}

function getNodeRadius(type: ServiceType) {
  if (type === "datastore") {
    return 20;
  }

  if (type === "frontend") {
    return 4;
  }

  return 10;
}

function panelStyle(extra?: CSSProperties): CSSProperties {
  return {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: 8,
    ...extra,
  };
}

type BadgeProps = {
  color: string;
  children: ReactNode;
  onClick?: () => void;
};

function Badge({ color, children, onClick }: BadgeProps) {
  return (
    <span
      onClick={onClick}
      style={{
        background: color,
        borderRadius: 3,
        color: "#fff",
        cursor: onClick ? "pointer" : "default",
        fontSize: "10px",
        fontWeight: 500,
        padding: "2px 8px",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

type TagProps = {
  children: ReactNode;
  color?: string;
};

function Tag({ children, color = "#334155" }: TagProps) {
  return (
    <span
      style={{
        background: color,
        borderRadius: 3,
        color: "#e2e8f0",
        fontFamily: "monospace",
        fontSize: "9px",
        padding: "1px 6px",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

type ServiceNodeProps = {
  id: string;
  service: Service;
  position: { x: number; y: number };
  width: number;
  height: number;
  isHighlight: boolean;
  isAffected: boolean;
  isDimmed: boolean;
  onSelect: (serviceKey: string) => void;
};

function ServiceNode({
  id,
  service,
  position,
  width,
  height,
  isHighlight,
  isAffected,
  isDimmed,
  onSelect,
}: ServiceNodeProps) {
  const statusStyle = STATUS_STYLES[service.status] ?? STATUS_STYLES.active;
  const stroke = isHighlight ? "#dc2626" : isAffected ? "#f97316" : statusStyle.border;

  return (
    <g
      onClick={() => onSelect(id)}
      opacity={isDimmed ? 0.15 : 1}
      style={{ cursor: "pointer" }}
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
}

type ServiceEdgeProps = {
  from: { x: number; y: number };
  to: { x: number; y: number };
  protocol?: string;
  criticality?: DependencyCriticality;
  isActive: boolean;
  isDimmed: boolean;
};

function ServiceEdge({ from, to, protocol, criticality, isActive, isDimmed }: ServiceEdgeProps) {
  const midY = (from.y + to.y) / 2;
  const path = `M${from.x},${from.y} C${from.x},${midY} ${to.x},${midY} ${to.x},${to.y}`;

  return (
    <g opacity={isDimmed ? 0.06 : isActive ? 0.9 : 0.35}>
      <path
        d={path}
        fill="none"
        markerEnd="url(#arrow)"
        stroke={isActive ? "#f97316" : "#94a3b8"}
        strokeDasharray={criticality === "soft" ? "4 3" : "none"}
        strokeWidth={isActive ? 2 : 1}
      />
      {protocol && isActive ? (
        <text
          fill="#94a3b8"
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
}

type DataFlowPipelineProps = {
  dataFlow: DataFlow;
  selectedService: string | null;
  onSelectService: (serviceKey: string) => void;
};

function DataFlowPipeline({ dataFlow, selectedService, onSelectService }: DataFlowPipelineProps) {
  const stageW = 130;
  const stageH = 72;
  const arrowW = 40;
  const gap = 12;
  const totalW = dataFlow.stages.length * (stageW + arrowW + gap) - arrowW - gap;

  return (
    <div style={{ overflowX: "auto", padding: "8px 16px" }}>
      <svg height={stageH + 20} style={{ display: "block" }} width={Math.max(totalW + 40, 300)}>
        <defs>
          <marker
            id="pipeArrow"
            markerHeight="8"
            markerWidth="8"
            orient="auto"
            refX="10"
            refY="5"
            viewBox="0 0 10 10"
          >
            <path d="M0 0 L10 5 L0 10 z" fill="#475569" />
          </marker>
        </defs>
        {dataFlow.stages.map((stage, index) => {
          const x = 20 + index * (stageW + arrowW + gap);
          const service = SERVICES[stage.service];
          const isSelected = stage.service === selectedService;

          return (
            <g key={`${stage.service}-${index}`}>
              <g onClick={() => onSelectService(stage.service)} style={{ cursor: "pointer" }}>
                <rect
                  fill={isSelected ? "#1e293b" : "#0f172a"}
                  height={stageH}
                  rx={8}
                  stroke={isSelected ? "#f97316" : "#334155"}
                  strokeWidth={isSelected ? 2 : 1}
                  width={stageW}
                  x={x}
                  y={4}
                />
                <rect
                  fill={ACTION_COLORS[stage.action] ?? "#64748b"}
                  height={16}
                  opacity={0.9}
                  rx={4}
                  width={stageW - 8}
                  x={x + 4}
                  y={8}
                />
                <text
                  fill="#fff"
                  fontFamily="system-ui"
                  fontSize="9"
                  fontWeight="600"
                  textAnchor="middle"
                  x={x + stageW / 2}
                  y={20}
                >
                  {stage.action.toUpperCase()}
                </text>
                <text
                  fill="#e2e8f0"
                  fontFamily="system-ui"
                  fontSize="10"
                  fontWeight="600"
                  textAnchor="middle"
                  x={x + stageW / 2}
                  y={42}
                >
                  {formatServiceLabel(service?.name ?? stage.service, 18)}
                </text>
                <text
                  fill="#64748b"
                  fontFamily="system-ui"
                  fontSize="8"
                  textAnchor="middle"
                  x={x + stageW / 2}
                  y={56}
                >
                  {formatServiceLabel(stage.format ?? "", 20)}
                </text>
              </g>
              {index < dataFlow.stages.length - 1 ? (
                <line
                  markerEnd="url(#pipeArrow)"
                  stroke="#475569"
                  strokeWidth={1.5}
                  x1={x + stageW + 2}
                  x2={x + stageW + arrowW + gap - 2}
                  y1={4 + stageH / 2}
                  y2={4 + stageH / 2}
                />
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function App() {
  const [mode, setMode] = useState<Mode>("overview");
  const [selectedFlow, setSelectedFlow] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [selectedDataFlow, setSelectedDataFlow] = useState<string | null>(null);
  const [expandedDataFlow, setExpandedDataFlow] = useState<string | null>(null);

  const graph = useMemo(() => buildGraph(SERVICES), []);

  const { affectedSet, highlightKey, visibleServices } = useMemo(() => {
    const allServices = new Set(Object.keys(SERVICES));

    if (mode === "flow" && selectedFlow) {
      const flowServices = new Set(
        Object.entries(SERVICES)
          .filter(([, service]) => (service.business_flows ?? []).includes(selectedFlow))
          .map(([key]) => key),
      );

      return {
        affectedSet: flowServices,
        highlightKey: null,
        visibleServices: flowServices,
      };
    }

    if ((mode === "blast" || mode === "upstream") && selectedService) {
      return {
        affectedSet: collectReachable(
          selectedService,
          mode === "blast" ? graph.downstream : graph.upstream,
        ),
        highlightKey: selectedService,
        visibleServices: allServices,
      };
    }

    return {
      affectedSet: allServices,
      highlightKey: null,
      visibleServices: allServices,
    };
  }, [graph, mode, selectedFlow, selectedService]);

  const layout = useMemo(
    () => computeLayout(visibleServices, SERVICES, graph),
    [graph, visibleServices],
  );

  const edges = useMemo(() => {
    const result: Array<{
      from: string;
      to: string;
      protocol?: string;
      criticality?: DependencyCriticality;
      isActive: boolean;
    }> = [];

    for (const [serviceKey, service] of Object.entries(SERVICES)) {
      for (const dependency of service.upstream ?? []) {
        if (
          visibleServices.has(serviceKey) &&
          visibleServices.has(dependency.service) &&
          layout.positions[serviceKey] &&
          layout.positions[dependency.service]
        ) {
          result.push({
            criticality: dependency.criticality,
            from: dependency.service,
            isActive: affectedSet.has(serviceKey) && affectedSet.has(dependency.service),
            protocol: dependency.protocol,
            to: serviceKey,
          });
        }
      }
    }

    return result;
  }, [affectedSet, layout.positions, visibleServices]);

  const affectedBusinessFlows = useMemo(() => {
    if (!selectedService || mode === "overview" || mode === "data") {
      return [];
    }

    const affectedServices = collectReachable(
      selectedService,
      mode === "blast" ? graph.downstream : graph.upstream,
    );
    const flowKeys = new Set<string>();

    for (const serviceKey of affectedServices) {
      for (const flowKey of SERVICES[serviceKey]?.business_flows ?? []) {
        flowKeys.add(flowKey);
      }
    }

    return [...flowKeys];
  }, [graph, mode, selectedService]);

  const affectedDataFlows = useMemo(() => {
    if (!selectedService || mode === "data") {
      return [];
    }

    return getAffectedDataFlows(selectedService, DATA_FLOWS);
  }, [mode, selectedService]);

  const filteredDataFlows = useMemo(() => {
    let entries = Object.entries(DATA_FLOWS);

    if (selectedDataFlow) {
      entries = entries.filter(([key]) => key === selectedDataFlow);
    } else if (selectedFlow && mode === "data") {
      entries = entries.filter(([, dataFlow]) => dataFlow.business_flow === selectedFlow);
    }

    return entries;
  }, [mode, selectedDataFlow, selectedFlow]);

  const selectedServiceDetails = selectedService ? SERVICES[selectedService] : null;
  const isGraphMode = graphModes.includes(mode);

  const handleServiceClick = useCallback(
    (serviceKey: string) => {
      if (mode === "overview") {
        setMode("blast");
      }

      setSelectedService(serviceKey);
    },
    [mode],
  );

  const handleTabChange = useCallback((nextMode: Mode) => {
    setMode(nextMode);

    if (nextMode === "overview") {
      setSelectedService(null);
      setSelectedFlow(null);
      setSelectedDataFlow(null);
    }

    if (nextMode === "data") {
      setSelectedDataFlow(null);
    }
  }, []);

  return (
    <div
      style={{
        background: "#0f172a",
        color: "#e2e8f0",
        fontFamily: "system-ui, -apple-system, sans-serif",
        minHeight: "100vh",
      }}
    >
      <header style={{ borderBottom: "1px solid #1e293b", padding: "16px 20px" }}>
        <div style={{ fontSize: "15px", fontWeight: 700, letterSpacing: "-0.02em" }}>
          Service Dependency Explorer
        </div>
        <div style={{ color: "#64748b", fontSize: "11px", marginTop: 2 }}>
          Click a service for blast radius and affected data flows, powered by
          {" "}
          `service_registry.yaml`
        </div>
      </header>

      <nav
        style={{
          borderBottom: "1px solid #1e293b",
          display: "flex",
          gap: 1,
          overflowX: "auto",
          padding: "12px 20px 0",
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            style={{
              background: "none",
              border: "none",
              borderBottom:
                mode === tab.key ? "2px solid #3b82f6" : "2px solid transparent",
              color: mode === tab.key ? "#e2e8f0" : "#64748b",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: "12px",
              fontWeight: 500,
              padding: "8px 14px",
              whiteSpace: "nowrap",
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <section
        style={{
          alignItems: "center",
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          padding: "12px 20px",
        }}
      >
        {mode === "flow" ? (
          <select
            onChange={(event) => setSelectedFlow(event.target.value || null)}
            style={selectStyle}
            value={selectedFlow ?? ""}
          >
            <option value="">All business flows</option>
            {Object.entries(BUSINESS_FLOWS).map(([flowKey, flow]) => (
              <option key={flowKey} value={flowKey}>
                {flow.name} ({flow.priority})
              </option>
            ))}
          </select>
        ) : null}

        {mode === "data" ? (
          <>
            <select
              onChange={(event) => {
                setSelectedFlow(event.target.value || null);
                setSelectedDataFlow(null);
              }}
              style={selectStyle}
              value={selectedFlow ?? ""}
            >
              <option value="">All business flows</option>
              {Object.entries(BUSINESS_FLOWS).map(([flowKey, flow]) => (
                <option key={flowKey} value={flowKey}>
                  {flow.name}
                </option>
              ))}
            </select>
            <select
              onChange={(event) => {
                const value = event.target.value || null;
                setSelectedDataFlow(value);
                setExpandedDataFlow(value);
              }}
              style={selectStyle}
              value={selectedDataFlow ?? ""}
            >
              <option value="">All data flows</option>
              {Object.entries(DATA_FLOWS)
                .filter(([, dataFlow]) => !selectedFlow || dataFlow.business_flow === selectedFlow)
                .map(([flowKey, dataFlow]) => (
                  <option key={flowKey} value={flowKey}>
                    {dataFlow.name}
                  </option>
                ))}
            </select>
          </>
        ) : null}

        {mode === "blast" || mode === "upstream" ? (
          <select
            onChange={(event) => setSelectedService(event.target.value || null)}
            style={selectStyle}
            value={selectedService ?? ""}
          >
            <option value="">Select a service…</option>
            {Object.entries(SERVICES).map(([serviceKey, service]) => (
              <option key={serviceKey} value={serviceKey}>
                {service.name}
              </option>
            ))}
          </select>
        ) : null}

        {affectedBusinessFlows.length > 0 ? (
          <div
            style={{
              alignItems: "center",
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
              marginLeft: "auto",
            }}
          >
            <span
              style={{
                color: "#94a3b8",
                fontSize: "10px",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              Affected flows:
            </span>
            {affectedBusinessFlows.map((flowKey) => (
              <Badge color={FLOW_COLORS[flowKey] ?? "#475569"} key={flowKey}>
                {BUSINESS_FLOWS[flowKey]?.name ?? flowKey}
              </Badge>
            ))}
          </div>
        ) : null}
      </section>

      {isGraphMode ? (
        <section style={{ overflow: "auto", padding: "0 20px" }}>
          <svg height={layout.svgH} style={{ display: "block", margin: "0 auto" }} width={layout.svgW}>
            <defs>
              <marker
                id="arrow"
                markerHeight="6"
                markerWidth="6"
                orient="auto-start-reverse"
                refX="10"
                refY="5"
                viewBox="0 0 10 10"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
              </marker>
            </defs>
            {edges.map((edge, index) => {
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
            })}
            {[...visibleServices].map((serviceKey) => {
              const position = layout.positions[serviceKey];

              if (!position) {
                return null;
              }

              return (
                <ServiceNode
                  height={layout.nodeH}
                  id={serviceKey}
                  isAffected={affectedSet.has(serviceKey)}
                  isDimmed={mode !== "overview" && !affectedSet.has(serviceKey)}
                  isHighlight={serviceKey === highlightKey}
                  key={serviceKey}
                  onSelect={handleServiceClick}
                  position={position}
                  service={SERVICES[serviceKey]}
                  width={layout.nodeW}
                />
              );
            })}
          </svg>
        </section>
      ) : null}

      {mode === "data" ? (
        <section style={{ padding: "0 20px 20px" }}>
          {filteredDataFlows.length === 0 ? (
            <div style={{ color: "#64748b", padding: 40, textAlign: "center" }}>
              No data flows found for this filter.
            </div>
          ) : null}

          {filteredDataFlows.map(([flowKey, dataFlow]) => {
            const isExpanded = expandedDataFlow === flowKey || selectedDataFlow === flowKey;

            return (
              <div key={flowKey} style={{ ...panelStyle({ marginBottom: 12 }), overflow: "hidden" }}>
                <div
                  onClick={() => setExpandedDataFlow(isExpanded ? null : flowKey)}
                  style={{
                    alignItems: "center",
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "12px 16px",
                  }}
                >
                  <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <span style={{ fontSize: "13px", fontWeight: 600 }}>{dataFlow.name}</span>
                    <Badge color={FLOW_COLORS[dataFlow.business_flow] ?? "#475569"}>
                      {BUSINESS_FLOWS[dataFlow.business_flow]?.name ?? dataFlow.business_flow}
                    </Badge>
                    <Tag>
                      {DATA_TYPE_ICONS[dataFlow.data_type] ?? "?"} {dataFlow.data_type}
                    </Tag>
                    <Tag color={SENSITIVITY_COLORS[dataFlow.sensitivity] ?? "#475569"}>
                      {dataFlow.sensitivity}
                    </Tag>
                    <Tag>{dataFlow.freshness}</Tag>
                    <Tag color="#334155">{dataFlow.stages.length} stages</Tag>
                  </div>
                  <span
                    style={{
                      color: "#64748b",
                      fontSize: "16px",
                      transform: isExpanded ? "rotate(180deg)" : "rotate(0)",
                      transition: "transform 0.2s",
                    }}
                  >
                    ▾
                  </span>
                </div>

                {isExpanded ? (
                  <div style={{ borderTop: "1px solid #334155" }}>
                    <div style={{ color: "#94a3b8", fontSize: "11px", padding: "8px 16px" }}>
                      {dataFlow.description}
                    </div>
                    <DataFlowPipeline
                      dataFlow={dataFlow}
                      onSelectService={setSelectedService}
                      selectedService={selectedService}
                    />
                    <div style={{ overflowX: "auto", padding: "0 16px 12px" }}>
                      <table style={{ borderCollapse: "collapse", fontSize: "10px", width: "100%" }}>
                        <thead>
                          <tr
                            style={{
                              color: "#64748b",
                              letterSpacing: "0.05em",
                              textTransform: "uppercase",
                            }}
                          >
                            {["#", "Service", "Action", "Format", "Notes"].map((heading) => (
                              <th
                                key={heading}
                                style={{
                                  borderBottom: "1px solid #334155",
                                  padding: "4px 8px",
                                  textAlign: "left",
                                }}
                              >
                                {heading}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {dataFlow.stages.map((stage, index) => (
                            <tr
                              key={`${stage.service}-${index}`}
                              onClick={() => setSelectedService(stage.service)}
                              style={{ color: "#cbd5e1", cursor: "pointer" }}
                            >
                              <td style={tableCellStyle}>{index + 1}</td>
                              <td style={{ ...tableCellStyle, fontWeight: 600 }}>
                                {SERVICES[stage.service]?.name ?? stage.service}
                              </td>
                              <td style={tableCellStyle}>
                                <span
                                  style={{
                                    background: ACTION_COLORS[stage.action] ?? "#475569",
                                    borderRadius: 3,
                                    color: "#fff",
                                    fontSize: "9px",
                                    padding: "1px 6px",
                                  }}
                                >
                                  {stage.action}
                                </span>
                              </td>
                              <td style={{ ...tableCellStyle, fontFamily: "monospace" }}>
                                {stage.format}
                              </td>
                              <td style={{ ...tableCellStyle, color: "#94a3b8" }}>{stage.notes}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </section>
      ) : null}

      {selectedServiceDetails && isGraphMode && (mode === "blast" || mode === "upstream") ? (
        <section style={{ ...panelStyle({ margin: "16px 20px", padding: "14px 18px" }) }}>
          <div
            style={{
              alignItems: "start",
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ fontSize: "14px", fontWeight: 600 }}>{selectedServiceDetails.name}</div>
              <div style={{ color: "#94a3b8", fontSize: "11px", marginTop: 2 }}>
                {selectedServiceDetails.type} · {selectedServiceDetails.status}
              </div>
            </div>
            <Badge color={mode === "blast" ? "#dc2626" : "#2563eb"}>
              {mode === "blast"
                ? `${affectedSet.size - 1} downstream affected`
                : `${affectedSet.size - 1} upstream deps`}
            </Badge>
          </div>

          {(selectedServiceDetails.upstream?.length ?? 0) > 0 ? (
            <div style={{ marginTop: 10 }}>
              <div style={sectionLabelStyle}>Direct dependencies</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {selectedServiceDetails.upstream?.map((dependency) => (
                  <Tag
                    color={dependency.criticality === "hard" ? "#991b1b" : "#44403c"}
                    key={`${selectedService}-${dependency.service}`}
                  >
                    {dependency.service} ({dependency.protocol}, {dependency.criticality})
                  </Tag>
                ))}
              </div>
            </div>
          ) : null}

          {affectedDataFlows.length > 0 ? (
            <div style={{ marginTop: 12 }}>
              <div style={sectionLabelStyle}>Data flows through this service</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {affectedDataFlows.map(([flowKey, dataFlow]) => (
                  <span
                    key={flowKey}
                    onClick={() => {
                      setMode("data");
                      setSelectedDataFlow(flowKey);
                      setExpandedDataFlow(flowKey);
                    }}
                    style={{
                      background: "#0f172a",
                      border: "1px solid #475569",
                      borderRadius: 4,
                      color: "#e2e8f0",
                      cursor: "pointer",
                      fontSize: "10px",
                      fontWeight: 500,
                      padding: "3px 10px",
                    }}
                  >
                    {DATA_TYPE_ICONS[dataFlow.data_type] ?? "?"} {dataFlow.name}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <footer
        style={{
          borderTop: "1px solid #1e293b",
          color: "#64748b",
          display: "flex",
          flexWrap: "wrap",
          fontSize: "10px",
          gap: 12,
          padding: "12px 20px",
        }}
      >
        {mode !== "data"
          ? [
              ...Object.entries(STATUS_STYLES).map(([status, style]) => (
                <span
                  key={status}
                  style={{ alignItems: "center", display: "flex", gap: 4 }}
                >
                  <span
                    style={{
                      background: style.bg,
                      borderRadius: 2,
                      height: 10,
                      width: 10,
                    }}
                  />
                  {status}
                </span>
              )),
              <span key="hard" style={{ alignItems: "center", display: "flex", gap: 4 }}>
                <span style={{ borderBottom: "2px solid #94a3b8", width: 16 }} />
                hard
              </span>,
              <span key="soft" style={{ alignItems: "center", display: "flex", gap: 4 }}>
                <span style={{ borderBottom: "2px dashed #94a3b8", width: 16 }} />
                soft
              </span>,
              ...Object.entries(TYPE_ICONS).map(([type, icon]) => (
                <span key={type}>
                  {icon} {type}
                </span>
              )),
            ]
          : Object.entries(ACTION_COLORS).map(([action, color]) => (
              <span key={action} style={{ alignItems: "center", display: "flex", gap: 4 }}>
                <span style={{ background: color, borderRadius: 2, height: 10, width: 10 }} />
                {action}
              </span>
            ))}
      </footer>
    </div>
  );
}

const selectStyle: CSSProperties = {
  background: "#1e293b",
  border: "1px solid #334155",
  borderRadius: 4,
  color: "#e2e8f0",
  fontFamily: "inherit",
  fontSize: "12px",
  padding: "6px 10px",
};

const tableCellStyle: CSSProperties = {
  borderBottom: "1px solid #1e293b",
  padding: "4px 8px",
};

const sectionLabelStyle: CSSProperties = {
  color: "#64748b",
  fontSize: "10px",
  letterSpacing: "0.05em",
  marginBottom: 4,
  textTransform: "uppercase",
};
