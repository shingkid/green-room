import {
  DEFAULT_REGISTRY_TEMPLATE,
  getExplorerTitle,
  getStageSubtypeLabel,
  loadInitialRegistrySource,
  pointerToLabel,
  type DataFlowStage,
  validateRegistryText,
} from "@domain/registry";
import { vi } from "vitest";

describe("registry domain", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it("rejects empty business_flows, data_flows, and services sections", () => {
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

    expect(result.registry).toBeNull();
    expect(result.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        "must NOT have fewer than 1 properties",
        "must NOT have fewer than 1 properties",
        "must NOT have fewer than 1 properties",
      ]),
    );
    expect(result.checklist.find((group) => group.title === "Sections")?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "business_flows (min 1)", checked: false }),
        expect.objectContaining({ label: "data_flows (min 1)", checked: false }),
        expect.objectContaining({ label: "services (min 1)", checked: false }),
      ]),
    );
  });

  it("returns YAML parse issues with no registry", () => {
    const invalidYaml = `
metadata:
  team: Platform
  team_id: platform
  last_updated: 2026-04-08
  maintainers:
    - name: Jane
      slack: "@jane"
services:
  api:
    name: API
    description: Broken indent
      type: backend
`;
    const result = validateRegistryText(invalidYaml);

    expect(result.registry).toBeNull();
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0]?.severity).toBe("error");
  });

  it("loads first available checked-in registry source", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404, statusText: "Not Found" })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        text: vi.fn().mockResolvedValue("metadata:\n  team: Platform\n"),
      });
    vi.stubGlobal("fetch", fetchMock);

    const source = await loadInitialRegistrySource();

    expect(source).toEqual({
      sourceLabel: "/service-registry.yaml",
      sourceText: "metadata:\n  team: Platform\n",
    });
  });

  it("throws when registry fetch fails with non-404 status", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Server Error",
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadInitialRegistrySource()).rejects.toThrow(
      "Failed to load /service_registry.yaml: 500 Server Error",
    );
  });
});
