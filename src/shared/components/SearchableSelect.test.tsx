import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { SearchableSelect } from "./SearchableSelect";

const options = [
  { label: "Checkout", value: "checkout", searchText: "payments purchase" },
  { label: "Reporting", value: "reporting", searchText: "analytics daily" },
];

describe("SearchableSelect", () => {
  it("opens, filters options, and selects an item", async () => {
    const onChange = vi.fn();
    render(
      <SearchableSelect
        allLabel="All flows"
        ariaLabel="flows"
        emptyMessage="No matches"
        onChange={onChange}
        options={options}
        placeholder="Select flow"
        value={null}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /select flow/i }));
    await userEvent.type(screen.getByRole("textbox", { name: "flows" }), "analytics");
    await userEvent.click(screen.getByRole("button", { name: "Reporting" }));

    expect(onChange).toHaveBeenCalledWith("reporting");
  });

  it("resets query and closes on escape", async () => {
    const onChange = vi.fn();
    render(
      <SearchableSelect
        allLabel="All services"
        ariaLabel="services"
        emptyMessage="No matches"
        onChange={onChange}
        options={options}
        placeholder="Select service"
        value={null}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /select service/i }));
    const input = screen.getByRole("textbox", { name: "services" });
    await userEvent.type(input, "no-match");
    expect(screen.getByText("No matches")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("textbox", { name: "services" })).not.toBeInTheDocument();
  });
});
