import Ajv2020, { type ErrorObject } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { LineCounter, isMap, isSeq, parseDocument, type YAMLSeq } from "yaml";

import registrySchema from "../../service_registry.schema.json";

export type ServiceStatus = "active" | "deprecated" | "migrating";
export type ServiceType = "frontend" | "backend" | "datastore" | "infrastructure";
export type DependencyCriticality = "hard" | "soft";
export type DataFlowAction =
  | "produces"
  | "transforms"
  | "stores"
  | "indexes"
  | "enriches"
  | "caches"
  | "serves"
  | "consumes";
export type DataType = "dataset" | "event" | "metric" | "config" | "auth_token";
export type Sensitivity = "public" | "internal" | "confidential" | "restricted";

export type Mode = "overview" | "impact" | "flow" | "data";
export type ImpactDirection = "downstream" | "upstream";
export type Theme = "light" | "dark";

export type Dependency = {
  service: string;
  protocol?: string;
  criticality?: DependencyCriticality;
};

export type Service = {
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

export type BusinessFlow = {
  name: string;
  description: string;
  priority: string;
  stakeholders: string[];
};

export type DataFlowStage = {
  service: string;
  action: DataFlowAction;
  format?: string;
  notes?: string;
};

export type DataFlow = {
  name: string;
  description: string;
  business_flow: string;
  data_type: DataType;
  sensitivity: Sensitivity;
  freshness: string;
  stages: DataFlowStage[];
};

export type Registry = {
  metadata: {
    team: string;
    team_id: string;
    last_updated: string;
    maintainers: Array<{ name: string; slack: string }>;
  };
  business_flows: Record<string, BusinessFlow>;
  data_flows: Record<string, DataFlow>;
  services: Record<string, Service>;
};

export type StatusStyle = {
  bg: string;
  border: string;
  text: string;
};

export type ValidationIssue = {
  message: string;
  path: string;
  location: string | null;
  severity: "error";
};

export type ValidationResult = {
  issues: ValidationIssue[];
  registry: Registry | null;
};

export type InitialLoadResult = {
  sourceLabel: string;
  sourceText: string;
};

export type SelectOption = {
  label: string;
  searchText?: string;
  value: string;
};

export const ALL_SERVICE_STATUSES: ServiceStatus[] = ["active", "deprecated", "migrating"];
export const ALL_SERVICE_TYPES: ServiceType[] = [
  "frontend",
  "backend",
  "datastore",
  "infrastructure",
];
export const ALL_OWNERSHIP_KINDS = ["internal", "external"] as const;
export type OwnershipKind = (typeof ALL_OWNERSHIP_KINDS)[number];

export const STATUS_STYLES: Record<ServiceStatus, StatusStyle> = {
  active: { bg: "#16a34a", border: "#15803d", text: "#fff" },
  deprecated: { bg: "#6b7280", border: "#4b5563", text: "#fff" },
  migrating: { bg: "#2563eb", border: "#1d4ed8", text: "#fff" },
};

export const ACTION_COLORS: Record<DataFlowAction, string> = {
  produces: "#059669",
  transforms: "#7c3aed",
  stores: "#0369a1",
  indexes: "#0369a1",
  enriches: "#d97706",
  caches: "#64748b",
  serves: "#059669",
  consumes: "#dc2626",
};

export const FLOW_COLORS: Record<string, string> = {
  research_search: "#8b5cf6",
  data_ingestion: "#06b6d4",
  report_generation: "#f59e0b",
  admin_monitoring: "#6b7280",
};

export const TYPE_ICONS: Record<ServiceType, string> = {
  frontend: "◻",
  backend: "⚙",
  datastore: "⛁",
  infrastructure: "△",
};

export const DATA_TYPE_ICONS: Record<DataType, string> = {
  dataset: "📊",
  event: "⚡",
  metric: "📈",
  config: "⚙",
  auth_token: "🔑",
};

export const SENSITIVITY_COLORS: Record<Sensitivity, string> = {
  public: "#22c55e",
  internal: "#3b82f6",
  confidential: "#f59e0b",
  restricted: "#ef4444",
};

export const TABS: Array<{ key: Mode; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "impact", label: "Dependency Impact" },
  { key: "flow", label: "Business Flow" },
  { key: "data", label: "Data Lineage" },
];

export const GRAPH_MODES: Mode[] = ["overview", "impact", "flow"];
export const REGISTRY_URL_CANDIDATES = ["/service_registry.yaml", "/service-registry.yaml"];
export const LOCAL_STORAGE_DRAFT_KEY = "service-catalog.registry-draft";
export const DEFAULT_REGISTRY_TEMPLATE = `metadata:
  team: Platform Engineering
  team_id: platform_engineering
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
    owner: platform_engineering
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
    owner: platform_engineering
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

export function pointerToLabel(pointer: string) {
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
  // AJV often reports issues on a missing child path, while the YAML parser only knows about
  // concrete nodes that exist. Walk upward until we find the closest real source location.
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
      // Track value locations, not just keys, so downstream validation errors land on the field
      // content the user actually needs to edit.
      const key = String((item.key as { value?: unknown } | null | undefined)?.value ?? "");
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
      // Required-field errors are reported on the parent object. Point at the missing child path
      // so the issue label matches the field the user needs to add.
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

export function validateRegistryText(sourceText: string): ValidationResult {
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
  // Schema validation catches shape issues. Cross-reference validation handles referential
  // integrity between sections, which JSON Schema alone does not express cleanly here.
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

export async function loadInitialRegistrySource(): Promise<InitialLoadResult | null> {
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

export function findYamlLine(yamlText: string, keyPath: string[]): number {
  const lc = new LineCounter();
  const doc = parseDocument(yamlText, { lineCounter: lc });
  const node = doc.getIn(keyPath, true);
  if (node && typeof node === "object" && "range" in node) {
    const range = (node as { range?: number[] }).range;
    if (Array.isArray(range) && typeof range[0] === "number") {
      return lc.linePos(range[0]).line;
    }
  }
  return 1;
}

export function reorderDataFlowStages(
  yamlText: string,
  flowKey: string,
  newStages: DataFlowStage[],
): string {
  const doc = parseDocument(yamlText);
  doc.setIn(["data_flows", flowKey, "stages"], doc.createNode(newStages));
  return doc.toString();
}

export function addDataFlowStage(
  yamlText: string,
  flowKey: string,
  stage: DataFlowStage,
  atIndex: number,
): string {
  const doc = parseDocument(yamlText);
  const stages = doc.getIn(["data_flows", flowKey, "stages"]);
  if (isSeq(stages)) {
    (stages as YAMLSeq).items.splice(atIndex, 0, doc.createNode(stage));
  }
  return doc.toString();
}

export function getExplorerTitle(teamName?: string | null) {
  const normalizedTeamName = teamName?.trim();

  return normalizedTeamName
    ? `${normalizedTeamName} Service Dependency Explorer`
    : "Service Dependency Explorer";
}
