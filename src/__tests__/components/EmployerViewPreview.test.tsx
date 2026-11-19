/**
 * @jest-environment jsdom
 *
 * The CV builder's "Preview as employers see it": a job seeker opens the
 * standardised CV staff are shown (one fixed Mployedin template, default
 * formatting, every section), read-only, drawn from the profile as it is
 * saved. Arabic is in EmployerViewPreviewArabic.test.tsx.
 */
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { STAFF_CV_TEMPLATE } from "@/lib/jobSeeker/cvDesign";
import type { BuiltCvResponse } from "@/lib/cv/renderBuiltCv";

// The viewer carries the PDF renderer; the test only needs the props it is given.
const viewProps = jest.fn();
jest.mock("next/dynamic", () => () => function MployedinCvViewStub(props: Record<string, unknown>) {
  viewProps(props);
  return <div data-testid="mployedin-cv-view" />;
});

import { EmployerViewPreview, hasUploadedCvFile } from "@/app/[locale]/(dashboard)/job-seeker/cv/EmployerViewPreview";

const SEEKER_ID = "64b000000000000000000001";
const BUILT_URL = `/api/employers/candidates/${SEEKER_ID}/cv?kind=built`;

const built = (hasContent: boolean): BuiltCvResponse => ({
  hasContent,
  identity: { fullName: "Sara Ahmed", email: "sara@example.com", phone: "" },
  profile: hasContent ? { summary: "Developer", skills: ["React"] } : {},
});

function mockBuilt(body: BuiltCvResponse | "error") {
  global.fetch = jest.fn(async () =>
    body === "error"
      ? { ok: false, status: 500, json: async () => ({}) }
      : { ok: true, status: 200, json: async () => body },
  ) as unknown as typeof fetch;
}

const openPreview = () => fireEvent.click(screen.getByRole("button", { name: "Preview as employers see it" }));

beforeEach(() => viewProps.mockClear());

describe("EmployerViewPreview", () => {
  it("offers the preview as a button and fetches nothing until it is opened", () => {
    mockBuilt(built(true));
    render(<EmployerViewPreview seekerId={SEEKER_ID} hasUploadedFile={false} />);
    expect(screen.getByRole("button", { name: "Preview as employers see it" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("opens a dialog that says what it shows and draws the saved CV in the staff template, read-only", async () => {
    mockBuilt(built(true));
    render(<EmployerViewPreview seekerId={SEEKER_ID} hasUploadedFile={false} />);
    openPreview();

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("How employers see your CV")).toBeInTheDocument();
    expect(within(dialog).getByText("Every CV on Mployedin uses this clean layout so employers can compare fairly.")).toBeInTheDocument();

    // The same endpoint staff read, so the preview is what they get; not the unsaved form.
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(BUILT_URL);
    expect((global.fetch as jest.Mock).mock.calls[0][1]).toMatchObject({ credentials: "same-origin", cache: "no-store" });

    await within(dialog).findByTestId("mployedin-cv-view");
    expect(viewProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ templateOverride: STAFF_CV_TEMPLATE, showToolbar: false, data: built(true) }),
    );
    // Read-only: nothing in the dialog edits or downloads.
    expect(within(dialog).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /download|save/i })).not.toBeInTheDocument();
  });

  it("asks again every time it is opened, so a saved change shows", async () => {
    mockBuilt(built(true));
    render(<EmployerViewPreview seekerId={SEEKER_ID} hasUploadedFile={false} />);
    openPreview();
    await screen.findByTestId("mployedin-cv-view");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    openPreview();
    await screen.findByTestId("mployedin-cv-view");
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("tells a profile with nothing to build from what to add, and draws no CV", async () => {
    mockBuilt(built(false));
    render(<EmployerViewPreview seekerId={SEEKER_ID} hasUploadedFile={false} />);
    openPreview();
    expect(await screen.findByText("Add experience, education or skills to build your Mployedin CV.")).toBeInTheDocument();
    expect(screen.queryByTestId("mployedin-cv-view")).not.toBeInTheDocument();
  });

  it("gives the same note, without a request, when there is no profile yet", async () => {
    mockBuilt(built(true));
    render(<EmployerViewPreview seekerId={null} hasUploadedFile={false} />);
    openPreview();
    expect(await screen.findByText("Add experience, education or skills to build your Mployedin CV.")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("mentions the uploaded file only when there is one", async () => {
    mockBuilt(built(true));
    const { unmount } = render(<EmployerViewPreview seekerId={SEEKER_ID} hasUploadedFile />);
    openPreview();
    expect(await screen.findByText("Employers can also open the CV file you uploaded.")).toBeInTheDocument();
    unmount();

    render(<EmployerViewPreview seekerId={SEEKER_ID} hasUploadedFile={false} />);
    openPreview();
    await screen.findByTestId("mployedin-cv-view");
    expect(screen.queryByText("Employers can also open the CV file you uploaded.")).not.toBeInTheDocument();
  });

  it("keeps the uploaded-file line even when there is nothing to build from", async () => {
    mockBuilt(built(false));
    render(<EmployerViewPreview seekerId={SEEKER_ID} hasUploadedFile />);
    openPreview();
    expect(await screen.findByText("Add experience, education or skills to build your Mployedin CV.")).toBeInTheDocument();
    expect(screen.getByText("Employers can also open the CV file you uploaded.")).toBeInTheDocument();
  });

  it("warns that unsaved edits are not in the preview, only when there are some", async () => {
    mockBuilt(built(true));
    const { unmount } = render(<EmployerViewPreview seekerId={SEEKER_ID} hasUploadedFile={false} hasUnsavedChanges />);
    openPreview();
    expect(await screen.findByText("Shows your saved profile. Unsaved edits aren't included.")).toBeInTheDocument();
    unmount();

    render(<EmployerViewPreview seekerId={SEEKER_ID} hasUploadedFile={false} />);
    openPreview();
    await screen.findByTestId("mployedin-cv-view");
    expect(screen.queryByText(/Unsaved edits/)).not.toBeInTheDocument();
  });

  it("says it could not load, and Try again asks once more", async () => {
    mockBuilt("error");
    render(<EmployerViewPreview seekerId={SEEKER_ID} hasUploadedFile={false} />);
    openPreview();
    expect(await screen.findByText("We couldn't load your preview. Please try again.")).toBeInTheDocument();
    expect(screen.queryByTestId("mployedin-cv-view")).not.toBeInTheDocument();

    mockBuilt(built(true));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByTestId("mployedin-cv-view");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("is a full-screen sheet on a phone", async () => {
    mockBuilt(built(true));
    render(<EmployerViewPreview seekerId={SEEKER_ID} hasUploadedFile={false} />);
    openPreview();
    const dialog = await screen.findByRole("dialog");
    expect(dialog.className).toMatch(/\bh-dvh\b/);
    expect(dialog.className).toMatch(/\brounded-none\b/);
  });
});

describe("hasUploadedCvFile", () => {
  it("is true for a Profile CV file", () => {
    expect(hasUploadedCvFile({ cv: { originalUrl: "https://files/cv.pdf" } })).toBe(true);
  });
  it("is true for a resume the seeker uploaded", () => {
    expect(hasUploadedCvFile({ documents: [{ category: "resume", url: "https://files/a.pdf" }] })).toBe(true);
  });
  it("is false when the only resume is the copy of the CV built on Mployedin", () => {
    expect(hasUploadedCvFile({
      cv: { originalUrl: "https://files/built.pdf" },
      documents: [{ category: "resume", url: "https://files/built.pdf", builtHash: "abcdef0123456789" }],
    })).toBe(false);
    expect(hasUploadedCvFile({ documents: [{ category: "resume", url: "https://files/built.pdf", builtHash: "abcdef0123456789" }] })).toBe(false);
  });
  it("is false for other documents, an empty profile or none", () => {
    expect(hasUploadedCvFile({ documents: [{ category: "certificate", url: "https://files/c.pdf" }] })).toBe(false);
    expect(hasUploadedCvFile({})).toBe(false);
    expect(hasUploadedCvFile(null)).toBe(false);
    expect(hasUploadedCvFile(undefined)).toBe(false);
  });
});
