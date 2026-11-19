/**
 * @jest-environment jsdom
 *
 * Admin applications: the rows' checkboxes feed the bulk bar, which now also has
 * "Export CVs". Each export item carries the seeker, the application (so
 * "Original" is the CV sent with it) and the candidate's name. The bar is the
 * shared sticky SelectionBar; the status change it already had still works.
 */
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminApplicationsPage from "@/app/[locale]/(dashboard)/admin/applications/page";

const searchParamsState = new URLSearchParams();
const paginationState = {
  page: 1,
  limit: 100,
  total: 0,
  totalPages: 1,
  setPage: jest.fn(),
  setLimit: jest.fn(),
  updateTotal: jest.fn(),
  resetPage: jest.fn(),
};
jest.mock("@/hooks/usePagination", () => ({ usePagination: () => paginationState }));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => "/en/admin/applications",
  useSearchParams: () => searchParamsState,
  useParams: () => ({ locale: "en" }),
}));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));

interface DialogProps {
  open: boolean;
  items: Array<{ seekerId: string; applicationId?: string; name?: string }>;
  onExported?: (summary: { exported: number; skipped: number; fileName: string; fileCount: number }) => void;
}
const dialogProps: DialogProps[] = [];
jest.mock("@/components/shared/CvExport/CvExportDialog", () => ({
  CvExportDialog: (props: DialogProps) => {
    dialogProps.push(props);
    return props.open ? (
      <div role="dialog" aria-label="Export dialog">
        <button type="button" onClick={() => props.onExported?.({ exported: 1, skipped: 0, fileName: "x.zip", fileCount: 1 })}>finish export</button>
      </div>
    ) : null;
  },
}));
const lastDialog = () => dialogProps[dialogProps.length - 1];

jest.setTimeout(20_000);

const seekerId = (n: number) => `64b${String(n).padStart(21, "0")}`;
const appId = (n: number) => `64c${String(n).padStart(21, "0")}`;
const application = (n: number, over: Record<string, unknown> = {}) => ({
  _id: appId(n),
  status: "applied",
  createdAt: "2026-10-01T00:00:00Z",
  appliedAt: "2026-10-01T00:00:00Z",
  jobId: { _id: `job${n}`, title: `Job ${n}`, employerId: { companyName: "Acme" } },
  jobSeekerId: { _id: seekerId(n), fullName: `Candidate ${n}`, email: `c${n}@example.com` },
  ...over,
});

const fetchMock = jest.fn();
function mockApplications(list: ReturnType<typeof application>[]) {
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    // As the real route does: employers and stats come back only when asked for
    // (the page refetches whenever they change, so an unconditional reply loops).
    const params = new URL(String(input), "http://localhost").searchParams;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        applications: list,
        pagination: { total: list.length, pages: 1 },
        ...(params.get("fetchEmployers") ? { allEmployers: [{ _id: "emp-1", companyName: "Acme" }] } : {}),
        ...(params.get("fetchStats")
          ? { stats: { byStatus: {}, bySource: {}, avgAiScore: 0, scoredCount: 0, todayCount: 0, weekCount: 0, totalAll: list.length } }
          : {}),
      }),
    } as Response;
  });
  global.fetch = fetchMock as unknown as typeof fetch;
}

async function renderPage(list: ReturnType<typeof application>[]) {
  mockApplications(list);
  render(<AdminApplicationsPage />);
  // 51 rows render slowly under a loaded machine.
  await screen.findAllByRole("checkbox", { name: "Select application" }, { timeout: 10_000 });
  return userEvent.setup({ delay: null });
}

const rowBoxes = () => screen.getAllByRole("checkbox", { name: "Select application" });
const bar = () => screen.getByRole("region", { name: "Selected rows" });

beforeEach(() => {
  dialogProps.length = 0;
  fetchMock.mockReset();
  paginationState.limit = 100;
});

describe("admin applications: Export CVs", () => {
  it("shows no bar until a row is ticked, then the shared selection bar with the count and Export CVs", async () => {
    const user = await renderPage([application(1), application(2), application(3)]);
    expect(screen.queryByRole("region", { name: "Selected rows" })).toBeNull();

    await user.click(rowBoxes()[1]);

    expect(within(bar()).getByText("1 selected")).toBeInTheDocument();
    expect(within(bar()).getByRole("button", { name: "Export CVs" })).toBeEnabled();
  });

  it("the bar is the sticky one: bulk status and Apply are in it too", async () => {
    const user = await renderPage([application(1)]);
    await user.click(rowBoxes()[0]);

    expect(bar().className).toMatch(/\bsticky\b/);
    expect(within(bar()).getByRole("button", { name: "Apply" })).toBeDisabled();
  });

  it("opens the dialog with seeker, application and name for each ticked row, in tick order", async () => {
    const user = await renderPage([application(1), application(2), application(3)]);
    await user.click(rowBoxes()[2]);
    await user.click(rowBoxes()[0]);
    expect(lastDialog().open).toBe(false);

    await user.click(within(bar()).getByRole("button", { name: "Export CVs" }));

    expect(lastDialog().open).toBe(true);
    expect(lastDialog().items).toEqual([
      { seekerId: seekerId(3), applicationId: appId(3), name: "Candidate 3" },
      { seekerId: seekerId(1), applicationId: appId(1), name: "Candidate 1" },
    ]);
  });

  it("falls back to the account name, and skips an application whose candidate is gone", async () => {
    const user = await renderPage([
      application(1, { jobSeekerId: { _id: seekerId(1), userId: { name: "Account Name" } } }),
      application(2, { jobSeekerId: undefined }),
    ]);
    await user.click(screen.getAllByRole("checkbox", { name: "Select all on this page" })[0]);

    expect(within(bar()).getByText("2 selected")).toBeInTheDocument();
    await user.click(within(bar()).getByRole("button", { name: "Export CVs" }));

    expect(lastDialog().items).toEqual([{ seekerId: seekerId(1), applicationId: appId(1), name: "Account Name" }]);
  });

  it("is limited to 50: above that the button is disabled and says why", async () => {
    const list = Array.from({ length: 51 }, (_, i) => application(i + 1));
    const user = await renderPage(list);
    await user.click(screen.getAllByRole("checkbox", { name: "Select all on this page" })[0]);

    expect(within(bar()).getByText("51 selected")).toBeInTheDocument();
    expect(within(bar()).getByRole("button", { name: "Export CVs" })).toBeDisabled();
    expect(within(bar()).getByText(/up to 50 CVs at a time/)).toBeInTheDocument();
    await user.click(within(bar()).getByRole("button", { name: "Export CVs" }));
    expect(lastDialog().open).toBe(false);
  });

  it("clears the selection once the export is done", async () => {
    const user = await renderPage([application(1)]);
    await user.click(rowBoxes()[0]);
    await user.click(within(bar()).getByRole("button", { name: "Export CVs" }));
    await user.click(screen.getByRole("button", { name: "finish export" }));

    await waitFor(() => expect(screen.queryByRole("region", { name: "Selected rows" })).toBeNull());
  });

  it("Clear empties the selection", async () => {
    const user = await renderPage([application(1), application(2)]);
    await user.click(rowBoxes()[0]);
    await user.click(within(bar()).getByRole("button", { name: "Clear selection" }));

    expect(screen.queryByRole("region", { name: "Selected rows" })).toBeNull();
    expect(rowBoxes()[0]).not.toBeChecked();
  });

  it("select-all still ticks and unticks every row on the page", async () => {
    const user = await renderPage([application(1), application(2)]);
    const all = screen.getAllByRole("checkbox", { name: "Select all on this page" })[0];

    await user.click(all);
    expect(within(bar()).getByText("2 selected")).toBeInTheDocument();
    await user.click(all);
    expect(screen.queryByRole("region", { name: "Selected rows" })).toBeNull();
  });
});
