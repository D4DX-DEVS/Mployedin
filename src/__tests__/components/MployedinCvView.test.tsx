/**
 * @jest-environment jsdom
 *
 * MployedinCvView's Download renders the standardised PDF in the browser. When
 * that render fails (an error, or the render timeout) the person must be told
 * inline, the button must come back, and nothing may be saved.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { BuiltCvResponse } from "@/lib/cv/renderBuiltCv";

const renderBuiltCvPdf = jest.fn();
jest.mock("@/lib/cv/renderBuiltCv", () => ({
  builtCvRenderInput: () => ({ data: {}, templateId: "classic", formatting: {} }),
  renderBuiltCvPdf: (...args: unknown[]) => renderBuiltCvPdf(...args),
}));
const saveBlob = jest.fn();
jest.mock("@/lib/download/saveBlob", () => ({ saveBlob: (...args: unknown[]) => saveBlob(...args) }));
// The screen is in English (the global next-intl mock); its labels are a marker object so a switch to the CV's language shows.
const UI_LABELS = { present: "UI labels" };
jest.mock("@/app/[locale]/(dashboard)/job-seeker/cv/use-cv-pdf-labels", () => ({ useCvPdfLabels: () => UI_LABELS }));
const pagesProps = jest.fn();
jest.mock("@/app/[locale]/(dashboard)/job-seeker/cv/pdf-pages-preview", () => ({
  PdfPagesPreview: (props: unknown) => { pagesProps(props); return <div data-testid="pages" />; },
}));
jest.mock("@/app/[locale]/(dashboard)/job-seeker/cv/paged-preview", () => ({ PagedPreview: () => null }));
jest.mock("@/app/[locale]/(dashboard)/job-seeker/cv/templates", () => ({ TemplateRenderer: () => null }));

const mockLoadFails = { on: false };
jest.mock("@/lib/cv/cvPdfLabels", () => {
  const actual = jest.requireActual("@/lib/cv/cvPdfLabels");
  return { ...actual, loadCvPdfLabels: (lang: string) => (mockLoadFails.on ? Promise.reject(new Error("offline")) : actual.loadCvPdfLabels(lang)) };
});

import MployedinCvView from "@/components/shared/MployedinCvView";
import ar from "../../../messages/ar.json";

const data: BuiltCvResponse = {
  hasContent: true,
  identity: { fullName: "Sara Ali", email: "sara@example.com", phone: "" },
  profile: { summary: "Developer" },
};

const download = () => screen.getByRole("button", { name: /download/i });

const arabicData: BuiltCvResponse = {
  hasContent: true,
  identity: { fullName: "سارة علي", email: "sara@example.com", phone: "" },
  profile: { summary: "مطورة برمجيات" },
};

beforeEach(() => {
  pagesProps.mockClear();
  mockLoadFails.on = false;
  renderBuiltCvPdf.mockReset();
  saveBlob.mockReset();
});

describe("MployedinCvView download", () => {
  it("saves the rendered PDF", async () => {
    const blob = new Blob(["pdf"]);
    renderBuiltCvPdf.mockResolvedValue(blob);
    render(<MployedinCvView url="/x" data={data} fileName="Sara.pdf" />);
    fireEvent.click(download());
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(blob, "Sara.pdf"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says so inline when the PDF could not be made (a render timeout included), saves nothing, and lets them retry", async () => {
    renderBuiltCvPdf.mockRejectedValueOnce(Object.assign(new Error("timed out"), { name: "CvRenderTimeoutError" }));
    render(<MployedinCvView url="/x" data={data} />);
    fireEvent.click(download());

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't create the PDF. Please try again.");
    expect(saveBlob).not.toHaveBeenCalled();
    await waitFor(() => expect(download()).toBeEnabled());

    renderBuiltCvPdf.mockResolvedValueOnce(new Blob(["pdf"]));
    fireEvent.click(download());
    await waitFor(() => expect(saveBlob).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("clears an old error when the details change to another candidate", async () => {
    renderBuiltCvPdf.mockRejectedValueOnce(new Error("boom"));
    const { rerender } = render(<MployedinCvView url="/x" data={data} />);
    fireEvent.click(download());
    await screen.findByRole("alert");
    rerender(<MployedinCvView url="/y" data={{ ...data, identity: { ...data.identity, fullName: "Omar" } }} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("MployedinCvView labels follow the CV's language, not the screen's", () => {
  it("English screen + English CV: the screen's labels, in the preview and the download", async () => {
    renderBuiltCvPdf.mockResolvedValue(new Blob(["pdf"]));
    render(<MployedinCvView url="/x" data={data} />);
    expect(pagesProps.mock.calls.at(-1)?.[0].labels).toBe(UI_LABELS);
    fireEvent.click(download());
    await waitFor(() => expect(saveBlob).toHaveBeenCalled());
    expect(renderBuiltCvPdf.mock.calls[0][1]).toBe(UI_LABELS);
  });

  it("English screen + Arabic CV: the preview switches to Arabic headings", async () => {
    render(<MployedinCvView url="/x" data={arabicData} />);
    await waitFor(() => expect(pagesProps.mock.calls.at(-1)?.[0].labels.present).toBe(ar.cvBuilderPage.previewSections.present));
  });

  it("English screen + Arabic CV: the download is drawn with Arabic headings", async () => {
    renderBuiltCvPdf.mockResolvedValue(new Blob(["pdf"]));
    render(<MployedinCvView url="/x" data={arabicData} />);
    fireEvent.click(await screen.findByRole("button", { name: /download/i }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalled());
    const labels = renderBuiltCvPdf.mock.calls[0][1];
    expect(labels.present).toBe(ar.cvBuilderPage.previewSections.present);
    expect(labels.proficiency.native).toBe(ar.cvBuilderPage.proficiency.native);
  });

  it("keeps the loading state until the CV's language is in, so no heading ever shows in the screen's language", async () => {
    render(<MployedinCvView url="/x" data={arabicData} />);
    expect(screen.queryByTestId("pages")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
    await screen.findByTestId("pages");
    for (const [props] of pagesProps.mock.calls) expect(props.labels.present).toBe(ar.cvBuilderPage.previewSections.present);
  });

  it("shows the preview with the screen's labels at once when the CV's language cannot be loaded", async () => {
    mockLoadFails.on = true;
    render(<MployedinCvView url="/x" data={arabicData} />);
    await screen.findByTestId("pages");
    expect(pagesProps.mock.calls.at(-1)?.[0].labels).toBe(UI_LABELS);
  });
});
