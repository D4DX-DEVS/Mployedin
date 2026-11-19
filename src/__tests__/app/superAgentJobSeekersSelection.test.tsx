/**
 * @jest-environment jsdom
 *
 * Super Agent Job Seekers: row checkboxes, a select-all for the page, and a
 * sticky "N selected · Clear · Export CVs" bar that opens the shared CV export
 * (owner decision 3A, at most 50). The ticked rows are separate from the one
 * profile open in the side panel; opening a profile must not touch them.
 */
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/en/super-agent/job-seekers",
  useParams: () => ({ locale: "en" }),
}));

jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { role: "super_agent" } }, status: "authenticated" }),
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

import SuperAgentJobSeekersPage from "@/app/[locale]/(dashboard)/super-agent/job-seekers/page";

const id = (n: number) => String(n).padStart(24, "0");

function seeker(n: number) {
  return {
    _id: id(n),
    fullName: `Seeker ${n}`,
    email: `seeker${n}@example.com`,
    country: "UAE",
    location: "Dubai",
    currentJobTitle: "Welder",
    experienceYears: 4,
    profileCompletion: 70,
    skills: ["Welding"],
    industry: "Construction",
    createdAt: "2026-10-01T00:00:00.000Z",
  };
}

function serve(count: number, profileBody?: Record<string, unknown>) {
  global.fetch = jest.fn(async (url: string) => {
    const path = String(url);
    if (path.startsWith("/api/super-agent/job-seekers?")) {
      return {
        ok: true,
        json: async () => ({
          items: Array.from({ length: count }, (_, i) => seeker(i + 1)),
          total: count,
          stats: { total: count, active: count, avgCompletion: 70, withExperience: count, premium: 0 },
          agents: [],
          countries: [],
          industryCounts: [],
        }),
      };
    }
    if (path === `/api/job-seekers/${id(1)}` && profileBody) {
      return { ok: true, status: 200, json: async () => ({ jobSeeker: profileBody, applications: [] }) };
    }
    return { ok: true, json: async () => ({ items: [] }) };
  }) as unknown as typeof fetch;
}

const table = () => screen.getByRole("table");
const phoneList = () => screen.getByRole("list", { name: "Job Seekers" });

async function loaded() {
  // Both the phone cards and the table are in the DOM; CSS decides which one shows.
  await within(table()).findByRole("checkbox", { name: "Select Seeker 1" });
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

describe("super agent job seekers: selection", () => {
  it("shows no selection bar until a row is ticked, then counts and clears", async () => {
    serve(3);
    render(<SuperAgentJobSeekersPage />);
    await loaded();
    expect(screen.queryByRole("region", { name: "Selected rows" })).toBeNull();

    await userEvent.click(within(table()).getByRole("checkbox", { name: "Select Seeker 2" }));
    expect(screen.getByText("1 selected")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.queryByRole("region", { name: "Selected rows" })).toBeNull();
    expect(within(table()).getByRole("checkbox", { name: "Select Seeker 2" })).not.toBeChecked();
  });

  it("selects every row of the page from the header checkbox, and shows a partial pick as mixed", async () => {
    serve(3);
    render(<SuperAgentJobSeekersPage />);
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

  it("puts a 44px checkbox in each phone card header, and a select-all above the cards", async () => {
    serve(2);
    render(<SuperAgentJobSeekersPage />);
    await loaded();

    const box = within(phoneList()).getByRole("checkbox", { name: "Select Seeker 1" });
    expect(box.closest("label")?.className).toMatch(/min-h-11/);
    expect(box.closest("label")?.className).toMatch(/min-w-11/);
    await userEvent.click(box);
    // The same selection as the table's.
    expect(within(table()).getByRole("checkbox", { name: "Select Seeker 1" })).toBeChecked();

    const phoneAll = screen
      .getAllByRole("checkbox", { name: "Select all on this page" })
      .find((el) => !table().contains(el));
    expect(phoneAll?.closest("label")?.className).toMatch(/min-h-11/);
    await userEvent.click(phoneAll as HTMLElement);
    expect(screen.getByText("2 selected")).toBeInTheDocument();
  });

  it("opens the export with the selected seekers and the sheet columns, keyed by seeker id", async () => {
    serve(3);
    render(<SuperAgentJobSeekersPage />);
    await loaded();
    expect(lastDialog().open).toBe(false);

    await userEvent.click(within(table()).getByRole("checkbox", { name: "Select Seeker 3" }));
    await userEvent.click(within(table()).getByRole("checkbox", { name: "Select Seeker 1" }));
    await userEvent.click(screen.getByRole("button", { name: "Export CVs" }));

    expect(await screen.findByRole("dialog", { name: "Export CVs" })).toBeInTheDocument();
    const props = lastDialog();
    expect(props.open).toBe(true);
    expect(props.items).toEqual([
      { seekerId: id(3), name: "Seeker 3" },
      { seekerId: id(1), name: "Seeker 1" },
    ]);
    expect(props.detailsRows?.header.slice(0, 2)).toEqual(["Name", "Email"]);
    expect(props.detailsRows?.rowsById.get(id(3))?.slice(0, 2)).toEqual(["Seeker 3", "seeker3@example.com"]);
    expect(props.detailsRows?.rowsById.has(id(2))).toBe(false);
  });

  it("clears the selection once the ZIP was exported", async () => {
    serve(2);
    render(<SuperAgentJobSeekersPage />);
    await loaded();
    await userEvent.click(within(table()).getByRole("checkbox", { name: "Select Seeker 1" }));
    await userEvent.click(screen.getByRole("button", { name: "Export CVs" }));
    await userEvent.click(await screen.findByRole("button", { name: "Finish export" }));

    await waitFor(() => expect(screen.queryByRole("region", { name: "Selected rows" })).toBeNull());
  });

  it("allows 50 candidates and holds back a 51st", async () => {
    serve(51);
    render(<SuperAgentJobSeekersPage />);
    await loaded();

    await userEvent.click(within(table()).getByRole("checkbox", { name: "Select all on this page" }));
    expect(screen.getByText("51 selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export CVs" })).toBeDisabled();
    expect(screen.getAllByText(/up to 50 CVs/).length).toBeGreaterThan(0);

    await userEvent.click(within(table()).getByRole("checkbox", { name: "Select Seeker 51" }));
    expect(screen.getByText("50 selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export CVs" })).toBeEnabled();
    // Role queries over 51 rows in two layouts are slow in jsdom.
  }, 30000);
});

describe("super agent job seekers: profile panel and viewer", () => {
  it("opens a profile in the side panel without touching the ticked rows", async () => {
    serve(2, { ...seeker(1), userId: { name: "Seeker 1", email: "seeker1@example.com" }, skills: ["Welding"] });
    render(<SuperAgentJobSeekersPage />);
    await loaded();
    await userEvent.click(within(table()).getByRole("checkbox", { name: "Select Seeker 2" }));

    await userEvent.click(within(table()).getAllByRole("button", { name: /View Profile/i })[0]);

    // The panel loads that one profile (a "View CV" button appears for it).
    expect(await screen.findByRole("button", { name: "View CV" })).toBeInTheDocument();
    // The ticked row is still ticked, and the export still has only it.
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(lastDialog().items).toEqual([{ seekerId: id(2), name: "Seeker 2" }]);
  });

  it("opens the Standardised CV first and the uploaded file only when asked for", async () => {
    serve(1, { ...seeker(1), userId: { name: "Seeker 1", email: "seeker1@example.com" }, cv: { originalUrl: "/files/cv.pdf" } });
    render(<SuperAgentJobSeekersPage />);
    await loaded();

    await userEvent.click(within(table()).getByRole("button", { name: /View Profile/i }));
    await userEvent.click(await screen.findByRole("button", { name: "View CV" }));
    expect(await screen.findByTestId("viewer")).toHaveAttribute("data-source", "");
    expect(screen.getByTestId("viewer")).toHaveAttribute("data-url", `/api/employers/candidates/${id(1)}/cv#cv.pdf`);
  });

  it("opens the uploaded file from the secondary menu item", async () => {
    serve(1, { ...seeker(1), userId: { name: "Seeker 1", email: "seeker1@example.com" }, cv: { originalUrl: "/files/cv.pdf" } });
    render(<SuperAgentJobSeekersPage />);
    await loaded();

    await userEvent.click(within(table()).getByRole("button", { name: /View Profile/i }));
    await userEvent.click(await screen.findByRole("button", { name: "More ways to open the CV" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Original CV (Uploaded)" }));

    expect(await screen.findByTestId("viewer")).toHaveAttribute("data-source", "file");
  });
});
