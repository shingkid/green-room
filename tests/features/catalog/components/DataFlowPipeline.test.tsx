import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { DataFlowPipeline } from "@features/catalog/components/DataFlowPipeline";
import type { DataFlow, Service } from "@domain/registry";

describe("DataFlowPipeline", () => {
  const services: Record<string, Service> = {
    api: {
      business_flows: ["checkout"],
      description: "API",
      health_check: "https://example.com/health",
      name: "Example API",
      owner: "platform",
      runbook: "https://example.com/runbook",
      status: "active",
      type: "backend",
      upstream: [],
    },
    db: {
      business_flows: ["checkout"],
      description: "DB",
      health_check: "https://example.com/health-db",
      name: "Example DB",
      owner: "platform",
      runbook: "https://example.com/runbook-db",
      status: "active",
      type: "datastore",
      upstream: [],
    },
  };

  it("renders stages and allows selecting a service from stage nodes", async () => {
    const onSelectService = vi.fn();
    const dataFlow: DataFlow = {
      business_flow: "checkout",
      data_type: "event",
      description: "Flow desc",
      freshness: "real-time",
      name: "Checkout Events",
      sensitivity: "internal",
      stages: [
        { action: "processes", process_kind: "transform", service: "api" },
        { action: "stores", service: "db", store_kind: "database" },
      ],
    };

    render(
      <DataFlowPipeline
        dataFlow={dataFlow}
        onSelectService={onSelectService}
        selectedService={null}
        services={services}
      />,
    );

    expect(screen.getByText("PROCESSES")).toBeInTheDocument();
    expect(screen.getByText("STORES")).toBeInTheDocument();
    expect(screen.getByText("Example API")).toBeInTheDocument();
    expect(screen.getByText("transform")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Example API"));
    expect(onSelectService).toHaveBeenCalledWith("api");
  });

  it("falls back to raw service key and format detail when service metadata is missing", () => {
    const dataFlow: DataFlow = {
      business_flow: "checkout",
      data_type: "dataset",
      description: "Flow desc",
      freshness: "hourly",
      name: "Unknown Service Flow",
      sensitivity: "internal",
      stages: [{ action: "produces", format: "JSON", service: "missing_service" }],
    };

    render(
      <DataFlowPipeline
        dataFlow={dataFlow}
        onSelectService={() => {}}
        selectedService={"missing_service"}
        services={{}}
      />,
    );

    expect(screen.getByText("PRODUCES")).toBeInTheDocument();
    expect(screen.getByText("missing_service")).toBeInTheDocument();
    expect(screen.getByText("JSON")).toBeInTheDocument();
  });
});
