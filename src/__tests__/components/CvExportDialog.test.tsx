/**
 * @jest-environment jsdom
 *
 * The bulk CV export dialog: what the manifest says is shown before anything is
 * downloaded, the mode choice recounts it, progress and Cancel while it runs,
 * and the three ways it ends (ZIP + toast, partial ZIP + toast, error with no
 * ZIP). Network, renderer and download are faked; the ZIP is the real one.
 */
import { prefStorage } from "@/lib/consent/prefStorage";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";

import { CvExportDialog, type CvExportDialogProps } from "@/components/shared/CvExport/CvExportDialog";
import { CV_EXPORT_MODE_KEY } from "@/components/shared/CvExport/useCvExport";
import { csrfFetch } from "@/lib/security/csrf-client";
import { renderBuiltCvPdf } from "@/lib/cv/renderBuiltCv";
import { buildCvZip } from "@/lib/cv/cvZip";
import { CV_EXPORT_MAX_ITEMS, type CvExportAllowedItem, type CvExportManifestItem } from "@/lib/cv/cvExportTypes";
import {
  BUILT_JSON,
  abortable,
  allowed,
  asResponse,
  deferred,
  denied,
  fakeResponse,
  itemsFor,
  pdfBlob,
} from "@/__tests__/helpers/cvExportFixtures";

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/lib/security/csrf-client", () => ({ csrfFetch: jest.fn() }));
jest.mock("@/lib/cv/renderBuiltCv", () => ({ renderBuiltCvPdf: jest.fn() }));
jest.mock("@/lib/cv/cvZip", () => {
  const actual = jest.requireActual("@/lib/cv/cvZip");
  return { ...actual, buildCvZip: jest.fn(actual.buildCvZip) };
});

const en = require("../../../messages/en.json") as {
  cvExport: Record<string, string>;
  formErrors: Record<string, string>;
};

const csrfFetchMock = csrfFetch as jest.MockedFunction<typeof csrfFetch>;
const renderMock = renderBuiltCvPdf as jest.MockedFunction<typeof renderBuiltCvPdf>;
const buildZipMock = buildCvZip as jest.MockedFunction<typeof buildCvZip>;
const toastSuccess = toast.success as jest.Mock;
const fetchMock = jest.fn();

let downloads: string[];

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  csrfFetchMock.mockReset();
  fetchMock.mockReset();
  toastSuccess.mockReset();
  renderMock.mockReset();
  renderMock.mockImplementation(async () => pdfBlob());
  buildZipMock.mockReset();
  buildZipMock.mockImplementation(jest.requireActual("@/lib/cv/cvZip").buildCvZip);
  global.fetch = fetchMock as unknown as typeof fetch;
  installFiles();

  downloads = [];
  URL.createObjectURL = jest.fn(() => "blob:test") as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = jest.fn() as unknown as typeof URL.revokeObjectURL;
  jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push(this.download);
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

function mockManifest(rows: CvExportManifestItem[]) {
  csrfFetchMock.mockResolvedValue(asResponse(fakeResponse(200, { json: { items: rows } })));
}

type FileHandler = (init: RequestInit | undefined) => Promise<unknown> | unknown;

function installFiles(overrides: Record<string, FileHandler> = {}) {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const handler = overrides[url];
    const answer = handler
      ? Promise.resolve(handler(init))
      : Promise.resolve(
          url.includes("kind=built")
            ? fakeResponse(200, { json: BUILT_JSON })
            : fakeResponse(200, { type: "application/pdf", body: "%PDF-original" }),
        );
    return abortable(init?.signal ?? undefined, answer);
  });
}

function renderDialog(rows: CvExportManifestItem[], props: Partial<CvExportDialogProps> = {}) {
  mockManifest(rows);
  const onOpenChange = jest.fn();
  const view = render(<CvExportDialog open onOpenChange={onOpenChange} items={itemsFor(rows)} {...props} />);
  return { ...view, onOpenChange };
}

const exportButton = (count: number) => screen.findByRole("button", { name: `Export ${count} ${count === 1 ? "CV" : "CVs"}` });
const radio = (name: RegExp) => screen.getByRole("radio", { name });

describe("CvExportDialog: before the export", () => {
  it("shows what the manifest says will be missing, before any file is fetched", async () => {
    const rows = [allowed(1), allowed(2, { hasStandardised: false }), allowed(3, { hasOriginal: false }), denied(4)];
    renderDialog(rows);

    expect(screen.getByRole("heading", { name: en.cvExport.title })).toBeInTheDocument();
    expect(screen.getByText("4 candidates selected")).toBeInTheDocument();
    // While the manifest is out: a status line, and Export waits.
    expect(screen.getByText(en.cvExport.checking)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export 4 CVs" })).toBeDisabled();

    expect(await screen.findByText("1 has no standardised CV · 1 is outside your access")).toBeInTheDocument();
    expect(screen.getByText(/They'll be listed in the report inside the ZIP\./)).toBeInTheDocument();
    expect(await exportButton(4)).toBeEnabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("recounts when the mode is switched, and remembers the choice", async () => {
    const user = userEvent.setup();
    const rows = [allowed(1), allowed(2, { hasStandardised: false }), allowed(3, { hasOriginal: false }), denied(4)];
    renderDialog(rows);
    await screen.findByText("1 has no standardised CV · 1 is outside your access");
    expect(radio(/Standardised CVs/)).toHaveAttribute("aria-checked", "true");

    await user.click(radio(/Original CVs/));
    expect(await screen.findByText("1 has no uploaded file · 1 is outside your access")).toBeInTheDocument();
    expect(screen.queryByText(/no standardised CV/)).not.toBeInTheDocument();
    expect(prefStorage.get(CV_EXPORT_MODE_KEY)).toBe("original");

    await user.click(radio(/Both versions/));
    expect(
      await screen.findByText("1 has no standardised CV · 1 has no uploaded file · 1 is outside your access"),
    ).toBeInTheDocument();
    expect(csrfFetchMock).toHaveBeenCalledTimes(1);
  });

  it("opens on the mode used last time", async () => {
    prefStorage.set(CV_EXPORT_MODE_KEY, "both");
    renderDialog([allowed(1)]);
    expect(radio(/Both versions/)).toHaveAttribute("aria-checked", "true");
    await exportButton(1);
  });

  it("moves the choice with the arrow keys", async () => {
    const user = userEvent.setup();
    renderDialog([allowed(1)]);
    await exportButton(1);
    radio(/Standardised CVs/).focus();
    await user.keyboard("{ArrowDown}");
    expect(radio(/Original CVs/)).toHaveAttribute("aria-checked", "true");
    expect(radio(/Original CVs/)).toHaveFocus();
  });

  it("names the candidates behind a warning only when asked", async () => {
    const user = userEvent.setup();
    renderDialog([allowed(1), allowed(2, { hasStandardised: false, name: "Omar Ali" })]);
    await screen.findByText("1 has no standardised CV");
    expect(screen.queryByText("Omar Ali")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: en.cvExport.showNames }));
    expect(screen.getByText("Omar Ali")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: en.cvExport.hideNames })).toHaveAttribute("aria-expanded", "true");

    await user.click(screen.getByRole("button", { name: en.cvExport.hideNames }));
    expect(screen.queryByText("Omar Ali")).not.toBeInTheDocument();
  });

  it("says so, and will not export, when nobody has the chosen CV", async () => {
    renderDialog([allowed(1, { hasStandardised: false }), allowed(2, { hasStandardised: false })]);
    expect(await screen.findByText(en.cvExport.nothingToExport)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export 2 CVs" })).toBeDisabled();
  });

  it("offers the details sheet only when the caller supplied rows", async () => {
    const { unmount } = renderDialog([allowed(1)]);
    await exportButton(1);
    expect(screen.queryByLabelText(en.cvExport.includeDetails)).not.toBeInTheDocument();
    unmount();

    renderDialog([allowed(1)], { detailsRows: { header: ["Name"], rowsById: new Map([["x", ["y"]]]) } });
    await exportButton(1);
    const box = screen.getByRole("checkbox", { name: en.cvExport.includeDetails });
    expect(box).toBeChecked();
  });

  it(`refuses more than ${CV_EXPORT_MAX_ITEMS} candidates without asking the server`, () => {
    const rows = Array.from({ length: CV_EXPORT_MAX_ITEMS + 1 }, (_, i) => allowed(i + 1));
    renderDialog(rows);
    expect(screen.getByRole("alert")).toHaveTextContent(`You can export up to ${CV_EXPORT_MAX_ITEMS} candidates at a time`);
    expect(screen.getByRole("button", { name: `Export ${rows.length} CVs` })).toBeDisabled();
    expect(csrfFetchMock).not.toHaveBeenCalled();
  });

  it("explains a rate limit and lets the person try again", async () => {
    const user = userEvent.setup();
    csrfFetchMock.mockResolvedValueOnce(asResponse(fakeResponse(429, { json: { error: "Too many export requests." } })));
    render(<CvExportDialog open onOpenChange={jest.fn()} items={[{ seekerId: allowed(1).seekerId }]} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(en.formErrors.rateLimit);
    expect(screen.queryByText("Too many export requests.")).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();

    mockManifest([allowed(1)]);
    await user.click(screen.getByRole("button", { name: en.cvExport.retry }));
    expect(await exportButton(1)).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("CvExportDialog: while it runs", () => {
  it("shows progress, and Cancel stops the fetches and returns to the options", async () => {
    const user = userEvent.setup();
    const rows = [allowed(1, { name: "Sara Ahmed" }), allowed(2)];
    const signals: AbortSignal[] = [];
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      signals.push(init?.signal as AbortSignal);
      return abortable(init?.signal ?? undefined, new Promise(() => undefined));
    });
    renderDialog(rows);
    await user.click(await exportButton(2));

    expect(await screen.findByText("Preparing CVs… 0 of 2")).toBeInTheDocument();
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(await screen.findByText(/Sara Ahmed — standardised CV|Name 2 — standardised CV/)).toBeInTheDocument();
    // Export stays put but cannot be pressed again while running.
    expect(screen.getByRole("button", { name: /^Export/ })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((s) => s.aborted)).toBe(true);
    expect(await screen.findByText(en.cvExport.cancelled)).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(await exportButton(2)).toBeEnabled();
    expect(buildZipMock).not.toHaveBeenCalled();
    expect(downloads).toHaveLength(0);
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("closing it in the middle of an export cancels the export", async () => {
    const user = userEvent.setup();
    const signals: AbortSignal[] = [];
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      signals.push(init?.signal as AbortSignal);
      return abortable(init?.signal ?? undefined, new Promise(() => undefined));
    });
    const { onOpenChange } = renderDialog([allowed(1)]);
    await user.click(await exportButton(1));
    await screen.findByRole("progressbar");

    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(signals.every((s) => s.aborted)).toBe(true);
  });

  it("moves the bar and the count as candidates finish", async () => {
    const user = userEvent.setup();
    const rows = [allowed(1), allowed(2)];
    const gate = deferred<unknown>();
    installFiles({ [(rows[1] as CvExportAllowedItem).builtUrl]: () => gate.promise });
    renderDialog(rows);
    await user.click(await exportButton(2));

    expect(await screen.findByText("Preparing CVs… 1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
    gate.resolve(fakeResponse(200, { json: BUILT_JSON }));
    await waitFor(() => expect(downloads).toHaveLength(1));
  });
});

describe("CvExportDialog: how it ends", () => {
  it("downloads the ZIP, says how many were exported, and closes", async () => {
    const user = userEvent.setup();
    const onExported = jest.fn();
    const { onOpenChange } = renderDialog([allowed(1), allowed(2)], { onExported });
    await user.click(await exportButton(2));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(downloads).toHaveLength(1);
    expect(downloads[0]).toMatch(/^Mployedin-CVs-.*\.zip$/);
    expect(toastSuccess).toHaveBeenCalledWith("2 candidates exported");
    expect(onExported).toHaveBeenCalledWith(expect.objectContaining({ exported: 2, skipped: 0 }));
  });

  it("on a partial failure still downloads and says how many were skipped", async () => {
    const user = userEvent.setup();
    const rows = [allowed(1), allowed(2)];
    installFiles({ [(rows[1] as CvExportAllowedItem).builtUrl]: () => fakeResponse(502) });
    const { onOpenChange } = renderDialog(rows);
    await user.click(await exportButton(2));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(downloads).toHaveLength(1);
    expect(toastSuccess).toHaveBeenCalledWith("1 candidate exported · 1 skipped (see report)");
  });

  it("counts a candidate the person may not open as skipped", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog([allowed(1), denied(2)]);
    await user.click(await exportButton(2));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(toastSuccess).toHaveBeenCalledWith("1 candidate exported · 1 skipped (see report)");
  });

  it("when every CV fails: no download, no toast, the dialog stays with a 'Couldn't export' error", async () => {
    const user = userEvent.setup();
    installFiles({
      [(allowed(1) as CvExportAllowedItem).builtUrl]: () => Promise.reject(new TypeError("down")),
      [(allowed(2) as CvExportAllowedItem).builtUrl]: () => fakeResponse(500),
    });
    const { onOpenChange } = renderDialog([allowed(1), allowed(2)]);
    await user.click(await exportButton(2));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(en.cvExport.exportFailed);
    expect(alert.textContent).toMatch(/^Couldn't export these CVs/);
    expect(downloads).toHaveLength(0);
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    // Back on the options, ready to try again.
    expect(within(screen.getByRole("radiogroup")).getAllByRole("radio")).toHaveLength(3);
    expect(await exportButton(2)).toBeEnabled();
  });

  it("passes the details sheet to the ZIP unless the person unticks it", async () => {
    const user = userEvent.setup();
    const details = { header: ["Name"], rowsById: new Map([["x", ["y"]]]) };
    buildZipMock.mockResolvedValue({
      blob: new Blob(["zip"]),
      fileName: "x.zip",
      report: [],
      fileCount: 1,
      exportedCandidates: 1,
      skippedCandidates: 0,
    });
    const { unmount } = renderDialog([allowed(1)], { detailsRows: details });
    await user.click(await exportButton(1));
    await waitFor(() => expect(buildZipMock).toHaveBeenCalledTimes(1));
    expect(buildZipMock.mock.calls[0][0].details).toBe(details);
    unmount();

    renderDialog([allowed(1)], { detailsRows: details });
    await exportButton(1);
    await user.click(screen.getByRole("checkbox", { name: en.cvExport.includeDetails }));
    await user.click(screen.getByRole("button", { name: "Export 1 CV" }));
    await waitFor(() => expect(buildZipMock).toHaveBeenCalledTimes(2));
    expect(buildZipMock.mock.calls[1][0].details).toBeUndefined();
  });

  it("keeps working when storage throws", async () => {
    jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const user = userEvent.setup();
    renderDialog([allowed(1)]);
    await exportButton(1);
    await user.click(radio(/Both versions/));
    expect(radio(/Both versions/)).toHaveAttribute("aria-checked", "true");
  });
});

describe("CvExportDialog: running, accessibility and safety", () => {
  function hangingFetch(signals: AbortSignal[] = []) {
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      signals.push(init?.signal as AbortSignal);
      return abortable(init?.signal ?? undefined, new Promise(() => undefined));
    });
    return signals;
  }

  it("moves focus to Cancel when the export starts", async () => {
    const user = userEvent.setup();
    hangingFetch();
    renderDialog([allowed(1), allowed(2)]);
    await user.click(await exportButton(2));
    await screen.findByRole("progressbar");
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("announces only the 'N of M' line, not the whole progress block", async () => {
    const user = userEvent.setup();
    hangingFetch();
    renderDialog([allowed(1), allowed(2)]);
    await user.click(await exportButton(2));

    const line = await screen.findByText("Preparing CVs… 0 of 2");
    expect(line).toHaveAttribute("aria-live", "polite");
    const dialog = screen.getByRole("dialog");
    expect(Array.from(dialog.querySelectorAll("[aria-live], [role='status'], [role='alert']"))).toEqual([line]);
    // The bar and the "who is being prepared" line sit outside any live region.
    expect(screen.getByRole("progressbar").closest("[aria-live]")).toBeNull();
    const current = await screen.findByText(/— standardised CV/);
    expect(current.closest("[aria-live]")).toBeNull();
  });

  it("keeps Export where it was, disabled, while running, so a double click cannot land on Cancel", async () => {
    const user = userEvent.setup();
    hangingFetch();
    const { onOpenChange } = renderDialog([allowed(1), allowed(2)]);
    await user.click(await exportButton(2));
    await screen.findByRole("progressbar");

    const again = screen.getByRole("button", { name: "Export 2 CVs" });
    expect(again).toBeDisabled();
    const calls = fetchMock.mock.calls.length;
    await user.click(again);
    expect(fetchMock.mock.calls.length).toBe(calls);
    expect(screen.queryByText(en.cvExport.cancelled)).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("a double click on Export starts one export and does not cancel it", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog([allowed(1), allowed(2)]);
    await user.dblClick(await exportButton(2));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(downloads).toHaveLength(1);
    expect(buildZipMock).toHaveBeenCalledTimes(1);
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(en.cvExport.cancelled)).not.toBeInTheDocument();
  });

  it("says so, instead of silently dropping the export, when the selection changes mid-run", async () => {
    const user = userEvent.setup();
    const signals = hangingFetch();
    const rowsA = [allowed(1), allowed(2)];
    const { rerender, onOpenChange } = renderDialog(rowsA);
    await user.click(await exportButton(2));
    await screen.findByRole("progressbar");

    const rowsB = [allowed(1)];
    mockManifest(rowsB);
    rerender(<CvExportDialog open onOpenChange={onOpenChange} items={itemsFor(rowsB)} />);

    expect(await screen.findByText(en.cvExport.selectionChanged)).toBeInTheDocument();
    expect(signals.every((s) => s.aborted)).toBe(true);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(await exportButton(1)).toBeEnabled();
    expect(downloads).toHaveLength(0);
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("drops the 'cancelled' note when the mode is changed", async () => {
    const user = userEvent.setup();
    hangingFetch();
    renderDialog([allowed(1)]);
    await user.click(await exportButton(1));
    await screen.findByRole("progressbar");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByText(en.cvExport.cancelled)).toBeInTheDocument();

    await user.click(radio(/Both versions/));
    expect(screen.queryByText(en.cvExport.cancelled)).not.toBeInTheDocument();
  });
});
