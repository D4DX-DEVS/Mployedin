import { fireEvent, render, screen } from "@testing-library/react";
import { StatusFilterStrip } from "@/components/shared/StatusFilterStrip";

describe("StatusFilterStrip", () => {
  it("exposes compact counts as named, touch-safe selection controls", () => {
    const onSelect = jest.fn();

    render(
      <StatusFilterStrip
        label="Filter jobs by status"
        selectedId="all"
        onSelect={onSelect}
        items={[
          { id: "all", label: "All", value: 31 },
          { id: "active", label: "Active", value: 16 },
          { id: "draft", label: "Drafts", value: 4 },
          { id: "paused", label: "Paused", value: 3 },
        ]}
      />
    );

    expect(screen.getByRole("group", { name: "Filter jobs by status" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "31 All" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "4 Drafts" })).toHaveClass("min-h-14");

    fireEvent.click(screen.getByRole("button", { name: "4 Drafts" }));
    expect(onSelect).toHaveBeenCalledWith("draft");
  });
});
