/**
 * @jest-environment jsdom
 *
 * useOriginalCv reads what the CV route says about the file it served: whether
 * it is there, and (X-Mployedin-Cv-Built) whether it is the Mployedin-built PDF
 * sent with the application, so the viewer can call it "CV sent with application"
 * without the caller having to know.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { useOriginalCv } from "@/components/shared/useOriginalCv";

const URL_A = "/api/employers/candidates/64b000000000000000000001/cv?applicationId=64b0000000000000000000aa#cv.pdf";
const URL_B = "/api/employers/candidates/64b000000000000000000002/cv#cv.pdf";

function okResponse(headers: Record<string, string> = {}) {
  return {
    ok: true,
    status: 200,
    headers: new Headers(headers),
    body: { cancel: jest.fn() },
    blob: jest.fn(async () => new Blob(["%PDF"], { type: "application/pdf" })),
  };
}

function setPdfViewer(enabled: boolean) {
  Object.defineProperty(navigator, "pdfViewerEnabled", { value: enabled, configurable: true });
}

beforeEach(() => {
  global.URL.createObjectURL = jest.fn(() => "blob:cv");
  global.URL.revokeObjectURL = jest.fn();
});
afterEach(() => {
  delete (navigator as unknown as Record<string, unknown>).pdfViewerEnabled;
});

describe("useOriginalCv: sentWithApplication (X-Mployedin-Cv-Built)", () => {
  it("is false until the route has answered", async () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    const { result } = renderHook(() => useOriginalCv(URL_A, true));
    expect(result.current.sentWithApplication).toBe(false);
    expect(result.current.availability).toBe("unknown");
  });

  it("is true when the route marks the served file as the built CV sent with the application", async () => {
    global.fetch = jest.fn(async () => okResponse({ "X-Mployedin-Cv-Built": "1" })) as unknown as typeof fetch;
    const { result } = renderHook(() => useOriginalCv(URL_A, true));
    await waitFor(() => expect(result.current.availability).toBe("available"));
    expect(result.current.sentWithApplication).toBe(true);
  });

  it("is false for an uploaded file (no header)", async () => {
    global.fetch = jest.fn(async () => okResponse()) as unknown as typeof fetch;
    const { result } = renderHook(() => useOriginalCv(URL_A, true));
    await waitFor(() => expect(result.current.availability).toBe("available"));
    expect(result.current.sentWithApplication).toBe(false);
  });

  it("only a header of 1 counts", async () => {
    global.fetch = jest.fn(async () => okResponse({ "X-Mployedin-Cv-Built": "0" })) as unknown as typeof fetch;
    const { result } = renderHook(() => useOriginalCv(URL_A, true));
    await waitFor(() => expect(result.current.availability).toBe("available"));
    expect(result.current.sentWithApplication).toBe(false);
  });

  it("is read on a browser with no PDF viewer too, where the body is dropped", async () => {
    setPdfViewer(false);
    const res = okResponse({ "X-Mployedin-Cv-Built": "1" });
    global.fetch = jest.fn(async () => res) as unknown as typeof fetch;
    const { result } = renderHook(() => useOriginalCv(URL_A, true));
    await waitFor(() => expect(result.current.availability).toBe("available"));
    expect(result.current.sentWithApplication).toBe(true);
    expect(res.body.cancel).toHaveBeenCalled();
  });

  it("tolerates a response with no headers object", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      body: { cancel: jest.fn() },
      blob: async () => new Blob(["%PDF"], { type: "application/pdf" }),
    })) as unknown as typeof fetch;
    const { result } = renderHook(() => useOriginalCv(URL_A, true));
    await waitFor(() => expect(result.current.availability).toBe("available"));
    expect(result.current.sentWithApplication).toBe(false);
  });

  it("is false for a file that is missing", async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 404,
      headers: new Headers({ "X-Mployedin-Cv-Built": "1" }),
      json: async () => ({ code: "NO_CV" }),
    })) as unknown as typeof fetch;
    const { result } = renderHook(() => useOriginalCv(URL_A, true));
    await waitFor(() => expect(result.current.availability).toBe("missing"));
    expect(result.current.sentWithApplication).toBe(false);
  });

  it("does not carry over to the next candidate's file", async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) =>
      okResponse(String(input).includes("0001") || String(input).includes("000000000001") ? { "X-Mployedin-Cv-Built": "1" } : {}),
    ) as unknown as typeof fetch;
    const { result, rerender } = renderHook(({ url }) => useOriginalCv(url, true), { initialProps: { url: URL_A } });
    await waitFor(() => expect(result.current.sentWithApplication).toBe(true));

    rerender({ url: URL_B });
    // At once: nothing known about the new file yet, not the previous file's answer.
    expect(result.current.sentWithApplication).toBe(false);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    await waitFor(() => expect(result.current.availability).toBe("available"));
    expect(result.current.sentWithApplication).toBe(false);
  });
});
