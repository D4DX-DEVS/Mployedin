/**
 * The public job page's apply form, for a signed-in seeker: it offers the CV
 * built on Mployedin (it listed only uploaded files), preselects the same CV
 * as the dashboard dialog, and takes the same file formats as the server.
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

jest.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { name: "Antony Varghese", email: "antony@example.com", role: "job_seeker", image: "" } },
    status: "authenticated",
    update: jest.fn(),
  }),
  signIn: jest.fn(),
  getSession: jest.fn(),
}));
jest.mock("@/lib/firebase/googleSignIn", () => ({ getGoogleIdToken: jest.fn(), preloadGoogleSignIn: jest.fn() }));
jest.mock("@/lib/browser/navigateWithPageLoad", () => ({ navigateWithPageLoad: jest.fn() }));
jest.mock("@/lib/security/csrf-client", () => ({ csrfFetch: jest.fn() }));

const ensureBuiltCvDocument = jest.fn();
jest.mock("@/app/[locale]/(dashboard)/job-seeker/cv/built-cv", () => {
  const actual = jest.requireActual("@/app/[locale]/(dashboard)/job-seeker/cv/built-cv");
  return { ...actual, ensureBuiltCvDocument: (...a: unknown[]) => ensureBuiltCvDocument(...a) };
});

import EasyApply from "@/components/features/public/EasyApply";

type Me = { name: string; documents: unknown[]; cvUrl: string | null; hasBuiltCv: boolean; skills: string[]; socialLinks: unknown[] };
let me: Me;
let applyRequests: Array<Record<string, unknown>>;
let uploads: number;

const json = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

// The "application submitted" card scrolls itself into view; jsdom has no layout.
beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
});

beforeEach(() => {
  jest.clearAllMocks();
  me = { name: "Antony Varghese", documents: [], cvUrl: null, hasBuiltCv: true, skills: [], socialLinks: [] };
  applyRequests = [];
  uploads = 0;
  (global as unknown as { fetch: jest.Mock }).fetch = jest.fn((url: string, init?: { method?: string; body?: string }) => {
    if (url.startsWith("/api/job-seeker/me")) return json({ jobSeeker: me });
    if (url.startsWith("/api/job-seeker/documents")) {
      uploads += 1;
      return json({ document: { id: "up-1", name: "x", category: "resume", url: "https://cdn/x" } });
    }
    if (url === "/api/applications" && init?.method === "POST") {
      applyRequests.push(JSON.parse(init.body ?? "{}"));
      return json({ application: { _id: "app1" } }, 201);
    }
    if (url.startsWith("/api/applications?")) return json({ applications: [] });
    return json({}, 200);
  });
  ensureBuiltCvDocument.mockResolvedValue({
    id: "built-1", name: "Antony Varghese - Mployedin CV.pdf", category: "resume", url: "https://cdn/documents/built.pdf", builtHash: "aaaaaaaaaaaaaa",
  });
});

const open = () => render(<EasyApply jobId="job1" jobTitle="Site Engineer" locale="en" screeningQuestions={[]} />);
const builtChoice = () => screen.findByRole("radio", { name: /CV built on Mployedin/ });
const submit = async () => {
  const buttons = await screen.findAllByRole("button");
  const apply = buttons.filter((b) => /apply/i.test(b.textContent ?? "")).at(-1)!;
  fireEvent.click(apply);
};

describe("public EasyApply — signed-in seeker's CV", () => {
  it("offers the CV built on Mployedin and sends its stored copy", async () => {
    open();
    const built = await builtChoice();
    // The only CV there is, so it is the one selected.
    expect(built).toBeChecked();

    await submit();
    await waitFor(() => expect(applyRequests).toHaveLength(1));
    expect(ensureBuiltCvDocument).toHaveBeenCalledTimes(1);
    expect(ensureBuiltCvDocument.mock.calls[0][0].identity).toMatchObject({ fullName: "Antony Varghese", email: "antony@example.com" });
    expect(applyRequests[0]).toMatchObject({ jobId: "job1", documentIds: ["built-1"] });
    expect(applyRequests[0].includeProfileCv).toBeUndefined();
  });

  it("does not apply when the built CV cannot be prepared", async () => {
    const { BuiltCvError } = jest.requireActual("@/app/[locale]/(dashboard)/job-seeker/cv/built-cv");
    ensureBuiltCvDocument.mockRejectedValue(new BuiltCvError(""));
    open();
    await builtChoice();
    await submit();
    expect(await screen.findByText(/couldn't prepare your Mployedin CV/)).toBeInTheDocument();
    expect(applyRequests).toHaveLength(0);
  });

  it("reloads the CV list when the chosen CV has gone, instead of offering it again", async () => {
    me.documents = [{ id: "d1", name: "Resume.pdf", category: "resume", url: "https://cdn/documents/resume.pdf" }];
    const base = (global as unknown as { fetch: jest.Mock }).fetch.getMockImplementation()!;
    (global as unknown as { fetch: jest.Mock }).fetch.mockImplementation((url: string, init?: { method?: string }) =>
      url === "/api/applications" && init?.method === "POST"
        ? json({ error: "That file is no longer in your documents.", code: "DOCUMENT_NOT_FOUND" }, 400)
        : base(url, init));
    open();
    expect(await screen.findByRole("radio", { name: /Resume\.pdf/ })).toBeChecked();
    me.documents = [];
    await submit();

    expect(await screen.findByText(/no longer in your documents\. Choose your CV again/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("radio", { name: /Resume\.pdf/ })).not.toBeInTheDocument());
    expect(await builtChoice()).toBeChecked();
  });

  it("lists the built CV once, not its stored file as well", async () => {
    me.documents = [
      { id: "b0", name: "Antony Varghese - Mployedin CV.pdf", category: "resume", url: "https://cdn/documents/built-old.pdf", builtHash: "0000000000" },
    ];
    open();
    await builtChoice();
    expect(screen.queryByRole("radio", { name: /Mployedin CV\.pdf/ })).not.toBeInTheDocument();
  });

  it("preselects the Profile CV first, then the newest upload — as the dashboard dialog does", async () => {
    me.cvUrl = "https://cdn/cvs/profile.pdf";
    me.documents = [
      { id: "d1", name: "Old.pdf", category: "resume", url: "https://cdn/documents/old.pdf" },
      { id: "d2", name: "New.pdf", category: "resume", url: "https://cdn/documents/new.pdf" },
    ];
    const first = open();
    expect(await screen.findByRole("radio", { name: /Profile CV/ })).toBeChecked();
    first.unmount();

    me.cvUrl = null;
    open();
    // It used to pick the first upload here and the newest in the dashboard.
    expect(await screen.findByRole("radio", { name: /New\.pdf/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Old\.pdf/ })).not.toBeChecked();
    expect(await builtChoice()).not.toBeChecked();
  });

  it("does not offer a built CV to a seeker who never saved one", async () => {
    me.hasBuiltCv = false;
    me.cvUrl = "https://cdn/cvs/profile.pdf";
    open();
    await screen.findByRole("radio", { name: /Profile CV/ });
    expect(screen.queryByRole("radio", { name: /CV built on Mployedin/ })).not.toBeInTheDocument();
  });

  it("offers only formats the server takes, and turns away a legacy .doc before uploading", async () => {
    open();
    await builtChoice();
    const inputs = [...document.querySelectorAll('input[type="file"]')] as HTMLInputElement[];
    expect(inputs.length).toBeGreaterThan(0);
    for (const input of inputs) expect(input.accept).toBe(".pdf,.docx,.jpg,.jpeg,.png,.webp");

    fireEvent.change(inputs[0], { target: { files: [new File(["x"], "old-cv.doc", { type: "application/msword" })] } });
    expect(await screen.findByText(/file type isn't supported/)).toBeInTheDocument();
    expect(uploads).toBe(0);
  });
});
