/**
 * @jest-environment jsdom
 */
import React from "react";
import { act } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AgentEmployersPage from "@/app/[locale]/(dashboard)/agent/employers/page";

/* The agent's employer list shows as cards or as a table. The choice lives in
   `?view=` (so a shared link opens the same layout) and is remembered in the
   browser, and both layouts must offer the same actions: posting and entering
   the account only for employers assigned to the agent. */

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

jest.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ can: (_resource: string, action: string) => action === "update" }),
}));

jest.mock("@/hooks/useConfirm", () => ({
  useConfirm: () => ({ confirm: jest.fn(), ConfirmDialogNode: null }),
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

describe("AgentEmployersPage cards / table view", () => {
  beforeEach(() => {
    searchParamsState = new URLSearchParams();
    window.history.replaceState({}, "", PATHNAME);
    window.localStorage.clear();
    replaceMock.mockClear();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ employers: EMPLOYERS, pagination: { total: 2 } }),
    }) as unknown as typeof fetch;
  });

  it("opens as cards by default", async () => {
    await renderPage();

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cards" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Table" })).toHaveAttribute("aria-pressed", "false");
  });

  it("switches to the table, writes ?view=table and remembers the choice", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole("button", { name: "Table" }));

    const table = await screen.findByRole("table");
    expect(within(table).getByRole("columnheader", { name: "Company" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Industry / Location" })).toBeInTheDocument();
    expect(replaceMock).toHaveBeenLastCalledWith("?view=table");
    expect(window.localStorage.getItem("agent-employers-view")).toBe("table");
    expect(screen.getByRole("button", { name: "Table" })).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps the current page when the layout changes", async () => {
    const user = userEvent.setup();
    searchParamsState = new URLSearchParams("page=2");
    window.history.replaceState({}, "", `${PATHNAME}?page=2`);
    await renderPage();

    await user.click(screen.getByRole("button", { name: "Table" }));

    expect(replaceMock).toHaveBeenLastCalledWith("?page=2&view=table");
  });

  it("opens the table straight from ?view=table, with actions only where the employer is assigned", async () => {
    searchParamsState = new URLSearchParams("view=table");
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

  it("uses the remembered layout when the URL has no ?view=", async () => {
    window.localStorage.setItem("agent-employers-view", "table");
    await renderPage();

    await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());
  });

  it("lets ?view= override the remembered layout", async () => {
    window.localStorage.setItem("agent-employers-view", "table");
    searchParamsState = new URLSearchParams("view=cards");
    await renderPage();

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
