import {
  DEFAULT_REGISTRY_TEMPLATE,
  getExplorerTitle,
  getStageSubtypeLabel,
  pointerToLabel,
  type DataFlowStage,
  validateRegistryText,
} from "@domain/registry";

describe("registry domain", () => {
  it("validates a known-good registry template", () => {
    const result = validateRegistryText(DEFAULT_REGISTRY_TEMPLATE);

    expect(result.registry).not.toBeNull();
    expect(result.issues).toHaveLength(0);
  });

  it("reports cross-reference issues for unknown flow/service keys", () => {
    const invalidRegistry = `
metadata:
  team: Platform
  team_id: platform
  last_updated: 2026-04-08
  maintainers:
    - name: Jane
      slack: "@jane"
business_flows:
  checkout:
    name: Checkout
    description: Checkout flow
    priority: P1
    stakeholders: [Product]
data_flows:
  broken:
    name: Broken flow
    description: Broken
    business_flow: unknown_flow
    data_type: event
    sensitivity: internal
    freshness: real-time
    stages:
      - service: unknown_service
        action: produces
services:
  api:
    name: API
    description: Backend
    type: backend
    status: active
    upstream:
      - service: missing_dependency
        protocol: HTTPS
        criticality: hard
    business_flows: [checkout]
    owner: platform
    runbook: https://example.com/runbook
    health_check: https://example.com/health
`;
    const result = validateRegistryText(invalidRegistry);

    expect(result.registry).toBeNull();
    expect(result.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        'Unknown business flow "unknown_flow".',
        'Unknown stage service "unknown_service".',
        'Unknown upstream service "missing_dependency".',
      ]),
    );
  });

  it("formats pointers and explorer titles consistently", () => {
    expect(pointerToLabel("")).toBe("(root)");
    expect(pointerToLabel("/services/api/upstream/0/service")).toBe(
      "services > api > upstream > 0 > service",
    );
    expect(getExplorerTitle("  Platform Team ")).toBe("Platform Team Service Dependency Explorer");
    expect(getExplorerTitle()).toBe("Service Dependency Explorer");
  });

  it("returns subtype labels only for matching stage actions", () => {
    const processingStage: DataFlowStage = {
      service: "api",
      action: "processes",
      process_kind: "transform",
    };
    const storageStage: DataFlowStage = {
      service: "db",
      action: "stores",
      store_kind: "database",
    };
    const producerStage: DataFlowStage = {
      service: "ui",
      action: "produces",
    };

    expect(getStageSubtypeLabel(processingStage)).toBe("transform");
    expect(getStageSubtypeLabel(storageStage)).toBe("database");
    expect(getStageSubtypeLabel(producerStage)).toBeNull();
  });

  it("accepts empty business_flows, data_flows, and services sections", () => {
    const minimalRegistry = `
metadata:
  team: Platform
  team_id: platform
  last_updated: 2026-04-08
  maintainers:
    - name: Jane
      slack: "@jane"
business_flows: {}
data_flows: {}
services: {}
`;

    const result = validateRegistryText(minimalRegistry);

    expect(result.issues).toHaveLength(0);
    expect(result.registry).not.toBeNull();
    expect(result.checklist.find((group) => group.title === "Sections")?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "business_flows section", checked: true }),
        expect.objectContaining({ label: "data_flows section", checked: true }),
        expect.objectContaining({ label: "services section", checked: true }),
      ]),
    );
  });
});
