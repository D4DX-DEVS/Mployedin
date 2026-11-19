/**
 * @jest-environment jsdom
 *
 * The labels a standardised CV is drawn and downloaded with follow the CV's
 * language, whatever the screen's.
 */
import { renderHook, waitFor, act } from "@testing-library/react";
import en from "../../../messages/en.json";
import ar from "../../../messages/ar.json";
import type { CVPDFLabels } from "@/app/[locale]/(dashboard)/job-seeker/cv/pdf/shared";

let mockLocale = "en";
jest.mock("next-intl", () => ({
  ...jest.requireActual("../../__mocks__/next-intl"),
  useLocale: () => mockLocale,
}));

const UI_LABELS = { yourName: "ui", present: "ui present" } as unknown as CVPDFLabels;
jest.mock("@/app/[locale]/(dashboard)/job-seeker/cv/use-cv-pdf-labels", () => ({ useCvPdfLabels: () => UI_LABELS }));

const mockLoad = jest.fn();
jest.mock("@/lib/cv/cvPdfLabels", () => {
  const actual = jest.requireActual("@/lib/cv/cvPdfLabels");
  return { ...actual, loadCvPdfLabels: (...args: unknown[]) => mockLoad(...args) };
});

import { useCvPdfLabelsFor } from "@/components/shared/useCvPdfLabelsFor";
import { cvPdfLabelsFromMessages } from "@/lib/cv/cvPdfLabels";

const EN_LABELS = cvPdfLabelsFromMessages(en as never, "en");
const AR_LABELS = cvPdfLabelsFromMessages(ar as never, "ar");

beforeEach(() => {
  mockLocale = "en";
  mockLoad.mockReset();
  mockLoad.mockImplementation(async (lang: string) => (lang === "ar" ? AR_LABELS : EN_LABELS));
});

describe("useCvPdfLabelsFor", () => {
  it("English UI + English CV: the screen's labels, nothing loaded", async () => {
    const { result } = renderHook(() => useCvPdfLabelsFor("en"));
    expect(result.current.labels).toBe(UI_LABELS);
    await expect(result.current.resolve()).resolves.toBe(UI_LABELS);
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it("English UI + Arabic CV: Arabic labels once loaded (the screen's until then)", async () => {
    const { result } = renderHook(() => useCvPdfLabelsFor("ar"));
    expect(result.current.labels).toBe(UI_LABELS);
    await waitFor(() => expect(result.current.labels).toBe(AR_LABELS));
    expect(mockLoad).toHaveBeenCalledWith("ar");
  });

  it("Arabic UI + English CV: English labels", async () => {
    mockLocale = "ar";
    const { result } = renderHook(() => useCvPdfLabelsFor("en"));
    await waitFor(() => expect(result.current.labels).toBe(EN_LABELS));
    expect(result.current.labels.present).toBe("Present");
  });

  it("resolve() waits for the CV's language, so a download pressed early is still in it", async () => {
    const { result } = renderHook(() => useCvPdfLabelsFor("ar"));
    let labels: CVPDFLabels | undefined;
    await act(async () => { labels = await result.current.resolve(); });
    expect(labels).toBe(AR_LABELS);
  });

  it("falls back to the screen's labels when the CV's language cannot be loaded", async () => {
    mockLoad.mockRejectedValue(new Error("chunk failed"));
    const { result } = renderHook(() => useCvPdfLabelsFor("ar"));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.labels).toBe(UI_LABELS);
    await expect(result.current.resolve()).resolves.toBe(UI_LABELS);
  });

  it("is not ready while the CV's language loads, then is", async () => {
    const { result } = renderHook(() => useCvPdfLabelsFor("ar"));
    expect(result.current.ready).toBe(false);
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.labels).toBe(AR_LABELS);
  });

  it("is ready at once when the CV is in the screen's language or there is no CV yet", () => {
    expect(renderHook(() => useCvPdfLabelsFor("en")).result.current.ready).toBe(true);
    expect(renderHook(() => useCvPdfLabelsFor(null)).result.current.ready).toBe(true);
  });

  it("is ready, with the screen's labels, as soon as the load fails", async () => {
    mockLoad.mockRejectedValue(new Error("chunk failed"));
    const { result } = renderHook(() => useCvPdfLabelsFor("ar"));
    expect(result.current.ready).toBe(false);
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.labels).toBe(UI_LABELS);
  });

  it("no CV yet (null): the screen's labels, nothing loaded", () => {
    const { result } = renderHook(() => useCvPdfLabelsFor(null));
    expect(result.current.labels).toBe(UI_LABELS);
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it("follows the CV when it changes to one in another language", async () => {
    const { result, rerender } = renderHook(({ lang }: { lang: "en" | "ar" }) => useCvPdfLabelsFor(lang), { initialProps: { lang: "ar" as "en" | "ar" } });
    await waitFor(() => expect(result.current.labels).toBe(AR_LABELS));
    rerender({ lang: "en" });
    expect(result.current.labels).toBe(UI_LABELS);
  });
});
