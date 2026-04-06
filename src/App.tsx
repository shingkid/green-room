import Ajv2020, { type ErrorObject } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type ReactNode,
} from "react";
import { LineCounter, isMap, isSeq, parseDocument } from "yaml";

import registrySchema from "../service_registry.schema.json";

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
type Theme = "light" | "dark";

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

type ValidationIssue = {
  message: string;
  path: string;
  location: string | null;
  severity: "error";
};

type ValidationResult = {
  issues: ValidationIssue[];
  registry: Registry | null;
};

type InitialLoadResult = {
  sourceLabel: string;
  sourceText: string;
};

type SelectOption = {
  label: string;
  searchText?: string;
  value: string;
};

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
const REGISTRY_URL_CANDIDATES = ["/service_registry.yaml", "/service-registry.yaml"];
const LOCAL_STORAGE_DRAFT_KEY = "service-catalog.registry-draft";
const LOCAL_STORAGE_THEME_KEY = "service-catalog.theme";

const DEFAULT_REGISTRY_TEMPLATE = `metadata:
  team: Platform Engineering
  last_updated: 2026-04-06
  maintainers:
    - name: Jane Doe
      slack: "@jane"

business_flows:
  example_flow:
    name: Example Flow
    description: Replace this placeholder with a real business journey.
    priority: P1
    stakeholders:
      - Product

data_flows:
  example_data_flow:
    name: Example Data Flow
    description: Describe how data moves between services.
    business_flow: example_flow
    data_type: event
    sensitivity: internal
    freshness: near-real-time
    stages:
      - service: example_ui
        action: produces
        format: JSON
      - service: example_api
        action: transforms
        format: JSON

services:
  example_ui:
    name: Example UI
    description: User-facing application.
    type: frontend
    status: active
    upstream:
      - service: example_api
        protocol: HTTPS
        criticality: hard
    business_flows:
      - example_flow
    owner: Web Platform
    runbook: https://example.com/runbooks/example-ui
    health_check: https://example.com/health/example-ui
    port: 443

  example_api:
    name: Example API
    description: Backend API for the example flow.
    type: backend
    status: active
    upstream: []
    business_flows:
      - example_flow
    owner: API Platform
    runbook: https://example.com/runbooks/example-api
    health_check: https://example.com/health/example-api
    port: 8080
`;

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
});

addFormats(ajv);

const validateSchema = ajv.compile(registrySchema);

function getPreferredTheme(): Theme {
  if (typeof window === "undefined") {
    return "dark";
  }

  const storedTheme = window.localStorage.getItem(LOCAL_STORAGE_THEME_KEY);

  if (storedTheme === "light" || storedTheme === "dark") {
    return storedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function escapeJsonPointerSegment(segment: string) {
  return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}

function decodeJsonPointerSegment(segment: string) {
  return segment.replaceAll("~1", "/").replaceAll("~0", "~");
}

function toPointer(path: string[]) {
  return path.length === 0 ? "" : `/${path.map(escapeJsonPointerSegment).join("/")}`;
}

function formatLocation(line: number, column: number) {
  return `line ${line}, col ${column}`;
}

function pointerToLabel(pointer: string) {
  if (!pointer) {
    return "(root)";
  }

  return pointer
    .split("/")
    .slice(1)
    .map(decodeJsonPointerSegment)
    .join(" > ");
}

function nearestLocation(
  locations: Map<string, string>,
  pointer: string,
  fallbackRoot: string | null,
): string | null {
  let current = pointer;

  while (true) {
    const found = locations.get(current);

    if (found) {
      return found;
    }

    if (current === "") {
      return fallbackRoot;
    }

    const lastSlash = current.lastIndexOf("/");
    current = lastSlash <= 0 ? "" : current.slice(0, lastSlash);
  }
}

function collectNodeLocations(
  node: any,
  path: string[],
  lineCounter: LineCounter,
  locations: Map<string, string>,
) {
  if (!node) {
    return;
  }

  const [start] = node.range ?? [];

  if (typeof start === "number") {
    const pos = lineCounter.linePos(start);
    locations.set(toPointer(path), formatLocation(pos.line, pos.col));
  }

  if (isMap(node)) {
    for (const item of node.items) {
      const key = String(item.key?.value ?? "");
      collectNodeLocations(item.value, [...path, key], lineCounter, locations);
    }
    return;
  }

  if (isSeq(node)) {
    node.items.forEach((item: any, index: number) => {
      collectNodeLocations(item, [...path, String(index)], lineCounter, locations);
    });
  }
}

function formatSchemaIssue(
  error: ErrorObject,
  locations: Map<string, string>,
  rootLocation: string | null,
) {
  let pointer = error.instancePath ?? "";

  if (error.keyword === "required" && typeof error.params === "object") {
    const missingProperty = (error.params as { missingProperty?: string }).missingProperty;

    if (missingProperty) {
      pointer = `${pointer}/${escapeJsonPointerSegment(missingProperty)}`;
    }
  }

  if (error.keyword === "additionalProperties" && typeof error.params === "object") {
    const additionalProperty = (error.params as { additionalProperty?: string }).additionalProperty;

    if (additionalProperty) {
      pointer = `${pointer}/${escapeJsonPointerSegment(additionalProperty)}`;
    }
  }

  return {
    location: nearestLocation(locations, pointer, rootLocation),
    message: error.message ?? "Schema validation failed.",
    path: pointer,
    severity: "error" as const,
  };
}

function addReferenceIssue(
  issues: ValidationIssue[],
  locations: Map<string, string>,
  rootLocation: string | null,
  path: string[],
  message: string,
) {
  const pointer = toPointer(path);

  issues.push({
    location: nearestLocation(locations, pointer, rootLocation),
    message,
    path: pointer,
    severity: "error",
  });
}

function validateCrossReferences(
  registry: Registry,
  locations: Map<string, string>,
  rootLocation: string | null,
) {
  const issues: ValidationIssue[] = [];
  const businessFlowKeys = new Set(Object.keys(registry.business_flows));
  const serviceKeys = new Set(Object.keys(registry.services));

  for (const [serviceKey, service] of Object.entries(registry.services)) {
    for (const [index, flowKey] of (service.business_flows ?? []).entries()) {
      if (!businessFlowKeys.has(flowKey)) {
        addReferenceIssue(
          issues,
          locations,
          rootLocation,
          ["services", serviceKey, "business_flows", String(index)],
          `Unknown business flow "${flowKey}".`,
        );
      }
    }

    for (const [index, dependency] of (service.upstream ?? []).entries()) {
      if (!serviceKeys.has(dependency.service)) {
        addReferenceIssue(
          issues,
          locations,
          rootLocation,
          ["services", serviceKey, "upstream", String(index), "service"],
          `Unknown upstream service "${dependency.service}".`,
        );
      }
    }
  }

  for (const [flowKey, flow] of Object.entries(registry.data_flows)) {
    if (!businessFlowKeys.has(flow.business_flow)) {
      addReferenceIssue(
        issues,
        locations,
        rootLocation,
        ["data_flows", flowKey, "business_flow"],
        `Unknown business flow "${flow.business_flow}".`,
      );
    }

    for (const [index, stage] of flow.stages.entries()) {
      if (!serviceKeys.has(stage.service)) {
        addReferenceIssue(
          issues,
          locations,
          rootLocation,
          ["data_flows", flowKey, "stages", String(index), "service"],
          `Unknown stage service "${stage.service}".`,
        );
      }
    }
  }

  return issues;
}

function validateRegistryText(sourceText: string): ValidationResult {
  const lineCounter = new LineCounter();
  const doc = parseDocument(sourceText, {
    lineCounter,
    prettyErrors: false,
    strict: false,
  });
  const locations = new Map<string, string>();

  if (doc.contents) {
    collectNodeLocations(doc.contents, [], lineCounter, locations);
  }

  const rootLocation = locations.get("") ?? null;
  const parseIssues: ValidationIssue[] = (doc.errors ?? []).map((error: any) => {
    const position =
      typeof error.pos?.[0] === "number" ? lineCounter.linePos(error.pos[0]) : null;

    return {
      location: position ? formatLocation(position.line, position.col) : rootLocation,
      message: error.message,
      path: "",
      severity: "error",
    };
  });

  if (parseIssues.length > 0) {
    return {
      issues: parseIssues,
      registry: null,
    };
  }

  const raw = doc.toJS();
  const isValid = validateSchema(raw);
  const schemaIssues = !isValid
    ? (validateSchema.errors ?? []).map((error) =>
        formatSchemaIssue(error, locations, rootLocation),
      )
    : [];

  if (schemaIssues.length > 0) {
    return {
      issues: schemaIssues,
      registry: null,
    };
  }

  const registry = raw as Registry;
  const referenceIssues = validateCrossReferences(registry, locations, rootLocation);

  if (referenceIssues.length > 0) {
    return {
      issues: referenceIssues,
      registry: null,
    };
  }

  return {
    issues: [],
    registry,
  };
}

async function loadInitialRegistrySource(): Promise<InitialLoadResult | null> {
  for (const url of REGISTRY_URL_CANDIDATES) {
    const response = await fetch(url, { cache: "no-store" });

    if (response.ok) {
      return {
        sourceLabel: url,
        sourceText: await response.text(),
      };
    }

    if (response.status !== 404) {
      throw new Error(`Failed to load ${url}: ${response.status} ${response.statusText}`);
    }
  }

  return null;
}

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
    svgH: 60 + layers.length * (nodeH + gapY) + 40,
    svgW: totalWidth + 40,
    nodeH,
    nodeW,
  };
}

function formatServiceLabel(name: string, limit: number) {
  return name.length > limit ? `${name.slice(0, limit - 1)}…` : name;
}

function normalizeSearchText(value: string) {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, " ").trim();
}

function matchesFuzzy(label: string, query: string, extraSearchText?: string) {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return true;
  }

  const haystack = normalizeSearchText(`${label} ${extraSearchText ?? ""}`);
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);

  return tokens.every((token) => haystack.includes(token));
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

type BadgeProps = {
  color: string;
  children: ReactNode;
  onClick?: () => void;
};

function Badge({ color, children, onClick }: BadgeProps) {
  return (
    <span
      className={`badge${onClick ? " badge-clickable" : ""}`}
      onClick={onClick}
      style={{ "--badge-color": color } as CSSProperties}
    >
      {children}
    </span>
  );
}

type TagProps = {
  children: ReactNode;
  color?: string;
};

function Tag({ children, color = "var(--tag-neutral)" }: TagProps) {
  return (
    <span className="tag" style={{ "--tag-color": color } as CSSProperties}>
      {children}
    </span>
  );
}

type SearchableSelectProps = {
  allLabel: string;
  ariaLabel: string;
  emptyMessage: string;
  onChange: (value: string | null) => void;
  options: SelectOption[];
  placeholder: string;
  value: string | null;
};

function SearchableSelect({
  allLabel,
  ariaLabel,
  emptyMessage,
  onChange,
  options,
  placeholder,
  value,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const selectedOption = options.find((option) => option.value === value) ?? null;
  const filteredOptions = useMemo(
    () =>
      options.filter((option) =>
        matchesFuzzy(option.label, query, option.searchText),
      ),
    [options, query],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    inputRef.current?.focus();

    function handleClickOutside(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery("");
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        setQuery("");
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const handleSelect = useCallback(
    (nextValue: string | null) => {
      onChange(nextValue);
      setIsOpen(false);
      setQuery("");
    },
    [onChange],
  );

  return (
    <div className="searchable-select" ref={rootRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className={`searchable-select-trigger${isOpen ? " searchable-select-trigger-open" : ""}`}
        onClick={() => setIsOpen((open) => !open)}
        type="button"
      >
        <span className={selectedOption ? "" : "searchable-select-placeholder"}>
          {selectedOption?.label ?? placeholder}
        </span>
        <span className="searchable-select-chevron">▾</span>
      </button>

      {isOpen ? (
        <div className="searchable-select-menu">
          <input
            aria-label={ariaLabel}
            className="searchable-select-input"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${ariaLabel.toLowerCase()}...`}
            ref={inputRef}
            value={query}
          />
          <div className="searchable-select-options" role="listbox">
            <button
              className={`searchable-select-option${value === null ? " searchable-select-option-active" : ""}`}
              onClick={() => handleSelect(null)}
              type="button"
            >
              {allLabel}
            </button>
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <button
                  className={`searchable-select-option${option.value === value ? " searchable-select-option-active" : ""}`}
                  key={option.value}
                  onClick={() => handleSelect(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))
            ) : (
              <div className="searchable-select-empty">{emptyMessage}</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
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
      className="service-node"
      onClick={() => onSelect(id)}
      opacity={isDimmed ? 0.15 : 1}
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
        stroke={isActive ? "var(--graph-edge-active)" : "var(--graph-edge)"}
        strokeDasharray={criticality === "soft" ? "4 3" : "none"}
        strokeWidth={isActive ? 2 : 1}
      />
      {protocol && isActive ? (
        <text
          fill="var(--graph-edge-label)"
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
  services: Record<string, Service>;
  onSelectService: (serviceKey: string) => void;
};

function DataFlowPipeline({
  dataFlow,
  selectedService,
  services,
  onSelectService,
}: DataFlowPipelineProps) {
  const stageW = 130;
  const stageH = 72;
  const arrowW = 40;
  const gap = 12;
  const totalW = dataFlow.stages.length * (stageW + arrowW + gap) - arrowW - gap;

  return (
    <div className="pipeline-scroll">
      <svg height={stageH + 20} width={Math.max(totalW + 40, 300)}>
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
            <path d="M0 0 L10 5 L0 10 z" fill="var(--pipeline-arrow)" />
          </marker>
        </defs>
        {dataFlow.stages.map((stage, index) => {
          const x = 20 + index * (stageW + arrowW + gap);
          const service = services[stage.service];
          const isSelected = stage.service === selectedService;

          return (
            <g key={`${stage.service}-${index}`}>
              <g className="pipeline-stage" onClick={() => onSelectService(stage.service)}>
                <rect
                  fill={
                    isSelected
                      ? "var(--pipeline-stage-bg-selected)"
                      : "var(--pipeline-stage-bg)"
                  }
                  height={stageH}
                  rx={8}
                  stroke={
                    isSelected
                      ? "var(--pipeline-stage-stroke-selected)"
                      : "var(--pipeline-stage-stroke)"
                  }
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
                  fill="var(--text-primary)"
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
                  fill="var(--text-subtle)"
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
                  stroke="var(--pipeline-arrow)"
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

type RegistryEditorProps = {
  theme: Theme;
  draftText: string;
  issues: ValidationIssue[];
  onApply: () => void;
  onChange: (value: string) => void;
  onClose?: () => void;
  onDownload: () => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onToggleTheme: () => void;
  canApply: boolean;
  sourceLabel: string | null;
};

function RegistryEditor({
  theme,
  draftText,
  issues,
  onApply,
  onChange,
  onClose,
  onDownload,
  onImport,
  onToggleTheme,
  canApply,
  sourceLabel,
}: RegistryEditorProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="editor-shell">
      <div className="editor-header">
        <div>
          <div className="app-title">Registry Editor</div>
          <div className="app-subtitle">
            {sourceLabel
              ? `Editing ${sourceLabel}. Validation runs on every change.`
              : "No registry file was found. Paste or upload one below."}
          </div>
        </div>
        <div className="header-actions">
          <button
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            aria-pressed={theme === "dark"}
            className="secondary-button theme-toggle-button"
            onClick={onToggleTheme}
            type="button"
          >
            <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
          </button>
          <button className="secondary-button" onClick={() => inputRef.current?.click()} type="button">
            Import YAML
          </button>
          <button className="secondary-button" onClick={onDownload} type="button">
            Download YAML
          </button>
          {onClose ? (
            <button className="secondary-button" onClick={onClose} type="button">
              Back to explorer
            </button>
          ) : null}
          <button className="primary-button" disabled={!canApply} onClick={onApply} type="button">
            {canApply ? "Use this registry" : "Fix validation errors"}
          </button>
          <input
            accept=".yaml,.yml,text/yaml,text/x-yaml"
            className="hidden-file-input"
            onChange={onImport}
            ref={inputRef}
            type="file"
          />
        </div>
      </div>

      <div className="editor-layout">
        <section className="editor-pane">
          <div className="pane-title">YAML</div>
          <textarea
            className="editor-textarea"
            onChange={(event) => onChange(event.target.value)}
            spellCheck={false}
            value={draftText}
          />
        </section>

        <section className="editor-pane">
          <div className="pane-title">Validation</div>
          {issues.length === 0 ? (
            <div className="validation-ok">
              <div className="validation-ok-title">Schema validation passed.</div>
              <div className="validation-ok-body">
                The registry is syntactically valid, matches the schema, and all known references resolve.
              </div>
            </div>
          ) : (
            <div className="validation-list">
              {issues.map((issue, index) => (
                <div className="validation-item" key={`${issue.path}-${issue.message}-${index}`}>
                  <div className="validation-item-header">
                    <span className="validation-severity">Error</span>
                    {issue.location ? (
                      <span className="validation-location">{issue.location}</span>
                    ) : null}
                  </div>
                  <div className="validation-message">{issue.message}</div>
                  <div className="validation-path">{pointerToLabel(issue.path)}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

type CatalogViewProps = {
  theme: Theme;
  registry: Registry;
  sourceLabel: string | null;
  onEditRegistry: () => void;
  onToggleTheme: () => void;
};

function CatalogView({
  theme,
  registry,
  sourceLabel,
  onEditRegistry,
  onToggleTheme,
}: CatalogViewProps) {
  const services = registry.services;
  const businessFlows = registry.business_flows;
  const dataFlows = registry.data_flows;

  const [mode, setMode] = useState<Mode>("overview");
  const [selectedStakeholder, setSelectedStakeholder] = useState<string | null>(null);
  const [selectedFlow, setSelectedFlow] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [selectedDataFlow, setSelectedDataFlow] = useState<string | null>(null);
  const [expandedDataFlow, setExpandedDataFlow] = useState<string | null>(null);

  const graph = useMemo(() => buildGraph(services), [services]);
  const stakeholderOptions = useMemo(() => {
    const stakeholders = new Set<string>();

    for (const flow of Object.values(businessFlows)) {
      for (const stakeholder of flow.stakeholders) {
        stakeholders.add(stakeholder);
      }
    }

    return [...stakeholders]
      .sort((left, right) => left.localeCompare(right))
      .map((stakeholder) => ({
        label: stakeholder,
        value: stakeholder,
      }));
  }, [businessFlows]);
  const eligibleFlowEntries = useMemo(
    () =>
      Object.entries(businessFlows).filter(
        ([, flow]) =>
          !selectedStakeholder || flow.stakeholders.includes(selectedStakeholder),
      ),
    [businessFlows, selectedStakeholder],
  );
  const eligibleFlowKeys = useMemo(
    () => new Set(eligibleFlowEntries.map(([flowKey]) => flowKey)),
    [eligibleFlowEntries],
  );
  const businessFlowOptions = useMemo(
    () =>
      eligibleFlowEntries.map(([flowKey, flow]) => ({
        label: `${flow.name} (${flow.priority})`,
        searchText: `${flowKey} ${flow.description} ${flow.stakeholders.join(" ")}`,
        value: flowKey,
      })),
    [eligibleFlowEntries],
  );
  const dataBusinessFlowOptions = useMemo(
    () =>
      eligibleFlowEntries.map(([flowKey, flow]) => ({
        label: flow.name,
        searchText: `${flowKey} ${flow.description} ${flow.stakeholders.join(" ")}`,
        value: flowKey,
      })),
    [eligibleFlowEntries],
  );
  const serviceOptions = useMemo(
    () =>
      Object.entries(services)
        .map(([serviceKey, service]) => ({
          label: service.name,
          searchText: `${serviceKey} ${service.type} ${service.status} ${service.description}`,
          value: serviceKey,
        }))
        .sort((left, right) => left.label.localeCompare(right.label)),
    [services],
  );
  const eligibleDataFlowEntries = useMemo(
    () =>
      Object.entries(dataFlows).filter(
        ([, dataFlow]) =>
          eligibleFlowKeys.has(dataFlow.business_flow) &&
          (!selectedFlow || dataFlow.business_flow === selectedFlow),
      ),
    [dataFlows, eligibleFlowKeys, selectedFlow],
  );
  const dataFlowOptions = useMemo(
    () =>
      eligibleDataFlowEntries.map(([flowKey, dataFlow]) => ({
        label: dataFlow.name,
        searchText: `${flowKey} ${dataFlow.description} ${dataFlow.data_type} ${dataFlow.sensitivity}`,
        value: flowKey,
      })),
    [eligibleDataFlowEntries],
  );

  useEffect(() => {
    if (selectedFlow && !eligibleFlowKeys.has(selectedFlow)) {
      setSelectedFlow(null);
    }
  }, [eligibleFlowKeys, selectedFlow]);

  useEffect(() => {
    const validDataFlowKeys = new Set(eligibleDataFlowEntries.map(([flowKey]) => flowKey));

    if (selectedDataFlow && !validDataFlowKeys.has(selectedDataFlow)) {
      setSelectedDataFlow(null);
    }
  }, [eligibleDataFlowEntries, selectedDataFlow]);

  const { affectedSet, highlightKey, visibleServices } = useMemo(() => {
    const allServices = new Set(Object.keys(services));

    if (mode === "flow") {
      const flowServices = new Set(
        Object.entries(services)
          .filter(([, service]) => {
            const flowKeys = service.business_flows ?? [];

            if (selectedFlow) {
              return flowKeys.includes(selectedFlow);
            }

            if (selectedStakeholder) {
              return flowKeys.some((flowKey) => eligibleFlowKeys.has(flowKey));
            }

            return true;
          })
          .map(([key]) => key),
      );

      return {
        affectedSet: flowServices,
        highlightKey: null,
        visibleServices: selectedFlow || selectedStakeholder ? flowServices : allServices,
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
  }, [eligibleFlowKeys, graph, mode, selectedFlow, selectedService, selectedStakeholder, services]);

  const layout = useMemo(
    () => computeLayout(visibleServices, services, graph),
    [graph, services, visibleServices],
  );

  const edges = useMemo(() => {
    const result: Array<{
      from: string;
      to: string;
      protocol?: string;
      criticality?: DependencyCriticality;
      isActive: boolean;
    }> = [];

    for (const [serviceKey, service] of Object.entries(services)) {
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
  }, [affectedSet, layout.positions, services, visibleServices]);

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
      for (const flowKey of services[serviceKey]?.business_flows ?? []) {
        flowKeys.add(flowKey);
      }
    }

    return [...flowKeys];
  }, [graph, mode, selectedService, services]);

  const affectedDataFlows = useMemo(() => {
    if (!selectedService || mode === "data") {
      return [];
    }

    return getAffectedDataFlows(selectedService, dataFlows);
  }, [dataFlows, mode, selectedService]);

  const filteredDataFlows = useMemo(() => {
    let entries = eligibleDataFlowEntries;

    if (selectedDataFlow) {
      entries = entries.filter(([key]) => key === selectedDataFlow);
    }

    return entries;
  }, [eligibleDataFlowEntries, selectedDataFlow]);

  const selectedServiceDetails = selectedService ? services[selectedService] : null;
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
      setSelectedStakeholder(null);
      setSelectedService(null);
      setSelectedFlow(null);
      setSelectedDataFlow(null);
    }

    if (nextMode === "data") {
      setSelectedDataFlow(null);
    }
  }, []);

  return (
    <div className="app-shell" data-theme={theme}>
      <header className="app-header">
        <div className="header-row">
          <div>
            <div className="app-title">Service Dependency Explorer</div>
            <div className="app-subtitle">
              {sourceLabel
                ? `Loaded from ${sourceLabel}. Edit the registry to validate and preview changes in-browser.`
                : "Click a service for blast radius and affected data flows."}
            </div>
          </div>
          <div className="header-actions">
            <button
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
              aria-pressed={theme === "dark"}
              className="secondary-button theme-toggle-button"
              onClick={onToggleTheme}
              type="button"
            >
              <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
            </button>
            <button className="secondary-button" onClick={onEditRegistry} type="button">
              Edit registry
            </button>
          </div>
        </div>
      </header>

      <nav className="app-tabs">
        {TABS.map((tab) => (
          <button
            className={`app-tab${mode === tab.key ? " app-tab-active" : ""}`}
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <section className="control-bar">
        {mode === "flow" || mode === "data" ? (
          <SearchableSelect
            allLabel="All stakeholders"
            ariaLabel="stakeholders"
            emptyMessage="No stakeholders match."
            onChange={setSelectedStakeholder}
            options={stakeholderOptions}
            placeholder="Filter by stakeholder"
            value={selectedStakeholder}
          />
        ) : null}

        {mode === "flow" ? (
          <SearchableSelect
            allLabel="All business flows"
            ariaLabel="business flows"
            emptyMessage="No business flows match."
            onChange={setSelectedFlow}
            options={businessFlowOptions}
            placeholder="Filter business flows"
            value={selectedFlow}
          />
        ) : null}

        {mode === "data" ? (
          <>
            <SearchableSelect
              allLabel="All business flows"
              ariaLabel="business flows"
              emptyMessage="No business flows match."
              onChange={(value) => {
                setSelectedFlow(value);
                setSelectedDataFlow(null);
              }}
              options={dataBusinessFlowOptions}
              placeholder="Filter business flows"
              value={selectedFlow}
            />
            <SearchableSelect
              allLabel="All data flows"
              ariaLabel="data flows"
              emptyMessage="No data flows match."
              onChange={(value) => {
                setSelectedDataFlow(value);
                setExpandedDataFlow(value);
              }}
              options={dataFlowOptions}
              placeholder="Filter data flows"
              value={selectedDataFlow}
            />
          </>
        ) : null}

        {mode === "blast" || mode === "upstream" ? (
          <SearchableSelect
            allLabel="All services"
            ariaLabel="services"
            emptyMessage="No services match."
            onChange={setSelectedService}
            options={serviceOptions}
            placeholder="Select a service"
            value={selectedService}
          />
        ) : null}

        {affectedBusinessFlows.length > 0 ? (
          <div className="flow-summary">
            <span className="overline">Affected flows:</span>
            {affectedBusinessFlows.map((flowKey) => (
              <Badge color={FLOW_COLORS[flowKey] ?? "#475569"} key={flowKey}>
                {businessFlows[flowKey]?.name ?? flowKey}
              </Badge>
            ))}
          </div>
        ) : null}
      </section>

      {isGraphMode ? (
        <section className="graph-section">
          <svg className="graph-canvas" height={layout.svgH} width={layout.svgW}>
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
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--graph-arrow)" />
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
                  service={services[serviceKey]}
                  width={layout.nodeW}
                />
              );
            })}
          </svg>
        </section>
      ) : null}

      {mode === "data" ? (
        <section className="data-section">
          {filteredDataFlows.length === 0 ? (
            <div className="empty-state">No data flows found for this filter.</div>
          ) : null}

          {filteredDataFlows.map(([flowKey, dataFlow]) => {
            const isExpanded = expandedDataFlow === flowKey || selectedDataFlow === flowKey;

            return (
              <div className="panel" key={flowKey} style={{ marginBottom: 12, overflow: "hidden" }}>
                <div
                  className="panel-header"
                  onClick={() => setExpandedDataFlow(isExpanded ? null : flowKey)}
                >
                  <div className="panel-header-main">
                    <span className="panel-title">{dataFlow.name}</span>
                    <Badge color={FLOW_COLORS[dataFlow.business_flow] ?? "#475569"}>
                      {businessFlows[dataFlow.business_flow]?.name ?? dataFlow.business_flow}
                    </Badge>
                    <Tag>
                      {DATA_TYPE_ICONS[dataFlow.data_type] ?? "?"} {dataFlow.data_type}
                    </Tag>
                    <Tag color={SENSITIVITY_COLORS[dataFlow.sensitivity] ?? "#475569"}>
                      {dataFlow.sensitivity}
                    </Tag>
                    <Tag>{dataFlow.freshness}</Tag>
                    <Tag color="var(--tag-neutral)">{dataFlow.stages.length} stages</Tag>
                  </div>
                  <span className={`panel-chevron${isExpanded ? " panel-chevron-expanded" : ""}`}>
                    ▾
                  </span>
                </div>

                {isExpanded ? (
                  <div className="panel-body">
                    <div className="panel-description">{dataFlow.description}</div>
                    <DataFlowPipeline
                      dataFlow={dataFlow}
                      onSelectService={setSelectedService}
                      selectedService={selectedService}
                      services={services}
                    />
                    <div className="table-scroll">
                      <table className="dataflow-table">
                        <thead>
                          <tr className="dataflow-header">
                            {["#", "Service", "Action", "Format", "Notes"].map((heading) => (
                              <th key={heading}>{heading}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {dataFlow.stages.map((stage, index) => (
                            <tr
                              className="dataflow-row"
                              key={`${stage.service}-${index}`}
                              onClick={() => setSelectedService(stage.service)}
                            >
                              <td>{index + 1}</td>
                              <td className="dataflow-service-cell">
                                {services[stage.service]?.name ?? stage.service}
                              </td>
                              <td>
                                <span
                                  className="action-pill"
                                  style={
                                    { "--action-color": ACTION_COLORS[stage.action] ?? "#475569" } as CSSProperties
                                  }
                                >
                                  {stage.action}
                                </span>
                              </td>
                              <td className="mono-cell">{stage.format}</td>
                              <td className="muted-cell">{stage.notes}</td>
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
        <section className="panel details-panel">
          <div className="details-header">
            <div>
              <div className="details-title">{selectedServiceDetails.name}</div>
              <div className="details-meta">
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
            <div className="details-section">
              <div className="overline">Direct dependencies</div>
              <div className="tag-row">
                {selectedServiceDetails.upstream?.map((dependency) => (
                  <Tag
                    color={
                      dependency.criticality === "hard"
                        ? "var(--tag-critical)"
                        : "var(--tag-muted)"
                    }
                    key={`${selectedService}-${dependency.service}`}
                  >
                    {dependency.service} ({dependency.protocol}, {dependency.criticality})
                  </Tag>
                ))}
              </div>
            </div>
          ) : null}

          {affectedDataFlows.length > 0 ? (
            <div className="details-section">
              <div className="overline">Data flows through this service</div>
              <div className="tag-row">
                {affectedDataFlows.map(([flowKey, dataFlow]) => (
                  <span
                    className="link-tag"
                    key={flowKey}
                    onClick={() => {
                      setMode("data");
                      setSelectedDataFlow(flowKey);
                      setExpandedDataFlow(flowKey);
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

      <footer className="app-footer">
        {mode !== "data"
          ? [
              ...Object.entries(STATUS_STYLES).map(([status, style]) => (
                <span className="legend-item" key={status}>
                  <span
                    className="legend-swatch"
                    style={{ "--legend-color": style.bg } as CSSProperties}
                  />
                  {status}
                </span>
              )),
              <span className="legend-item" key="hard">
                <span className="legend-line legend-line-hard" />
                hard
              </span>,
              <span className="legend-item" key="soft">
                <span className="legend-line legend-line-soft" />
                soft
              </span>,
              ...Object.entries(TYPE_ICONS).map(([type, icon]) => (
                <span key={type}>
                  {icon} {type}
                </span>
              )),
            ]
          : Object.entries(ACTION_COLORS).map(([action, color]) => (
              <span className="legend-item" key={action}>
                <span
                  className="legend-swatch"
                  style={{ "--legend-color": color } as CSSProperties}
                />
                {action}
              </span>
            ))}
      </footer>
    </div>
  );
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => getPreferredTheme());
  const [sourceLabel, setSourceLabel] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [appliedRegistry, setAppliedRegistry] = useState<Registry | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.body.dataset.theme = theme;
    window.localStorage.setItem(LOCAL_STORAGE_THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const initialSource = await loadInitialRegistrySource();
        const storedDraft = window.localStorage.getItem(LOCAL_STORAGE_DRAFT_KEY);

        if (cancelled) {
          return;
        }

        if (initialSource) {
          setSourceLabel(initialSource.sourceLabel);
          setDraftText(initialSource.sourceText);

          const validation = validateRegistryText(initialSource.sourceText);

          if (validation.registry) {
            setAppliedRegistry(validation.registry);
            setShowEditor(false);
          } else {
            setAppliedRegistry(null);
            setShowEditor(true);
          }
        } else if (storedDraft) {
          setSourceLabel("saved local draft");
          setDraftText(storedDraft);

          const validation = validateRegistryText(storedDraft);

          if (validation.registry) {
            setAppliedRegistry(validation.registry);
          }

          setShowEditor(true);
        } else {
          setSourceLabel(null);
          setDraftText(DEFAULT_REGISTRY_TEMPLATE);
          setAppliedRegistry(null);
          setShowEditor(true);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        setLoadError(error instanceof Error ? error.message : "Failed to load registry.");
        setSourceLabel(null);
        setDraftText(DEFAULT_REGISTRY_TEMPLATE);
        setShowEditor(true);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!draftText) {
      window.localStorage.removeItem(LOCAL_STORAGE_DRAFT_KEY);
      return;
    }

    window.localStorage.setItem(LOCAL_STORAGE_DRAFT_KEY, draftText);
  }, [draftText]);

  const validation = useMemo(() => validateRegistryText(draftText), [draftText]);

  const handleApplyRegistry = useCallback(() => {
    if (!validation.registry) {
      return;
    }

    setAppliedRegistry(validation.registry);
    setShowEditor(false);

    if (!sourceLabel) {
      setSourceLabel("in-browser draft");
    } else if (!REGISTRY_URL_CANDIDATES.includes(sourceLabel)) {
      setSourceLabel(sourceLabel);
    } else {
      setSourceLabel(`${sourceLabel} (edited in browser)`);
    }
  }, [sourceLabel, validation.registry]);

  const handleImport = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const text = await file.text();
    setDraftText(text);
    setSourceLabel(file.name);
    setShowEditor(true);
    event.target.value = "";
  }, []);

  const handleDownload = useCallback(() => {
    const blob = new Blob([draftText], { type: "text/yaml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = "service_registry.yaml";
    anchor.click();
    URL.revokeObjectURL(url);
  }, [draftText]);

  const handleToggleTheme = useCallback(() => {
    setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"));
  }, []);

  if (isLoading) {
    return (
      <div className="startup-shell" data-theme={theme}>
        <div className="startup-card">
          <div className="app-title">Service Dependency Explorer</div>
          <div className="app-subtitle">Loading registry…</div>
        </div>
      </div>
    );
  }

  if (showEditor || !appliedRegistry) {
    return (
      <div className="app-shell" data-theme={theme}>
        {loadError ? (
          <div className="load-error-banner">
            {loadError}
          </div>
        ) : null}
        <RegistryEditor
          canApply={validation.registry !== null}
          draftText={draftText}
          issues={validation.issues}
          onApply={handleApplyRegistry}
          onChange={setDraftText}
          onClose={appliedRegistry ? () => setShowEditor(false) : undefined}
          onDownload={handleDownload}
          onImport={handleImport}
          onToggleTheme={handleToggleTheme}
          sourceLabel={sourceLabel}
          theme={theme}
        />
      </div>
    );
  }

  return (
    <CatalogView
      onEditRegistry={() => setShowEditor(true)}
      onToggleTheme={handleToggleTheme}
      registry={appliedRegistry}
      sourceLabel={sourceLabel}
      theme={theme}
    />
  );
}
