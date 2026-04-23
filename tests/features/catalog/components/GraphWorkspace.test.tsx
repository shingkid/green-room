import { render, screen } from "@testing-library/react";

import { GraphWorkspace } from "@features/catalog/components/GraphWorkspace";

describe("GraphWorkspace", () => {
  it("renders graph canvas with top-right controls slot and optional details dock", () => {
    render(
      <GraphWorkspace
        controls={<button type="button">hosting-control</button>}
        details={<div>details-panel</div>}
        graph={<div>graph-canvas</div>}
        showDetails
      />,
    );

    expect(screen.getByText("graph-canvas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "hosting-control" })).toBeInTheDocument();
    expect(screen.getByText("details-panel")).toBeInTheDocument();
  });

  it("hides details dock when showDetails is false", () => {
    render(
      <GraphWorkspace
        controls={<button type="button">hosting-control</button>}
        details={<div>details-panel</div>}
        graph={<div>graph-canvas</div>}
        showDetails={false}
      />,
    );

    expect(screen.queryByText("details-panel")).not.toBeInTheDocument();
  });
});
