/**
 * @jest-environment jsdom
 *
 * Admin job seekers: tick rows (table and phone cards), a sticky selection bar,
 * and "Export CVs" through the shared export dialog (mocked here: its own tests
 * cover the download). The "Download CVs" menu item opens the same dialog with
 * the selection, or, with nothing ticked, asks before exporting the first 50 of
 * the filtered list. "View CV" opens the Standardised CV; the menu has the
 * original file. The old inline ZIP is gone: nothing calls bulk-cv-download.
 */
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminJobSeekersPage from "@/app/[locale]/(dashboard)/admin/job-seekers/page";

const paginationState = {
  page: 1,
  limit: 20,
  total: 3,
  totalPages: 1,
  setPage: jest.fn(),
  setLimit: jest.fn(),
  updateTotal: jest.fn(),
  resetPage: jest.fn(),
};
jest.mock("@/hooks/usePagination", () => ({ usePagination: () => paginationState }));
const pushMock = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: jest.fn() }),
  usePathname: () => "/en/admin/job-seekers",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ locale: "en" }),
}));
jest.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ role: "admin", can: () => true, session: null }),
}));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

// The filter bar is its own thing; here it only hosts the "Download CVs" menu item.
jest.mock("@/app/[locale]/(dashboard)/admin/job-seekers/_components/JobSeekersFilterPanel", () => {
  const actual = jest.requireActual("@/app/[locale]/(dashboard)/admin/job-seekers/_components/JobSeekersFilterPanel");
  const { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } = jest.requireActual("@/components/ui/dropdown-menu");
  return {
    ...actual,
    JobSeekersFilterPanel: ({ exportExtra }: { exportExtra?: React.ReactNode }) => (
      <DropdownMenu>
        <DropdownMenuTrigger>Export menu</DropdownMenuTrigger>
        <DropdownMenuContent>{exportExtra}</DropdownMenuContent>
      </DropdownMenu>
    ),
  };
});

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: Array<{ seekerId: string; applicationId?: string; name?: string }>;
  detailsRows?: { header: string[]; rowsById: Map<string, string[]> };
  onExported?: (summary: { exported: number; skipped: number; fileName: string; fileCount: number }) => void;
}
const dialogProps: DialogProps[] = [];
jest.mock("@/components/shared/CvExport/CvExportDialog", () => ({
  CvExportDialog: (props: DialogProps) => {
    dialogProps.push(props);
    return props.open ? (
      <div role="dialog" aria-label="Export dialog">
        <span data-testid="dialog-count">{props.items.length}</span>
        <button type="button" onClick={() => props.onExported?.({ exported: props.items.length, skipped: 0, fileName: "x.zip", fileCount: props.items.length })}>
          finish export
        </button>
        <button type="button" onClick={() => props.onOpenChange(false)}>close export</button>
      </div>
    ) : null;
  },
}));
const lastDialog = () => dialogProps[dialogProps.length - 1];

interface ViewerProps { url: string; initialSource?: string }
const viewerProps: ViewerProps[] = [];
jest.mock("@/components/shared/ResumeViewerModal", () => ({
  ResumeViewerModal: (props: ViewerProps) => {
    viewerProps.push(props);
    return <div data-testid="viewer" data-url={props.url} data-source={props.initialSource ?? ""} />;
  },
}));

jest.setTimeout(20_000);

const seeker = (n: number, over: Record<string, unknown> = {}) => ({
  _id: `64b${String(n).padStart(21, "0")}`,
  fullName: `Seeker ${n}`,
  email: `seeker${n}@example.com`,
  nationality: "Egyptian",
  currentLocation: "Cairo",
  headline: `Headline ${n}`,
  totalExperienceYears: n,
  cv: { originalUrl: `https://cdn/cv-${n}.pdf` },
  createdAt: "2026-10-01T00:00:00Z",
  ...over,
});

let rows: ReturnType<typeof seeker>[];
const fetchMock = jest.fn();

function mockList(all: ReturnType<typeof seeker>[], total = all.length) {
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/admin/job-attributes/industries")) {
      return { ok: true, status: 200, json: async () => ({ data: [] }) } as Response;
    }
    if (url.startsWith("/api/job-seekers?")) {
      const params = new URL(url, "http://localhost").searchParams;
      const page = Number(params.get("page") ?? 1);
      const limit = Number(params.get("limit") ?? 20);
      return { ok: true, status: 200, json: async () => ({ items: all.slice((page - 1) * limit, page * limit), total, industryCounts: [] }) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  });
}

const listCalls = () => fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.startsWith("/api/job-seekers?"));
const table = () => screen.getByRole("table");
const phoneList = () => screen.getByRole("list", { name: "Job Seekers" });

async function renderPage(data = rows, total = data.length) {
  mockList(data, total);
  paginationState.total = total;
  render(<AdminJobSeekersPage />);
  // 51 rows render slowly under a loaded machine.
  await within(table()).findByText(data[0].fullName, undefined, { timeout: 10_000 });
  return userEvent.setup({ delay: null });
}

beforeEach(() => {
  dialogProps.length = 0;
  viewerProps.length = 0;
  pushMock.mockReset();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  rows = [seeker(1), seeker(2), seeker(3)];
  paginationState.total = 3;
  paginationState.limit = 20;
});

describe("selecting rows", () => {
  it("every row has a checkbox, in the table and on the phone cards, and the page has a select-all", async () => {
    await renderPage();

    for (const scope of [within(table()), within(phoneList())]) {
      for (const r of rows) expect(scope.getByRole("checkbox", { name: `Select ${r.fullName}` })).not.toBeChecked();
    }
    expect(within(table()).getByRole("checkbox", { name: "Select all on this page" })).not.toBeChecked();
    // Phones have no header row: select-all lives above the cards.
    expect(screen.getAllByRole("checkbox", { name: "Select all on this page" })).toHaveLength(2);
  });

  it("the phone checkbox sits in a 44px touch target", async () => {
    await renderPage();
    const box = within(phoneList()).getByRole("checkbox", { name: "Select Seeker 1" });
    expect(box.closest("label")?.className).toMatch(/min-h-11/);
    expect(box.closest("label")?.className).toMatch(/min-w-11/);
  });

  it("ticking a row shows the selection bar, in step on both layouts; Clear removes it", async () => {
    const user = await renderPage();
    expect(screen.queryByRole("region", { name: "Selected rows" })).toBeNull();

    await user.click(within(table()).getByRole("checkbox", { name: "Select Seeker 2" }));

    const bar = screen.getByRole("region", { name: "Selected rows" });
    expect(within(bar).getByText("1 selected")).toBeInTheDocument();
    expect(within(phoneList()).getByRole("checkbox", { name: "Select Seeker 2" })).toBeChecked();

    await user.click(within(bar).getByRole("button", { name: "Clear selection" }));
    expect(screen.queryByRole("region", { name: "Selected rows" })).toBeNull();
    expect(within(table()).getByRole("checkbox", { name: "Select Seeker 2" })).not.toBeChecked();
  });

  it("select-all ticks every row on the page, and again takes them off", async () => {
    const user = await renderPage();
    const all = within(table()).getByRole("checkbox", { name: "Select all on this page" });

    await user.click(all);
    expect(within(screen.getByRole("region", { name: "Selected rows" })).getByText("3 selected")).toBeInTheDocument();
    expect(all).toBeChecked();

    await user.click(all);
    expect(screen.queryByRole("region", { name: "Selected rows" })).toBeNull();
  });

  it("select-all shows a mixed state while only some rows are ticked", async () => {
    const user = await renderPage();
    await user.click(within(table()).getByRole("checkbox", { name: "Select Seeker 1" }));
    expect(within(table()).getByRole("checkbox", { name: "Select all on this page" })).toHaveAttribute("aria-checked", "mixed");
  });

  it("ticking the row does not open the profile, which a click on the row does", async () => {
    const user = await renderPage();
    await user.click(within(table()).getByRole("checkbox", { name: "Select Seeker 1" }));
    expect(screen.getByRole("region", { name: "Selected rows" })).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();

    await user.click(within(table()).getAllByText("Egyptian")[0]);
    expect(pushMock).toHaveBeenCalledWith(`/en/admin/job-seekers/${rows[0]._id}`);
  });
});

describe("Export CVs for the selection", () => {
  it("opens the dialog with the ticked candidates, their names, and the details sheet columns", async () => {
    const user = await renderPage();
    await user.click(within(table()).getByRole("checkbox", { name: "Select Seeker 3" }));
    await user.click(within(table()).getByRole("checkbox", { name: "Select Seeker 1" }));
    expect(lastDialog().open).toBe(false);

    await user.click(within(screen.getByRole("region", { name: "Selected rows" })).getByRole("button", { name: "Export CVs" }));

    expect(lastDialog().open).toBe(true);
    expect(lastDialog().items).toEqual([
      { seekerId: rows[2]._id, name: "Seeker 3" },
      { seekerId: rows[0]._id, name: "Seeker 1" },
    ]);
    const details = lastDialog().detailsRows!;
    // The columns the old candidates.xlsx had, without the CV file column (the ZIP adds Standardised/Original).
    expect(details.header).toEqual(["Name", "Email", "Nationality", "Location", "Experience (Years)", "Headline"]);
    expect(details.rowsById.get(rows[2]._id)).toEqual(["Seeker 3", "seeker3@example.com", "Egyptian", "Cairo", "3", "Headline 3"]);
    expect(details.rowsById.get(rows[0]._id)).toEqual(["Seeker 1", "seeker1@example.com", "Egyptian", "Cairo", "1", "Headline 1"]);
  });

  it("has no applicationId: this is a list of seekers, not applicants", async () => {
    const user = await renderPage();
    await user.click(within(table()).getByRole("checkbox", { name: "Select Seeker 1" }));
    await user.click(screen.getByRole("button", { name: "Export CVs" }));
    expect(lastDialog().items[0]).not.toHaveProperty("applicationId");
  });

  it("clears the selection once the export is done, and closing the dialog keeps it", async () => {
    const user = await renderPage();
    await user.click(within(table()).getByRole("checkbox", { name: "Select Seeker 1" }));
    await user.click(screen.getByRole("button", { name: "Export CVs" }));

    await user.click(screen.getByRole("button", { name: "close export" }));
    expect(lastDialog().open).toBe(false);
    expect(screen.getByRole("region", { name: "Selected rows" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Export CVs" }));
    await user.click(screen.getByRole("button", { name: "finish export" }));
    expect(screen.queryByRole("region", { name: "Selected rows" })).toBeNull();
  });

  it("is limited to 50: above that the button is disabled and says why, and the dialog never opens", async () => {
    const many = Array.from({ length: 51 }, (_, i) => seeker(i + 1));
    paginationState.limit = 100; // the list's rows-per-page option: all 51 are on the page
    const user = await renderPage(many);
    await user.click(within(table()).getByRole("checkbox", { name: "Select all on this page" }));

    const bar = screen.getByRole("region", { name: "Selected rows" });
    expect(within(bar).getByText("51 selected")).toBeInTheDocument();
    const button = within(bar).getByRole("button", { name: "Export CVs" });
    expect(button).toBeDisabled();
    expect(within(bar).getByText(/up to 50 CVs at a time/)).toBeInTheDocument();
    await user.click(button);
    expect(lastDialog().open).toBe(false);
  });

  it("exactly 50 is allowed", async () => {
    const many = Array.from({ length: 50 }, (_, i) => seeker(i + 1));
    paginationState.limit = 100;
    const user = await renderPage(many);
    await user.click(within(table()).getByRole("checkbox", { name: "Select all on this page" }));
    expect(screen.getByRole("button", { name: "Export CVs" })).toBeEnabled();
  });
});

describe("the Download CVs menu item", () => {
  const openMenuItem = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole("button", { name: "Export menu" }));
    return screen.getByRole("menuitem", { name: "Download CVs" });
  };

  it("with a selection, opens the dialog with it (no question asked)", async () => {
    const user = await renderPage();
    await user.click(within(table()).getByRole("checkbox", { name: "Select Seeker 2" }));

    await user.click(await openMenuItem(user));

    expect(lastDialog().open).toBe(true);
    expect(lastDialog().items).toEqual([{ seekerId: rows[1]._id, name: "Seeker 2" }]);
    expect(screen.queryByText(/No one is selected/)).toBeNull();
  });

  it("with nothing selected, asks before exporting the whole filtered list (small list: all of it)", async () => {
    const user = await renderPage();

    await user.click(await openMenuItem(user));

    expect(await screen.findByText("No one is selected. Export the CVs of all 3 candidates in this list?")).toBeInTheDocument();
    expect(lastDialog().open).toBe(false);
  });

  it("declining the question does nothing", async () => {
    const user = await renderPage();
    await user.click(await openMenuItem(user));
    await user.click(await screen.findByRole("button", { name: /cancel/i }));

    expect(lastDialog().open).toBe(false);
    expect(listCalls().filter((u) => u.includes("limit=50"))).toHaveLength(0);
  });

  it("confirming opens the dialog with the first 50 of the filtered list, in list order, with their details", async () => {
    const many = Array.from({ length: 120 }, (_, i) => seeker(i + 1));
    const user = await renderPage(many.slice(0, 20), 120);
    // The route behind the list answers any page of the full set.
    mockList(many, 120);

    await user.click(await openMenuItem(user));
    expect(
      await screen.findByText("No one is selected. Export the CVs of the first 50 of 120 candidates in this list, in the order shown? One export holds at most 50."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Export CVs" }));

    await waitFor(() => expect(lastDialog().open).toBe(true));
    expect(lastDialog().items).toHaveLength(50);
    expect(lastDialog().items[0]).toEqual({ seekerId: many[0]._id, name: "Seeker 1" });
    expect(lastDialog().items[49]).toEqual({ seekerId: many[49]._id, name: "Seeker 50" });
    const details = lastDialog().detailsRows!;
    expect(details.rowsById.size).toBe(50);
    expect(details.rowsById.get(many[49]._id)?.[0]).toBe("Seeker 50");
  });

  it("pages through the same list query the table uses (search and filters included)", async () => {
    const many = Array.from({ length: 120 }, (_, i) => seeker(i + 1));
    const user = await renderPage(many.slice(0, 20), 120);
    mockList(many, 120);
    fetchMock.mockClear();
    mockList(many, 120);

    await user.click(await openMenuItem(user));
    await user.click(await screen.findByRole("button", { name: "Export CVs" }));
    await waitFor(() => expect(lastDialog().open).toBe(true));

    const exportCalls = listCalls().filter((u) => u.includes("limit=50"));
    expect(exportCalls).toHaveLength(1);
    expect(exportCalls[0]).toContain("page=1");
  });

  it("says so when the list cannot be loaded", async () => {
    const { toast } = jest.requireMock("sonner") as { toast: { error: jest.Mock } };
    const user = await renderPage();
    fetchMock.mockImplementation(async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response);

    await user.click(await openMenuItem(user));
    await user.click(await screen.findByRole("button", { name: "Export CVs" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't load the list to export. Try again in a moment."));
    expect(lastDialog().open).toBe(false);
  });

  it("an empty list has nothing to export: no question, no dialog", async () => {
    const { toast } = jest.requireMock("sonner") as { toast: { error: jest.Mock } };
    mockList([], 0);
    paginationState.total = 0;
    render(<AdminJobSeekersPage />);
    const user = userEvent.setup();
    await within(table()).findByText("No job seekers found");

    await user.click(await openMenuItem(user));

    expect(toast.error).toHaveBeenCalledWith("No CVs found for this search");
    expect(screen.queryByText(/No one is selected/)).toBeNull();
    expect(lastDialog().open).toBe(false);
  });

  it("never calls the retired bulk-cv-download route", async () => {
    const user = await renderPage();
    await user.click(await openMenuItem(user));
    await user.click(await screen.findByRole("button", { name: "Export CVs" }));
    await waitFor(() => expect(lastDialog().open).toBe(true));

    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("bulk-cv-download"))).toBe(false);
  });
});

describe("View CV", () => {
  it("the primary action opens the Standardised CV (the viewer's default), not the file", async () => {
    const user = await renderPage();
    await user.click(within(table()).getAllByRole("button", { name: /View CV/ })[0]);

    const viewer = screen.getByTestId("viewer");
    expect(viewer).toHaveAttribute("data-url", `/api/employers/candidates/${rows[0]._id}/cv#cv.pdf`);
    expect(viewer).toHaveAttribute("data-source", "");
  });

  it("is offered for a seeker with no uploaded file too, since the Standardised CV is made from the profile", async () => {
    rows = [seeker(1, { cv: undefined, skills: ["Welding"] })];
    await renderPage(rows);
    expect(within(table()).getByRole("button", { name: /View CV/ })).toBeInTheDocument();
  });

  it("is not offered when there is neither an uploaded file nor profile content to build from", async () => {
    rows = [seeker(1, { cv: undefined }), seeker(2, { cv: undefined, summary: "Experienced welder" }), seeker(3)];
    await renderPage(rows);
    const first = within(table()).getByText("Seeker 1").closest("tr") as HTMLElement;
    const second = within(table()).getByText("Seeker 2").closest("tr") as HTMLElement;
    const third = within(table()).getByText("Seeker 3").closest("tr") as HTMLElement;
    expect(within(first).queryByRole("button", { name: /View CV/ })).toBeNull();
    expect(within(second).getByRole("button", { name: /View CV/ })).toBeInTheDocument();
    expect(within(third).getByRole("button", { name: /View CV/ })).toBeInTheDocument();
  });

  it("the menu's Original CV (Uploaded) opens the file", async () => {
    const user = await renderPage();
    const firstRow = within(table()).getByText("Seeker 1").closest("tr") as HTMLElement;
    await user.click(within(firstRow).getByRole("button", { name: /more|actions/i }));
    await user.click(await screen.findByRole("menuitem", { name: "Original CV (Uploaded)" }));

    const viewer = screen.getByTestId("viewer");
    expect(viewer).toHaveAttribute("data-url", `/api/employers/candidates/${rows[0]._id}/cv#cv.pdf`);
    expect(viewer).toHaveAttribute("data-source", "file");
  });

  it("the menu has no Original CV item for a seeker with no uploaded file", async () => {
    rows = [seeker(1, { cv: undefined })];
    const user = await renderPage(rows);
    const firstRow = within(table()).getByText("Seeker 1").closest("tr") as HTMLElement;
    await user.click(within(firstRow).getByRole("button", { name: /more|actions/i }));

    expect(screen.queryByRole("menuitem", { name: "Original CV (Uploaded)" })).toBeNull();
  });
});
