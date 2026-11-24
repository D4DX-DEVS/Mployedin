/**
 * @jest-environment jsdom
 *
 * The bulk CV export's state machine: idle -> checking (manifest) -> ready
 * (counts) -> running -> done | error. The network (manifest + file fetches),
 * the PDF renderer and the download are faked; the ZIP is built by the real
 * buildCvZip so the report the person receives can be read back.
 */
import { prefStorage } from "@/lib/consent/prefStorage";
import { act, renderHook, waitFor } from "@testing-library/react";
import JSZip from "jszip";

import { useCvExport, CV_EXPORT_MODE_KEY, type UseCvExportOptions } from "@/components/shared/CvExport/useCvExport";
import { csrfFetch } from "@/lib/security/csrf-client";
import { renderBuiltCvPdf } from "@/lib/cv/renderBuiltCv";
import { buildCvZip } from "@/lib/cv/cvZip";
import { CV_EXPORT_MAX_ITEMS, type CvExportAllowedItem, type CvExportManifestItem } from "@/lib/cv/cvExportTypes";
import { isFormError } from "@/lib/errors/form-error";
import {
  BUILT_JSON,
  abortable,
  allowed,
  asResponse,
  blobToBuffer,
  deferred,
  denied,
  fakeResponse,
  itemsFor,
  pdfBlob,
  seekerId,
} from "@/__tests__/helpers/cvExportFixtures";

jest.mock("@/lib/security/csrf-client", () => ({ csrfFetch: jest.fn() }));
jest.mock("@/lib/cv/renderBuiltCv", () => ({ renderBuiltCvPdf: jest.fn() }));
/** Lets a test make reading cvZip.extFromResponse throw, to reach the worker's last-resort catch. */
const mockExtThrows = { times: 0 };
jest.mock("@/lib/cv/cvZip", () => {
  const actual = jest.requireActual("@/lib/cv/cvZip");
  const mod = { ...actual, buildCvZip: jest.fn(actual.buildCvZip) };
  Object.defineProperty(mod, "extFromResponse", {
    enumerable: true,
    get: () => {
      if (mockExtThrows.times > 0) {
        mockExtThrows.times -= 1;
        throw new Error("boom");
      }
      return actual.extFromResponse;
    },
  });
  return mod;
});

const en = require("../../../messages/en.json") as {
  cvBuilderPage: { previewSections: Record<string, string> };
  cvExport: Record<string, string>;
  formErrors: Record<string, string>;
};

const csrfFetchMock = csrfFetch as jest.MockedFunction<typeof csrfFetch>;
const renderMock = renderBuiltCvPdf as jest.MockedFunction<typeof renderBuiltCvPdf>;
const buildZipMock = buildCvZip as jest.MockedFunction<typeof buildCvZip>;
const fetchMock = jest.fn();

/* ── fixtures ────────────────────────────────────────── */

function mockManifest(rows: CvExportManifestItem[]) {
  csrfFetchMock.mockResolvedValue(asResponse(fakeResponse(200, { json: { items: rows } })));
}

type FileHandler = (init: RequestInit | undefined) => Promise<unknown> | unknown;

/** Routes file GETs by URL; anything unlisted gets the default built / original answer. */
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

/* ── download capture ────────────────────────────────── */

let downloads: Array<{ name: string; href: string }>;
let zipBlobs: Blob[];
let createUrlMock: jest.Mock;
let revokeUrlMock: jest.Mock;

beforeEach(() => {
  mockExtThrows.times = 0;
  localStorage.clear();
  sessionStorage.clear();
  csrfFetchMock.mockReset();
  fetchMock.mockReset();
  renderMock.mockReset();
  renderMock.mockImplementation(async () => pdfBlob());
  buildZipMock.mockReset();
  buildZipMock.mockImplementation(jest.requireActual("@/lib/cv/cvZip").buildCvZip);
  global.fetch = fetchMock as unknown as typeof fetch;
  installFiles();

  downloads = [];
  zipBlobs = [];
  createUrlMock = jest.fn((blob: Blob) => {
    zipBlobs.push(blob);
    return `blob:test-${zipBlobs.length}`;
  });
  revokeUrlMock = jest.fn();
  URL.createObjectURL = createUrlMock as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = revokeUrlMock as unknown as typeof URL.revokeObjectURL;
  jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ name: this.download, href: this.href });
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

function renderExport(rows: CvExportManifestItem[], extra: Partial<UseCvExportOptions> = {}) {
  mockManifest(rows);
  const items = itemsFor(rows);
  return renderHook((props: UseCvExportOptions) => useCvExport(props), {
    initialProps: { open: true, items, ...extra } as UseCvExportOptions,
  });
}

async function ready(result: { current: ReturnType<typeof useCvExport> }) {
  await waitFor(() => expect(result.current.phase).toBe("ready"));
}

async function runToEnd(result: { current: ReturnType<typeof useCvExport> }, includeDetails = true) {
  act(() => result.current.start({ includeDetails }));
  await waitFor(() => expect(["done", "error"]).toContain(result.current.phase));
}

/* ── tests ───────────────────────────────────────────── */

describe("useCvExport: the manifest check", () => {
  it("asks the manifest once on open and counts what is missing for the chosen mode", async () => {
    const rows = [allowed(1), allowed(2, { hasStandardised: false }), allowed(3, { hasOriginal: false }), denied(4)];
    const { result } = renderExport(rows);
    expect(result.current.phase).toBe("checking");
    await ready(result);

    expect(csrfFetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = csrfFetchMock.mock.calls[0];
    expect(url).toBe("/api/cv-export/manifest");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ items: rows.map((r) => ({ seekerId: r.seekerId })) });

    // Default mode is standardised: only row 2 lacks it; "no uploaded file" is not asked about.
    expect(result.current.mode).toBe("standardised");
    expect(result.current.counts).toMatchObject({
      total: 4,
      allowed: 3,
      denied: 1,
      missingStandardised: 1,
      missingOriginal: 0,
      exportable: 2,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the application id only where the list is of applicants", async () => {
    const rows = [allowed(1), allowed(2)];
    mockManifest(rows);
    const applicationId = "a".repeat(24);
    renderHook(() => useCvExport({ open: true, items: [{ seekerId: rows[0].seekerId, applicationId }, { seekerId: rows[1].seekerId }] }));
    await waitFor(() => expect(csrfFetchMock).toHaveBeenCalled());
    expect(JSON.parse(String(csrfFetchMock.mock.calls[0][1]?.body))).toEqual({
      items: [{ seekerId: rows[0].seekerId, applicationId }, { seekerId: rows[1].seekerId }],
    });
  });

  it("recounts when the mode changes, without asking the server again", async () => {
    const rows = [allowed(1), allowed(2, { hasStandardised: false }), allowed(3, { hasOriginal: false }), denied(4)];
    const { result } = renderExport(rows);
    await ready(result);

    act(() => result.current.setMode("both"));
    expect(result.current.counts).toMatchObject({ missingStandardised: 1, missingOriginal: 1, exportable: 3 });

    act(() => result.current.setMode("original"));
    expect(result.current.counts).toMatchObject({ missingStandardised: 0, missingOriginal: 1, exportable: 2 });
    expect(csrfFetchMock).toHaveBeenCalledTimes(1);
  });

  it("names who is missing or out of reach, falling back to a short id for a nameless one", async () => {
    const rows = [allowed(1, { name: "" }), allowed(2, { hasStandardised: false }), denied(4)];
    const { result } = renderExport(rows);
    await ready(result);
    act(() => result.current.setMode("both"));
    expect(result.current.counts?.names.missingStandardised).toEqual(["Name 2"]);
    expect(result.current.counts?.names.missingOriginal).toEqual([]);
    expect(result.current.counts?.names.denied).toEqual(["Candidate 000004"]);
  });

  it("uses the name the list passed for a candidate the manifest would not name", async () => {
    const rows = [denied(4)];
    mockManifest(rows);
    const { result } = renderHook(() => useCvExport({ open: true, items: [{ seekerId: seekerId(4), name: "Sara Ahmed" }] }));
    await ready(result);
    expect(result.current.counts?.names.denied).toEqual(["Sara Ahmed"]);
  });

  it("does not ask again when the caller rebuilds an identical items array", async () => {
    const rows = [allowed(1), allowed(2)];
    const { result, rerender } = renderExport(rows);
    await ready(result);
    rerender({ open: true, items: itemsFor(rows) });
    rerender({ open: true, items: itemsFor(rows) });
    expect(csrfFetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe("ready");
  });

  it("stays idle while closed", () => {
    mockManifest([allowed(1)]);
    const { result } = renderHook(() => useCvExport({ open: false, items: [{ seekerId: seekerId(1) }] }));
    expect(result.current.phase).toBe("idle");
    expect(csrfFetchMock).not.toHaveBeenCalled();
  });

  it(`refuses more than ${CV_EXPORT_MAX_ITEMS} candidates without asking the server`, async () => {
    const rows = Array.from({ length: CV_EXPORT_MAX_ITEMS + 1 }, (_, i) => allowed(i + 1));
    const { result } = renderExport(rows);
    expect(result.current.overLimit).toBe(true);
    expect(result.current.phase).toBe("idle");
    act(() => result.current.start());
    expect(csrfFetchMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.phase).toBe("idle");
  });

  it(`accepts exactly ${CV_EXPORT_MAX_ITEMS} candidates`, async () => {
    const rows = Array.from({ length: CV_EXPORT_MAX_ITEMS }, (_, i) => allowed(i + 1));
    const { result } = renderExport(rows);
    await ready(result);
    expect(result.current.overLimit).toBe(false);
  });

  describe("when the manifest cannot be had", () => {
    const messageOf = (result: { current: ReturnType<typeof useCvExport> }) => {
      expect(isFormError(result.current.error)).toBe(true);
      return result.current.error?.message;
    };

    it("explains a rate limit (429) in friendly words", async () => {
      csrfFetchMock.mockResolvedValue(asResponse(fakeResponse(429, { json: { error: "Too many export requests." } })));
      const { result } = renderHook(() => useCvExport({ open: true, items: [{ seekerId: seekerId(1) }] }));
      await waitFor(() => expect(result.current.phase).toBe("error"));
      expect(messageOf(result)).toBe(en.formErrors.rateLimit);
      expect(result.current.counts).toBeNull();
    });

    it("says it is not allowed on 401 / 403", async () => {
      csrfFetchMock.mockResolvedValue(asResponse(fakeResponse(403, { json: { error: "Forbidden" } })));
      const { result } = renderHook(() => useCvExport({ open: true, items: [{ seekerId: seekerId(1) }] }));
      await waitFor(() => expect(result.current.phase).toBe("error"));
      expect(messageOf(result)).toBe(en.formErrors.permission);
    });

    it("never shows a raw server message on a 500", async () => {
      csrfFetchMock.mockResolvedValue(asResponse(fakeResponse(500, { json: { error: "MongoServerError: boom" } })));
      const { result } = renderHook(() => useCvExport({ open: true, items: [{ seekerId: seekerId(1) }] }));
      await waitFor(() => expect(result.current.phase).toBe("error"));
      expect(messageOf(result)).toBe(en.cvExport.checkError);
    });

    it("explains a network failure", async () => {
      csrfFetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
      const { result } = renderHook(() => useCvExport({ open: true, items: [{ seekerId: seekerId(1) }] }));
      await waitFor(() => expect(result.current.phase).toBe("error"));
      expect(messageOf(result)).toBe(en.formErrors.network);
    });

    it("treats an answer with the wrong number of rows as a failed check", async () => {
      mockManifest([allowed(1)]);
      const { result } = renderHook(() => useCvExport({ open: true, items: [{ seekerId: seekerId(1) }, { seekerId: seekerId(2) }] }));
      await waitFor(() => expect(result.current.phase).toBe("error"));
      expect(messageOf(result)).toBe(en.cvExport.checkError);
    });

    it("asks again on retry", async () => {
      csrfFetchMock.mockResolvedValueOnce(asResponse(fakeResponse(429, { json: {} })));
      const { result } = renderHook(() => useCvExport({ open: true, items: [{ seekerId: seekerId(1) }] }));
      await waitFor(() => expect(result.current.phase).toBe("error"));

      mockManifest([allowed(1)]);
      act(() => result.current.retry());
      await ready(result);
      expect(result.current.error).toBeNull();
      expect(csrfFetchMock).toHaveBeenCalledTimes(2);
    });
  });
});

describe("useCvExport: the remembered mode", () => {
  it("restores the last mode and writes a new choice", async () => {
    prefStorage.set(CV_EXPORT_MODE_KEY, "both");
    const { result } = renderExport([allowed(1)]);
    expect(result.current.mode).toBe("both");
    act(() => result.current.setMode("original"));
    expect(prefStorage.get(CV_EXPORT_MODE_KEY)).toBe("original");
    await ready(result);
  });

  it("ignores a stored value that is not a mode", async () => {
    prefStorage.set(CV_EXPORT_MODE_KEY, "everything");
    const { result } = renderExport([allowed(1)]);
    expect(result.current.mode).toBe("standardised");
    await ready(result);
  });

  it("keeps working when storage throws on read and on write", async () => {
    jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    const { result } = renderExport([allowed(1)]);
    expect(result.current.mode).toBe("standardised");
    await ready(result);
    expect(() => act(() => result.current.setMode("both"))).not.toThrow();
    expect(result.current.mode).toBe("both");
  });
});

describe("useCvExport: the export run", () => {
  it("fetches each file, draws the standardised CV in the staff template, and downloads one ZIP", async () => {
    const rows = [allowed(1), allowed(2)];
    const onDone = jest.fn();
    const { result } = renderExport(rows, { onDone });
    await ready(result);
    act(() => result.current.setMode("both"));
    await runToEnd(result);

    expect(result.current.phase).toBe("done");
    for (const row of rows as CvExportAllowedItem[]) {
      expect(fetchMock).toHaveBeenCalledWith(row.originalUrl, expect.objectContaining({ credentials: "same-origin" }));
      expect(fetchMock).toHaveBeenCalledWith(row.builtUrl, expect.objectContaining({ credentials: "same-origin" }));
    }
    expect(renderMock).toHaveBeenCalledTimes(2);
    expect(renderMock).toHaveBeenCalledWith(BUILT_JSON, expect.objectContaining({ experience: expect.any(String) }), { templateId: "classic" });

    const input = buildZipMock.mock.calls[0][0];
    expect(input.mode).toBe("both");
    expect(input.entries.map((e) => e.id)).toEqual(rows.map((r) => r.seekerId));
    expect(input.entries[0].standardised?.status).toBe("ok");
    expect(input.entries[0].original).toMatchObject({ status: "ok", ext: "pdf" });

    expect(downloads).toHaveLength(1);
    expect(downloads[0].name).toMatch(/^Mployedin-CVs-\d{4}-\d{2}-\d{2}-\d{4}\.zip$/);
    expect(downloads[0].href).toBe("blob:test-1");
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ exported: 2, skipped: 0 }));
  });

  it("revokes the download link a little after the click, not during it", async () => {
    jest.useFakeTimers();
    const { result } = renderExport([allowed(1)]);
    await ready(result);
    act(() => result.current.start());
    await waitFor(() => expect(result.current.phase).toBe("done"));
    expect(downloads).toHaveLength(1);
    expect(revokeUrlMock).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(revokeUrlMock).toHaveBeenCalledWith("blob:test-1");
  });

  it("keeps the real extension of an original that is not a PDF", async () => {
    const rows = [allowed(1)];
    installFiles({
      [(rows[0] as CvExportAllowedItem).originalUrl]: () =>
        fakeResponse(200, { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
    });
    const { result } = renderExport(rows);
    await ready(result);
    act(() => result.current.setMode("original"));
    await runToEnd(result);
    expect(buildZipMock.mock.calls[0][0].entries[0].original).toMatchObject({ status: "ok", ext: "docx" });
  });

  it("only fetches what the chosen mode asks for", async () => {
    const rows = [allowed(1)];
    const { result } = renderExport(rows);
    await ready(result);
    act(() => result.current.setMode("original"));
    await runToEnd(result);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe((rows[0] as CvExportAllowedItem).originalUrl);
    expect(renderMock).not.toHaveBeenCalled();
  });

  it("keeps the entries in input order whatever order the fetches finish in", async () => {
    const rows = [allowed(1), allowed(2), allowed(3)];
    const slow = deferred<unknown>();
    installFiles({ [(rows[0] as CvExportAllowedItem).originalUrl]: () => slow.promise });
    const { result } = renderExport(rows);
    await ready(result);
    act(() => result.current.setMode("original"));
    act(() => result.current.start());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    await new Promise((r) => setTimeout(r, 10)); // rows 2 and 3 finish first
    slow.resolve(fakeResponse(200, { type: "application/pdf" }));
    await waitFor(() => expect(result.current.phase).toBe("done"));
    expect(buildZipMock.mock.calls[0][0].entries.map((e) => e.id)).toEqual(rows.map((r) => r.seekerId));
  });

  it("never has more than 3 file fetches in flight", async () => {
    const rows = Array.from({ length: 8 }, (_, i) => allowed(i + 1));
    let inFlight = 0;
    let max = 0;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      inFlight += 1;
      max = Math.max(max, inFlight);
      return abortable(
        init?.signal ?? undefined,
        new Promise((resolve) => setTimeout(resolve, 8)).then(() => {
          inFlight -= 1;
          return url.includes("kind=built")
            ? fakeResponse(200, { json: BUILT_JSON })
            : fakeResponse(200, { type: "application/pdf" });
        }),
      );
    });
    const { result } = renderExport(rows);
    await ready(result);
    act(() => result.current.setMode("both"));
    await runToEnd(result);
    expect(result.current.phase).toBe("done");
    expect(fetchMock).toHaveBeenCalledTimes(16);
    expect(max).toBe(3);
  });

  it("reports progress as candidates finished out of candidates to prepare", async () => {
    const rows = [allowed(1), allowed(2, { hasStandardised: false }), allowed(3), denied(4)];
    const gate = deferred<unknown>();
    installFiles({ [(rows[2] as CvExportAllowedItem).builtUrl]: () => gate.promise });
    const { result } = renderExport(rows);
    await ready(result);
    act(() => result.current.start());
    // Row 2 has nothing to fetch and row 4 is denied: two candidates to prepare.
    await waitFor(() => expect(result.current.progress).toMatchObject({ done: 1, total: 2, stage: "files" }));
    expect(result.current.phase).toBe("running");
    expect(result.current.progress?.current).toMatchObject({ step: "standardised" });
    gate.resolve(fakeResponse(200, { json: BUILT_JSON }));
    await waitFor(() => expect(result.current.phase).toBe("done"));
  });

  describe("cancel", () => {
    it("aborts the fetches in flight, starts no more, and downloads nothing", async () => {
      const rows = Array.from({ length: 6 }, (_, i) => allowed(i + 1));
      const signals: AbortSignal[] = [];
      fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
        signals.push(init?.signal as AbortSignal);
        return abortable(init?.signal ?? undefined, new Promise(() => undefined));
      });
      const { result } = renderExport(rows);
      await ready(result);
      act(() => result.current.setMode("original"));
      act(() => result.current.start());
      await waitFor(() => expect(signals).toHaveLength(3));

      act(() => result.current.cancel());
      expect(signals.every((s) => s.aborted)).toBe(true);
      expect(result.current.phase).toBe("ready");
      expect(result.current.cancelled).toBe(true);

      await new Promise((r) => setTimeout(r, 20));
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(buildZipMock).not.toHaveBeenCalled();
      expect(downloads).toHaveLength(0);
    });

    it("lets a render in flight finish but throws its result away", async () => {
      const rendering = deferred<Blob>();
      renderMock.mockImplementation(() => rendering.promise);
      const { result } = renderExport([allowed(1)]);
      await ready(result);
      act(() => result.current.start());
      await waitFor(() => expect(renderMock).toHaveBeenCalled());

      act(() => result.current.cancel());
      await act(async () => {
        rendering.resolve(pdfBlob());
        await new Promise((r) => setTimeout(r, 10));
      });
      expect(result.current.phase).toBe("ready");
      expect(buildZipMock).not.toHaveBeenCalled();
      expect(downloads).toHaveLength(0);
    });

    it("can export again after a cancel", async () => {
      const gate = deferred<unknown>();
      installFiles({ [(allowed(1) as CvExportAllowedItem).builtUrl]: () => gate.promise });
      const { result } = renderExport([allowed(1)]);
      await ready(result);
      act(() => result.current.start());
      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      act(() => result.current.cancel());

      installFiles();
      await runToEnd(result);
      expect(result.current.phase).toBe("done");
      expect(downloads).toHaveLength(1);
      expect(result.current.cancelled).toBe(false);
    });

    it("aborts the work when the dialog closes", async () => {
      const signals: AbortSignal[] = [];
      fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
        signals.push(init?.signal as AbortSignal);
        return abortable(init?.signal ?? undefined, new Promise(() => undefined));
      });
      const rows = [allowed(1), allowed(2)];
      const { result, rerender } = renderExport(rows);
      await ready(result);
      act(() => result.current.start());
      await waitFor(() => expect(signals.length).toBeGreaterThan(0));

      rerender({ open: false, items: itemsFor(rows) });
      expect(signals.every((s) => s.aborted)).toBe(true);
      expect(result.current.phase).toBe("idle");
      expect(result.current.counts).toBeNull();
    });
  });

  describe("one candidate failing never stops the rest", () => {
    it("records a failed download as an error and carries on", async () => {
      const rows = [allowed(1), allowed(2), allowed(3)];
      installFiles({ [(rows[1] as CvExportAllowedItem).originalUrl]: () => Promise.reject(new TypeError("network down")) });
      const { result } = renderExport(rows);
      await ready(result);
      act(() => result.current.setMode("original"));
      await runToEnd(result);

      const entries = buildZipMock.mock.calls[0][0].entries;
      expect(entries.map((e) => e.original?.status)).toEqual(["ok", "error", "ok"]);
      expect(entries[1].original).toMatchObject({ note: en.cvExport.noteDownloadError });
      expect(result.current.phase).toBe("done");
      expect(downloads).toHaveLength(1);
    });

    it("records a render that rejects (including a timeout) against that candidate only", async () => {
      const rows = [allowed(1), allowed(2), allowed(3)];
      renderMock.mockImplementation(async () => pdfBlob());
      renderMock.mockImplementationOnce(async () => pdfBlob());
      renderMock.mockImplementationOnce(async () => {
        throw new Error("PDF render timed out");
      });
      const { result } = renderExport(rows);
      await ready(result);
      await runToEnd(result);

      const statuses = buildZipMock.mock.calls[0][0].entries.map((e) => e.standardised?.status);
      expect(statuses.filter((s) => s === "ok")).toHaveLength(2);
      const failed = buildZipMock.mock.calls[0][0].entries.find((e) => e.standardised?.status === "error");
      expect(failed?.standardised).toMatchObject({ note: en.cvExport.noteBuildError });
      expect(result.current.phase).toBe("done");
    });

    it("maps the file route's answers: 404 missing, 403 no access, anything else an error", async () => {
      const rows = [allowed(1), allowed(2), allowed(3), allowed(4)];
      const url = (n: number) => (rows[n - 1] as CvExportAllowedItem).originalUrl;
      installFiles({
        [url(1)]: () => fakeResponse(404),
        [url(2)]: () => fakeResponse(403),
        [url(3)]: () => fakeResponse(502),
      });
      const { result } = renderExport(rows);
      await ready(result);
      act(() => result.current.setMode("original"));
      await runToEnd(result);
      const entries = buildZipMock.mock.calls[0][0].entries;
      expect(entries[0].original).toMatchObject({ status: "missing", note: en.cvExport.noteNoUploadedFile });
      expect(entries[1].original).toMatchObject({ status: "no access" });
      expect(entries[2].original).toMatchObject({ status: "error", note: en.cvExport.noteDownloadError });
      expect(entries[3].original?.status).toBe("ok");
    });

    it("reports a standardised CV with no content as missing and does not render it", async () => {
      const rows = [allowed(1), allowed(2)];
      installFiles({ [(rows[0] as CvExportAllowedItem).builtUrl]: () => fakeResponse(200, { json: { ...BUILT_JSON, hasContent: false } }) });
      const { result } = renderExport(rows);
      await ready(result);
      await runToEnd(result);
      const entries = buildZipMock.mock.calls[0][0].entries;
      expect(entries[0].standardised).toMatchObject({ status: "missing", note: en.cvExport.noteNoProfileDetails });
      expect(entries[1].standardised?.status).toBe("ok");
      expect(renderMock).toHaveBeenCalledTimes(1);
    });

    it("does not fetch what the manifest says is not there, and reports it missing", async () => {
      const rows = [allowed(1, { hasStandardised: false, hasOriginal: false }), allowed(2)];
      const { result } = renderExport(rows);
      await ready(result);
      act(() => result.current.setMode("both"));
      await runToEnd(result);
      const urls = fetchMock.mock.calls.map((c) => c[0]);
      expect(urls.some((u) => String(u).includes(seekerId(1)))).toBe(false);
      const entries = buildZipMock.mock.calls[0][0].entries;
      expect(entries[0].standardised).toMatchObject({ status: "missing" });
      expect(entries[0].original).toMatchObject({ status: "missing" });
    });
  });

  describe("two applications of one candidate", () => {
    it("draws the standardised CV once, keeps both originals, and notes the repeat", async () => {
      const rows = [allowed(1), allowed(1), allowed(2)];
      const items = [
        { seekerId: seekerId(1), applicationId: "a".repeat(24) },
        { seekerId: seekerId(1), applicationId: "b".repeat(24) },
        { seekerId: seekerId(2), applicationId: "c".repeat(24) },
      ];
      mockManifest(rows);
      const { result } = renderHook(() => useCvExport({ open: true, items }));
      await ready(result);
      act(() => result.current.setMode("both"));
      await runToEnd(result);

      expect(result.current.phase).toBe("done");
      expect(renderMock).toHaveBeenCalledTimes(2);
      const builtCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("kind=built"));
      expect(builtCalls).toHaveLength(2);
      const originalCalls = fetchMock.mock.calls.filter((c) => !String(c[0]).includes("kind=built"));
      expect(originalCalls).toHaveLength(3);

      const entries = buildZipMock.mock.calls[0][0].entries;
      expect(entries[0].standardised?.status).toBe("ok");
      expect(entries[1].standardised).toMatchObject({ status: "missing", note: en.cvExport.noteStandardisedAlreadyIncluded });
      expect(entries[1].original?.status).toBe("ok");
    });
  });

  describe("denied candidates", () => {
    it("are never fetched and come through as 'no access' report rows", async () => {
      const rows: CvExportManifestItem[] = [allowed(1), denied(2), allowed(3, { name: "Omar Ali" })];
      const { result } = renderExport(rows);
      await ready(result);
      act(() => result.current.setMode("both"));
      await runToEnd(result);

      expect(fetchMock.mock.calls.some((c) => String(c[0]).includes(seekerId(2)))).toBe(false);
      const entries = buildZipMock.mock.calls[0][0].entries;
      expect(entries.map((e) => e.id)).toEqual([seekerId(1), seekerId(2), seekerId(3)]);
      expect(entries[1].original).toMatchObject({ status: "no access" });
      expect(entries[1].standardised?.status).toBe("missing");

      // And the report the person receives says so.
      const zip = await JSZip.loadAsync(await blobToBuffer(zipBlobs[0]));
      const report = await zip.file("export-report.csv")!.async("string");
      expect(report).toContain("no access");
    });
  });

  describe("when nothing could be prepared", () => {
    it("downloads nothing and says it couldn't export", async () => {
      const rows = [allowed(1), allowed(2)];
      const onDone = jest.fn();
      installFiles({
        [(rows[0] as CvExportAllowedItem).originalUrl]: () => Promise.reject(new TypeError("down")),
        [(rows[1] as CvExportAllowedItem).originalUrl]: () => fakeResponse(500),
      });
      const { result } = renderExport(rows, { onDone });
      await ready(result);
      act(() => result.current.setMode("original"));
      await runToEnd(result);

      expect(result.current.phase).toBe("error");
      expect(isFormError(result.current.error)).toBe(true);
      expect(result.current.error?.message).toBe(en.cvExport.exportFailed);
      expect(result.current.error?.message).not.toMatch(/^Failed to/);
      expect(downloads).toHaveLength(0);
      expect(createUrlMock).not.toHaveBeenCalled();
      expect(buildZipMock).not.toHaveBeenCalled(); // no point zipping a report on its own
      expect(onDone).not.toHaveBeenCalled();
      // The person can try again from the same options.
      expect(result.current.counts).not.toBeNull();
    });

    it("does not download when the ZIP holds no CV file, whatever the entries said", async () => {
      buildZipMock.mockResolvedValueOnce({
        blob: new Blob(["zip"]),
        fileName: "x.zip",
        report: [],
        fileCount: 0,
        exportedCandidates: 0,
        skippedCandidates: 1,
      });
      const { result } = renderExport([allowed(1)]);
      await ready(result);
      await runToEnd(result);
      expect(result.current.phase).toBe("error");
      expect(result.current.error?.message).toBe(en.cvExport.exportFailed);
      expect(downloads).toHaveLength(0);
    });

    it("can be retried and then succeeds", async () => {
      const rows = [allowed(1)];
      installFiles({ [(rows[0] as CvExportAllowedItem).builtUrl]: () => fakeResponse(500) });
      const { result } = renderExport(rows);
      await ready(result);
      await runToEnd(result);
      expect(result.current.phase).toBe("error");

      installFiles();
      await runToEnd(result);
      expect(result.current.phase).toBe("done");
      expect(result.current.error).toBeNull();
      expect(downloads).toHaveLength(1);
    });

    it("explains a ZIP that could not be built", async () => {
      buildZipMock.mockRejectedValueOnce(new Error("out of memory"));
      const { result } = renderExport([allowed(1)]);
      await ready(result);
      await runToEnd(result);
      expect(result.current.phase).toBe("error");
      expect(result.current.error?.message).toBe(en.cvExport.zipError);
      expect(downloads).toHaveLength(0);
    });
  });

  describe("a partial failure", () => {
    it("still downloads the ZIP, and the report lists the candidates that failed", async () => {
      const rows = [allowed(1, { name: "Sara Ahmed" }), allowed(2, { name: "Omar Ali" }), allowed(3, { name: "Lina Haddad", hasOriginal: false })];
      installFiles({ [(rows[1] as CvExportAllowedItem).originalUrl]: () => fakeResponse(502) });
      const onDone = jest.fn();
      const { result } = renderExport(rows, { onDone });
      await ready(result);
      act(() => result.current.setMode("original"));
      await runToEnd(result);

      expect(result.current.phase).toBe("done");
      expect(downloads).toHaveLength(1);
      expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ exported: 1, skipped: 2 }));

      const zip = await JSZip.loadAsync(await blobToBuffer(zipBlobs[0]));
      expect(Object.keys(zip.files)).toEqual(expect.arrayContaining(["Original/Sara Ahmed - Original CV.pdf", "export-report.csv"]));
      expect(Object.keys(zip.files).some((p) => p.includes("Omar Ali"))).toBe(false);
      const report = await zip.file("export-report.csv")!.async("string");
      expect(report).toContain("Omar Ali,,error");
      expect(report).toContain(en.cvExport.noteDownloadError);
      expect(report).toContain("Lina Haddad,,missing");
      expect(report).toContain("Sara Ahmed,,ok");
    });
  });

  describe("the details sheet", () => {
    const details = { header: ["Name"], rowsById: new Map([[seekerId(1), ["Name 1"]]]) };

    function stubBuild() {
      buildZipMock.mockResolvedValue({
        blob: new Blob(["zip"]),
        fileName: "x.zip",
        report: [],
        fileCount: 1,
        exportedCandidates: 1,
        skippedCandidates: 0,
      });
    }

    it("is passed to the ZIP when supplied and asked for", async () => {
      stubBuild();
      const { result } = renderExport([allowed(1)], { detailsRows: details });
      await ready(result);
      await runToEnd(result, true);
      expect(buildZipMock.mock.calls[0][0].details).toBe(details);
    });

    it("is left out when the person unticks it", async () => {
      stubBuild();
      const { result } = renderExport([allowed(1)], { detailsRows: details });
      await ready(result);
      await runToEnd(result, false);
      expect(buildZipMock.mock.calls[0][0].details).toBeUndefined();
    });

    it("is left out when the caller supplied none", async () => {
      stubBuild();
      const { result } = renderExport([allowed(1)]);
      await ready(result);
      await runToEnd(result, true);
      expect(buildZipMock.mock.calls[0][0].details).toBeUndefined();
    });
  });
});

describe("useCvExport: guards", () => {
  it("ignores a second start while a run is under way (a double click)", async () => {
    const rows = [allowed(1), allowed(2)];
    const onDone = jest.fn();
    const { result } = renderExport(rows, { onDone });
    await ready(result);
    act(() => {
      result.current.start();
      result.current.start();
    });
    await waitFor(() => expect(result.current.phase).toBe("done"));
    expect(fetchMock).toHaveBeenCalledTimes(2); // one file per candidate, not two runs of them
    expect(renderMock).toHaveBeenCalledTimes(2);
    expect(buildZipMock).toHaveBeenCalledTimes(1);
    expect(downloads).toHaveLength(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("does nothing after unmount: no more fetches, no ZIP, no download, no callback", async () => {
    const rendering = deferred<Blob>();
    renderMock.mockImplementation(() => rendering.promise);
    const onDone = jest.fn();
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const signals: AbortSignal[] = [];
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      signals.push(init?.signal as AbortSignal);
      return Promise.resolve(
        url.includes("kind=built") ? fakeResponse(200, { json: BUILT_JSON }) : fakeResponse(200, { type: "application/pdf" }),
      );
    });
    const { result, unmount } = renderExport([allowed(1)], { onDone });
    await ready(result);
    act(() => result.current.setMode("both"));
    act(() => result.current.start());
    await waitFor(() => expect(renderMock).toHaveBeenCalled()); // the standardised render is in flight

    unmount();
    expect(signals.every((s) => s.aborted)).toBe(true);
    await act(async () => {
      rendering.resolve(pdfBlob());
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(fetchMock).toHaveBeenCalledTimes(1); // the original was never fetched
    expect(buildZipMock).not.toHaveBeenCalled();
    expect(downloads).toHaveLength(0);
    expect(onDone).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  describe("when the selection changes", () => {
    it("cancels a run in progress, says so, and checks the new selection", async () => {
      const signals: AbortSignal[] = [];
      fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
        signals.push(init?.signal as AbortSignal);
        return abortable(init?.signal ?? undefined, new Promise(() => undefined));
      });
      const rowsA = [allowed(1), allowed(2)];
      const { result, rerender } = renderExport(rowsA);
      await ready(result);
      act(() => result.current.start());
      await waitFor(() => expect(signals.length).toBeGreaterThan(0));

      const rowsB = [allowed(1)];
      mockManifest(rowsB);
      rerender({ open: true, items: itemsFor(rowsB) });

      expect(signals.every((s) => s.aborted)).toBe(true);
      expect(result.current.selectionChanged).toBe(true);
      await ready(result);
      expect(result.current.counts?.total).toBe(1);
      expect(result.current.selectionChanged).toBe(true);
      expect(downloads).toHaveLength(0);
      expect(buildZipMock).not.toHaveBeenCalled();
    });

    it("says nothing when no run was in progress", async () => {
      const rowsA = [allowed(1), allowed(2)];
      const { result, rerender } = renderExport(rowsA);
      await ready(result);
      const rowsB = [allowed(1)];
      mockManifest(rowsB);
      rerender({ open: true, items: itemsFor(rowsB) });
      await ready(result);
      expect(result.current.counts?.total).toBe(1);
      expect(result.current.selectionChanged).toBe(false);
    });

    it("forgets the note once a new export starts", async () => {
      const gate = deferred<unknown>();
      installFiles({ [(allowed(1) as CvExportAllowedItem).builtUrl]: () => gate.promise });
      const { result, rerender } = renderExport([allowed(1), allowed(2)]);
      await ready(result);
      act(() => result.current.start());
      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      mockManifest([allowed(1)]);
      rerender({ open: true, items: itemsFor([allowed(1)]) });
      await ready(result);
      expect(result.current.selectionChanged).toBe(true);

      gate.resolve(fakeResponse(200, { json: BUILT_JSON }));
      await runToEnd(result);
      expect(result.current.selectionChanged).toBe(false);
    });
  });

  it("forgets that it was cancelled when the mode changes", async () => {
    const signals: AbortSignal[] = [];
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      signals.push(init?.signal as AbortSignal);
      return abortable(init?.signal ?? undefined, new Promise(() => undefined));
    });
    const { result } = renderExport([allowed(1)]);
    await ready(result);
    act(() => result.current.start());
    await waitFor(() => expect(signals.length).toBeGreaterThan(0));
    act(() => result.current.cancel());
    expect(result.current.cancelled).toBe(true);

    act(() => result.current.setMode("both"));
    expect(result.current.cancelled).toBe(false);
  });

  it("counts a candidate whose preparation threw unexpectedly as finished, and reports it as an error", async () => {
    const rows = [allowed(1), allowed(2)];
    const gate = deferred<unknown>();
    installFiles({ [(rows[1] as CvExportAllowedItem).originalUrl]: () => gate.promise });
    const { result } = renderExport(rows);
    await ready(result);
    act(() => result.current.setMode("original"));

    mockExtThrows.times = 1; // the first candidate's preparation throws outside the fetch helpers
    act(() => result.current.start());
    await waitFor(() => expect(result.current.progress).toMatchObject({ done: 1, total: 2 }));
    expect(result.current.phase).toBe("running");

    gate.resolve(fakeResponse(200, { type: "application/pdf" }));
    await waitFor(() => expect(result.current.phase).toBe("done"));
    const entries = buildZipMock.mock.calls[0][0].entries;
    expect(entries[0].original).toMatchObject({ status: "error", note: en.cvExport.noteDownloadError });
    expect(entries[1].original?.status).toBe("ok");
  });
});

describe("useCvExport: headings follow each CV's own language", () => {
  const arMessages = require("../../../messages/ar.json") as { cvBuilderPage: { previewSections: Record<string, string> } };
  const arabicBuilt = { hasContent: true, identity: { fullName: "سارة علي", email: "", phone: "" }, profile: { summary: "مطورة برمجيات" } };
  const englishBuilt = { hasContent: true, identity: { fullName: "Sara Ali", email: "", phone: "" }, profile: { summary: "Developer" } };

  it("draws an Arabic CV with Arabic headings and an English one with English headings, in one export, on an English screen", async () => {
    const rows = [allowed(1), allowed(2)];
    installFiles({
      [rows[0].builtUrl]: () => fakeResponse(200, { json: arabicBuilt }),
      [rows[1].builtUrl]: () => fakeResponse(200, { json: englishBuilt }),
    });
    const { result } = renderExport(rows);
    await ready(result);
    await runToEnd(result);

    expect(renderMock).toHaveBeenCalledTimes(2);
    const labelsByName = new Map(renderMock.mock.calls.map(([data, labels]) => [data.identity.fullName, labels]));
    expect(labelsByName.get("سارة علي")?.present).toBe(arMessages.cvBuilderPage.previewSections.present);
    expect(labelsByName.get("Sara Ali")?.present).toBe(en.cvBuilderPage.previewSections.present);
  });
});

/* ── the job an export is for, and recording it ──────── */

describe("useCvExport: the job and the export record", () => {
  function mockManifestBody(body: Record<string, unknown>) {
    csrfFetchMock.mockImplementation(async (url) =>
      asResponse(fakeResponse(200, { json: String(url).includes("/complete") ? { recorded: 1 } : body })),
    );
  }
  const completeCalls = () => csrfFetchMock.mock.calls.filter(([url]) => String(url).includes("/api/cv-export/complete"));

  it("sends the job with the manifest, and says which candidates the client already has", async () => {
    const rows = [
      allowed(1, { forJob: { exported: { count: 1, lastAt: "2026-11-18T00:00:00.000Z", lastBy: "Sam", lastVersions: ["original"] }, application: null } }),
      allowed(2, { forJob: { exported: null, application: { applicationId: "a", status: "shortlisted", updatedAt: "2026-11-20T00:00:00.000Z" } } }),
      allowed(3, { forJob: { exported: null, application: null } }),
    ];
    mockManifestBody({ items: rows, batchId: "b1" });
    const { result } = renderHook((props: UseCvExportOptions) => useCvExport(props), {
      initialProps: { open: true, items: itemsFor(rows), jobId: "job-1" } as UseCvExportOptions,
    });
    await ready(result);
    const sent = JSON.parse(String(csrfFetchMock.mock.calls[0][1]?.body));
    expect(sent.jobId).toBe("job-1");
    expect(result.current.jobOverlap.map((o) => [o.seekerId, !!o.exported, !!o.application])).toEqual([
      [seekerId(1), true, false],
      [seekerId(2), false, true],
    ]);
  });

  it("leaves out the skipped candidates and confirms only the ones whose files are in the ZIP", async () => {
    const rows = [allowed(1), allowed(2), allowed(3, { hasStandardised: false })];
    mockManifestBody({ items: rows, batchId: "batch-7" });
    const { result } = renderHook((props: UseCvExportOptions) => useCvExport(props), {
      initialProps: { open: true, items: itemsFor(rows) } as UseCvExportOptions,
    });
    await ready(result);
    act(() => result.current.start({ includeDetails: false, skipSeekerIds: new Set([seekerId(1)]) }));
    await waitFor(() => expect(result.current.phase).toBe("done"));
    await waitFor(() => expect(completeCalls()).toHaveLength(1));
    const body = JSON.parse(String(completeCalls()[0][1]?.body));
    // Candidate 1 was skipped; candidate 3 has no Standardised CV, so nothing of theirs is in a Standardised ZIP.
    expect(body).toEqual({ batchId: "batch-7", items: [{ seekerId: seekerId(2), versions: ["standardised"] }] });
  });

  it("confirms nothing when the manifest named no batch", async () => {
    const rows = [allowed(1)];
    mockManifestBody({ items: rows });
    const { result } = renderHook((props: UseCvExportOptions) => useCvExport(props), {
      initialProps: { open: true, items: itemsFor(rows) } as UseCvExportOptions,
    });
    await ready(result);
    act(() => result.current.start({ includeDetails: false }));
    await waitFor(() => expect(result.current.phase).toBe("done"));
    expect(completeCalls()).toHaveLength(0);
  });
});
