import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DEFAULT_REGISTRY_TEMPLATE, validateRegistryText } from "@domain/registry";
import { CatalogView } from "@features/catalog/CatalogView";

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
    expect(screen.getByTestId("graph-workspace")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Dependency Impact" }));
    const directionGroup = screen.getByRole("group", { name: "impact direction" });
    const directionButtons = within(directionGroup).getAllByRole("button");
    expect(directionButtons.map((button) => button.textContent)).toEqual([
      "Upstream",
      "Downstream",
    ]);
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
    expect(screen.getByTestId("graph-workspace")).toBeInTheDocument();
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
    expect(screen.getByText("2 stages")).toBeInTheDocument();
    expect(screen.getByText("Action")).toBeInTheDocument();
  });

  it("supports selecting services in impact mode and toggling direction", async () => {
    render(
      <CatalogView
        onEditRegistry={() => {}}
        onToggleTheme={() => {}}
        registry={registry}
        sourceLabel="service_registry.yaml"
        theme="dark"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Dependency Impact" }));
    await userEvent.click(screen.getByRole("button", { name: /select a service/i }));
    await userEvent.click(screen.getByRole("button", { name: "Example UI" }));

    const detailsDock = screen.getByTestId("graph-workspace-dock");
    expect(detailsDock).toContainElement(within(detailsDock).getByText("Example UI"));
    expect(within(detailsDock).getByText("Direct dependencies")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Upstream" }));
    expect(screen.getByText(/upstream deps/i)).toBeInTheDocument();
  });

  it("jumps from impact details into data lineage and renders on-call links", async () => {
    const service = registry.services.example_ui;
    const enrichedRegistry = {
      ...registry,
      services: {
        ...registry.services,
        example_ui: {
          ...service,
          dashboard: "https://example.com/dashboards/example-ui",
          on_call: "https://pagerduty.example.com/example-ui",
          incident_channel: "#incidents-platform",
          slo: "99.9%",
        },
      },
    };

    render(
      <CatalogView
        onEditRegistry={() => {}}
        onToggleTheme={() => {}}
        registry={enrichedRegistry}
        sourceLabel="service_registry.yaml"
        theme="dark"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Dependency Impact" }));
    await userEvent.click(screen.getByRole("button", { name: /select a service/i }));
    await userEvent.click(screen.getByRole("button", { name: "Example UI" }));

    expect(screen.getByRole("link", { name: "Runbook ↗" })).toHaveAttribute(
      "href",
      "https://example.com/runbooks/example-ui",
    );
    expect(screen.getByRole("link", { name: "Health check ↗" })).toHaveAttribute(
      "href",
      "https://example.com/health/example-ui",
    );
    expect(screen.getByRole("link", { name: "Dashboard ↗" })).toHaveAttribute(
      "href",
      "https://example.com/dashboards/example-ui",
    );
    expect(screen.getByRole("link", { name: "On-call ↗" })).toHaveAttribute(
      "href",
      "https://pagerduty.example.com/example-ui",
    );
    expect(screen.getByText("#incidents-platform")).toBeInTheDocument();
    expect(screen.getByText("SLO 99.9%")).toBeInTheDocument();

    await userEvent.click(screen.getByText(/Example Data Flow/));
    expect(screen.getByText("Describe how data moves between services.")).toBeInTheDocument();
    expect(screen.getByText("Data Lineage")).toBeInTheDocument();
  });

  it("toggles legend filters for status, ownership, and type in graph modes", async () => {
    render(
      <CatalogView
        onEditRegistry={() => {}}
        onToggleTheme={() => {}}
        registry={registry}
        sourceLabel="service_registry.yaml"
        theme="dark"
      />,
    );

    const activeStatusButton = screen.getByRole("button", { name: "active" });
    const teamOwnedButton = screen.getByRole("button", { name: "team-owned" });
    const externalButton = screen.getByRole("button", { name: "external" });
    const frontendTypeButton = screen.getByRole("button", { name: /frontend/i });

    expect(activeStatusButton.className).not.toMatch(/legendToggleOff/);
    expect(teamOwnedButton.className).not.toMatch(/legendToggleOff/);
    expect(externalButton.className).not.toMatch(/legendToggleOff/);
    expect(frontendTypeButton.className).not.toMatch(/legendToggleOff/);

    await userEvent.click(activeStatusButton);
    await userEvent.click(teamOwnedButton);
    await userEvent.click(externalButton);
    await userEvent.click(frontendTypeButton);

    expect(activeStatusButton.className).toMatch(/legendToggleOff/);
    expect(teamOwnedButton.className).toMatch(/legendToggleOff/);
    expect(externalButton.className).toMatch(/legendToggleOff/);
    expect(frontendTypeButton.className).toMatch(/legendToggleOff/);
  });
});
