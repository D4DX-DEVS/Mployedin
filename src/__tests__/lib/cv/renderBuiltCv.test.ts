import { EMPTY_CV_FORM, builtCvHash, cvFormFromProfile, ensureBuiltCvDocument } from "@/app/[locale]/(dashboard)/job-seeker/cv/built-cv";
import { DEFAULT_FORMATTING, getVisibleForm, type FormattingOptions } from "@/app/[locale]/(dashboard)/job-seeker/cv/types";
import type { CVPDFLabels } from "@/app/[locale]/(dashboard)/job-seeker/cv/pdf/shared";
import { CV_TEMPLATE_IDS, STAFF_CV_TEMPLATE } from "@/lib/jobSeeker/cvDesign";
import { builtCvRenderInput, renderBuiltCvPdf, renderCvPdfBlob as renderCvPdfBlobFromBuiltCv, type BuiltCvResponse } from "@/lib/cv/renderBuiltCv";
import { renderCvPdfBlob } from "@/lib/cv/renderCvPdf";

/* react-pdf is mocked: this suite is about WHAT is rendered (one shared input
   builder, one shared render function), not about drawing a PDF. The factory
   counters prove the renderer is only loaded when a PDF is actually made. */
let mockRendererLoads = 0;
let mockDocumentLoads = 0;
const mockPdf = jest.fn();
const mockRefreshFonts = jest.fn();

jest.mock("@react-pdf/renderer", () => {
  mockRendererLoads += 1;
  return { __esModule: true, pdf: (element: unknown) => mockPdf(element) };
});
jest.mock("@/app/[locale]/(dashboard)/job-seeker/cv/pdf/shared", () => ({
  __esModule: true,
  refreshCvPdfFonts: () => mockRefreshFonts(),
}));
jest.mock("@/app/[locale]/(dashboard)/job-seeker/cv/cv-pdf-document", () => {
  mockDocumentLoads += 1;
  return { __esModule: true, CVPDFDocument: function MockCvPdfDocument() { return null; } };
});

const LABELS: CVPDFLabels = {
  yourName: "Your name", present: "Present", experience: "Experience", education: "Education", grade: "Grade",
  skills: "Skills", projects: "Projects", languages: "Languages", certifications: "Certifications",
  professionalExperience: "Professional Experience", keyProjects: "Key Projects", coreCompetencies: "Core Competencies",
  decoratedExperience: "Experience", decoratedEducation: "Education", decoratedSkills: "Skills", decoratedProjects: "Projects",
  atCompany: "at {company}",
  proficiency: { basic: "Basic", conversational: "Conversational", professional: "Professional", native: "Native" },
};

const OWN_FORMATTING: FormattingOptions = {
  ...DEFAULT_FORMATTING,
  font: "georgia",
  fontSize: "large",
  themeColor: "green",
  pageFormat: "letter",
  margin: "wide",
};

function response(overrides: Partial<BuiltCvResponse["profile"]> = {}): BuiltCvResponse {
  return {
    hasContent: true,
    identity: { fullName: "Amina Hassan", email: "amina@example.com", phone: "+971500000000" },
    profile: {
      headline: "Senior accountant",
      skills: ["Excel", "IFRS"],
      experience: [{ jobTitle: "Accountant", company: "Acme", country: "UAE", startDate: "2020-01-01", endDate: null, isCurrent: true, description: "Closed the books." }],
      education: [{ degree: "BCom", institution: "Cairo University", field: "Accounting", graduationDate: "2018-06-01", grade: "A" }],
      languages: [{ language: "Arabic", proficiency: "native" }],
      certifications: ["CPA"],
      projects: [{ title: "ERP roll-out", description: "Led it.", techStack: ["SAP"], projectUrl: "", repoUrl: "" }],
      cvDesign: { templateId: "modern", formatting: OWN_FORMATTING, hiddenSections: ["projects", "skills"] },
      ...overrides,
    },
  };
}

/** The viewer's own computation before it was extracted — the no-override result must equal it. */
function legacyViewerInput(data: BuiltCvResponse) {
  const design = data.profile.cvDesign;
  const templateId = design?.templateId && (CV_TEMPLATE_IDS as readonly string[]).includes(design.templateId) ? design.templateId : "classic";
  const formatting = design?.formatting ?? DEFAULT_FORMATTING;
  const form = cvFormFromProfile(data.profile, {
    ...EMPTY_CV_FORM,
    fullName: data.identity.fullName,
    email: data.identity.email,
    phone: data.identity.phone,
  });
  return { data: getVisibleForm(form, new Set(design?.hiddenSections ?? [])), templateId, formatting };
}

describe("STAFF_CV_TEMPLATE", () => {
  it("is the classic template and a real template id", () => {
    expect(STAFF_CV_TEMPLATE).toBe("classic");
    expect(CV_TEMPLATE_IDS).toContain(STAFF_CV_TEMPLATE);
  });
});

describe("builtCvRenderInput — no override (the seeker's own design)", () => {
  it("equals what the viewer computed before the extraction", () => {
    const body = response();
    const { data, templateId, formatting } = builtCvRenderInput(body);
    expect({ data, templateId, formatting }).toEqual(legacyViewerInput(body));
  });

  it("keeps the seeker's template, formatting and hidden sections", () => {
    const input = builtCvRenderInput(response());
    expect(input.templateId).toBe("modern");
    expect(input.formatting).toEqual(OWN_FORMATTING);
    expect([...input.hiddenSections].sort()).toEqual(["projects", "skills"]);
    expect(input.data.projects).toEqual([]);
    expect(input.data.skills).toEqual([]);
    expect(input.data.experience).toHaveLength(1);
  });

  it("fills the form from the identity and the profile", () => {
    const { data } = builtCvRenderInput(response());
    expect(data.fullName).toBe("Amina Hassan");
    expect(data.email).toBe("amina@example.com");
    expect(data.phone).toBe("+971500000000");
    expect(data.headline).toBe("Senior accountant");
    expect(data.experience[0]).toMatchObject({ jobTitle: "Accountant", company: "Acme", startDate: "2020-01", isCurrent: true });
  });

  it("falls back to classic and the default look when the seeker never chose one", () => {
    for (const cvDesign of [undefined, null]) {
      const body = response({ cvDesign });
      const input = builtCvRenderInput(body);
      expect(input.templateId).toBe("classic");
      expect(input.formatting).toBe(DEFAULT_FORMATTING);
      expect(input.hiddenSections.size).toBe(0);
      expect({ data: input.data, templateId: input.templateId, formatting: input.formatting }).toEqual(legacyViewerInput(body));
    }
  });

  it("falls back to classic when the saved template id is retired or unknown", () => {
    const body = response({ cvDesign: { templateId: "retired-template", formatting: OWN_FORMATTING, hiddenSections: [] } });
    expect(builtCvRenderInput(body).templateId).toBe("classic");
  });

  it("handles an empty profile without throwing", () => {
    const body: BuiltCvResponse = { hasContent: false, identity: { fullName: "", email: "", phone: "" }, profile: {} };
    const input = builtCvRenderInput(body);
    expect(input.templateId).toBe("classic");
    expect(input.formatting).toBe(DEFAULT_FORMATTING);
    expect(input.data).toEqual(EMPTY_CV_FORM);
    expect(input.hiddenSections.size).toBe(0);
  });
});

describe("builtCvRenderInput — staff override (one fixed look for everyone)", () => {
  it("forces the override template and the default formatting", () => {
    const input = builtCvRenderInput(response(), STAFF_CV_TEMPLATE);
    expect(input.templateId).toBe("classic");
    expect(input.formatting).toBe(DEFAULT_FORMATTING);
  });

  it("keeps the sections the candidate hid: they are left out of the standardised CV too", () => {
    const input = builtCvRenderInput(response(), STAFF_CV_TEMPLATE);
    expect([...input.hiddenSections].sort()).toEqual(["projects", "skills"]);
    expect(input.data.projects).toEqual([]);
    expect(input.data.skills).toEqual([]);
    // What they left visible is there.
    expect(input.data.experience).toHaveLength(1);
    expect(input.data.education).toHaveLength(1);
    expect(input.data.certifications).toEqual(["CPA"]);
  });

  it("shows every section when the candidate hid none (or never chose a design)", () => {
    for (const cvDesign of [undefined, null, { templateId: "modern", formatting: OWN_FORMATTING, hiddenSections: [] }]) {
      const input = builtCvRenderInput(response({ cvDesign }), STAFF_CV_TEMPLATE);
      expect(input.hiddenSections.size).toBe(0);
      expect(input.data.projects).toHaveLength(1);
      expect(input.data.skills).toEqual(["Excel", "IFRS"]);
    }
  });

  it("looks the same for two candidates with different saved designs, each with their own hidden sections", () => {
    const a = builtCvRenderInput(response(), STAFF_CV_TEMPLATE);
    const b = builtCvRenderInput(
      response({ cvDesign: { templateId: "creative", formatting: { ...OWN_FORMATTING, font: "playfair", themeColor: "red" }, hiddenSections: ["experience"] } }),
      STAFF_CV_TEMPLATE,
    );
    expect(b.templateId).toBe(a.templateId);
    expect(b.formatting).toEqual(a.formatting);
    expect([...b.hiddenSections]).toEqual(["experience"]);
    expect(b.data.experience).toEqual([]);
    expect(b.data.projects).toHaveLength(1);
  });

  it("applies the override even when the candidate has no saved design", () => {
    const input = builtCvRenderInput(response({ cvDesign: null }), "classic");
    expect(input.templateId).toBe("classic");
    expect(input.formatting).toBe(DEFAULT_FORMATTING);
  });

  it("uses the override template when it is not classic, still with default formatting and the candidate's hidden sections", () => {
    const input = builtCvRenderInput(response(), "minimal");
    expect(input.templateId).toBe("minimal");
    expect(input.formatting).toBe(DEFAULT_FORMATTING);
    expect([...input.hiddenSections].sort()).toEqual(["projects", "skills"]);
  });

  it("falls back to the staff template when the override is not a known template", () => {
    const input = builtCvRenderInput(response(), "not-a-template");
    expect(input.templateId).toBe(STAFF_CV_TEMPLATE);
    expect(input.formatting).toBe(DEFAULT_FORMATTING);
  });

  it("does not change the candidate's content, only the look", () => {
    const body = response();
    const own = builtCvRenderInput(body).data;
    const staff = builtCvRenderInput(body, STAFF_CV_TEMPLATE).data;
    expect(staff).toEqual(own);
  });

  it("passes Arabic content through unchanged", () => {
    const body = response({
      headline: "محاسب أول",
      skills: ["إكسل", "المعايير الدولية"],
      experience: [{ jobTitle: "محاسب", company: "شركة النور", country: "الإمارات", startDate: "2020-01-01", endDate: null, isCurrent: true, description: "إقفال الدفاتر." }],
      cvDesign: { templateId: "modern", formatting: OWN_FORMATTING, hiddenSections: ["projects"] },
    });
    body.identity.fullName = "أمينة حسن";
    const { data } = builtCvRenderInput(body, STAFF_CV_TEMPLATE);
    expect(data.fullName).toBe("أمينة حسن");
    expect(data.headline).toBe("محاسب أول");
    expect(data.skills).toEqual(["إكسل", "المعايير الدولية"]);
    expect(data.experience[0]).toMatchObject({ jobTitle: "محاسب", company: "شركة النور", country: "الإمارات" });
    expect(data.projects).toEqual([]);
  });
});

describe("renderBuiltCvPdf", () => {
  beforeEach(() => {
    mockPdf.mockReset();
    mockPdf.mockImplementation(() => ({ toBlob: () => Promise.resolve(new Blob(["%PDF-"], { type: "application/pdf" })) }));
  });

  it("does not load react-pdf or the CV document until a PDF is made", async () => {
    expect(mockRendererLoads).toBe(0);
    expect(mockDocumentLoads).toBe(0);
    await renderBuiltCvPdf(response(), LABELS);
    expect(mockRendererLoads).toBeGreaterThan(0);
    expect(mockDocumentLoads).toBeGreaterThan(0);
  });

  it("renders the seeker's own design when there is no override", async () => {
    const body = response();
    const blob = await renderBuiltCvPdf(body, LABELS);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/pdf");

    const element = mockPdf.mock.calls[0][0] as { props: Record<string, unknown> };
    const expected = builtCvRenderInput(body);
    expect(element.props).toEqual({ data: expected.data, templateId: "modern", formatting: OWN_FORMATTING, labels: LABELS });
  });

  it("renders the staff template with default formatting when overridden", async () => {
    const body = response();
    await renderBuiltCvPdf(body, LABELS, { templateId: STAFF_CV_TEMPLATE });

    const element = mockPdf.mock.calls[0][0] as { props: Record<string, unknown> };
    const expected = builtCvRenderInput(body, STAFF_CV_TEMPLATE);
    expect(element.props).toEqual({ data: expected.data, templateId: "classic", formatting: DEFAULT_FORMATTING, labels: LABELS });
  });

  it("renders the same input to the same document props every time", async () => {
    const body = response();
    await renderBuiltCvPdf(body, LABELS, { templateId: STAFF_CV_TEMPLATE });
    await renderBuiltCvPdf(body, LABELS, { templateId: STAFF_CV_TEMPLATE });
    const [first, second] = mockPdf.mock.calls.map((c) => (c[0] as { props: unknown }).props);
    expect(second).toEqual(first);
  });

  it("rejects when the renderer fails, so callers can report a gap", async () => {
    mockPdf.mockImplementation(() => ({ toBlob: () => Promise.reject(new Error("render failed")) }));
    await expect(renderBuiltCvPdf(response(), LABELS)).rejects.toThrow("render failed");
  });
});

describe("renderCvPdfBlob: the one render wrapper", () => {
  beforeEach(() => {
    mockPdf.mockReset();
    mockPdf.mockImplementation(() => ({ toBlob: () => Promise.resolve(new Blob(["%PDF-"], { type: "application/pdf" })) }));
  });

  it("is the same function whichever module it is imported from", () => {
    expect(renderCvPdfBlobFromBuiltCv).toBe(renderCvPdfBlob);
  });

  it("hands the four props to CVPDFDocument and returns react-pdf's Blob", async () => {
    const { data, templateId, formatting } = builtCvRenderInput(response());
    const blob = await renderCvPdfBlob({ data, templateId, formatting, labels: LABELS });
    expect(blob.type).toBe("application/pdf");
    const element = mockPdf.mock.calls[0][0] as { props: Record<string, unknown> };
    expect(element.props).toEqual({ data, templateId, formatting, labels: LABELS });
  });

  it("is what renderBuiltCvPdf calls: same props for the same input", async () => {
    const body = response();
    const parts = builtCvRenderInput(body, STAFF_CV_TEMPLATE);
    await renderCvPdfBlob({ data: parts.data, templateId: parts.templateId, formatting: parts.formatting, labels: LABELS });
    await renderBuiltCvPdf(body, LABELS, { templateId: STAFF_CV_TEMPLATE });
    const [direct, viaBuilt] = mockPdf.mock.calls.map((c) => (c[0] as { props: unknown }).props);
    expect(viaBuilt).toEqual(direct);
  });

  it("is what ensureBuiltCvDocument renders with (the seeker's apply flow), with the same hash inputs as before", async () => {
    const body = response();
    const upload = jest.fn(async (file: File, builtHash: string) => ({ id: "d1", name: file.name, category: "resume", url: "/d1", builtHash }));
    const doc = await ensureBuiltCvDocument(
      { identity: { fullName: body.identity.fullName, email: body.identity.email, photo: "" }, labels: LABELS, documents: [] },
      { loadProfile: async () => body.profile, loadDocuments: async () => [], upload },
    );

    expect(mockPdf).toHaveBeenCalledTimes(1);
    const props = (mockPdf.mock.calls[0][0] as { props: { data: unknown; templateId: string; formatting: unknown; labels: unknown } }).props;
    expect(props.templateId).toBe("modern");
    expect(props.labels).toBe(LABELS);
    // The stored file is keyed by the same inputs it was rendered from.
    expect(doc.builtHash).toBe(builtCvHash({ data: props.data as never, templateId: props.templateId, formatting: props.formatting, labels: props.labels }));
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0][0].type).toBe("application/pdf");
  });

  it("ensureBuiltCvDocument still reports BuiltCvError when the render fails", async () => {
    mockPdf.mockImplementation(() => ({ toBlob: () => Promise.reject(new Error("render failed")) }));
    const body = response();
    await expect(
      ensureBuiltCvDocument(
        { identity: { fullName: "A", email: "a@example.com", photo: "" }, labels: LABELS, documents: [] },
        { loadProfile: async () => body.profile, loadDocuments: async () => [], upload: jest.fn() },
      ),
    ).rejects.toMatchObject({ name: "BuiltCvError" });
  });
});
