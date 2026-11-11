/**
 * The CV a seeker builds on Mployedin was never sent with an application: the
 * builder only downloaded a PDF. The apply dialog now offers it, made from the
 * profile and the saved design, and stored once as a resume file that is
 * reused until the CV changes.
 */
import {
  EMPTY_CV_FORM,
  builtCvHash,
  cvFormFromProfile,
  ensureBuiltCvDocument,
  BuiltCvError,
  type BuiltCvDocument,
  type BuiltCvRenderInput,
} from "@/app/[locale]/(dashboard)/job-seeker/cv/built-cv";
import type { CVPDFLabels } from "@/app/[locale]/(dashboard)/job-seeker/cv/pdf/shared";

const labels = { yourName: "Your name", present: "Present" } as unknown as CVPDFLabels;

const profile = {
  phone: "+971500000000",
  nationality: "Indian",
  currentLocation: "Dubai",
  summary: "Site engineer with 6 years on high-rise projects.",
  avatar: "https://cdn/avatars/a.png?X-Amz-Signature=one",
  skills: ["AutoCAD", "Primavera"],
  socialLinks: [
    { label: "LinkedIn", url: "https://www.linkedin.com/in/antony" },
    { label: "GitHub", url: "https://github.com/antony" },
  ],
  experience: [
    { jobTitle: "Site Engineer", company: "Arabtec", country: "UAE", startDate: "2020-03-01T00:00:00.000Z", isCurrent: true, description: "Ran daily site meetings" },
  ],
  education: [{ degree: "B.Tech", institution: "CUSAT", field: "Civil", graduationDate: "2018-06-01T00:00:00.000Z", grade: "8.1" }],
  languages: [{ language: "English", proficiency: "professional" }],
  certifications: ["PMP"],
  projects: [],
  cvDesign: { templateId: "modern", hiddenSections: ["certifications"] },
};

const identity = { fullName: "Antony Varghese", email: "antony@example.com", photo: "" };

describe("cvFormFromProfile", () => {
  it("fills the CV from the profile and keeps the name and email it was given", () => {
    const form = cvFormFromProfile(profile, { ...EMPTY_CV_FORM, fullName: "Antony Varghese", email: "antony@example.com" });
    expect(form).toMatchObject({
      fullName: "Antony Varghese",
      email: "antony@example.com",
      phone: "+971500000000",
      headline: "Site engineer with 6 years on high-rise projects.",
      linkedin: "https://www.linkedin.com/in/antony",
      skills: ["AutoCAD", "Primavera"],
      certifications: ["PMP"],
    });
    expect(form.additionalLinks).toEqual([{ label: "GitHub", url: "https://github.com/antony" }]);
    expect(form.experience[0]).toMatchObject({ jobTitle: "Site Engineer", startDate: "2020-03", endDate: "", isCurrent: true });
    expect(form.education[0]).toMatchObject({ degree: "B.Tech", graduationDate: "2018-06" });
  });

  it("keeps what is already there when the profile has nothing for it", () => {
    const prev = { ...EMPTY_CV_FORM, skills: ["Excel"], phone: "123" };
    const form = cvFormFromProfile({}, prev);
    expect(form.skills).toEqual(["Excel"]);
    expect(form.phone).toBe("123");
  });
});

describe("builtCvHash", () => {
  const base = { data: cvFormFromProfile(profile, EMPTY_CV_FORM), templateId: "modern", formatting: { themeColor: "#000" }, labels };

  it("is the same for the same CV and changes when the CV does", () => {
    expect(builtCvHash(base)).toBe(builtCvHash({ ...base }));
    expect(builtCvHash(base)).toMatch(/^[0-9a-f]{8,64}$/);
    expect(builtCvHash({ ...base, templateId: "classic" })).not.toBe(builtCvHash(base));
    expect(builtCvHash({ ...base, data: { ...base.data, headline: "New" } })).not.toBe(builtCvHash(base));
  });

  it("ignores the signature on a signed photo link, which changes on every read", () => {
    const resigned = { ...base, data: { ...base.data, photo: "https://cdn/avatars/a.png?X-Amz-Signature=two" } };
    expect(builtCvHash(resigned)).toBe(builtCvHash(base));
  });
});

describe("ensureBuiltCvDocument", () => {
  const renderPdf = jest.fn(async (_input: BuiltCvRenderInput) => new Blob(["%PDF-1.4"], { type: "application/pdf" }));
  const upload = jest.fn(async (_file: File, builtHash: string): Promise<BuiltCvDocument> => ({
    id: "new-built", name: _file.name, category: "resume", url: "https://cdn/documents/built.pdf", builtHash,
  }));
  const loadProfile = jest.fn(async () => profile);
  // By default the server's documents are what the dialog was given.
  const deps = { renderPdf, upload, loadProfile, loadDocuments: async () => null };

  beforeEach(() => jest.clearAllMocks());

  it("makes the PDF from the saved design and stores it as a resume", async () => {
    const doc = await ensureBuiltCvDocument({ identity, labels, documents: [] }, deps);

    expect(renderPdf).toHaveBeenCalledTimes(1);
    const rendered = renderPdf.mock.calls[0][0];
    expect(rendered.templateId).toBe("modern");
    expect(rendered.data.fullName).toBe("Antony Varghese");
    // Hidden in the builder, so not in the CV that is sent.
    expect(rendered.data.certifications).toEqual([]);

    const [file, hash] = upload.mock.calls[0];
    expect(file.name).toBe("Antony Varghese - Mployedin CV.pdf");
    expect(file.type).toBe("application/pdf");
    expect(doc).toMatchObject({ id: "new-built", builtHash: hash });
  });

  it("reuses the stored file while the CV has not changed", async () => {
    const first = await ensureBuiltCvDocument({ identity, labels, documents: [] }, deps);
    jest.clearAllMocks();

    const again = await ensureBuiltCvDocument({ identity, labels, documents: [first] }, deps);
    expect(again.id).toBe("new-built");
    expect(renderPdf).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it("makes a new file once the profile changes", async () => {
    const first = await ensureBuiltCvDocument({ identity, labels, documents: [] }, deps);
    jest.clearAllMocks();
    loadProfile.mockResolvedValueOnce({ ...profile, summary: "Now a project manager." });

    await ensureBuiltCvDocument({ identity, labels, documents: [first] }, deps);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0][1]).not.toBe(first.builtHash);
  });

  it("does not reuse a copy that was deleted since the dialog opened", async () => {
    const first = await ensureBuiltCvDocument({ identity, labels, documents: [] }, deps);
    jest.clearAllMocks();

    // The dialog still holds `first`; the documents on the server no longer do.
    const fresh = await ensureBuiltCvDocument(
      { identity, labels, documents: [first] },
      { ...deps, loadDocuments: async () => [] },
    );
    expect(upload).toHaveBeenCalledTimes(1);
    expect(fresh.builtHash).toBe(first.builtHash);
  });

  it("falls back to the dialog's list when the documents cannot be re-read", async () => {
    const first = await ensureBuiltCvDocument({ identity, labels, documents: [] }, deps);
    jest.clearAllMocks();

    const again = await ensureBuiltCvDocument(
      { identity, labels, documents: [first] },
      { ...deps, loadDocuments: async () => null },
    );
    expect(again.id).toBe(first.id);
    expect(upload).not.toHaveBeenCalled();
  });

  it("fails clearly when there is no profile to build from", async () => {
    loadProfile.mockResolvedValueOnce(null as never);
    await expect(ensureBuiltCvDocument({ identity, labels, documents: [] }, deps)).rejects.toBeInstanceOf(BuiltCvError);
    expect(upload).not.toHaveBeenCalled();
  });
});
