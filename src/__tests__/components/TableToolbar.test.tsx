/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TableToolbar } from "@/components/shared/TableToolbar";

describe("TableToolbar", () => {
  it("renders compact admin controls with collapsible filters", async () => {
    const user = userEvent.setup();

    render(
      <TableToolbar
        title="FAQs"
        description="Manage frequently asked questions"
        search=""
        onSearchChange={() => undefined}
        searchPlaceholder="Search FAQs"
        actions={<button type="button">Add FAQ</button>}
        filterContent={<div>Advanced filters</div>}
      />
    );

    expect(screen.getByRole("heading", { name: "FAQs" })).toBeInTheDocument();
    expect(screen.getByText("Manage frequently asked questions")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /search faqs/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add faq/i })).toBeInTheDocument();
    expect(screen.queryByText("Advanced filters")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /filter/i }));

    expect(screen.getByText("Advanced filters")).toBeInTheDocument();
  });
});