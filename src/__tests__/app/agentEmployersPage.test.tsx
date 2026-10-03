/**
 * @jest-environment jsdom
 */
import React from "react";
import { act } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AgentEmployersPage from "@/app/[locale]/(dashboard)/agent/employers/page";

/* The agent's employer list is one table, like admin's. Posting and entering
   the account are offered only for employers assigned to the agent; a
   region-only row can still open its jobs. A failed load or delete must say
   so instead of reading as an empty list or a no-op. */

const PATHNAME = "/en/agent/employers";
let searchParamsState = new URLSearchParams();
const replaceMock = jest.fn((href: string) => {
  const search = href.startsWith("?") ? href : "";
  searchParamsState = new URLSearchParams(search);
  window.history.replaceState({}, "", `${PATHNAME}${search}`);
});

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn(), replace: (href: string) => replaceMock(href) }),
  usePathname: () => PATHNAME,
  useSearchParams: () => searchParamsState,
  useParams: () => ({ locale: "en" }),
}));

jest.mock("@/hooks/usePagination", () => ({
  usePagination: () => ({
    page: 1,
    limit: 10,
    total: 2,
    totalPages: 1,
    setPage: jest.fn(),
    setLimit: jest.fn(),
    updateTotal: jest.fn(),
    resetPage: jest.fn(),
    paginationParams: () => new URLSearchParams({ page: "1", limit: "10" }),
  }),
}));

let allowedActions = ["update"];
jest.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ can: (_resource: string, action: string) => allowedActions.includes(action) }),
}));

const confirmMock = jest.fn();
jest.mock("@/hooks/useConfirm", () => ({
  useConfirm: () => ({ confirm: (...args: unknown[]) => confirmMock(...args), ConfirmDialogNode: null }),
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

jest.mock("@/components/shared/CrudModal", () => ({
  CrudModal: () => null,
}));

jest.mock("sonner", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

const EMPLOYERS = [
  {
    _id: "emp-assigned",
    name: "Assigned Contact",
    email: "a@acme.test",
    companyName: "Acme Assigned",
    industry: "Technology",
    location: "Dubai",
    isActive: true,
    assignedToMe: true,
  },
  {
    _id: "emp-region",
    name: "Region Contact",
    email: "r@region.test",
    companyName: "Region Co",
    industry: "Retail",
    isActive: true,
    assignedToMe: false,
  },
];

async function renderPage() {
  await act(async () => {
    render(<AgentEmployersPage />);
  });
  await screen.findAllByText("Acme Assigned");
}

describe("AgentEmployersPage table", () => {
  beforeEach(() => {
    searchParamsState = new URLSearchParams();
    window.history.replaceState({}, "", PATHNAME);
    replaceMock.mockClear();
    allowedActions = ["update"];
    confirmMock.mockReset();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ employers: EMPLOYERS, pagination: { total: 2 } }),
    }) as unknown as typeof fetch;
  });

  it("shows a table, with no cards/table switch", async () => {
    await renderPage();

    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: "Company" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Industry / Location" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cards" })).not.toBeInTheDocument();
  });

  it("offers posting and entering only where the employer is assigned", async () => {
    await renderPage();

    const rows = within(screen.getByRole("table")).getAllByRole("row");
    const assigned = rows.find((row) => within(row).queryByText("Acme Assigned"))!;
    const region = rows.find((row) => within(row).queryByText("Region Co"))!;

    expect(within(assigned).queryByText("In your region")).not.toBeInTheDocument();
    expect(within(assigned).getByRole("link", { name: "Post Job" })).toHaveAttribute(
      "href",
      "/en/agent/jobs/new?employer=emp-assigned",
    );
    expect(within(assigned).getByRole("button", { name: "Edit Acme Assigned" })).toBeInTheDocument();
    expect(within(assigned).getByRole("button", { name: "Switch to Acme Assigned workspace" })).toBeInTheDocument();

    expect(within(region).getByText("In your region")).toBeInTheDocument();
    expect(within(region).queryByRole("link", { name: "Post Job" })).not.toBeInTheDocument();
    expect(within(region).queryByRole("button", { name: /^Edit/ })).not.toBeInTheDocument();
    expect(within(region).getByRole("link", { name: "View Jobs" })).toHaveAttribute(
      "href",
      "/en/agent/jobs?employer=emp-region",
    );
    // Missing fields read as a dash, not an empty cell.
    expect(within(region).getByText("—")).toBeInTheDocument();
  });

  it("shows the empty state inside the table when there are no employers", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ employers: [], pagination: { total: 0 } }),
    }) as unknown as typeof fetch;
    await act(async () => {
      render(<AgentEmployersPage />);
    });

    const table = await screen.findByRole("table");
    expect(await within(table).findByText("No employer accounts yet")).toBeInTheDocument();
  });

  it("shows an error with a retry when the list fails to load", async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
      .mockResolvedValue({ ok: true, json: async () => ({ employers: EMPLOYERS, pagination: { total: 2 } }) });
    global.fetch = fetchMock as unknown as typeof fetch;
    const user = userEvent.setup();
    await act(async () => {
      render(<AgentEmployersPage />);
    });

    const retry = await screen.findByRole("button", { name: /try again/i });
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    await user.click(retry);
    expect(await screen.findAllByText("Acme Assigned")).not.toHaveLength(0);
  });

  it("says so when a delete is refused, and keeps the row", async () => {
    allowedActions = ["update", "delete"];
    confirmMock.mockResolvedValue(true);
    const { toast } = jest.requireMock("sonner") as { toast: { error: jest.Mock } };
    toast.error.mockClear();
    const fetchMock = jest.fn((url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        return Promise.resolve({ ok: false, json: async () => ({}) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ employers: EMPLOYERS, pagination: { total: 2 } }) });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const user = userEvent.setup();
    await renderPage();

    const rows = within(screen.getByRole("table")).getAllByRole("row");
    const region = rows.find((row) => within(row).queryByText("Region Co"))!;
    await user.click(within(region).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("We couldn't delete this employer. Please try again."));
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE")).toHaveLength(1);
    expect(screen.getAllByText("Region Co")).not.toHaveLength(0);
  });
});
