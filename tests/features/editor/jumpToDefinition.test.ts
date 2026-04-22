import { describe, it, expect } from "vitest";
import { findDefinition, findReferences } from "@features/editor/jumpToDefinition";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const SAMPLE_DOC = `metadata:
  team: Platform

services:
  recipe_api:
    name: Recipe API
    description: Backend for recipe data.
    type: backend
    status: active
    upstream:
      - service: ingredients_db
        protocol: PostgreSQL
    business_flows:
      - meal_planning

  ingredients_db:
    name: Ingredients DB
    type: datastore
    status: active

business_flows:
  meal_planning:
    name: Meal Planning
    description: The core meal-planning flow.
    priority: P1
    stakeholders: [Product]

data_flows:
  recipe_pipeline:
    name: Recipe Pipeline
    description: Moves recipe data.
    business_flow: meal_planning
    data_type: dataset
    sensitivity: internal
    freshness: near-real-time
    stages:
      - service: recipe_api
        action: produces
      - service: ingredients_db
        action: stores
`;

// ---------------------------------------------------------------------------
// findDefinition
// ---------------------------------------------------------------------------

describe("findDefinition", () => {
  it("finds a service key at 2-space indent", () => {
    const pos = findDefinition(SAMPLE_DOC, "recipe_api");
    expect(pos).not.toBeNull();
    expect(SAMPLE_DOC.slice(pos!, pos! + "recipe_api".length)).toBe("recipe_api");
  });

  it("finds a business_flow key at 2-space indent", () => {
    const pos = findDefinition(SAMPLE_DOC, "meal_planning");
    expect(pos).not.toBeNull();
    expect(SAMPLE_DOC.slice(pos!, pos! + "meal_planning".length)).toBe("meal_planning");
  });

  it("finds a data_flow key at 2-space indent", () => {
    const pos = findDefinition(SAMPLE_DOC, "recipe_pipeline");
    expect(pos).not.toBeNull();
    expect(SAMPLE_DOC.slice(pos!, pos! + "recipe_pipeline".length)).toBe("recipe_pipeline");
  });

  it("returns null for a key that does not exist", () => {
    expect(findDefinition(SAMPLE_DOC, "nonexistent_key")).toBeNull();
  });

  it("returns null for section headers at 0-space indent", () => {
    // 'services', 'business_flows', 'metadata' are at column 0 — not definitions.
    expect(findDefinition(SAMPLE_DOC, "services")).toBeNull();
    expect(findDefinition(SAMPLE_DOC, "business_flows")).toBeNull();
    expect(findDefinition(SAMPLE_DOC, "metadata")).toBeNull();
  });

  it("returns null for field names at 4+ spaces indent", () => {
    // 'name', 'type', 'status' are always at 4-space indent.
    expect(findDefinition(SAMPLE_DOC, "name")).toBeNull();
    expect(findDefinition(SAMPLE_DOC, "type")).toBeNull();
    expect(findDefinition(SAMPLE_DOC, "status")).toBeNull();
  });

  it("works when the definition is at the very start of the string (no leading newline)", () => {
    const doc = "  recipe_api:\n    name: Recipe API\n";
    const pos = findDefinition(doc, "recipe_api");
    expect(pos).toBe(2); // after the two leading spaces
    expect(doc.slice(pos!, pos! + "recipe_api".length)).toBe("recipe_api");
  });

  it("works when the definition is in the middle of a multi-section document", () => {
    const doc = `services:\n  a_service:\n    name: A\nbusiness_flows:\n  b_flow:\n    name: B\n`;
    const posA = findDefinition(doc, "a_service");
    const posB = findDefinition(doc, "b_flow");
    expect(posA).not.toBeNull();
    expect(posB).not.toBeNull();
    expect(doc.slice(posA!, posA! + "a_service".length)).toBe("a_service");
    expect(doc.slice(posB!, posB! + "b_flow".length)).toBe("b_flow");
  });

  it("does not match a key that is a substring of another key", () => {
    const doc = `services:\n  recipe_api_v2:\n    name: V2\n  recipe_api:\n    name: V1\n`;
    const pos = findDefinition(doc, "recipe_api");
    // Must find the exact key "recipe_api:", not "recipe_api_v2:"
    expect(pos).not.toBeNull();
    // The character after the match must be ':' not '_'
    expect(doc[pos! + "recipe_api".length]).toBe(":");
  });
});

// ---------------------------------------------------------------------------
// findReferences
// ---------------------------------------------------------------------------

describe("findReferences", () => {
  it("returns all value occurrences excluding the definition line", () => {
    const defPos = findDefinition(SAMPLE_DOC, "recipe_api")!;
    const refs = findReferences(SAMPLE_DOC, "recipe_api", defPos);

    // recipe_api appears in data_flows stages
    expect(refs.length).toBeGreaterThan(0);
    // The definition position must NOT be in refs
    expect(refs).not.toContain(defPos);
    // Every ref position should have the key text
    for (const pos of refs) {
      expect(SAMPLE_DOC.slice(pos, pos + "recipe_api".length)).toBe("recipe_api");
    }
  });

  it("returns empty array when the key is defined but never referenced", () => {
    const doc = `services:\n  loner_service:\n    name: Loner\n    type: backend\n    status: active\n`;
    const defPos = findDefinition(doc, "loner_service")!;
    const refs = findReferences(doc, "loner_service", defPos);
    expect(refs).toHaveLength(0);
  });

  it("handles a key that appears in upstream, business_flows, and stage references", () => {
    const defPos = findDefinition(SAMPLE_DOC, "meal_planning")!;
    const refs = findReferences(SAMPLE_DOC, "meal_planning", defPos);
    // meal_planning appears in: service.business_flows array AND data_flow.business_flow field
    expect(refs.length).toBeGreaterThanOrEqual(2);
    expect(refs).not.toContain(defPos);
  });

  it("does not return the definition position itself", () => {
    const defPos = findDefinition(SAMPLE_DOC, "ingredients_db")!;
    const refs = findReferences(SAMPLE_DOC, "ingredients_db", defPos);
    expect(refs).not.toContain(defPos);
  });

  it("does not match substrings of longer keys", () => {
    const doc = [
      "services:",
      "  api:",
      "    name: API",
      "    status: active",
      "    type: backend",
      "    upstream:",
      "      - service: recipe_api",
      "  recipe_api:",
      "    name: Recipe API",
      "    status: active",
      "    type: backend",
    ].join("\n");

    const defPos = findDefinition(doc, "api")!;
    const refs = findReferences(doc, "api", defPos);
    // "recipe_api" contains "api" but the lookbehind prevents it from matching
    for (const pos of refs) {
      const before = pos > 0 ? doc[pos - 1] : "";
      expect(before).not.toMatch(/[a-z0-9_]/);
    }
  });
});
