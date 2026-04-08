import { render, screen } from "@testing-library/react";

import { SchemaHintsPanel } from "@features/editor/SchemaHintsPanel";

describe("SchemaHintsPanel", () => {
  it("renders empty guidance when no hint is active", () => {
    render(<SchemaHintsPanel hint={null} />);

    expect(screen.getByText("Schema Hints")).toBeInTheDocument();
    expect(screen.getByText(/Move the cursor inside a `services`/)).toBeInTheDocument();
  });

  it("renders required/optional fields, enums, and starter snippet when hint exists", () => {
    render(
      <SchemaHintsPanel
        hint={{
          description: "Full description",
          optionalFields: [
            {
              description: "Optional desc",
              enumValues: ["x", "y"],
              name: "optional_key",
              summaryDescription: "Optional summary",
            },
          ],
          requiredFields: [
            {
              description: "Required desc",
              enumValues: ["a", "b"],
              name: "required_key",
              summaryDescription: "Required summary",
            },
          ],
          snippet: "example_key:\n  required_key: a",
          summaryDescription: "Hint summary",
          title: "Service Entry",
        }}
      />,
    );

    expect(screen.getByText("Service Entry")).toBeInTheDocument();
    expect(screen.getByText("Hint summary")).toBeInTheDocument();
    expect(screen.getByText("Required fields")).toBeInTheDocument();
    expect(screen.getByText("required_key")).toBeInTheDocument();
    expect(screen.getByText("Allowed: a, b")).toBeInTheDocument();
    expect(screen.getByText("Optional fields")).toBeInTheDocument();
    expect(screen.getByText("optional_key")).toBeInTheDocument();
    expect(screen.getByText("Allowed: x, y")).toBeInTheDocument();
    expect(screen.getByText("Starter shape")).toBeInTheDocument();
    expect(screen.getByText(/example_key:/)).toBeInTheDocument();
    expect(screen.getByText(/required_key: a/)).toBeInTheDocument();
  });

  it("hides optional and summary sections when hint has no optional fields or summary", () => {
    render(
      <SchemaHintsPanel
        hint={{
          description: null,
          optionalFields: [],
          requiredFields: [
            {
              description: null,
              enumValues: null,
              name: "required_key",
              summaryDescription: null,
            },
          ],
          snippet: "example_key:\n  required_key: value",
          summaryDescription: null,
          title: "Data Flow Entry",
        }}
      />,
    );

    expect(screen.queryByText("Optional fields")).not.toBeInTheDocument();
    expect(screen.queryByText("Allowed:")).not.toBeInTheDocument();
    expect(screen.queryByText("Hint summary")).not.toBeInTheDocument();
  });
});
