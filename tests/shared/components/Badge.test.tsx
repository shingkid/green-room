import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { Badge } from "@shared/components/Badge";

describe("Badge", () => {
  it("renders a non-clickable badge when no click handler is provided", () => {
    render(<Badge color="#123456">Status</Badge>);

    const badge = screen.getByText("Status");
    expect(badge).toBeInTheDocument();
    expect(badge.className).not.toContain("clickable");
  });

  it("renders clickable style and handles click when handler is provided", async () => {
    const onClick = vi.fn();
    render(
      <Badge color="#123456" onClick={onClick}>
        Status
      </Badge>,
    );

    const badge = screen.getByText("Status");
    expect(badge.className).toContain("clickable");
    await userEvent.click(badge);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
