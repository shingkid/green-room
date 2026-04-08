import { describe, expect, it } from "vitest";

import {
  detectHintContext,
  detectHintContextFromParsed,
  HINTS_BY_CONTEXT,
  parseHintDocument,
} from "@features/editor/schemaHints";

describe("schemaHints", () => {
  it("extracts required fields and generated snippets for each targeted section", () => {
    expect(HINTS_BY_CONTEXT.service.requiredFields.map((field) => field.name)).toEqual(
      expect.arrayContaining([
        "name",
        "description",
        "type",
        "status",
        "upstream",
        "business_flows",
        "owner",
        "runbook",
        "health_check",
      ]),
    );
    expect(HINTS_BY_CONTEXT.businessFlow.requiredFields.map((field) => field.name)).toEqual(
      expect.arrayContaining(["name", "description", "priority", "stakeholders"]),
    );
    expect(HINTS_BY_CONTEXT.dataFlow.requiredFields.map((field) => field.name)).toEqual(
      expect.arrayContaining([
        "name",
        "description",
        "business_flow",
        "data_type",
        "sensitivity",
        "freshness",
        "stages",
      ]),
    );

    expect(HINTS_BY_CONTEXT.service.snippet).toContain("example_service:");
    expect(HINTS_BY_CONTEXT.service.snippet).toContain("name:");
    expect(HINTS_BY_CONTEXT.businessFlow.snippet).toContain("example_key:");
    expect(HINTS_BY_CONTEXT.dataFlow.snippet).toContain("stages:");
    expect(HINTS_BY_CONTEXT.service.summaryDescription).toBeTruthy();
    expect(HINTS_BY_CONTEXT.service.requiredFields[0]?.summaryDescription).toBeTruthy();
  });

  it("detects context for service, business flow, and data flow entries", () => {
    const source = `services:
  api:
    name: API
    description: Backend API
    type: backend
    status: active
    upstream: []
    business_flows: [checkout]
    owner: platform
    runbook: https://example.com/runbook
    health_check: https://example.com/health

business_flows:
  checkout:
    name: Checkout
    description: Checkout flow
    priority: P1
    stakeholders: [Product]

data_flows:
  checkout_events:
    name: Checkout Events
    description: Event stream
    business_flow: checkout
    data_type: event
    sensitivity: internal
    freshness: real-time
    stages:
      - service: api
        action: produces
`;

    expect(detectHintContext(source, source.indexOf("type: backend"))).toBe("service");
    expect(detectHintContext(source, source.indexOf("priority: P1"))).toBe("businessFlow");
    expect(detectHintContext(source, source.indexOf("data_type: event"))).toBe("dataFlow");
    expect(detectHintContext(source, source.indexOf("services:"))).toBe("none");

    const parsed = parseHintDocument(source);
    expect(detectHintContextFromParsed(parsed, source.indexOf("type: backend"))).toBe("service");
    expect(detectHintContextFromParsed(parsed, source.indexOf("priority: P1"))).toBe(
      "businessFlow",
    );
    expect(detectHintContextFromParsed(parsed, source.indexOf("data_type: event"))).toBe(
      "dataFlow",
    );
  });
});
