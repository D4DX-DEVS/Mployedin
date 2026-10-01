/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AgentJobsPage from "@/app/[locale]/(dashboard)/agent/jobs/page";

/* Agent Jobs follows the admin list standard (TABLE-CONSISTENCY-AUDIT.md §3):
   one InlineFilterBar, one table panel, status in column 2, ErrorState on a
   failed load. The old page counted the employer default "all" as an active
   filter, so its Filters badge read 1 on a clean page, and its AI reset set
   the employer to "" (no such option). */

const replaceMock = jest.fn((href: string) => {
  window.history.replaceState({}, "", href);
});

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: (href: string) => replaceMock(href) }),
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
  useParams: () => ({ locale: "en" }),
}));

const paginationState = {
  page: 1,
  limit: 10,
  total: 0,
  totalPages: 1,
  setPage: jest.fn(),
  setLimit: jest.fn(),
  updateTotal: jest.fn(),
  resetPage: jest.fn(),
  paginationParams: () => new URLSearchParams({ page: "1", limit: "10" }),
};

jest.mock("@/hooks/usePagination", () => ({
  usePagination: () => paginationState,
}));

const exportHandlers = {
  handleExportCsv: jest.fn(),
  handleExportExcel: jest.fn(),
  handleExportPdf: jest.fn(),
};

jest.mock("@/hooks/useTableExport", () => ({
  useTableExport: () => exportHandlers,
}));

jest.mock("@/components/shared/PaginationControls", () => ({
  PaginationControls: () => <div data-testid="pagination-controls" />,
}));

jest.mock("@/components/ui/searchable-select", () => ({
  SearchableSelect: ({ id, value, placeholder }: { id?: string; value: string; placeholder?: string }) => (
    <select id={id} value={value} onChange={() => {}} aria-label={placeholder}>
      <option value={value}>{value}</option>
    </select>
  ),
}));

jest.mock("sonner", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

const JOB = {
  _id: "j1",
  title: "Site Engineer",
  status: "paused",
  location: { city: "Dubai", country: "UAE" },
  category: "Engineering",
  applicationCount: 4,
  employerId: { _id: "e1", companyName: "Acme Builders" },
  createdAt: "2026-09-20T10:00:00.000Z",
};

type JobsResponse = { ok: boolean; body?: unknown };

describe("AgentJobsPage", () => {
  const fetchMock = jest.fn();
  let jobsResponse: JobsResponse;

  const jobsCalls = () =>
    fetchMock.mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.startsWith("/api/jobs?"))
      .map((url) => new URLSearchParams(url.split("?")[1]));

  beforeEach(() => {
    window.history.replaceState({}, "", "/en/agent/jobs");
    replaceMock.mockClear();
    paginationState.total = 0;
    jobsResponse = {
      ok: true,
      body: { jobs: [], pagination: { total: 0 }, statusCounts: { active: 2, draft: 1, paused: 1, closed: 3 } },
    };
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/employers")) {
        return {
          ok: true,
          json: async () => ({
            employers: [
              { _id: "e1", companyName: "Acme Builders" },
              { _id: "e2", companyName: "Beta Logistics" },
            ],
          }),
        };
      }
      return { ok: jobsResponse.ok, json: async () => jobsResponse.body ?? {} };
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("sends no filters and offers no Clear on a clean page", async () => {
    render(<AgentJobsPage />);

    await waitFor(() => expect(jobsCalls().length).toBeGreaterThan(0));
    const params = jobsCalls().at(-1)!;
    expect(params.has("employerId")).toBe(false);
    expect(params.has("status")).toBe(false);
    expect(params.has("search")).toBe(false);
    expect(screen.queryByRole("button", { name: /clear filters/i })).toBeNull();
    // The old toggle read "Filters 1" here: the employer default "all" counted.
    expect(screen.getByRole("button", { name: /filters/i }).textContent).not.toMatch(/\d/);
  });

  it("filters the list by status from the header tiles", async () => {
    const user = userEvent.setup();
    render(<AgentJobsPage />);

    const pausedTile = await screen.findByRole("button", { name: /paused/i });
    await user.click(pausedTile);

    await waitFor(() => expect(jobsCalls().at(-1)!.get("status")).toBe("paused"));
    expect(pausedTile).toHaveAttribute("aria-pressed", "true");
  });

  it("shows an error with a retry, not the empty state, when the load fails", async () => {
    jobsResponse = { ok: false };
    const user = userEvent.setup();
    render(<AgentJobsPage />);

    const alert = await screen.findByRole("alert");
    expect(screen.queryByText(/no jobs found/i)).toBeNull();

    const before = jobsCalls().length;
    jobsResponse = { ok: true, body: { jobs: [], pagination: { total: 0 }, statusCounts: {} } };
    await user.click(within(alert).getByRole("button"));
    await waitFor(() => expect(jobsCalls().length).toBeGreaterThan(before));
  });

  it("clears every filter, employer back to all, from the filtered empty state", async () => {
    window.history.replaceState({}, "", "/en/agent/jobs?employerId=e1&status=draft");
    const user = userEvent.setup();
    render(<AgentJobsPage />);

    await waitFor(() => expect(jobsCalls().at(-1)!.get("employerId")).toBe("e1"));
    const clearButtons = await screen.findAllByRole("button", { name: /clear filters/i });
    await user.click(clearButtons.at(-1)!);

    await waitFor(() => {
      const params = jobsCalls().at(-1)!;
      expect(params.has("employerId")).toBe(false);
      expect(params.has("status")).toBe(false);
    });
  });

  it("puts status in the second column and links each row to its candidates", async () => {
    paginationState.total = 1;
    jobsResponse = {
      ok: true,
      body: { jobs: [JOB], pagination: { total: 1 }, statusCounts: { paused: 1 } },
    };
    render(<AgentJobsPage />);

    const row = (await screen.findByText("Site Engineer")).closest("tr")!;
    const cells = within(row).getAllByRole("cell");
    expect(within(cells[1]).getByText("Paused")).toBeInTheDocument();
    expect(within(row).getByText("Acme Builders")).toBeInTheDocument();

    const candidatesLink = within(row).getByRole("link", { name: /candidates/i });
    expect(candidatesLink).toHaveAttribute("href", "/en/agent/candidates?jobId=j1");
  });
});
