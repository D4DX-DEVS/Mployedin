/**
 * @jest-environment jsdom
 *
 * The Copilot's ranked candidate shortlist. Its CV download is the shared
 * export (CvExportDialog: Standardised / Original / Both), not a ZIP of its
 * own; the shortlist only fetches the contact details and hands the dialog the
 * candidates plus the sheet rows it has always built. Excel and PDF stay as they were.
 */
import type React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { TalentShortlist } from "@/components/shared/Copilot/TalentShortlist";
import * as shortlistExport from "@/components/shared/Copilot/candidateShortlistExport";
import type { ShortlistDetail } from "@/components/shared/Copilot/candidateShortlistExport";
import type { TalentRow } from "@/lib/ai/copilot/views";

const dialogProps = jest.fn();
jest.mock("@/components/shared/CvExport/CvExportDialog", () => ({
  CvExportDialog: (props: { open: boolean; onOpenChange: (open: boolean) => void }) => {
    dialogProps(props);
    return props.open ? (
      <div role="dialog" aria-label="Export CVs">
        <button type="button" onClick={() => props.onOpenChange(false)}>Close export</button>
      </div>
    ) : null;
  },
}));

jest.mock("@/components/shared/Copilot/candidateShortlistExport", () => ({
  ...jest.requireActual("@/components/shared/Copilot/candidateShortlistExport"),
  fetchShortlistDetails: jest.fn(),
  downloadShortlistExcel: jest.fn(),
  downloadShortlistPdf: jest.fn(),
}));

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
jest.mock("@/components/shared/UserAvatar", () => ({ UserAvatar: () => null }));

const fetchDetails = shortlistExport.fetchShortlistDetails as jest.Mock;
const downloadExcel = shortlistExport.downloadShortlistExcel as jest.Mock;

const talent: TalentRow[] = [
  { seekerId: "a".repeat(24), name: "Sara Ahmed", title: "Electrical Engineer", skills: ["AutoCAD"], hasCV: true, fit: 91 },
  { seekerId: "b".repeat(24), name: "Omar Ali", skills: [], hasCV: false, fit: 74 },
];

const details: ShortlistDetail[] = [
  {
    id: "a".repeat(24), name: "Sara Ahmed", headline: "", title: "Electrical Engineer", email: "sara@example.com", phone: "+965 111",
    skills: ["AutoCAD", "ETAP"], nationality: "Egyptian", location: "Kuwait", experienceYears: 5, hasCV: true,
  },
  {
    id: "b".repeat(24), name: "Omar Ali", headline: "Site engineer", title: "", email: "omar@example.com", phone: "",
    skills: [], nationality: "", location: "", experienceYears: null, hasCV: false,
  },
];

function lastDialogProps() {
  const calls = dialogProps.mock.calls;
  return calls[calls.length - 1][0] as {
    open: boolean;
    items: Array<{ seekerId: string; name?: string }>;
    detailsRows?: { header: string[]; rowsById: ReadonlyMap<string, string[]> };
    onOpenChange: (open: boolean) => void;
  };
}

async function chooseExport(label: RegExp) {
  await userEvent.click(screen.getByRole("button", { name: /^export$/i }));
  await userEvent.click(await screen.findByRole("menuitem", { name: label }));
}

beforeEach(() => {
  jest.clearAllMocks();
  fetchDetails.mockResolvedValue(details);
});

describe("TalentShortlist CV export", () => {
  it("keeps the export dialog closed until the CV download is chosen", () => {
    render(<TalentShortlist talent={talent} totalMatched={2} relaxed={false} brief="electrical engineer" onInternalLink={jest.fn()} />);
    expect(screen.queryByRole("dialog", { name: "Export CVs" })).toBeNull();
    expect(lastDialogProps().open).toBe(false);
  });

  it("opens the shared export for the whole shortlist, in rank order, with the sheet rows", async () => {
    render(<TalentShortlist talent={talent} totalMatched={2} relaxed={false} brief="electrical engineer" onInternalLink={jest.fn()} />);

    await chooseExport(/CVs/i);

    // The contact details are fetched at click time, for every ranked candidate.
    expect(fetchDetails).toHaveBeenCalledWith(["a".repeat(24), "b".repeat(24)]);
    expect(await screen.findByRole("dialog", { name: "Export CVs" })).toBeInTheDocument();

    const props = lastDialogProps();
    expect(props.open).toBe(true);
    expect(props.items).toEqual([
      { seekerId: "a".repeat(24), name: "Sara Ahmed" },
      { seekerId: "b".repeat(24), name: "Omar Ali" },
    ]);
    expect(props.detailsRows?.header).toEqual([
      "Rank", "Name", "Current title", "Fit %", "Experience (yrs)", "Location", "Nationality", "Email", "Phone", "Skills",
    ]);
    // The dialog adds its own Standardised / Original columns, so there is no "CV file" one here.
    expect(props.detailsRows?.header).not.toContain("CV file");
    expect(props.detailsRows?.rowsById.get("a".repeat(24))).toEqual([
      "1", "Sara Ahmed", "Electrical Engineer", "91%", "5", "Kuwait", "Egyptian", "sara@example.com", "+965 111", "AutoCAD, ETAP",
    ]);
    // A candidate without a title falls back to the headline; without years or a place, the cell is blank.
    expect(props.detailsRows?.rowsById.get("b".repeat(24))).toEqual([
      "2", "Omar Ali", "Site engineer", "74%", "", "", "", "omar@example.com", "", "",
    ]);
  });

  it("offers the CV export even when no candidate has an uploaded file (the standardised CV is built from the profile)", async () => {
    fetchDetails.mockResolvedValue(details.map((d) => ({ ...d, hasCV: false })));
    render(<TalentShortlist talent={talent} totalMatched={2} relaxed={false} brief="" onInternalLink={jest.fn()} />);

    await chooseExport(/CVs/i);

    expect(await screen.findByRole("dialog", { name: "Export CVs" })).toBeInTheDocument();
    expect(downloadExcel).not.toHaveBeenCalled();
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("closes the export without downloading anything else", async () => {
    render(<TalentShortlist talent={talent} totalMatched={2} relaxed={false} brief="" onInternalLink={jest.fn()} />);
    await chooseExport(/CVs/i);
    await userEvent.click(await screen.findByRole("button", { name: "Close export" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Export CVs" })).toBeNull());
    expect(downloadExcel).not.toHaveBeenCalled();
  });

  it("says so, and opens nothing, when the details cannot be fetched", async () => {
    fetchDetails.mockRejectedValue(new Error("shortlist details 500"));
    render(<TalentShortlist talent={talent} totalMatched={2} relaxed={false} brief="" onInternalLink={jest.fn()} />);

    await chooseExport(/CVs/i);

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't prepare the download. Try again."));
    expect(screen.queryByRole("dialog", { name: "Export CVs" })).toBeNull();
  });

  it("still downloads the Excel sheet on its own", async () => {
    render(<TalentShortlist talent={talent} totalMatched={2} relaxed={false} brief="electrical engineer" onInternalLink={jest.fn()} />);

    await chooseExport(/excel/i);

    await waitFor(() => expect(downloadExcel).toHaveBeenCalledTimes(1));
    expect(downloadExcel.mock.calls[0][0]).toEqual(details);
    expect(screen.queryByRole("dialog", { name: "Export CVs" })).toBeNull();
  });
});

describe("candidateShortlistExport", () => {
  it("no longer carries a ZIP builder of its own", () => {
    expect((shortlistExport as Record<string, unknown>).downloadShortlistZip).toBeUndefined();
  });

  it("builds the details sheet keyed by seeker id, not by position", () => {
    const cols = {
      rank: "Rank", name: "Name", title: "Title", fit: "Fit", experience: "Years", location: "Place",
      nationality: "Nationality", email: "Email", phone: "Phone", skills: "Skills",
    };
    const built = shortlistExport.shortlistCvDetails(details, new Map([["b".repeat(24), 60]]), cols);
    expect(built.header).toHaveLength(10);
    expect([...built.rowsById.keys()]).toEqual(["a".repeat(24), "b".repeat(24)]);
    // No fit known for Sara: blank, not "undefined%".
    expect(built.rowsById.get("a".repeat(24))?.[3]).toBe("");
    expect(built.rowsById.get("b".repeat(24))?.[3]).toBe("60%");
  });
});
