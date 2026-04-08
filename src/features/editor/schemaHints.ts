import { isMap, parseDocument } from "yaml";

import registrySchema from "../../../service_registry.schema.json";

type JsonSchema = {
  $defs?: Record<string, JsonSchema>;
  additionalProperties?: unknown;
  description?: string;
  enum?: unknown[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  type?: string;
  $ref?: string;
};

export type HintContext = "none" | "service" | "businessFlow" | "dataFlow";

export type HintField = {
  description: string | null;
  enumValues: string[] | null;
  name: string;
  summaryDescription: string | null;
};

export type HintContent = {
  description: string | null;
  optionalFields: HintField[];
  requiredFields: HintField[];
  snippet: string;
  summaryDescription: string | null;
  title: string;
};

export type ParsedHintDocument = {
  root: unknown;
};

type SectionHintSpec = {
  context: Exclude<HintContext, "none">;
  sectionKey: "services" | "business_flows" | "data_flows";
  title: string;
};

const SECTION_HINT_SPECS: SectionHintSpec[] = [
  { context: "service", sectionKey: "services", title: "Service Entry" },
  { context: "businessFlow", sectionKey: "business_flows", title: "Business Flow Entry" },
  { context: "dataFlow", sectionKey: "data_flows", title: "Data Flow Entry" },
];

const parsedSchema = registrySchema as JsonSchema;
const localRefCache = new Map<string, JsonSchema | null>();

function resolveLocalRef(schema: JsonSchema, ref: string): JsonSchema | null {
  if (!ref.startsWith("#/")) {
    return null;
  }

  const parts = ref
    .slice(2)
    .split("/")
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"));

  let current: unknown = schema;

  for (const part of parts) {
    if (!current || typeof current !== "object" || !(part in current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current && typeof current === "object" ? (current as JsonSchema) : null;
}

function dereferenceSchema(schema: JsonSchema, node: JsonSchema): JsonSchema {
  if (!node.$ref) {
    return node;
  }

  if (localRefCache.has(node.$ref)) {
    return localRefCache.get(node.$ref) ?? node;
  }

  const resolved = resolveLocalRef(schema, node.$ref);
  localRefCache.set(node.$ref, resolved);
  return resolved ?? node;
}

function normalizeField(schema: JsonSchema, fieldNode: JsonSchema, name: string): HintField {
  const resolvedField = dereferenceSchema(schema, fieldNode);
  const fullDescription = fieldNode.description ?? resolvedField.description ?? null;

  return {
    description: fullDescription,
    enumValues: Array.isArray(resolvedField.enum)
      ? resolvedField.enum.filter((value): value is string => typeof value === "string")
      : null,
    name,
    summaryDescription: summarizeDescription(fullDescription),
  };
}

function summarizeDescription(description: string | null): string | null {
  if (!description) {
    return null;
  }

  const normalized = description.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return null;
  }

  const listMarkerIndex = normalized.indexOf(" - ");
  const baseText = listMarkerIndex >= 0 ? normalized.slice(0, listMarkerIndex).trim() : normalized;
  const sentenceMatch = baseText.match(/^(.+?[.!?])(\s|$)/);
  const firstSentence = sentenceMatch?.[1]?.trim() ?? baseText;
  const capped =
    firstSentence.length > 120 ? `${firstSentence.slice(0, 117).trimEnd()}...` : firstSentence;

  return capped;
}

function getSectionEntrySchema(
  schema: JsonSchema,
  sectionKey: SectionHintSpec["sectionKey"],
): JsonSchema | null {
  const sectionNode = schema.properties?.[sectionKey];

  if (!sectionNode) {
    return null;
  }

  const resolvedSectionNode = dereferenceSchema(schema, sectionNode);
  const entriesNode = resolvedSectionNode.additionalProperties;

  if (!entriesNode || typeof entriesNode !== "object") {
    return null;
  }

  return dereferenceSchema(schema, entriesNode as JsonSchema);
}

function renderScalarPlaceholder(fieldName: string, fieldSchema: JsonSchema): string {
  const resolved = dereferenceSchema(parsedSchema, fieldSchema);

  if (Array.isArray(resolved.enum) && typeof resolved.enum[0] === "string") {
    return resolved.enum[0];
  }

  if (resolved.type === "integer") {
    return "0";
  }

  if (fieldName.includes("url") || fieldName.includes("runbook") || fieldName.includes("health")) {
    return "https://example.com/value";
  }

  if (fieldName.includes("id") || fieldName.includes("owner")) {
    return "example_id";
  }

  return "example_value";
}

function generateFieldSnippetLines(
  fieldName: string,
  fieldSchema: JsonSchema,
  depth: number,
): string[] {
  const indent = "  ".repeat(depth);
  const resolved = dereferenceSchema(parsedSchema, fieldSchema);

  if (resolved.type === "array") {
    const itemSchema = resolved.items ? dereferenceSchema(parsedSchema, resolved.items) : null;

    if (itemSchema?.type === "object") {
      const firstRequired = itemSchema.required?.[0] ?? "value";
      const nestedField = itemSchema.properties?.[firstRequired] ?? {};
      const nestedValue = renderScalarPlaceholder(firstRequired, nestedField);
      return [`${indent}${fieldName}:`, `${indent}  - ${firstRequired}: ${nestedValue}`];
    }

    const itemValue = itemSchema ? renderScalarPlaceholder(fieldName, itemSchema) : "example_value";
    return [`${indent}${fieldName}:`, `${indent}  - ${itemValue}`];
  }

  if (resolved.type === "object") {
    const required = resolved.required ?? [];

    if (required.length === 0 || !resolved.properties) {
      return [`${indent}${fieldName}: {}`];
    }

    const lines = [`${indent}${fieldName}:`];
    for (const nestedName of required.slice(0, 3)) {
      const nestedNode = resolved.properties[nestedName] ?? {};
      const nestedValue = renderScalarPlaceholder(nestedName, nestedNode);
      lines.push(`${indent}  ${nestedName}: ${nestedValue}`);
    }
    return lines;
  }

  return [`${indent}${fieldName}: ${renderScalarPlaceholder(fieldName, resolved)}`];
}

function generateSnippet(
  entrySchema: JsonSchema,
  sectionKey: SectionHintSpec["sectionKey"],
): string {
  const required = entrySchema.required ?? [];
  const properties = entrySchema.properties ?? {};
  const exampleKey = sectionKey === "services" ? "example_service" : "example_key";
  const lines: string[] = [`${exampleKey}:`];

  for (const fieldName of required) {
    const fieldSchema = properties[fieldName] ?? {};
    lines.push(...generateFieldSnippetLines(fieldName, fieldSchema, 1));
  }

  return lines.join("\n");
}

function buildHintContent(schema: JsonSchema, spec: SectionHintSpec): HintContent {
  const entrySchema = getSectionEntrySchema(schema, spec.sectionKey);
  const props = entrySchema?.properties ?? {};
  const requiredSet = new Set(entrySchema?.required ?? []);

  return {
    description: entrySchema?.description ?? null,
    optionalFields: Object.entries(props)
      .filter(([name]) => !requiredSet.has(name))
      .map(([name, node]) => normalizeField(schema, node, name)),
    requiredFields: Object.entries(props)
      .filter(([name]) => requiredSet.has(name))
      .map(([name, node]) => normalizeField(schema, node, name)),
    snippet: entrySchema ? generateSnippet(entrySchema, spec.sectionKey) : "",
    summaryDescription: summarizeDescription(entrySchema?.description ?? null),
    title: spec.title,
  };
}

export const HINTS_BY_CONTEXT: Record<
  Exclude<HintContext, "none">,
  HintContent
> = SECTION_HINT_SPECS.reduce(
  (acc, spec) => {
    acc[spec.context] = buildHintContent(parsedSchema, spec);
    return acc;
  },
  {} as Record<Exclude<HintContext, "none">, HintContent>,
);

function getNodeBounds(node: unknown): { end: number; start: number } | null {
  const maybeNode = node as { range?: [number?, number?] };
  const start = maybeNode.range?.[0];
  const end = maybeNode.range?.[1];

  if (typeof start !== "number" || typeof end !== "number") {
    return null;
  }

  return { end, start };
}

function includesOffset(node: unknown, offset: number): boolean {
  const bounds = getNodeBounds(node);

  return Boolean(bounds && offset >= bounds.start && offset <= bounds.end);
}

function isInsideSectionEntry(sectionNode: unknown, offset: number): boolean {
  if (!isMap(sectionNode)) {
    return false;
  }

  return sectionNode.items.some(
    (item) => includesOffset(item.key, offset) || includesOffset(item.value, offset),
  );
}

export function parseHintDocument(sourceText: string): ParsedHintDocument {
  const doc = parseDocument(sourceText, {
    prettyErrors: false,
    strict: false,
  });

  return { root: doc.contents };
}

export function detectHintContextFromParsed(
  parsed: ParsedHintDocument,
  cursorOffset: number,
): HintContext {
  const { root } = parsed;

  if (!isMap(root)) {
    return "none";
  }

  for (const item of root.items) {
    const sectionName = String((item.key as { value?: unknown } | null | undefined)?.value ?? "");
    const sectionValue = item.value;

    if (!includesOffset(sectionValue, cursorOffset)) {
      continue;
    }

    if (sectionName === "services" && isInsideSectionEntry(sectionValue, cursorOffset)) {
      return "service";
    }

    if (sectionName === "business_flows" && isInsideSectionEntry(sectionValue, cursorOffset)) {
      return "businessFlow";
    }

    if (sectionName === "data_flows" && isInsideSectionEntry(sectionValue, cursorOffset)) {
      return "dataFlow";
    }
  }

  return "none";
}

export function detectHintContext(sourceText: string, cursorOffset: number): HintContext {
  return detectHintContextFromParsed(parseHintDocument(sourceText), cursorOffset);
}
