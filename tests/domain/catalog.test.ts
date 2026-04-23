import type { Registry, Service } from "@domain/registry";
import {
  buildDataFlowMermaid,
  buildGraph,
  buildGraphMermaid,
  collectReachable,
  computeLayout,
  formatServiceLabel,
  getAffectedDataFlows,
  getNodeRadius,
  matchesFuzzy,
  normalizeSearchText,
  slugify,
} from "@domain/catalog";
import { HOSTING_ENVIRONMENT_COLORS } from "@domain/registry";

const services: Record<string, Service> = {
  api: {
    name: "API",
    description: "Backend API",
    type: "backend",
    status: "active",
    upstream: [{ service: "db", protocol: "PostgreSQL", criticality: "hard" }],
    business_flows: ["checkout"],
  },
  db: {
    name: "DB",
    description: "Database",
    type: "datastore",
    status: "active",
    upstream: [],
    business_flows: ["checkout"],
  },
};

describe("catalog domain helpers", () => {
  it("builds a defensive directed graph", () => {
    const graph = buildGraph({
      ...services,
      orphan: {
        name: "Orphan",
        description: "Unknown dependency",
        type: "backend",
        status: "active",
        upstream: [{ service: "missing", criticality: "soft" }],
      },
    });

    expect(graph.upstream.api[0]?.service).toBe("db");
    expect(graph.downstream.db[0]?.service).toBe("api");
    expect(graph.upstream.orphan).toEqual([]);
  });

  it("collects reachable nodes recursively", () => {
    const reachable = collectReachable("db", {
      db: [{ service: "api" }],
      api: [{ service: "worker" }],
      worker: [],
    });

    expect([...reachable].sort()).toEqual(["api", "db", "worker"]);
  });

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
    const layout = await computeLayout(
      new Set(["a", "b", "c"]),
      hostedServices,
      graph,
      true,
      { cloud_prod: { environment: "cloud" as const, provider: "AWS" } },
    );

    const groupNodes = layout.rfNodes.filter((n) => n.type === "hostingGroupNode");
    expect(groupNodes).toHaveLength(1);
    expect(groupNodes[0]?.id).toBe("__hosting_cloud_prod");

    const groupedServiceNodes = layout.rfNodes.filter((n) => n.parentId === "__hosting_cloud_prod");
    expect(groupedServiceNodes).toHaveLength(2);
    expect(groupedServiceNodes.map((n) => n.id).sort()).toEqual(["a", "b"]);

    const ungrouped = layout.rfNodes.find((n) => n.id === "c");
    expect(ungrouped?.parentId).toBeUndefined();
    expect(ungrouped?.type).toBe("serviceNode");

    // Parent nodes must appear before their children in the array (React Flow requirement)
    const groupIndex = layout.rfNodes.findIndex((n) => n.id === "__hosting_cloud_prod");
    const childIndices = layout.rfNodes
      .map((n, i) => (n.parentId === "__hosting_cloud_prod" ? i : -1))
      .filter((i) => i !== -1);
    expect(childIndices.every((i) => i > groupIndex)).toBe(true);

    expect(groupNodes[0]?.data.color).toBe(HOSTING_ENVIRONMENT_COLORS.cloud);
  });

  it("returns empty rfNodes for no visible services", async () => {
    const layout = await computeLayout(new Set(), {}, { upstream: {}, downstream: {} }, false);
    expect(layout.rfNodes).toEqual([]);
  });

  it("handles search and string normalization helpers", () => {
    expect(normalizeSearchText("Payments/API v2")).toBe("payments api v2");
    expect(matchesFuzzy("Payments API", "pay api")).toBe(true);
    expect(matchesFuzzy("Payments API", "pay missing")).toBe(false);
    expect(formatServiceLabel("VeryLongServiceName", 8)).toBe("VeryLon…");
    expect(slugify("  Hello, World!  ")).toBe("hello-world");
  });

  it("finds affected data flows by service stage usage", () => {
    const flows = {
      one: {
        name: "One",
        description: "One",
        business_flow: "checkout",
        data_type: "event" as const,
        sensitivity: "internal" as const,
        freshness: "realtime",
        stages: [{ service: "api", action: "produces" as const }],
      },
      two: {
        name: "Two",
        description: "Two",
        business_flow: "checkout",
        data_type: "event" as const,
        sensitivity: "internal" as const,
        freshness: "realtime",
        stages: [{ service: "db", action: "stores" as const }],
      },
    };
    expect(getAffectedDataFlows("api", flows).map(([k]) => k)).toEqual(["one"]);
  });

  it("exports deterministic mermaid diagrams", () => {
    const registry: Registry = {
      metadata: {
        team: "Platform",
        team_id: "platform",
        last_updated: "2026-04-08",
        maintainers: [],
      },
      hosting: {},
      stakeholders: {},
      business_flows: {
        checkout: {
          name: "Checkout",
          description: "Checkout flow",
          priority: "P1",
          stakeholders: ["Product"],
        },
      },
      data_flows: {},
      services,
    };

    const graphMermaid = buildGraphMermaid({
      registry,
      serviceKeys: new Set(["api", "db"]),
      edges: [{ from: "api", to: "db", protocol: "PostgreSQL", criticality: "hard" }],
      title: "Test",
      filenameStem: "graph",
    });
    expect(graphMermaid?.filename).toBe("graph.mmd");
    expect(graphMermaid?.source).toContain("flowchart LR");

    const dataMermaid = buildDataFlowMermaid({
      registry,
      dataFlowEntries: [
        [
          "checkout_events",
          {
            name: "Checkout Events",
            description: "Events",
            business_flow: "checkout",
            data_type: "event",
            sensitivity: "internal",
            freshness: "real-time",
            stages: [
              { service: "api", action: "produces", format: "JSON" },
              { service: "db", action: "stores", store_kind: "database" },
            ],
          },
        ],
      ],
      filenameStem: "data",
      title: "Data",
    });
    expect(dataMermaid?.source).toContain("Checkout Events");
    expect(dataMermaid?.source).toContain("database");
  });

  it("returns expected node radius by service type", () => {
    expect(getNodeRadius("datastore")).toBe(20);
    expect(getNodeRadius("frontend")).toBe(4);
    expect(getNodeRadius("worker")).toBe(10);
  });
});
