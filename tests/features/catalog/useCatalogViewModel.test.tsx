import { renderHook } from "@testing-library/react";

import type { Registry } from "@domain/registry";
import { useCatalogViewModel } from "@features/catalog/useCatalogViewModel";

const registry: Registry = {
  metadata: {
    team: "Platform",
    team_id: "platform_team",
    last_updated: "2026-04-08",
    maintainers: [{ name: "Jane", slack: "@jane" }],
  },
  business_flows: {
    p2_alpha: {
      name: "Alpha Flow",
      description: "Alpha",
      priority: "P2",
      stakeholders: ["Product"],
    },
    p1_zeta: {
      name: "Zeta Flow",
      description: "Zeta",
      priority: "P1",
      stakeholders: ["Product"],
    },
    p1_beta: {
      name: "Beta Flow",
      description: "Beta",
      priority: "P1",
      stakeholders: ["Product"],
    },
  },
  data_flows: {},
  services: {},
};

describe("useCatalogViewModel business flow sorting", () => {
  it("sorts business flow options by priority then alphabetical", () => {
    const { result } = renderHook(() => useCatalogViewModel(registry));

    expect(result.current.businessFlowOptions.map((option) => option.value)).toEqual([
      "p1_beta",
      "p1_zeta",
      "p2_alpha",
    ]);
  });

  it("applies the same ordering for data mode flow options", () => {
    const { result } = renderHook(() => useCatalogViewModel(registry));

    expect(result.current.dataBusinessFlowOptions.map((option) => option.value)).toEqual([
      "p1_beta",
      "p1_zeta",
      "p2_alpha",
    ]);
  });
});
