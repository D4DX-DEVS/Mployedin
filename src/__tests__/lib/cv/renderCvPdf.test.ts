/**
 * The one CV render function (src/lib/cv/renderCvPdf.ts): PDFs are drawn one at a
 * time, a render that never finishes cannot block the queue, and the CV fonts
 * are parsed afresh only when Arabic is (or just was) involved.
 *
 * react-pdf is mocked; the module is loaded fresh for every test because the
 * queue and the "last document had Arabic" flag live in module state.
 */
import { EMPTY_CV_FORM } from "@/app/[locale]/(dashboard)/job-seeker/cv/built-cv";
import { DEFAULT_FORMATTING } from "@/app/[locale]/(dashboard)/job-seeker/cv/types";
import type { CVPDFLabels } from "@/app/[locale]/(dashboard)/job-seeker/cv/pdf/shared";

const mockPdf = jest.fn();
const mockRefreshFonts = jest.fn();

jest.mock("@react-pdf/renderer", () => ({ __esModule: true, pdf: (element: unknown) => mockPdf(element) }));
jest.mock("@/app/[locale]/(dashboard)/job-seeker/cv/pdf/shared", () => ({
  __esModule: true,
  refreshCvPdfFonts: () => mockRefreshFonts(),
}));
jest.mock("@/app/[locale]/(dashboard)/job-seeker/cv/cv-pdf-document", () => ({
  __esModule: true,
  CVPDFDocument: function MockCvPdfDocument() { return null; },
}));

type RenderModule = typeof import("@/lib/cv/renderCvPdf");

function freshModule(): RenderModule {
  let loaded: RenderModule | undefined;
  jest.isolateModules(() => {
    loaded = jest.requireActual<RenderModule>("@/lib/cv/renderCvPdf");
  });
  return loaded as RenderModule;
}

const LABELS: CVPDFLabels = {
  yourName: "Your name", present: "Present", experience: "Experience", education: "Education", grade: "Grade",
  skills: "Skills", projects: "Projects", languages: "Languages", certifications: "Certifications",
  professionalExperience: "Professional Experience", keyProjects: "Key Projects", coreCompetencies: "Core Competencies",
  decoratedExperience: "Experience", decoratedEducation: "Education", decoratedSkills: "Skills", decoratedProjects: "Projects",
  atCompany: "at {company}",
  proficiency: { basic: "Basic", conversational: "Conversational", professional: "Professional", native: "Native" },
};

const english = () => ({ data: { ...EMPTY_CV_FORM, fullName: "Sarah Ahmed" }, templateId: "classic", formatting: DEFAULT_FORMATTING, labels: LABELS });
const arabic = () => ({ ...english(), data: { ...EMPTY_CV_FORM, fullName: "سارة أحمد" } });
const englishWithArabicLabels = () => ({ ...english(), labels: { ...LABELS, experience: "الخبرات" } });

const blobOf = () => new Blob(["%PDF-"], { type: "application/pdf" });
const finishes = () => ({ toBlob: () => Promise.resolve(blobOf()) });

beforeEach(() => {
  mockPdf.mockReset();
  mockRefreshFonts.mockReset();
  mockPdf.mockImplementation(finishes);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("font refresh: only when Arabic is (or just was) involved", () => {
  it("does not refresh for English CVs, however many in a row", async () => {
    const { renderCvPdfBlob } = freshModule();
    await renderCvPdfBlob(english());
    await renderCvPdfBlob(english());
    await renderCvPdfBlob(english());
    expect(mockPdf).toHaveBeenCalledTimes(3);
    expect(mockRefreshFonts).not.toHaveBeenCalled();
  });

  it("refreshes before an Arabic CV, and before it is drawn, never after", async () => {
    const calls: string[] = [];
    mockRefreshFonts.mockImplementation(() => calls.push("refresh"));
    mockPdf.mockImplementation(() => { calls.push("pdf"); return finishes(); });
    const { renderCvPdfBlob } = freshModule();
    await renderCvPdfBlob(arabic());
    expect(calls).toEqual(["refresh", "pdf"]);
  });

  it("refreshes for English after Arabic (the Arabic one left the fonts' glyph cache stamped), then stops", async () => {
    const { renderCvPdfBlob } = freshModule();
    await renderCvPdfBlob(english());
    expect(mockRefreshFonts).toHaveBeenCalledTimes(0);
    await renderCvPdfBlob(arabic());
    expect(mockRefreshFonts).toHaveBeenCalledTimes(1);
    await renderCvPdfBlob(english());
    expect(mockRefreshFonts).toHaveBeenCalledTimes(2);
    await renderCvPdfBlob(english());
    await renderCvPdfBlob(english());
    expect(mockRefreshFonts).toHaveBeenCalledTimes(2);
  });

  it("refreshes before every Arabic CV in a row", async () => {
    const { renderCvPdfBlob } = freshModule();
    await renderCvPdfBlob(arabic());
    await renderCvPdfBlob(arabic());
    await renderCvPdfBlob(arabic());
    expect(mockRefreshFonts).toHaveBeenCalledTimes(3);
  });

  it("treats Arabic section labels on an English CV as Arabic", async () => {
    const { renderCvPdfBlob } = freshModule();
    await renderCvPdfBlob(englishWithArabicLabels());
    expect(mockRefreshFonts).toHaveBeenCalledTimes(1);
  });

  it("still counts a render that failed as having had Arabic", async () => {
    const { renderCvPdfBlob } = freshModule();
    mockPdf.mockImplementationOnce(() => ({ toBlob: () => Promise.reject(new Error("render failed")) }));
    await expect(renderCvPdfBlob(arabic())).rejects.toThrow("render failed");
    await renderCvPdfBlob(english());
    expect(mockRefreshFonts).toHaveBeenCalledTimes(2);
  });
});

describe("queue: one PDF at a time", () => {
  it("draws overlapping requests one after the other, in the order asked", async () => {
    const { renderCvPdfBlob } = freshModule();
    const events: string[] = [];
    const releases: Array<() => void> = [];
    let n = 0;
    mockPdf.mockImplementation(() => {
      const id = ++n;
      events.push(`start ${id}`);
      return {
        toBlob: () => new Promise<Blob>((resolve) => {
          releases.push(() => { events.push(`end ${id}`); resolve(blobOf()); });
        }),
      };
    });

    const first = renderCvPdfBlob(english());
    const second = renderCvPdfBlob(english());
    const third = renderCvPdfBlob(english());
    await new Promise((r) => setTimeout(r, 20));
    expect(events).toEqual(["start 1"]);

    releases[0]();
    await first;
    await new Promise((r) => setTimeout(r, 20));
    expect(events).toEqual(["start 1", "end 1", "start 2"]);

    releases[1]();
    await second;
    await new Promise((r) => setTimeout(r, 20));
    releases[2]();
    await third;
    expect(events).toEqual(["start 1", "end 1", "start 2", "end 2", "start 3", "end 3"]);
  });

  it("a PDF that fails does not fail the ones queued behind it", async () => {
    const { renderCvPdfBlob } = freshModule();
    let n = 0;
    mockPdf.mockImplementation(() => {
      n += 1;
      return { toBlob: () => (n === 1 ? Promise.reject(new Error("render failed")) : Promise.resolve(blobOf())) };
    });
    const failing = renderCvPdfBlob(english());
    const after = renderCvPdfBlob(english());
    await expect(failing).rejects.toThrow("render failed");
    await expect(after).resolves.toBeInstanceOf(Blob);
    await expect(renderCvPdfBlob(english())).resolves.toBeInstanceOf(Blob);
  });
});

describe("a render that never finishes", () => {
  const hangs = () => ({ toBlob: () => new Promise<Blob>(() => undefined) });

  it("rejects with CvRenderTimeoutError after the timeout, so the queue moves on", async () => {
    jest.useFakeTimers();
    const { renderCvPdfBlob, CvRenderTimeoutError, CV_RENDER_TIMEOUT_MS } = freshModule();
    mockPdf.mockImplementationOnce(hangs);

    const stuck = renderCvPdfBlob(english());
    const next = renderCvPdfBlob(english());
    const stuckOutcome = expect(stuck).rejects.toBeInstanceOf(CvRenderTimeoutError);

    await jest.advanceTimersByTimeAsync(CV_RENDER_TIMEOUT_MS - 1);
    expect(mockPdf).toHaveBeenCalledTimes(1);   // still waiting on the first, the second has not started

    await jest.advanceTimersByTimeAsync(1);
    await stuckOutcome;
    await expect(next).resolves.toBeInstanceOf(Blob);
    expect(mockPdf).toHaveBeenCalledTimes(2);
  });

  it("is a typed error that says how long it waited", async () => {
    jest.useFakeTimers();
    const { renderCvPdfBlob, CvRenderTimeoutError, CV_RENDER_TIMEOUT_MS } = freshModule();
    mockPdf.mockImplementationOnce(hangs);

    const stuck = renderCvPdfBlob(english());
    const caught = stuck.catch((e: unknown) => e);
    await jest.advanceTimersByTimeAsync(CV_RENDER_TIMEOUT_MS);
    const error = await caught;

    expect(error).toBeInstanceOf(CvRenderTimeoutError);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBe("CvRenderTimeoutError");
    expect((error as InstanceType<typeof CvRenderTimeoutError>).timeoutMs).toBe(CV_RENDER_TIMEOUT_MS);
    expect((error as Error).message).toContain(String(CV_RENDER_TIMEOUT_MS / 1000));
  });

  it("is 45 seconds", () => {
    expect(freshModule().CV_RENDER_TIMEOUT_MS).toBe(45_000);
  });

  it("times each PDF from when it starts drawing, not from when it was queued", async () => {
    jest.useFakeTimers();
    const { renderCvPdfBlob, CV_RENDER_TIMEOUT_MS } = freshModule();
    const slow = (ms: number) => ({ toBlob: () => new Promise<Blob>((resolve) => { setTimeout(() => resolve(blobOf()), ms); }) });
    mockPdf.mockImplementationOnce(() => slow(CV_RENDER_TIMEOUT_MS - 5_000));
    mockPdf.mockImplementationOnce(() => slow(CV_RENDER_TIMEOUT_MS - 5_000));

    const first = renderCvPdfBlob(english());
    const second = renderCvPdfBlob(english());   // waits ~40 s in the queue, then takes ~40 s itself
    await jest.advanceTimersByTimeAsync((CV_RENDER_TIMEOUT_MS - 5_000) * 2 + 10);
    await expect(first).resolves.toBeInstanceOf(Blob);
    await expect(second).resolves.toBeInstanceOf(Blob);
  });

  it("ignores the stuck render if it finally finishes after the timeout", async () => {
    jest.useFakeTimers();
    const { renderCvPdfBlob, CvRenderTimeoutError, CV_RENDER_TIMEOUT_MS } = freshModule();
    let finishLate: (blob: Blob) => void = () => undefined;
    mockPdf.mockImplementationOnce(() => ({ toBlob: () => new Promise<Blob>((resolve) => { finishLate = resolve; }) }));

    const stuck = renderCvPdfBlob(english());
    const outcome = expect(stuck).rejects.toBeInstanceOf(CvRenderTimeoutError);
    await jest.advanceTimersByTimeAsync(CV_RENDER_TIMEOUT_MS);
    await outcome;

    finishLate(blobOf());
    await jest.advanceTimersByTimeAsync(10);
    await expect(renderCvPdfBlob(english())).resolves.toBeInstanceOf(Blob);
  });
});
