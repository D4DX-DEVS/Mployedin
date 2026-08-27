/* global expect */

import { describe, it, jest } from "@jest/globals";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/DataTable";

type Person = { name: string; email: string };

const columns: ColumnDef<Person>[] = [
  { accessorKey: "name", header: "Name", enableSorting: true },
  { accessorKey: "email", header: "Email", enableSorting: false },
];

const data: Person[] = [{ name: "Ada", email: "ada@example.com" }];

describe("DataTable accessibility", () => {
  it("labels search and page-size controls and announces result state", () => {
    render(
      <DataTable
        columns={columns}
        data={data}
        totalCount={1}
        searchPlaceholder="Search people"
      />
    );

    expect(screen.getByRole("textbox", { name: "Search people" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Rows per page" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Showing 1–1 of 1");
  });

  it("uses a real sortable header button and exposes the sort direction", () => {
    render(<DataTable columns={columns} data={data} totalCount={1} />);

    const nameHeader = screen.getByRole("columnheader", { name: /Name/ });
    const sortButton = within(nameHeader).getByRole("button", { name: /Name/ });
    expect(nameHeader).toHaveAttribute("aria-sort", "none");

    fireEvent.click(sortButton);
    expect(nameHeader).toHaveAttribute("aria-sort", "ascending");
  });

  it("activates interactive cards and rows with Enter or Space", () => {
    const onRowClick = jest.fn();
    const { container } = render(
      <DataTable
        columns={columns}
        data={data}
        totalCount={1}
        onRowClick={onRowClick}
        rowActionLabel={(person) => `View ${person.name}`}
      />
    );

    const card = screen.getByRole("button", { name: "View Ada" });
    fireEvent.keyDown(card, { key: "Enter" });

    const desktopRow = container.querySelector<HTMLTableRowElement>("tbody tr[tabindex='0']");
    expect(desktopRow).not.toBeNull();
    fireEvent.keyDown(desktopRow!, { key: " " });

    expect(onRowClick).toHaveBeenCalledTimes(2);
    expect(onRowClick).toHaveBeenNthCalledWith(1, data[0]);
    expect(onRowClick).toHaveBeenNthCalledWith(2, data[0]);
  });

  it("marks loading views busy and announces loading", () => {
    const { container } = render(
      <DataTable columns={columns} data={[]} totalCount={0} isLoading />
    );

    expect(container.querySelector("table")).toHaveAttribute("aria-busy", "true");
    expect(container.querySelector(".sm\\:hidden")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Loading...");
  });
});
