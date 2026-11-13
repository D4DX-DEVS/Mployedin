/**
 * A seeker who built a CV on Mployedin can send it: the apply dialog lists it
 * beside the uploaded files, and the application carries the stored copy.
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { name: "Antony Varghese", email: "antony@example.com", image: "" } }, status: "authenticated" }),
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

const csrfFetch = jest.fn();
jest.mock("@/lib/security/csrf-client", () => ({ csrfFetch: (...a: unknown[]) => csrfFetch(...a) }));

const ensureBuiltCvDocument = jest.fn();
jest.mock("@/app/[locale]/(dashboard)/job-seeker/cv/built-cv", () => {
  const actual = jest.requireActual("@/app/[locale]/(dashboard)/job-seeker/cv/built-cv");
  return { ...actual, ensureBuiltCvDocument: (...a: unknown[]) => ensureBuiltCvDocument(...a) };
});

import { EasyApplyFlowDialog } from "@/components/features/job-seeker/feed/EasyApplyFlowDialog";
import { BuiltCvError } from "@/app/[locale]/(dashboard)/job-seeker/cv/built-cv";

type Me = { documents: unknown[]; cvUrl: string | null; hasBuiltCv: boolean };
let me: Me;

const json = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

beforeEach(() => {
  jest.clearAllMocks();
  me = { documents: [], cvUrl: null, hasBuiltCv: true };
  (global as unknown as { fetch: jest.Mock }).fetch = jest.fn((url: string) => {
    if (url.startsWith("/api/job-seeker/me")) return json({ jobSeeker: me });
    if (url.startsWith("/api/jobs/")) return json({ job: { screeningQuestions: [] } });
    return json(null, 404);
  });
  csrfFetch.mockImplementation(() => json({ application: { _id: "app1" } }, 201));
  ensureBuiltCvDocument.mockResolvedValue({
    id: "built-1", name: "Antony Varghese - Mployedin CV.pdf", category: "resume", url: "https://cdn/documents/built.pdf", builtHash: "aaaaaaaaaaaaaa",
  });
});

function open() {
  const onApplied = jest.fn();
  render(
    <EasyApplyFlowDialog jobId="job1" jobTitle="Site Engineer" companyName="Arabtec" open onOpenChange={() => {}} onApplied={onApplied} />,
  );
  return { onApplied };
}

const applicationBody = () => {
  const call = csrfFetch.mock.calls.find(([url]) => url === "/api/applications");
  return call ? JSON.parse(call[1].body) : null;
};

describe("EasyApplyFlowDialog — CV built on Mployedin", () => {
  it("offers the built CV and sends it when it is the only CV", async () => {
    const { onApplied } = open();
    const option = await screen.findByRole("button", { name: /CV built on Mployedin/ });
    expect(option).toBeInTheDocument();
    // The only CV there is, so it is already the one selected.
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(await screen.findByRole("button", { name: /Submit application/ }));

    await waitFor(() => expect(onApplied).toHaveBeenCalledWith("job1"));
    expect(ensureBuiltCvDocument).toHaveBeenCalledTimes(1);
    expect(ensureBuiltCvDocument.mock.calls[0][0].identity).toMatchObject({ fullName: "Antony Varghese", email: "antony@example.com" });
    expect(applicationBody()).toMatchObject({ jobId: "job1", documentIds: ["built-1"] });
    expect(applicationBody().includeProfileCv).toBeUndefined();
  });

  it("keeps an uploaded CV as the default and lists the built CV once, not its stored file too", async () => {
    me.documents = [
      { id: "d1", name: "Resume.pdf", category: "resume", url: "https://cdn/documents/resume.pdf" },
      { id: "b0", name: "Antony Varghese - Mployedin CV.pdf", category: "resume", url: "https://cdn/documents/built-old.pdf", builtHash: "0000000000" },
    ];
    open();
    await screen.findByRole("button", { name: /CV built on Mployedin/ });
    expect(screen.getByRole("button", { name: /Resume\.pdf/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Mployedin CV\.pdf/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(await screen.findByRole("button", { name: /Submit application/ }));
    await waitFor(() => expect(applicationBody()).toMatchObject({ documentIds: ["d1"] }));
    expect(ensureBuiltCvDocument).not.toHaveBeenCalled();
  });

  it("preselects the Profile CV when there is one — the same default as the public job page", async () => {
    me.cvUrl = "https://cdn/cvs/profile.pdf";
    me.documents = [{ id: "d1", name: "Resume.pdf", category: "resume", url: "https://cdn/documents/resume.pdf" }];
    open();
    const profile = await screen.findByRole("button", { name: /Profile CV/ });
    expect(profile).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Resume\.pdf/ })).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(await screen.findByRole("button", { name: /Submit application/ }));
    await waitFor(() => expect(applicationBody()).toMatchObject({ includeProfileCv: true }));
    expect(applicationBody().documentIds).toBeUndefined();
  });

  it("says a CV that has gone must be chosen again, in the dialog's own words", async () => {
    me.documents = [{ id: "d1", name: "Resume.pdf", category: "resume", url: "https://cdn/documents/resume.pdf" }];
    csrfFetch.mockImplementation(() => json({ error: "That file is no longer in your documents.", code: "DOCUMENT_NOT_FOUND" }, 400));
    const { onApplied } = open();
    await screen.findByRole("button", { name: /Resume\.pdf/ });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(await screen.findByRole("button", { name: /Submit application/ }));

    // Deleted in another tab meanwhile: gone from the server's list.
    me.documents = [];

    expect(await screen.findByText(/no longer in your documents\. Choose your CV again/)).toBeInTheDocument();
    expect(onApplied).not.toHaveBeenCalled();
    // Back on the CV step with the list as it is now — submitting the stale
    // choice again would only be refused again.
    await waitFor(() => expect(screen.queryByRole("button", { name: /Resume\.pdf/ })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /CV built on Mployedin/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("offers the formats the server takes and turns away a legacy .doc before uploading it", async () => {
    open();
    await screen.findByRole("button", { name: /CV built on Mployedin/ });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.accept).toBe(".pdf,.docx,.jpg,.jpeg,.png,.webp");

    fireEvent.change(input, { target: { files: [new File(["x"], "old-cv.doc", { type: "application/msword" })] } });
    expect(await screen.findByText(/file type isn't supported/)).toBeInTheDocument();
    expect(csrfFetch).not.toHaveBeenCalled();
  });

  it("does not offer it to a seeker who never built one", async () => {
    me.hasBuiltCv = false;
    me.cvUrl = "https://cdn/cvs/profile.pdf";
    open();
    await screen.findByRole("button", { name: /Profile CV/ });
    expect(screen.queryByRole("button", { name: /CV built on Mployedin/ })).not.toBeInTheDocument();
  });

  it("does not apply when the built CV cannot be prepared, and says why", async () => {
    ensureBuiltCvDocument.mockRejectedValue(new BuiltCvError("You've reached today's limit for reading CVs. Please try again tomorrow."));
    const { onApplied } = open();
    await screen.findByRole("button", { name: /CV built on Mployedin/ });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(await screen.findByRole("button", { name: /Submit application/ }));

    expect(await screen.findByText(/reached today's limit for reading CVs/)).toBeInTheDocument();
    expect(applicationBody()).toBeNull();
    expect(onApplied).not.toHaveBeenCalled();
  });
});

describe("EasyApplyFlowDialog — a seeker with no CV", () => {
  it("applies with the Mployedin CV made from their details, so no application goes without a CV", async () => {
    me.hasBuiltCv = false;
    const { onApplied } = open();
    expect(await screen.findByRole("button", { name: /Your Mployedin CV/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Preview or edit it/ })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("button", { name: /Upload your own CV instead/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(await screen.findByRole("button", { name: /Submit application/ }));

    await waitFor(() => expect(onApplied).toHaveBeenCalledWith("job1"));
    expect(ensureBuiltCvDocument).toHaveBeenCalledTimes(1);
    expect(applicationBody()).toMatchObject({ documentIds: ["built-1"] });
  });
});
