import Ajv2020, { type ErrorObject } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { LineCounter, isMap, isSeq, parseDocument } from "yaml";

import DEFAULT_REGISTRY_TEMPLATE_RAW from "./default-registry-template.yaml?raw";

import registrySchema from "../../service_registry.schema.json";

export type ServiceStatus = "active" | "experimental" | "migrating" | "deprecated";
export type ServiceType = "frontend" | "backend" | "worker" | "datastore" | "infrastructure";
export type HostingEnvironment = "cloud" | "on_premises" | "dmz" | "private_cloud" | "colocation" | "edge";
export type Hosting = { environment: HostingEnvironment; provider?: string; account?: string };
export type DependencyCriticality = "hard" | "soft";
export type DataFlowAction = "produces" | "queues" | "processes" | "stores" | "serves" | "consumes";
export type ProcessKind = "transform" | "enrich" | "filter" | "aggregate" | "validate";
export type StoreKind = "database" | "object_store" | "index" | "cache" | "warehouse";
export type QueueKind = "queue" | "stream" | "topic" | "bus";
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
  hosting?: string;
  upstream?: Dependency[];
  business_flows?: string[];
  owner?: string;
  runbook?: string;
  health_check?: string;
  port?: number;
  dashboard?: string;
  on_call?: string;
  incident_channel?: string;
  slo?: string;
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
  process_kind?: ProcessKind;
  store_kind?: StoreKind;
  queue_kind?: QueueKind;
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
  hosting: Record<string, Hosting>;
  stakeholders: Record<string, { name: string; description?: string | null; contact?: string | null }>;
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
  checklist: ChecklistGroup[];
  issues: ValidationIssue[];
  registry: Registry | null;
};

export type ChecklistItem = { label: string; checked: boolean };
export type ChecklistGroup = { title: string; items: ChecklistItem[] };

export type InitialLoadResult = {
  sourceLabel: string;
  sourceText: string;
};

export type SelectOption = {
  label: string;
  searchText?: string;
  value: string;
};

export const ALL_SERVICE_STATUSES: ServiceStatus[] = [
  "active",
  "experimental",
  "migrating",
  "deprecated",
];
export const ALL_SERVICE_TYPES: ServiceType[] = [
  "frontend",
  "backend",
  "worker",
  "datastore",
  "infrastructure",
];
export const ALL_OWNERSHIP_KINDS = ["internal", "external"] as const;
export type OwnershipKind = (typeof ALL_OWNERSHIP_KINDS)[number];

export const STATUS_STYLES: Record<ServiceStatus, StatusStyle> = {
  active: { bg: "#16a34a", border: "#15803d", text: "#fff" },
  experimental: { bg: "#d97706", border: "#b45309", text: "#fff" },
  migrating: { bg: "#2563eb", border: "#1d4ed8", text: "#fff" },
  deprecated: { bg: "#6b7280", border: "#4b5563", text: "#fff" },
};

export const ACTION_COLORS: Record<DataFlowAction, string> = {
  produces: "#1B9E77",
  queues: "#D95F02",
  processes: "#7570B3",
  stores: "#E7298A",
  serves: "#66A61E",
  consumes: "#E31A1C",
};

export function getStageSubtypeLabel(stage: DataFlowStage) {
  if (stage.action === "processes") {
    return stage.process_kind ?? null;
  }

  if (stage.action === "stores") {
    return stage.store_kind ?? null;
  }

  if (stage.action === "queues") {
    return stage.queue_kind ?? null;
  }

  return null;
}

export const FLOW_COLORS: Record<string, string> = {
  research_search: "#8b5cf6",
  data_ingestion: "#06b6d4",
  report_generation: "#f59e0b",
  admin_monitoring: "#6b7280",
};

export const TYPE_ICONS: Record<ServiceType, string> = {
  frontend: "◻",
  backend: "⚙",
  worker: "▷",
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

export const ALL_HOSTING_ENVIRONMENTS: HostingEnvironment[] = [
  "cloud",
  "on_premises",
  "dmz",
  "private_cloud",
  "colocation",
  "edge",
];

export const HOSTING_ENVIRONMENT_COLORS: Record<HostingEnvironment, string> = {
  cloud: "#3b82f6",
  on_premises: "#6b7280",
  dmz: "#f59e0b",
  private_cloud: "#8b5cf6",
  colocation: "#14b8a6",
  edge: "#ec4899",
};

export const TABS: Array<{ key: Mode; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "impact", label: "Dependency Impact" },
  { key: "flow", label: "Business Flow" },
  { key: "data", label: "Data Lineage" },
];

export const GRAPH_MODES: Mode[] = ["overview", "impact", "flow"];
export const REGISTRY_URL_CANDIDATES = ["/service_registry.yaml", "/service-registry.yaml"];
export const LOCAL_STORAGE_DRAFT_KEY = "green-room.registry-draft";
export const DEFAULT_REGISTRY_TEMPLATE = DEFAULT_REGISTRY_TEMPLATE_RAW;

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

  return pointer.split("/").slice(1).map(decodeJsonPointerSegment).join(" > ");
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
  node: unknown,
  path: string[],
  lineCounter: LineCounter,
  locations: Map<string, string>,
) {
  if (!node) {
    return;
  }

  const nodeWithRange = node as { range?: [number?] };
  const [start] = nodeWithRange.range ?? [];

  if (typeof start === "number") {
    const pos = lineCounter.linePos(start);
    locations.set(toPointer(path), formatLocation(pos.line, pos.col));
  }

  if (isMap(node)) {
    for (const item of node.items) {
      const keyNode = item.key as { value?: unknown } | null | undefined;
      const key = String(keyNode?.value ?? "");
      // Track value locations, not just keys, so downstream validation errors land on the field
      // content the user actually needs to edit.
      collectNodeLocations(item.value, [...path, key], lineCounter, locations);
    }
    return;
  }

  if (isSeq(node)) {
    node.items.forEach((item: unknown, index: number) => {
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
  const hostingKeys = new Set(Object.keys(registry.hosting ?? {}));
  const stakeholderKeys = new Set(Object.keys(registry.stakeholders ?? {}));

  for (const [flowKey, flow] of Object.entries(registry.business_flows)) {
    for (const [index, stakeholderKey] of (flow.stakeholders ?? []).entries()) {
      if (!stakeholderKeys.has(stakeholderKey)) {
        addReferenceIssue(
          issues,
          locations,
          rootLocation,
          ["business_flows", flowKey, "stakeholders", String(index)],
          `Unknown stakeholder "${stakeholderKey}".`,
        );
      }
    }
  }

  for (const [serviceKey, service] of Object.entries(registry.services)) {
    if (service.hosting && !hostingKeys.has(service.hosting)) {
      addReferenceIssue(
        issues,
        locations,
        rootLocation,
        ["services", serviceKey, "hosting"],
        `Unknown hosting config "${service.hosting}".`,
      );
    }

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

function buildChecklist(raw: unknown): ChecklistGroup[] {
  const root =
    raw != null && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const meta =
    root["metadata"] != null &&
    typeof root["metadata"] === "object" &&
    !Array.isArray(root["metadata"])
      ? (root["metadata"] as Record<string, unknown>)
      : {};

  const nonEmptyStr = (v: unknown) => typeof v === "string" && v.trim().length > 0;

  const hasEntries = (key: string) => {
    const val = root[key];
    return (
      val != null &&
      typeof val === "object" &&
      !Array.isArray(val) &&
      Object.keys(val as object).length > 0
    );
  };

  return [
    {
      title: "Metadata",
      items: [
        { label: "team", checked: nonEmptyStr(meta["team"]) },
        { label: "team_id", checked: nonEmptyStr(meta["team_id"]) },
        { label: "last_updated", checked: nonEmptyStr(meta["last_updated"]) },
        {
          label: "maintainers (min 1)",
          checked:
            Array.isArray(meta["maintainers"]) && (meta["maintainers"] as unknown[]).length > 0,
        },
      ],
    },
    {
      title: "Sections",
      items: [
        { label: "hosting (min 1)", checked: hasEntries("hosting") },
        { label: "stakeholders (min 1)", checked: hasEntries("stakeholders") },
        { label: "business_flows (min 1)", checked: hasEntries("business_flows") },
        { label: "data_flows (min 1)", checked: hasEntries("data_flows") },
        { label: "services (min 1)", checked: hasEntries("services") },
      ],
    },
  ];
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

  // Best-effort parse for checklist — works even when the document has errors.
  let rawForChecklist: unknown = null;
  try {
    rawForChecklist = doc.toJS();
  } catch {
    /* leave null */
  }
  const checklist = buildChecklist(rawForChecklist);

  const parseIssues: ValidationIssue[] = (doc.errors ?? []).map((error: unknown) => {
    const maybeError = error as {
      message?: string;
      pos?: [number?];
    };
    const position =
      typeof maybeError.pos?.[0] === "number" ? lineCounter.linePos(maybeError.pos[0]) : null;

    return {
      location: position ? formatLocation(position.line, position.col) : rootLocation,
      message: maybeError.message ?? "YAML parse error.",
      path: "",
      severity: "error",
    };
  });

  if (parseIssues.length > 0) {
    return { checklist, issues: parseIssues, registry: null };
  }

  const raw = rawForChecklist;
  const isValid = validateSchema(raw);
  const schemaIssues = !isValid
    ? (validateSchema.errors ?? []).map((error) =>
        formatSchemaIssue(error, locations, rootLocation),
      )
    : [];

  if (schemaIssues.length > 0) {
    return { checklist, issues: schemaIssues, registry: null };
  }

  const registry = raw as Registry;
  // Schema validation catches shape issues. Cross-reference validation handles referential
  // integrity between sections, which JSON Schema alone does not express cleanly here.
  const referenceIssues = validateCrossReferences(registry, locations, rootLocation);

  if (referenceIssues.length > 0) {
    return { checklist, issues: referenceIssues, registry: null };
  }

  return { checklist, issues: [], registry };
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

export function getExplorerTitle(teamName?: string | null) {
  const normalizedTeamName = teamName?.trim();

  return normalizedTeamName
    ? `${normalizedTeamName} Service Dependency Explorer`
    : "Service Dependency Explorer";
}
