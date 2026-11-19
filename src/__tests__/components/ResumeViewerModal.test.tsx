/**
 * @jest-environment jsdom
 *
 * The CV viewer for the roles that open a candidate's CV (employer, agent, super
 * agent, admin). They see the Standardised CV (Mployedin) first, drawn in the one
 * staff template, with the Original CV (Uploaded) one click away. A candidate
 * with too little profile to build one opens on the original, with a reason; a
 * candidate with no file has the original tab disabled, with a reason. A
 * candidate (or application) that cannot be found, and a probe that failed, are
 * told apart from both. Arabic is in ResumeViewerModalArabic.test.tsx.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

let mockRole: string | undefined = "employer";
jest.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ role: mockRole, can: () => true, session: null }),
}));
jest.mock("@/hooks/useCandidates", () => ({
  useAtsCheck: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock("@/components/features/matching/RequirementReport", () => ({ RequirementReport: () => null }));

// The built-CV view is the PDF renderer; here it is a stub that records what the modal hands it.
const mockBuiltViewProps: Array<Record<string, unknown>> = [];
jest.mock("next/dynamic", () => () =>
  function BuiltCvViewStub(props: Record<string, unknown>) {
    mockBuiltViewProps.push(props);
    return <div data-testid="built-cv-view" data-template={String(props.templateOverride ?? "")} />;
  },
);

const mockRenderBuiltCvPdf = jest.fn(async (..._args: unknown[]) => new Blob(["pdf"], { type: "application/pdf" }));
jest.mock("@/lib/cv/renderBuiltCv", () => ({
  renderBuiltCvPdf: (...args: unknown[]) => mockRenderBuiltCvPdf(...args),
}));

import { ResumeViewerModal } from "@/components/shared/ResumeViewerModal";
import { STAFF_CV_TEMPLATE } from "@/lib/jobSeeker/cvDesign";

const SEEKER_ID = "64b000000000000000000001";
const OTHER_ID = "64b000000000000000000002";
const cvUrl = (id: string) => `/api/employers/candidates/${id}/cv#cv.pdf`;
const CV_URL = cvUrl(SEEKER_ID);

const builtBody = (fullName: string, hasContent = true) => ({
  hasContent,
  identity: { fullName, email: "sara@example.com", phone: "+971500000000" },
  profile: { skills: ["Welding"], cvDesign: { templateId: "creative" } },
});

interface Backend {
  /** error = the probe answers 500; notFound = 404 "Candidate not found". */
  built?: "ok" | "empty" | "error" | "notFound";
  /** missing = 404 with code NO_CV; notFound = 404 without it; error = 502. */
  file?: "ok" | "missing" | "notFound" | "error";
  /** The candidate's name on the profile; given the id, it can differ per candidate. */
  fullName?: string | ((id: string) => string);
  /** The first N probes of the standardised CV answer 500, whatever `built` says. */
  builtFailures?: number;
  /** The route marks the served file as the Mployedin-built CV sent with the application (X-Mployedin-Cv-Built). */
  sentBuilt?: boolean;
}

function mockBackend({ built = "ok", file = "ok", fullName = "Sara Ahmed", builtFailures = 0, sentBuilt = false }: Backend = {}) {
  let failuresLeft = builtFailures;
  const bodyCancel = jest.fn();
  const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
    const href = String(input);
    const id = /candidates\/([a-f\d]{24})\//.exec(href)?.[1] ?? "";
    if (href.includes("kind=built")) {
      if (failuresLeft > 0) { failuresLeft -= 1; return { ok: false, status: 500, json: async () => ({}) }; }
      if (built === "error") return { ok: false, status: 500, json: async () => ({}) };
      if (built === "notFound") return { ok: false, status: 404, json: async () => ({ error: "Candidate not found" }) };
      const name = typeof fullName === "function" ? fullName(id) : fullName;
      return { ok: true, status: 200, json: async () => builtBody(name, built !== "empty") };
    }
    if (file === "missing") return { ok: false, status: 404, blob: async () => new Blob([]), json: async () => ({ error: "No CV on file for this candidate.", code: "NO_CV" }) };
    if (file === "notFound") return { ok: false, status: 404, blob: async () => new Blob([]), json: async () => ({ error: "Candidate not found" }) };
    if (file === "error") return { ok: false, status: 502, blob: async () => new Blob([]) };
    return { ok: true, status: 200, headers: new Headers(sentBuilt ? { "X-Mployedin-Cv-Built": "1" } : {}), body: { cancel: bodyCancel }, blob: jest.fn(async () => new Blob(["%PDF"], { type: "application/pdf" })) };
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return Object.assign(fetchMock, { bodyCancel });
}

const builtFetches = (fetchMock: jest.Mock) =>
  fetchMock.mock.calls.filter(([input]) => String(input).includes("kind=built"));
const fileFetches = (fetchMock: jest.Mock) =>
  fetchMock.mock.calls.filter(([input]) => !String(input).includes("kind=built"));

function renderModal(props: Partial<React.ComponentProps<typeof ResumeViewerModal>> = {}) {
  return render(<ResumeViewerModal url={CV_URL} candidateName="Sara" onClose={jest.fn()} {...props} />);
}

const tabNamed = (name: string | RegExp) => screen.getByRole("tab", { name });
const standardisedTab = () => tabNamed("Standardised CV (Mployedin)");
const originalTab = () => tabNamed("Original CV (Uploaded)");
/** What a tab's aria-describedby points at, as text. */
const describedBy = (tab: HTMLElement) =>
  (tab.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean).map((id) => document.getElementById(id)?.textContent ?? "").join(" ");

/** A browser without a built-in PDF viewer, as most phones are. */
function setPdfViewer(enabled: boolean) {
  Object.defineProperty(navigator, "pdfViewerEnabled", { value: enabled, configurable: true });
}
/** Let the pending fetches settle. */
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

beforeEach(() => {
  mockRole = "employer";
  mockBuiltViewProps.length = 0;
  mockRenderBuiltCvPdf.mockClear();
  global.URL.createObjectURL = jest.fn(() => "blob:cv");
  global.URL.revokeObjectURL = jest.fn();
});
afterEach(() => {
  delete (navigator as unknown as Record<string, unknown>).pdfViewerEnabled;
});

describe("ResumeViewerModal: which CV opens first", () => {
  it.each(["employer", "agent", "super_agent", "admin"])("%s sees the Standardised CV first, in the staff template", async (role) => {
    mockRole = role;
    mockBackend();
    renderModal();

    expect(await screen.findByTestId("built-cv-view")).toHaveAttribute("data-template", STAFF_CV_TEMPLATE);
    expect(standardisedTab()).toHaveAttribute("aria-selected", "true");
    expect(originalTab()).toHaveAttribute("aria-selected", "false");
    expect(screen.getByText("Built from the candidate's current profile")).toBeInTheDocument();
    expect(screen.queryByText("Standardised CV not available yet")).toBeNull();
  });

  it("probes the standardised CV once and hands the loaded data to the view instead of fetching again", async () => {
    const fetchMock = mockBackend();
    renderModal();

    await screen.findByTestId("built-cv-view");
    expect(builtFetches(fetchMock)).toHaveLength(1);
    const props = mockBuiltViewProps[mockBuiltViewProps.length - 1];
    expect(props.data).toMatchObject({ hasContent: true });
    expect(props.showToolbar).toBe(false);
  });

  it("a job seeker opens their file first, and still sees the standardised CV in their own design", async () => {
    mockRole = "job_seeker";
    mockBackend();
    renderModal();

    expect(originalTab()).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByTitle("Sara's CV")).toBeInTheDocument();
    expect(screen.queryByTestId("built-cv-view")).toBeNull();

    await userEvent.click(standardisedTab());
    const view = await screen.findByTestId("built-cv-view");
    expect(view).toHaveAttribute("data-template", ""); // no override: their own design
  });

  it.each(["support", "editor", "viewer", "super-admin", ""])("a role outside the staff list (%p) opens the file, not the standardised CV", async (role) => {
    mockRole = role;
    mockBackend();
    renderModal();

    expect(originalTab()).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByTitle("Sara's CV")).toBeInTheDocument();
    expect(screen.queryByTestId("built-cv-view")).toBeNull();
  });

  it("opens the file first while the session role is not known yet", async () => {
    mockRole = undefined;
    mockBackend();
    renderModal();

    expect(originalTab()).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByTitle("Sara's CV")).toBeInTheDocument();
  });

  it("an explicit viewerRole wins over the session", async () => {
    mockRole = "job_seeker";
    mockBackend();
    renderModal({ viewerRole: "agent" });

    expect(await screen.findByTestId("built-cv-view")).toBeInTheDocument();
    expect(standardisedTab()).toHaveAttribute("aria-selected", "true");
  });

  it("shows no source control for a document that is not a candidate's CV", async () => {
    mockBackend();
    renderModal({ url: "/api/uploads/some-file.pdf" });

    expect(screen.queryByRole("tablist", { name: "Which CV" })).toBeNull();
    expect(await screen.findByTitle("Sara's CV")).toBeInTheDocument();
  });
});

describe("ResumeViewerModal: standardised CV not available (D6)", () => {
  it("falls back to the original, says why in the page, and disables the Standardised tab when the profile has too little", async () => {
    mockBackend({ built: "empty" });
    renderModal();

    expect(await screen.findByTitle("Sara's CV")).toBeInTheDocument();
    expect(originalTab()).toHaveAttribute("aria-selected", "true");
    // For a staff viewer who expected it: an amber status line, in the page.
    expect(screen.getByRole("status")).toHaveTextContent("Standardised CV not available yet");
    const tab = standardisedTab();
    expect(tab).toHaveAttribute("aria-disabled", "true");
    expect(tab).toHaveAttribute("title", "Standardised CV not available yet");
    expect(describedBy(tab)).toBe("Standardised CV not available yet");
    expect(screen.queryByTestId("built-cv-view")).toBeNull();

    await userEvent.click(tab);
    expect(originalTab()).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByTestId("built-cv-view")).toBeNull();
  });

  it("shows the reason to a viewer who never expected the standardised CV too, without the amber status", async () => {
    mockRole = "job_seeker";
    mockBackend({ built: "empty" });
    renderModal();

    expect(await screen.findByTitle("Sara's CV")).toBeInTheDocument();
    await waitFor(() => expect(standardisedTab()).toHaveAttribute("aria-disabled", "true"));
    expect(describedBy(standardisedTab())).toBe("Standardised CV not available yet");
    expect(screen.getByText("Standardised CV not available yet")).toBeVisible();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("a probe that failed is a neutral could-not-load, not 'not available yet', and can be tried again", async () => {
    const fetchMock = mockBackend({ builtFailures: 1 });
    renderModal();

    // Meanwhile the original shows, so there is something to read.
    expect(await screen.findByText("Couldn't load the Standardised CV.")).toBeInTheDocument();
    expect(screen.queryByText("Standardised CV not available yet")).toBeNull();
    expect(originalTab()).toHaveAttribute("aria-selected", "true");
    expect(standardisedTab()).toHaveAttribute("aria-disabled", "true");
    expect(describedBy(standardisedTab())).toBe("Couldn't load the Standardised CV.");

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByTestId("built-cv-view")).toBeInTheDocument();
    expect(builtFetches(fetchMock)).toHaveLength(2);
    expect(standardisedTab()).toHaveAttribute("aria-selected", "true");
    expect(standardisedTab()).not.toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByText("Couldn't load the Standardised CV.")).toBeNull();
  });

  it("a probe that keeps failing says so, in the neutral voice, without Failed to", async () => {
    mockBackend({ built: "error" });
    renderModal();

    const note = await screen.findByText("Couldn't load the Standardised CV.");
    expect(note.textContent).not.toMatch(/Failed to/);
  });
});

describe("ResumeViewerModal: no original file", () => {
  it("disables the Original tab with the reason, in the page, and stays on the Standardised CV", async () => {
    mockBackend({ file: "missing" });
    renderModal();

    expect(await screen.findByTestId("built-cv-view")).toBeInTheDocument();
    await waitFor(() => expect(originalTab()).toHaveAttribute("aria-disabled", "true"));
    expect(originalTab()).toHaveAttribute("title", "No file uploaded");
    expect(describedBy(originalTab())).toBe("No file uploaded");
    expect(screen.getByText("No file uploaded")).toBeVisible();
    expect(standardisedTab()).toHaveAttribute("aria-selected", "true");

    await userEvent.click(originalTab());
    expect(standardisedTab()).toHaveAttribute("aria-selected", "true");
  });

  it("says so in the pane when there is neither a file nor a standardised CV", async () => {
    mockBackend({ built: "empty", file: "missing" });
    renderModal();

    const pane = await screen.findByRole("tabpanel");
    expect(await within(pane).findByText("No file uploaded")).toBeInTheDocument();
    expect(standardisedTab()).toHaveAttribute("aria-disabled", "true");
    expect(originalTab()).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByRole("button", { name: "Download" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Download" })).toBeNull();
  });

  it("moves a viewer who would have opened the file onto the Standardised CV when there is no file", async () => {
    mockRole = "job_seeker";
    mockBackend({ file: "missing" });
    renderModal();

    expect(await screen.findByTestId("built-cv-view")).toBeInTheDocument();
    expect(standardisedTab()).toHaveAttribute("aria-selected", "true");
  });

  it("keeps the Original tab usable when the file merely cannot be previewed", async () => {
    mockBackend({ file: "error" });
    renderModal();

    await screen.findByTestId("built-cv-view");
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await settle();
    expect(originalTab()).not.toHaveAttribute("aria-disabled", "true");
  });
});

describe("ResumeViewerModal: a CV that cannot be found is not 'no file uploaded'", () => {
  it("a 404 without NO_CV (the application or candidate is gone) disables Original with its own reason", async () => {
    mockBackend({ file: "notFound" });
    renderModal();

    await screen.findByTestId("built-cv-view");
    await waitFor(() => expect(originalTab()).toHaveAttribute("aria-disabled", "true"));
    expect(describedBy(originalTab())).toBe("This candidate's CV couldn't be found.");
    expect(screen.getByText("This candidate's CV couldn't be found.")).toBeVisible();
    expect(screen.queryByText("No file uploaded")).toBeNull();
  });

  it("a candidate that cannot be found at all: both tabs disabled, the pane says so, never 'No file uploaded'", async () => {
    mockBackend({ built: "notFound", file: "notFound" });
    renderModal();

    const pane = await screen.findByRole("tabpanel");
    expect(await within(pane).findByText("This candidate's CV couldn't be found.")).toBeInTheDocument();
    expect(standardisedTab()).toHaveAttribute("aria-disabled", "true");
    expect(originalTab()).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByText("No file uploaded")).toBeNull();
    expect(screen.queryByText("Standardised CV not available yet")).toBeNull();
    // one line, not the same sentence twice
    expect(screen.getAllByText("This candidate's CV couldn't be found.")).toHaveLength(2); // the note and the pane
  });
});

describe("ResumeViewerModal: a browser with no PDF viewer (phones) still learns whether the file exists", () => {
  it("disables the Original tab on a 404 NO_CV although the preview is skipped", async () => {
    setPdfViewer(false);
    const fetchMock = mockBackend({ file: "missing" });
    renderModal();

    await screen.findByTestId("built-cv-view");
    await waitFor(() => expect(originalTab()).toHaveAttribute("aria-disabled", "true"));
    expect(describedBy(originalTab())).toBe("No file uploaded");
    // A plain GET of the CV, abortable: the request is the availability check.
    const probes = fileFetches(fetchMock);
    expect(probes).toHaveLength(1);
    expect(probes[0][0]).toBe(CV_URL);
    expect((probes[0][1] as RequestInit).method ?? "GET").toBe("GET");
    expect((probes[0][1] as RequestInit).signal).toBeDefined();
  });

  it("tells a missing candidate from a missing file there too", async () => {
    setPdfViewer(false);
    mockBackend({ file: "notFound" });
    renderModal();

    await screen.findByTestId("built-cv-view");
    await waitFor(() => expect(originalTab()).toHaveAttribute("aria-disabled", "true"));
    expect(describedBy(originalTab())).toBe("This candidate's CV couldn't be found.");
  });

  it("leaves the Original tab usable when the file is there, without keeping its bytes", async () => {
    setPdfViewer(false);
    const fetchMock = mockBackend();
    renderModal();

    await screen.findByTestId("built-cv-view");
    await waitFor(() => expect(fetchMock.bodyCancel).toHaveBeenCalled());
    expect(originalTab()).not.toHaveAttribute("aria-disabled", "true");

    await userEvent.click(originalTab());
    // No preview here: the download prompt, as before.
    expect(await screen.findByText("Preview isn't available here")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute("href", `/api/employers/candidates/${SEEKER_ID}/cv?download=1#cv.pdf`);
  });

  it("a probe that errors does not disable the tab", async () => {
    setPdfViewer(false);
    mockBackend({ file: "error" });
    renderModal();

    await screen.findByTestId("built-cv-view");
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await settle();
    expect(originalTab()).not.toHaveAttribute("aria-disabled", "true");
  });
});

describe("ResumeViewerModal: initialSource (an Original CV menu item opens the file)", () => {
  it("opens on the original file when asked, instead of the Standardised CV", async () => {
    mockBackend();
    renderModal({ initialSource: "file" });

    await waitFor(() => expect(originalTab()).toHaveAttribute("aria-selected", "true"));
    expect(standardisedTab()).toHaveAttribute("aria-selected", "false");
    expect(screen.queryByTestId("built-cv-view")).toBeNull();
  });

  it("falls back to the Standardised CV when there is no original file", async () => {
    mockBackend({ file: "missing" });
    setPdfViewer(false);
    renderModal({ initialSource: "file" });

    expect(await screen.findByTestId("built-cv-view")).toBeInTheDocument();
    expect(standardisedTab()).toHaveAttribute("aria-selected", "true");
  });

  it("a pick made in the viewer still wins over it", async () => {
    mockBackend();
    renderModal({ initialSource: "file" });
    await waitFor(() => expect(originalTab()).toHaveAttribute("aria-selected", "true"));

    await userEvent.click(standardisedTab());
    expect(await screen.findByTestId("built-cv-view")).toBeInTheDocument();
    expect(standardisedTab()).toHaveAttribute("aria-selected", "true");
  });

  it("opens on the Standardised CV by default for staff", async () => {
    mockBackend();
    renderModal();
    expect(await screen.findByTestId("built-cv-view")).toBeInTheDocument();
  });
});

describe("ResumeViewerModal: the built CV is asked for in the application's context", () => {
  it("adds the applicationId to the built-CV request when one is in hand", async () => {
    const fetchMock = mockBackend();
    renderModal({ applicationId: "64b0000000000000000000aa" });
    await screen.findByTestId("built-cv-view");
    const urls = builtFetches(fetchMock).map(([input]) => String(input));
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) expect(u).toContain("kind=built&applicationId=64b0000000000000000000aa");
  });

  it("asks without one outside an application", async () => {
    const fetchMock = mockBackend();
    renderModal();
    await screen.findByTestId("built-cv-view");
    for (const [input] of builtFetches(fetchMock)) expect(String(input)).not.toContain("applicationId");
  });
});

describe("ResumeViewerModal: the second tab's name (D4)", () => {
  it("is Original CV (Uploaded) by default", async () => {
    mockBackend();
    renderModal({ applicationId: "64b0000000000000000000aa" });
    await screen.findByTestId("built-cv-view");

    expect(originalTab()).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "CV sent with application" })).toBeNull();
  });

  it("is CV sent with application when the applicant sent the Mployedin-built CV", async () => {
    mockBackend();
    renderModal({ applicationId: "64b0000000000000000000aa", originalIsBuilt: true });
    await screen.findByTestId("built-cv-view");

    expect(tabNamed("CV sent with application")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Original CV (Uploaded)" })).toBeNull();
  });

  it("is not renamed by an application id alone", async () => {
    mockBackend();
    renderModal({ applicationId: "64b0000000000000000000aa", originalIsBuilt: false });
    await screen.findByTestId("built-cv-view");

    expect(originalTab()).toBeInTheDocument();
  });

  it("is CV sent with application when the CV route says so (no prop needed)", async () => {
    mockBackend({ sentBuilt: true });
    renderModal({ url: `${CV_URL.replace("#cv.pdf", "")}?applicationId=64b0000000000000000000aa#cv.pdf`, applicationId: "64b0000000000000000000aa" });
    await screen.findByTestId("built-cv-view");

    expect(await screen.findByRole("tab", { name: "CV sent with application" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Original CV (Uploaded)" })).toBeNull();
  });

  it("is also named by the route on a browser with no PDF viewer (the request is still made)", async () => {
    setPdfViewer(false);
    mockBackend({ sentBuilt: true });
    renderModal({ applicationId: "64b0000000000000000000aa" });
    await screen.findByTestId("built-cv-view");

    expect(await screen.findByRole("tab", { name: "CV sent with application" })).toBeInTheDocument();
  });

  it("stays Original CV (Uploaded) when the route does not mark the file as built", async () => {
    mockBackend({ sentBuilt: false });
    renderModal({ applicationId: "64b0000000000000000000aa" });
    await screen.findByTestId("built-cv-view");
    await settle();

    expect(originalTab()).toBeInTheDocument();
  });

  it("an explicit originalIsBuilt={false} overrides what the route says", async () => {
    mockBackend({ sentBuilt: true });
    renderModal({ applicationId: "64b0000000000000000000aa", originalIsBuilt: false });
    await screen.findByTestId("built-cv-view");
    await settle();

    expect(originalTab()).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "CV sent with application" })).toBeNull();
  });

  it("an explicit originalIsBuilt={true} wins even when the route is silent", async () => {
    mockBackend({ sentBuilt: false });
    renderModal({ applicationId: "64b0000000000000000000aa", originalIsBuilt: true });
    await screen.findByTestId("built-cv-view");
    await settle();

    expect(tabNamed("CV sent with application")).toBeInTheDocument();
  });
});

describe("ResumeViewerModal: the control", () => {
  it("is an accessible tab list with the tab panel it controls", async () => {
    mockBackend();
    renderModal();
    await screen.findByTestId("built-cv-view");

    const list = screen.getByRole("tablist", { name: "Which CV" });
    expect(within(list).getAllByRole("tab")).toHaveLength(2);
    const panel = screen.getByRole("tabpanel");
    expect(standardisedTab()).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveAttribute("aria-labelledby", standardisedTab().id);
    expect(within(panel).getByTestId("built-cv-view")).toBeInTheDocument();
  });

  it("switches with the arrow keys, skipping a disabled tab", async () => {
    mockBackend();
    renderModal();
    await screen.findByTestId("built-cv-view");

    standardisedTab().focus();
    fireEvent.keyDown(standardisedTab(), { key: "ArrowRight" });
    expect(originalTab()).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(originalTab(), { key: "ArrowLeft" });
    expect(standardisedTab()).toHaveAttribute("aria-selected", "true");
  });

  it("does not move onto a disabled tab with the arrow keys", async () => {
    mockBackend({ file: "missing" });
    renderModal();
    await screen.findByTestId("built-cv-view");
    await waitFor(() => expect(originalTab()).toHaveAttribute("aria-disabled", "true"));

    fireEvent.keyDown(standardisedTab(), { key: "ArrowRight" });
    expect(standardisedTab()).toHaveAttribute("aria-selected", "true");
  });

  it("phone: full width, a short label per tab, and above the CV / Profile switch", async () => {
    mockBackend();
    renderModal({ candidate: { role: "Welder" } });
    await screen.findByTestId("built-cv-view");

    const list = screen.getByRole("tablist", { name: "Which CV" });
    expect(list.className).toMatch(/\bw-full\b/);
    // Both labels are in the page; CSS shows the short one on phones, the long one from sm.
    const tab = standardisedTab();
    const short = within(tab).getByText("Standardised", { exact: true });
    const long = within(tab).getByText("Standardised CV (Mployedin)", { exact: true });
    expect(short.className).toMatch(/\bsm:hidden\b/);
    expect(long.className).toMatch(/\bhidden\b/);
    expect(long.className).toMatch(/\bsm:inline\b/);
    expect(within(originalTab()).getByText("Original", { exact: true })).toBeInTheDocument();

    const panes = screen.getByRole("tablist", { name: "CV or profile" });
    expect(list.compareDocumentPosition(panes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("phone: choosing a CV while the profile is open goes back to the CV", async () => {
    mockBackend();
    renderModal({ candidate: { role: "Welder" } });
    await screen.findByTestId("built-cv-view");

    await userEvent.click(screen.getByRole("tab", { name: "Profile" }));
    const pane = screen.getByTestId("built-cv-view").closest("div.overflow-auto") as HTMLElement;
    expect(pane.className).toMatch(/\bhidden\b/);

    await userEvent.click(originalTab());
    expect(pane.className).not.toMatch(/\bhidden\b/);
  });
});

describe("ResumeViewerModal: download follows the active version", () => {
  /** Press Download and return the name the file was saved under. */
  async function savedName() {
    const names: string[] = [];
    const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { names.push(this.download); });
    await userEvent.click(screen.getByRole("button", { name: "Download" }));
    await waitFor(() => expect(names).toHaveLength(1));
    click.mockRestore();
    return names[0];
  }

  it("Standardised: renders the standardised PDF in the staff template and saves it under the export's name", async () => {
    mockBackend();
    renderModal();
    await screen.findByTestId("built-cv-view");

    expect(await savedName()).toBe("Sara Ahmed - Standardised CV (Mployedin).pdf");
    expect(mockRenderBuiltCvPdf).toHaveBeenCalledTimes(1);
    const [data, , options] = mockRenderBuiltCvPdf.mock.calls[0] as unknown as [{ hasContent: boolean }, unknown, { templateId: string }];
    expect(data.hasContent).toBe(true);
    expect(options).toEqual({ templateId: STAFF_CV_TEMPLATE });
  });

  it("is never named like a built upload, which the CV source rules take for the seeker's own built CV", async () => {
    mockBackend();
    renderModal();
    await screen.findByTestId("built-cv-view");

    expect(await savedName()).not.toMatch(/ - Mployedin CV\.pdf$/i);
  });

  it("keeps an Arabic name and drops path characters, as the export does", async () => {
    mockBackend({ fullName: "سارة/أحمد: *?" });
    renderModal();
    await screen.findByTestId("built-cv-view");

    expect(await savedName()).toBe("سارةأحمد - Standardised CV (Mployedin).pdf");
  });

  it("falls back to the candidate's id when the profile has no name", async () => {
    mockBackend({ fullName: "" });
    renderModal({ candidateName: "" });
    await screen.findByTestId("built-cv-view");

    expect(await savedName()).toBe("Candidate 000001 - Standardised CV (Mployedin).pdf");
  });

  it("Original: the same button becomes a download of the file, and the standardised PDF is not rendered", async () => {
    mockBackend();
    renderModal();
    await screen.findByTestId("built-cv-view");

    await userEvent.click(originalTab());

    expect(screen.queryByRole("button", { name: "Download" })).toBeNull();
    const link = screen.getByRole("link", { name: "Download" });
    // An explicit Download is flagged so the CV route counts it (the preview fetch is not).
    expect(link).toHaveAttribute("href", `/api/employers/candidates/${SEEKER_ID}/cv?download=1#cv.pdf`);
    expect(link).toHaveAttribute("download", "Sara's CV");
    expect(mockRenderBuiltCvPdf).not.toHaveBeenCalled();

    // and back again
    await userEvent.click(standardisedTab());
    expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Download" })).toBeNull();
  });

  it("has one download, not a second one in the top bar's menu", async () => {
    mockBackend();
    renderModal();
    await screen.findByTestId("built-cv-view");

    expect(screen.queryByTitle("More")).toBeNull();
  });

  it("a document that is not a candidate's CV keeps the top bar's download menu", async () => {
    mockBackend();
    renderModal({ url: "/api/uploads/some-file.pdf" });

    expect(await screen.findByTitle("More")).toBeInTheDocument();
  });

  it("says so, without Failed to, when the PDF cannot be made", async () => {
    mockBackend();
    mockRenderBuiltCvPdf.mockRejectedValueOnce(new Error("render failed"));
    renderModal();
    await screen.findByTestId("built-cv-view");

    await userEvent.click(screen.getByRole("button", { name: "Download" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't create the PDF. Please try again.");
    expect(alert.textContent).not.toMatch(/Failed to/);
    // and the button is usable again
    expect(screen.getByRole("button", { name: "Download" })).not.toBeDisabled();
  });

  it("renders nothing until Download is pressed", async () => {
    mockBackend();
    renderModal();
    await screen.findByTestId("built-cv-view");

    expect(mockRenderBuiltCvPdf).not.toHaveBeenCalled();
  });
});

describe("ResumeViewerModal: opening another candidate in the same modal", () => {
  const ID_BY_NAME = (id: string) => `Candidate ${id.slice(-1)}`;

  it("never draws one candidate with another's data, and starts the next on the default CV", async () => {
    mockBackend({ fullName: ID_BY_NAME });
    const view = renderModal({ url: cvUrl(SEEKER_ID) });
    await screen.findByTestId("built-cv-view");
    await userEvent.click(originalTab()); // a pick on the first candidate

    view.rerender(<ResumeViewerModal url={cvUrl(OTHER_ID)} candidateName="Other" onClose={jest.fn()} />);

    // the pick does not carry over: the second candidate opens on the standardised CV
    await waitFor(() => expect(standardisedTab()).toHaveAttribute("aria-selected", "true"));
    await waitFor(() => {
      const last = mockBuiltViewProps[mockBuiltViewProps.length - 1];
      expect(String(last.url)).toContain(OTHER_ID);
    });
    // every time the view was drawn, its data belonged to the candidate it was asked for
    for (const props of mockBuiltViewProps) {
      const id = /candidates\/([a-f\d]{24})\//.exec(String(props.url))?.[1] ?? "";
      expect((props.data as { identity: { fullName: string } }).identity.fullName).toBe(ID_BY_NAME(id));
    }
  });

  it("does not show the first candidate's failed download on the next", async () => {
    mockBackend();
    mockRenderBuiltCvPdf.mockRejectedValueOnce(new Error("render failed"));
    const view = renderModal({ url: cvUrl(SEEKER_ID) });
    await screen.findByTestId("built-cv-view");
    await userEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    view.rerender(<ResumeViewerModal url={cvUrl(OTHER_ID)} candidateName="Other" onClose={jest.fn()} />);

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("does not show the first candidate's missing file on the next", async () => {
    const fetchMock = mockBackend({ file: "missing" });
    const view = renderModal({ url: cvUrl(SEEKER_ID) });
    await screen.findByTestId("built-cv-view");
    await waitFor(() => expect(originalTab()).toHaveAttribute("aria-disabled", "true"));

    // the second candidate has a file
    (fetchMock as jest.Mock).mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).includes("kind=built")) return { ok: true, status: 200, json: async () => builtBody("Candidate 2") };
      return { ok: true, status: 200, body: { cancel: jest.fn() }, blob: async () => new Blob(["%PDF"], { type: "application/pdf" }) };
    });
    view.rerender(<ResumeViewerModal url={cvUrl(OTHER_ID)} candidateName="Other" onClose={jest.fn()} />);

    await waitFor(() => expect(originalTab()).not.toHaveAttribute("aria-disabled", "true"));
    expect(screen.queryByText("No file uploaded")).toBeNull();
  });
});
