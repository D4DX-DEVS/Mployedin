/**
 * @jest-environment jsdom
 */
import React from "react";
import { act } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";

import AdminCommissionsPage from "@/app/[locale]/(dashboard)/admin/commissions/page";

const paginationState = {
  page: 1,
  limit: 10,
  total: 12,
  totalPages: 2,
  setPage: jest.fn(),
  setLimit: jest.fn(),
  updateTotal: jest.fn(),
  resetPage: jest.fn(),
};

/* The status filter lives in the URL (the admin dashboard deep-links to
   ?status=pending). The router mock moves jsdom's location so urlQuery's
   pending-write cache cannot leak one test's filter into the next. */
const replaceMock = jest.fn((href: string) => window.history.replaceState({}, "", href));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: replaceMock }),
  usePathname: () => "/en/admin/commissions",
  useSearchParams: () => new URLSearchParams(window.location.search),
  useParams: () => ({ locale: "en" }),
}));

jest.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    can: () => true,
  }),
}));

jest.mock("@/hooks/usePagination", () => ({
  usePagination: () => paginationState,
}));

jest.mock("@/hooks/useConfirm", () => ({
  useConfirm: () => ({
    confirm: jest.fn().mockResolvedValue(false),
    ConfirmDialogNode: null,
  }),
}));

jest.mock("@/components/shared/CrudModal", () => ({
  CrudModal: () => null,
}));

jest.mock("@/components/shared/PaginationControls", () => ({
  PaginationControls: () => <div data-testid="pagination-controls" />,
}));

jest.mock("@/components/ui/input", () => ({
  Input: React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
    (props, ref) => <input ref={ref} {...props} />
  ),
}));

jest.mock("@/components/ui/searchable-select", () => ({
  SearchableSelect: ({
    id,
    value,
    onValueChange,
    options,
  }: {
    id?: string;
    value: string;
    onValueChange: (value: string) => void;
    options: Array<{ value: string; label: string }>;
  }) => (
    <select id={id} aria-label="Status filter" value={value} onChange={(event) => onValueChange(event.target.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

describe("AdminCommissionsPage", () => {
  const fetchMock = jest.fn();
  const toastErrorMock = jest.mocked(toast.error);
  const toastSuccessMock = jest.mocked(toast.success);

  beforeEach(() => {
    window.history.replaceState({}, "", "/en/admin/commissions");
    replaceMock.mockClear();
    paginationState.setPage.mockReset();
    paginationState.setLimit.mockReset();
    paginationState.updateTotal.mockReset();
    paginationState.resetPage.mockReset();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();

    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            _id: "commission-1",
            agentId: { fullName: "Sahar Ali" },
            recipientName: "Sahar Ali",
            recipientRole: "agent",
            invoice: { _id: "invoice-9", invoiceNumber: "INV-202605-00009" },
            amount: 12500,
            currency: "AED",
            status: "pending",
            type: "placement",
            rate: 12,
            createdAt: "2026-04-10T00:00:00.000Z",
          },
        ],
        summary: { pending: 25000, approved: 18000, paid: 9500, currency: "AED" },
        total: 1,
        totalPages: 1,
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("opens already filtered when the URL carries a status (dashboard deep link)", async () => {
    window.history.replaceState({}, "", "/en/admin/commissions?status=pending");

    await act(async () => {
      render(<AdminCommissionsPage />);
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/commissions?page=1&limit=10&status=pending");
    });
    // Status filter is now in the inline filter bar, accessible without opening advanced filters
    const statusSelect = document.getElementById("admin-commissions-status-filter");
    expect(statusSelect).toBeInTheDocument();
    expect(statusSelect).toHaveValue("pending");
  });

  it("writes a picked status to the URL", async () => {
    const user = userEvent.setup();
    await act(async () => {
      render(<AdminCommissionsPage />);
    });

    // Status filter is now in the inline filter bar
    const statusSelect = document.getElementById("admin-commissions-status-filter");
    expect(statusSelect).toBeInTheDocument();
    await user.selectOptions(statusSelect!, "disputed");

    expect(replaceMock).toHaveBeenCalledWith("?status=disputed", { scroll: false });
  });

  it("renders the modern commissions workspace shell and fetched results", async () => {
    const user = userEvent.setup();

    await act(async () => {
      render(<AdminCommissionsPage />);
    });

    // The "Finance workspace" eyebrow above the title was dropped — it restated
    // the sidebar section, and the h1 below already identifies the page.
    expect(screen.getByRole("heading", { level: 1, name: "Commissions" })).toBeInTheDocument();
    // Commissions are generated from recruitment invoices; there is no manual create.
    expect(screen.queryByRole("button", { name: /add commission/i })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/commissions?page=1&limit=10");
    });

    await screen.findByText("Sahar Ali");

    expect(screen.getByText("Sahar Ali")).toBeInTheDocument();
    // The recipient's role and the invoice the line came from are on the row.
    expect(screen.getByRole("columnheader", { name: "Recipient" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Invoice" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "INV-202605-00009" })).toHaveAttribute("href", "/en/admin/invoices?invoice=invoice-9");
    expect(screen.getByText("AED 12,500")).toBeInTheDocument();
    expect(screen.getByText(/12% rate/i)).toBeInTheDocument();
    expect(screen.getByTestId("pagination-controls")).toBeInTheDocument();

    // KPI summary cards show totals from API summary
    expect(screen.getByText("AED 25,000")).toBeInTheDocument();
    expect(screen.getByText("AED 18,000")).toBeInTheDocument();
    expect(screen.getByText("AED 9,500")).toBeInTheDocument();

    // The hero's "records across N pages" badge and the ledger's panel head
    // ("Review and action agent payouts · Showing N records") were dropped —
    // both restated the "Visible records" metric and the pagination footer.
    expect(screen.queryByText(/records across/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /review and action agent payouts/i })).not.toBeInTheDocument();
    expect(screen.getByRole("table").closest("section")).toHaveClass("workspace-panel-surface");
    expect(paginationState.updateTotal).toHaveBeenCalledWith(1);

    // Date range sits behind the filter bar's "Advanced Filters" line.
    expect(screen.queryByLabelText("Date from")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /advanced filters/i }));

    expect(screen.getByLabelText("Date from")).toBeInTheDocument();
    expect(screen.getByLabelText("Date to")).toBeInTheDocument();
  });

  it("records the payment reference when marking a commission paid", async () => {
    const user = userEvent.setup();
    const approvedRow = {
      _id: "commission-2", recipientName: "Rajesh Kumar", recipientRole: "super_agent",
      invoice: null, amount: 8850, currency: "INR", status: "approved", type: "override", rate: 15,
      createdAt: "2026-05-21T00:00:00.000Z",
    };
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") return { ok: true, status: 200, json: async () => ({}) };
      return { ok: true, json: async () => ({ items: [approvedRow], summary: { pending: 0, approved: 8850, paid: 0, currency: "INR" }, total: 1 }) };
    });

    await act(async () => {
      render(<AdminCommissionsPage />);
    });
    await screen.findByText("Rajesh Kumar");
    expect(screen.getByText("Super agent")).toBeInTheDocument();
    expect(screen.getByText("No invoice")).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: /mark paid/i })[0]);
    const dialog = await screen.findByRole("dialog", { name: "Mark as paid" });

    // No reference, no payout.
    await user.click(within(dialog).getByRole("button", { name: "Mark as paid" }));
    expect(within(dialog).getByText("Enter the payment reference.")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "PATCH")).toBe(false);

    await user.type(within(dialog).getByLabelText(/payment reference/i), "NEFT-8841");
    await user.click(within(dialog).getByRole("button", { name: "Mark as paid" }));

    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith("Commission marked as paid"));
    const patch = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "PATCH");
    expect(patch?.[0]).toBe("/api/commissions/commission-2");
    expect(JSON.parse(String((patch?.[1] as RequestInit).body))).toEqual({
      status: "paid", paymentRef: "NEFT-8841", paymentMethod: "bank_transfer", paidAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
  });

  it("totals each currency apart and counts every matching record", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [],
        summary: {
          pending: 7200, approved: 0, paid: 6000, currency: "INR",
          byCurrency: [
            { currency: "INR", pending: 6000, approved: 0, paid: 6000 },
            { currency: "AED", pending: 1200, approved: 0, paid: 0 },
          ],
        },
        total: 0,
        pagination: { total: 37 },
      }),
    });
    paginationState.total = 37;

    await act(async () => {
      render(<AdminCommissionsPage />);
    });

    await screen.findByText("Pending review");
    const card = async (label: string) =>
      [...document.querySelectorAll("[data-header-metric-label]")]
        .find((el) => el.textContent === label)!.closest("[data-header-metric]") as HTMLElement;
    // Never "INR 7,200" — an AED line and an INR line can't be added up.
    const pending = await card("Pending review");
    expect(within(pending).getByText("INR 6,000")).toBeInTheDocument();
    expect(within(pending).getByText("AED 1,200")).toBeInTheDocument();
    expect(within(await card("Paid out")).getByText("INR 6,000")).toBeInTheDocument();
    expect(within(await card("Approved")).getByText("INR 0")).toBeInTheDocument();
    // Records is the server total, not the rows on this page.
    expect(within(await card("Records")).getByText("37")).toBeInTheDocument();
    paginationState.total = 12;
  });

  it("offers Delete only for an unpaid line with no invoice, and Clawback for any paid-out line", async () => {
    const user = userEvent.setup();
    const row = (name: string, extra: Record<string, unknown>) => ({
      _id: name, recipientName: name, recipientRole: "agent", amount: 100, currency: "AED",
      type: "placement", createdAt: "2026-09-01T00:00:00.000Z", ...extra,
    });
    const invoice = { _id: "inv-1", invoiceNumber: "INV-1" };
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          row("Invoice Pending", { status: "pending", invoice }),
          row("Manual Pending", { status: "pending", invoice: null }),
          row("Paid Out", { status: "paid", invoice, paidAt: "2026-09-10T12:00:00.000Z" }),
          row("Disputed Paid", { status: "disputed", invoice, paidAt: "2026-09-10T12:00:00.000Z" }),
          row("Manual Disputed Paid", { status: "disputed", invoice: null, paidAt: "2026-09-10T12:00:00.000Z" }),
        ],
        summary: { pending: 200, approved: 0, paid: 100, currency: "AED" },
        total: 4,
      }),
    });

    await act(async () => {
      render(<AdminCommissionsPage />);
    });
    const rowOf = async (name: string) => (await screen.findByText(name)).closest("tr") as HTMLElement;
    const menuItems = async (name: string) => {
      await user.click(screen.getByRole("button", { name: `More actions for ${name}` }));
      const items = (await screen.findAllByRole("menuitem")).map((el) => el.textContent?.trim());
      await user.keyboard("{Escape}");
      return items;
    };

    // Invoice line: its only extra action (Edit notes) is promoted; no Delete.
    const invoicePending = await rowOf("Invoice Pending");
    expect(within(invoicePending).getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(within(invoicePending).queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
    expect(within(invoicePending).queryByRole("button", { name: /more actions/i })).not.toBeInTheDocument();

    expect(await menuItems("Manual Pending")).toEqual(expect.arrayContaining(["Delete"]));

    const paidOut = await menuItems("Paid Out");
    expect(paidOut).toEqual(expect.arrayContaining(["Dispute", "Clawback"]));
    expect(paidOut).not.toContain("Delete");

    const disputedPaid = await menuItems("Disputed Paid");
    expect(disputedPaid).toContain("Clawback");
    expect(disputedPaid).not.toContain("Delete");

    // Paid, then disputed: still money that went out — clawback, never delete.
    const manualDisputedPaid = await menuItems("Manual Disputed Paid");
    expect(manualDisputedPaid).toContain("Clawback");
    expect(manualDisputedPaid).not.toContain("Delete");
  });

  it("handles fetch failure gracefully", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Network error"));

    await act(async () => {
      render(<AdminCommissionsPage />);
    });

    // Component should not crash on fetch failure
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
  });
});
