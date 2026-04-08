import { act, renderHook } from "@testing-library/react";

import { DEFAULT_REGISTRY_TEMPLATE, type Registry, validateRegistryText } from "@domain/registry";
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

  it("switches from overview to impact when selecting a service", () => {
    const parsed = validateRegistryText(DEFAULT_REGISTRY_TEMPLATE);
    if (!parsed.registry) {
      throw new Error("Expected default registry template to validate in tests.");
    }

    const { result } = renderHook(() => useCatalogViewModel(parsed.registry));

    act(() => {
      result.current.handleServiceClick("example_ui");
    });

    expect(result.current.mode).toBe("impact");
    expect(result.current.impactDirection).toBe("downstream");
    expect(result.current.selectedService).toBe("example_ui");
    expect(result.current.mermaidExport).not.toBeNull();
  });

  it("returns null impact export when no service is selected", () => {
    const parsed = validateRegistryText(DEFAULT_REGISTRY_TEMPLATE);
    if (!parsed.registry) {
      throw new Error("Expected default registry template to validate in tests.");
    }

    const { result } = renderHook(() => useCatalogViewModel(parsed.registry));

    act(() => {
      result.current.handleTabChange("impact");
    });

    expect(result.current.mode).toBe("impact");
    expect(result.current.selectedService).toBeNull();
    expect(result.current.mermaidExport).toBeNull();
  });

  it("clears graph and data selections when returning to overview", () => {
    const parsed = validateRegistryText(DEFAULT_REGISTRY_TEMPLATE);
    if (!parsed.registry) {
      throw new Error("Expected default registry template to validate in tests.");
    }

    const { result } = renderHook(() => useCatalogViewModel(parsed.registry));

    act(() => {
      result.current.handleServiceClick("example_ui");
      result.current.setSelectedStakeholder("Product");
      result.current.setSelectedFlow("example_flow");
      result.current.setSelectedDataFlow("example_data_flow");
    });

    act(() => {
      result.current.handleTabChange("overview");
    });

    expect(result.current.mode).toBe("overview");
    expect(result.current.selectedService).toBeNull();
    expect(result.current.selectedStakeholder).toBeNull();
    expect(result.current.selectedFlow).toBeNull();
    expect(result.current.selectedDataFlow).toBeNull();
  });
});
