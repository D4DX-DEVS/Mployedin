/**
 * @jest-environment jsdom
 */
/**
 * The rows-per-page box printed nothing until the page was hydrated: Radix
 * fills the trigger from its closed list, which only exists in the browser.
 * The number is now part of the first paint (server-rendered markup), and what
 * is shown after hydration is unchanged.
 */
import React from "react";
import { renderToString } from "react-dom/server";
import { render, screen } from "@testing-library/react";
import { PaginationControls } from "@/components/shared/PaginationControls";

jest.mock("next/navigation", () => ({ useParams: () => ({ locale: "en" }) }));

const props = { page: 1, totalPages: 3, total: 26, limit: 25, onPageChange: jest.fn(), onLimitChange: jest.fn() };

describe("PaginationControls", () => {
  it("has the rows-per-page number in the server-rendered markup, not an empty box", () => {
    const html = renderToString(<PaginationControls {...props} />);

    expect(html).toMatch(/role="combobox"[^>]*>\s*<span[^>]*>25<\/span>/);
  });

  it("shows the same number, range and total after hydration", () => {
    render(<PaginationControls {...props} />);

    expect(screen.getByRole("combobox", { name: "Rows per page" })).toHaveTextContent("25");
    expect(screen.getByText(/1–25/)).toBeInTheDocument();
    expect(screen.getByText(/26/)).toBeInTheDocument();
  });

  it("still shows a page size that is not in the list", () => {
    render(<PaginationControls {...props} limit={20} />);

    expect(screen.getByRole("combobox")).toHaveTextContent("20");
  });

  it("shows a caller's own summary in place of the range", () => {
    render(<PaginationControls {...props} summary={<span>custom summary</span>} />);

    expect(screen.getByText("custom summary")).toBeInTheDocument();
    expect(screen.queryByText(/1–25/)).not.toBeInTheDocument();
  });
});
