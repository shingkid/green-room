import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DEFAULT_REGISTRY_TEMPLATE, validateRegistryText } from "../../domain/registry";
import { CatalogView } from "./CatalogView";

const parsed = validateRegistryText(DEFAULT_REGISTRY_TEMPLATE);

if (!parsed.registry) {
  throw new Error("Expected default registry template to validate in tests.");
}
const registry = parsed.registry;

describe("CatalogView", () => {
  it("renders graph mode and allows switching tabs", async () => {
    render(
      <CatalogView
        onEditRegistry={() => {}}
        onToggleTheme={() => {}}
        registry={registry}
        sourceLabel="service_registry.yaml"
        theme="dark"
      />,
    );

    expect(screen.getByRole("button", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dependency Impact" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Business Flow" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Data Lineage" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Dependency Impact" }));
    expect(screen.getByText("Downstream")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Upstream"));

    await userEvent.click(screen.getByRole("button", { name: "Data Lineage" }));
    expect(screen.getByText("Example Data Flow")).toBeInTheDocument();
  });

  it("shows flow filters in business flow mode", async () => {
    render(
      <CatalogView
        onEditRegistry={() => {}}
        onToggleTheme={() => {}}
        registry={registry}
        sourceLabel="service_registry.yaml"
        theme="dark"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Business Flow" }));
    expect(screen.getByRole("button", { name: /filter by stakeholder/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /filter business flows/i })).toBeInTheDocument();
  });

  it("expands data flow details and renders pipeline stages", async () => {
    render(
      <CatalogView
        onEditRegistry={() => {}}
        onToggleTheme={() => {}}
        registry={registry}
        sourceLabel="service_registry.yaml"
        theme="light"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Data Lineage" }));
    await userEvent.click(screen.getByText("Example Data Flow"));

    expect(screen.getByText("Describe how data moves between services.")).toBeInTheDocument();
    expect(screen.getAllByText("Example UI").length).toBeGreaterThan(0);
    expect(screen.getByText("processes · transform")).toBeInTheDocument();
  });
});
