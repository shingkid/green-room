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
  hosting: {},
  stakeholders: {},
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

function getDefaultRegistry(): Registry {
  const parsed = validateRegistryText(DEFAULT_REGISTRY_TEMPLATE);
  if (!parsed.registry) {
    throw new Error("Expected default registry template to validate in tests.");
  }
  return parsed.registry;
}

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
    const { result } = renderHook(() => useCatalogViewModel(getDefaultRegistry()));

    act(() => {
      result.current.handleServiceClick("example_ui");
    });

    expect(result.current.mode).toBe("impact");
    expect(result.current.impactDirection).toBe("downstream");
    expect(result.current.selectedService).toBe("example_ui");
    expect(result.current.mermaidExport).not.toBeNull();
  });

  it("returns null impact export when no service is selected", () => {
    const { result } = renderHook(() => useCatalogViewModel(getDefaultRegistry()));

    act(() => {
      result.current.handleTabChange("impact");
    });

    expect(result.current.mode).toBe("impact");
    expect(result.current.selectedService).toBeNull();
    expect(result.current.mermaidExport).toBeNull();
  });

  it("clears graph and data selections when returning to overview", () => {
    const { result } = renderHook(() => useCatalogViewModel(getDefaultRegistry()));

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

  it("resets only legend filter sets", () => {
    const { result } = renderHook(() => useCatalogViewModel(getDefaultRegistry()));

    act(() => {
      result.current.handleTabChange("impact");
      result.current.setSelectedService("example_ui");
      result.current.setSelectedStakeholder("Product");
      result.current.setSelectedFlow("example_flow");
      result.current.setSelectedDataFlow("example_data_flow");
      result.current.handleToggleStatus("active");
      result.current.handleToggleType("frontend");
      result.current.handleToggleOwnership("internal");
    });

    expect(result.current.visibleStatusSet.has("active")).toBe(false);
    expect(result.current.visibleTypeSet.has("frontend")).toBe(false);
    expect(result.current.visibleOwnershipSet.has("internal")).toBe(false);

    act(() => {
      result.current.resetLegendFilters();
    });

    expect(result.current.visibleStatusSet.has("active")).toBe(true);
    expect(result.current.visibleTypeSet.has("frontend")).toBe(true);
    expect(result.current.visibleOwnershipSet.has("internal")).toBe(true);
    expect(result.current.selectedService).toBe("example_ui");
    expect(result.current.selectedStakeholder).toBe("Product");
    expect(result.current.selectedFlow).toBe("example_flow");
    expect(result.current.selectedDataFlow).toBe("example_data_flow");
  });
});
