/**
 * @jest-environment jsdom
 */
import React from "react";
import { act } from "react";
import { render, screen, waitFor } from "@testing-library/react";
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
    await userEvent.setup().click(screen.getByRole("button", { name: /filter/i }));
    expect(document.getElementById("admin-commissions-status-filter")).toHaveValue("pending");
  });

  it("writes a picked status to the URL", async () => {
    const user = userEvent.setup();
    await act(async () => {
      render(<AdminCommissionsPage />);
    });

    await user.click(screen.getByRole("button", { name: /filter/i }));
    await user.selectOptions(document.getElementById("admin-commissions-status-filter")!, "disputed");

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
    expect(screen.getByRole("button", { name: /add commission/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/commissions?page=1&limit=10");
    });

    await screen.findByText("Sahar Ali");

    expect(screen.getByText("Sahar Ali")).toBeInTheDocument();
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

    expect(screen.queryByLabelText("Date from")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /filter/i }));

    expect(screen.getByLabelText("Date from")).toBeInTheDocument();
    expect(screen.getByLabelText("Date to")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /clear filters/i })).toBeInTheDocument();
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
