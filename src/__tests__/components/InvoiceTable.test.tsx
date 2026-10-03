/**
 * @jest-environment jsdom
 */
import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { InvoiceTable, type InvoiceTableInvoice } from "@/components/shared/InvoiceTable";

/* Shared by the agent and super-agent invoice pages. Two rules that are easy to
   undo by reordering the column list or simplifying the row handler:
   - Phones show only the first two cells of a collapsed card, so the status
     must stay in column 2 for both roles.
   - On phones the row's own tap expands the card; it must not also open the
     invoice. The eye button stays the way in. */

const invoice: InvoiceTableInvoice = {
  _id: "inv-1",
  invoiceNumber: "INV-0001",
  category: "placement_fee",
  totalAmount: 1000,
  paidAmount: 250,
  balanceDue: 750,
  currency: "AED",
  status: "overdue",
  dueDate: "2026-09-30T00:00:00.000Z",
  employerId: { companyName: "Acme" },
  agentId: { name: "Sara" },
};

function setPhoneWidth(isPhone: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: isPhone && query.includes("max-width: 639px"),
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      onchange: null,
      dispatchEvent: jest.fn(),
    }),
  });
}

describe("InvoiceTable", () => {
  it.each(["agent", "super_agent"] as const)("keeps status in column 2 for %s", (role) => {
    render(<InvoiceTable invoices={[invoice]} loading={false} role={role} onSelect={jest.fn()} />);
    const headers = screen.getAllByRole("columnheader");
    expect(headers[1]).toHaveTextContent(/status/i);
    const cells = within(screen.getAllByRole("row")[1]).getAllByRole("cell");
    expect(cells[0]).toHaveTextContent("INV-0001");
    expect(cells[1]).not.toHaveTextContent("Acme");
  });

  it("opens the invoice on a desktop row click", () => {
    setPhoneWidth(false);
    const onSelect = jest.fn();
    render(<InvoiceTable invoices={[invoice]} loading={false} role="agent" onSelect={onSelect} />);
    fireEvent.click(screen.getByText("INV-0001"));
    expect(onSelect).toHaveBeenCalledWith("inv-1");
  });

  it("does not open the invoice when a phone tap expands the card", () => {
    setPhoneWidth(true);
    const onSelect = jest.fn();
    render(<InvoiceTable invoices={[invoice]} loading={false} role="agent" onSelect={onSelect} />);
    fireEvent.click(screen.getByText("INV-0001"));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("opens the invoice from the eye button on a phone, once", () => {
    setPhoneWidth(true);
    const onSelect = jest.fn();
    render(<InvoiceTable invoices={[invoice]} loading={false} role="super_agent" onSelect={onSelect} />);
    const row = screen.getAllByRole("row")[1];
    const viewButton = within(row).getAllByRole("button").find((b) => b.hasAttribute("data-table-action"));
    expect(viewButton).toBeDefined();
    fireEvent.click(viewButton!);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
