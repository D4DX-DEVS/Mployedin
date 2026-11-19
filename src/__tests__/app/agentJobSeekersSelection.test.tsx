/**
 * @jest-environment jsdom
 *
 * Agent Job Seekers: row checkboxes, a select-all for the page, and a sticky
 * "N selected · Clear · Export CVs" bar that opens the shared CV export
 * (owner decision 3A). The export holds at most 50 candidates. Which seekers
 * an agent may export is the server's call, so nothing is filtered here.
 */
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/en/agent/job-seekers",
  useParams: () => ({ locale: "en" }),
}));

jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { role: "agent" } }, status: "authenticated" }),
}));

const dialogProps = jest.fn();
jest.mock("@/components/shared/CvExport/CvExportDialog", () => ({
  CvExportDialog: (props: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onExported?: (summary: unknown) => void;
  }) => {
    dialogProps(props);
    return props.open ? (
      <div role="dialog" aria-label="Export CVs">
        <button type="button" onClick={() => { props.onExported?.({ exported: 1, skipped: 0, fileName: "x.zip", fileCount: 1 }); props.onOpenChange(false); }}>
          Finish export
        </button>
      </div>
    ) : null;
  },
}));

jest.mock("@/components/shared/ResumeViewerModal", () => ({
  ResumeViewerModal: (props: { url: string; initialSource?: string }) => (
    <div data-testid="viewer" data-url={props.url} data-source={props.initialSource ?? ""} />
  ),
}));

import AgentJobSeekersPage from "@/app/[locale]/(dashboard)/agent/job-seekers/page";

const id = (n: number) => String(n).padStart(24, "0");

function seeker(n: number) {
  return {
    _id: id(n),
    userId: { name: `Seeker ${n}`, email: `seeker${n}@example.com` },
    currentLocation: "Dubai",
    skills: ["Welding"],
    profileCompleteness: 80,
    totalExperienceYears: 3,
    industry: "Construction",
    hiringStatus: "applied",
    createdAt: "2026-10-01T00:00:00.000Z",
  };
}

function serve(count: number) {
  global.fetch = jest.fn(async (url: string) => {
    const path = String(url);
    if (path.startsWith("/api/job-seekers?")) {
      return {
        ok: true,
        json: async () => ({
          items: Array.from({ length: count }, (_, i) => seeker(i + 1)),
          total: count,
          stats: { complete: 1, avgCompleteness: 80, withTitles: 1 },
          industryCounts: [],
        }),
      };
    }
    return { ok: true, json: async () => ({ items: [] }) };
  }) as unknown as typeof fetch;
}

const table = () => screen.getByRole("table");
const phoneList = () => screen.getByRole("list", { name: "Job Seekers" });

async function loaded() {
  // Both the phone cards and the table are in the DOM; CSS decides which one shows.
  await within(table()).findByRole("button", { name: "Seeker 1" });
}

function lastDialog() {
  const calls = dialogProps.mock.calls;
  return calls[calls.length - 1][0] as {
    open: boolean;
    items: Array<{ seekerId: string; name?: string }>;
    detailsRows?: { header: string[]; rowsById: ReadonlyMap<string, string[]> };
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
});

describe("agent job seekers: selection", () => {
  it("shows no selection bar until a row is ticked, then counts and clears", async () => {
    serve(3);
    render(<AgentJobSeekersPage />);
    await loaded();
    expect(screen.queryByRole("region", { name: "Selected rows" })).toBeNull();

    await userEvent.click(within(table()).getByRole("checkbox", { name: "Select Seeker 2" }));
    expect(screen.getByRole("region", { name: "Selected rows" })).toBeInTheDocument();
    expect(screen.getByText("1 selected")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.queryByRole("region", { name: "Selected rows" })).toBeNull();
    expect(within(table()).getByRole("checkbox", { name: "Select Seeker 2" })).not.toBeChecked();
  });

  it("selects every row of the page from the header checkbox, and shows a partial pick as mixed", async () => {
    serve(3);
    render(<AgentJobSeekersPage />);
    await loaded();
    const header = within(table()).getByRole("checkbox", { name: "Select all on this page" });

    await userEvent.click(within(table()).getByRole("checkbox", { name: "Select Seeker 1" }));
    expect(header).toHaveAttribute("aria-checked", "mixed");

    await userEvent.click(header);
    expect(screen.getByText("3 selected")).toBeInTheDocument();
    expect(header).toBeChecked();

    await userEvent.click(header);
    expect(screen.queryByText("3 selected")).toBeNull();
  });

  it("keeps the table and the phone cards in step", async () => {
    serve(3);
    render(<AgentJobSeekersPage />);
    await loaded();

    await userEvent.click(within(phoneList()).getByRole("checkbox", { name: "Select Seeker 3" }));

    expect(within(table()).getByRole("checkbox", { name: "Select Seeker 3" })).toBeChecked();
    expect(screen.getByText("1 selected")).toBeInTheDocument();
  });

  it("puts a 44px checkbox in each phone card header, and a select-all above the cards", async () => {
    serve(2);
    render(<AgentJobSeekersPage />);
    await loaded();

    const box = within(phoneList()).getByRole("checkbox", { name: "Select Seeker 1" });
    expect(box.closest("label")?.className).toMatch(/min-h-11/);
    expect(box.closest("label")?.className).toMatch(/min-w-11/);

    // Phones have no header row: the page's select-all is its own 44px row.
    const all = screen.getAllByRole("checkbox", { name: "Select all on this page" });
    const phoneAll = all.find((el) => !table().contains(el));
    expect(phoneAll?.closest("label")?.className).toMatch(/min-h-11/);
    await userEvent.click(phoneAll as HTMLElement);
    expect(screen.getByText("2 selected")).toBeInTheDocument();
  });

  it("opens the export with the selected seekers and the sheet columns, keyed by seeker id", async () => {
    serve(3);
    render(<AgentJobSeekersPage />);
    await loaded();
    expect(lastDialog().open).toBe(false);

    await userEvent.click(within(table()).getByRole("checkbox", { name: "Select Seeker 2" }));
    await userEvent.click(within(table()).getByRole("checkbox", { name: "Select Seeker 3" }));
    await userEvent.click(screen.getByRole("button", { name: "Export CVs" }));

    expect(await screen.findByRole("dialog", { name: "Export CVs" })).toBeInTheDocument();
    const props = lastDialog();
    expect(props.open).toBe(true);
    // The profile id the CV routes take, in the order they were ticked.
    expect(props.items).toEqual([
      { seekerId: id(2), name: "Seeker 2" },
      { seekerId: id(3), name: "Seeker 3" },
    ]);
    expect(props.detailsRows?.header.slice(0, 2)).toEqual(["Name", "Email"]);
    expect(props.detailsRows?.rowsById.get(id(2))?.slice(0, 2)).toEqual(["Seeker 2", "seeker2@example.com"]);
    expect(props.detailsRows?.rowsById.has(id(1))).toBe(false);
  });

  it("clears the selection once the ZIP was exported", async () => {
    serve(2);
    render(<AgentJobSeekersPage />);
    await loaded();
    await userEvent.click(within(table()).getByRole("checkbox", { name: "Select Seeker 1" }));
    await userEvent.click(screen.getByRole("button", { name: "Export CVs" }));
    await userEvent.click(await screen.findByRole("button", { name: "Finish export" }));

    await waitFor(() => expect(screen.queryByRole("region", { name: "Selected rows" })).toBeNull());
    expect(within(table()).getByRole("checkbox", { name: "Select Seeker 1" })).not.toBeChecked();
  });

  it("allows 50 candidates and holds back a 51st", async () => {
    serve(51);
    render(<AgentJobSeekersPage />);
    await loaded();

    // The whole page of 51 is one over the limit of an export.
    await userEvent.click(within(table()).getByRole("checkbox", { name: "Select all on this page" }));
    expect(screen.getByText("51 selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export CVs" })).toBeDisabled();
    expect(screen.getAllByText(/up to 50 CVs/).length).toBeGreaterThan(0);

    // Drop one: 50 is allowed.
    await userEvent.click(within(table()).getByRole("checkbox", { name: "Select Seeker 51" }));
    expect(screen.getByText("50 selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export CVs" })).toBeEnabled();
    // Role queries over 51 rows in two layouts are slow in jsdom.
  }, 30000);
});

describe("agent job seekers: viewer", () => {
  it("opens the Standardised CV first and the uploaded file only when asked for", async () => {
    serve(1);
    global.fetch = jest.fn(async (url: string) => {
      const path = String(url);
      if (path.startsWith("/api/job-seekers?")) {
        return { ok: true, json: async () => ({ items: [seeker(1)], total: 1, stats: {}, industryCounts: [] }) };
      }
      if (path === `/api/job-seekers/${id(1)}`) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ jobSeeker: { ...seeker(1), cv: { originalUrl: "/files/cv.pdf" } }, applications: [] }),
        };
      }
      return { ok: true, json: async () => ({ items: [] }) };
    }) as unknown as typeof fetch;
    render(<AgentJobSeekersPage />);
    await loaded();

    await userEvent.click(within(table()).getByRole("button", { name: "Seeker 1" }));
    await userEvent.click(await screen.findByRole("button", { name: "More ways to open the CV" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Original CV (Uploaded)" }));

    const viewer = await screen.findByTestId("viewer");
    expect(viewer).toHaveAttribute("data-url", `/api/employers/candidates/${id(1)}/cv#cv.pdf`);
    expect(viewer).toHaveAttribute("data-source", "file");
  });
});
