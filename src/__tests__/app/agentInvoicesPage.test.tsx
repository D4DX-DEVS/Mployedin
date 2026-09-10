/**
 * @jest-environment jsdom
 */
import React from "react";
import { act } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AgentInvoicesPage from "@/app/[locale]/(dashboard)/agent/invoices/page";

/* The invoice search box was rendered as `search="" onSearchChange={() => {}}`.
   That is a controlled input whose value can never change, so the field looked
   editable and silently swallowed every keystroke. These tests hold the field
   to the two things that were broken: it must accept typing, and what is typed
   must reach `/api/invoices` as a `search` param. */

let searchParamsState = new URLSearchParams();
const replaceMock = jest.fn((href: string) => {
  searchParamsState = new URLSearchParams(href.split("?")[1] ?? "");
});

const paginationState = {
  page: 1,
  limit: 10,
  total: 2,
  totalPages: 1,
  setPage: jest.fn(),
  setLimit: jest.fn(),
  updateTotal: jest.fn(),
  resetPage: jest.fn(),
};

jest.mock("@/hooks/usePagination", () => ({
  usePagination: () => paginationState,
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: (href: string) => replaceMock(href) }),
  usePathname: () => "/en/agent/invoices",
  useSearchParams: () => searchParamsState,
  useParams: () => ({ locale: "en" }),
}));

jest.mock("@/hooks/useCurrencyPreference", () => ({
  useCurrencyPreference: () => ({ displayCurrency: "AED" }),
}));

jest.mock("@/hooks/useInvoiceAnalytics", () => ({
  useInvoiceAnalytics: () => ({ data: null, loading: false, refresh: jest.fn() }),
}));

jest.mock("@/hooks/useTableExport", () => ({
  useTableExport: () => ({
    handleExportCsv: jest.fn(),
    handleExportExcel: jest.fn(),
    handleExportPdf: jest.fn(),
  }),
}));

jest.mock("@/components/shared/PaginationControls", () => ({
  PaginationControls: () => <div data-testid="pagination-controls" />,
}));

jest.mock("@/components/shared/InvoiceTable", () => ({
  InvoiceTable: ({ invoices }: { invoices: Array<{ _id: string; invoiceNumber: string }> }) => (
    <table>
      <tbody>
        {invoices.map((invoice) => (
          <tr key={invoice._id}>
            <td>{invoice.invoiceNumber}</td>
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));

jest.mock("@/components/features/invoices/InvoiceBuilder", () => ({
  InvoiceBuilder: () => null,
}));

jest.mock("@/components/features/invoices/InvoiceDetailView", () => ({
  InvoiceDetailView: () => null,
}));

jest.mock("@/components/features/invoices/RevenueAnalyticsPanel", () => ({
  RevenueAnalyticsPanel: () => null,
}));

jest.mock("@/components/ui/searchable-select", () => ({
  SearchableSelect: ({ id, value }: { id?: string; value: string }) => (
    <select id={id} value={value} onChange={() => {}} aria-label="Status filter">
      <option value={value}>{value}</option>
    </select>
  ),
}));

jest.mock("@/components/ui/date-time-picker", () => ({
  DateTimePicker: () => <input aria-label="Date filter" readOnly />,
}));

jest.mock("sonner", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

const SEARCH_PLACEHOLDER = "Search invoices…";

describe("AgentInvoicesPage search", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    searchParamsState = new URLSearchParams();
    replaceMock.mockClear();
    paginationState.resetPage.mockReset();

    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        invoices: [
          {
            _id: "invoice-1",
            invoiceNumber: "INV-202605-00004",
            category: "recruitment",
            type: "recruitment",
            subtotal: 25000,
            taxAmount: 0,
            totalAmount: 25000,
            paidAmount: 0,
            balanceDue: 25000,
            amount: 25000,
            currency: "AED",
            status: "void",
            issuedAt: "2026-05-13T00:00:00.000Z",
            createdAt: "2026-05-13T00:00:00.000Z",
          },
        ],
        total: 1,
        summary: {
          draft: 0,
          pending_approval: 0,
          issued: 0,
          paid: 0,
          partially_paid: 0,
          totalAmount: 25000,
          totalPaid: 0,
          totalBalance: 25000,
        },
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("accepts keyboard input in the invoice search field", async () => {
    const user = userEvent.setup();

    await act(async () => {
      render(<AgentInvoicesPage />);
    });

    const field = screen.getByPlaceholderText(SEARCH_PLACEHOLDER) as HTMLInputElement;
    expect(field).not.toBeDisabled();
    expect(field).not.toHaveAttribute("readonly");

    await user.type(field, "INV-2026");

    // The whole point of the bug: every character has to survive.
    expect(field.value).toBe("INV-2026");
  });

  it("sends what was typed to /api/invoices as a search param", async () => {
    const user = userEvent.setup();

    await act(async () => {
      render(<AgentInvoicesPage />);
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/invoices?page=1&limit=10");
    });

    await user.type(screen.getByPlaceholderText(SEARCH_PLACEHOLDER), "Alpha");

    await waitFor(() => {
      const searched = fetchMock.mock.calls
        .map(([url]) => String(url))
        .filter((url) => url.includes("search="));
      expect(searched.at(-1)).toContain("search=Alpha");
    });
  });

  it("returns to page 1 when the search term changes", async () => {
    const user = userEvent.setup();

    await act(async () => {
      render(<AgentInvoicesPage />);
    });

    await user.type(screen.getByPlaceholderText(SEARCH_PLACEHOLDER), "A");

    expect(paginationState.resetPage).toHaveBeenCalled();
  });
});
