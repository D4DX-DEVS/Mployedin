/**
 * @jest-environment node
 *
 * Which stored file is "the original CV": one rule for the CV route (what it
 * streams) and the export manifest (whether there is one, and whether it is
 * itself a Mployedin-built PDF).
 */
jest.mock("@/lib/storage/spaces", () => ({
  // Our storage in this test; anything else is a link to another site.
  isStoredFileUrl: (url: string) => url.startsWith("https://cdn/"),
}));

import { resolveOriginalCvSource } from "@/lib/cv/originalCvSource";

const PROFILE_CV = "https://cdn/cvs/profile.pdf";
const SENT_CV = "https://cdn/documents/sent.pdf";
const BUILT_COPY = "https://cdn/documents/built.pdf";

describe("without an application (staff views, talent pool)", () => {
  it("is the Profile CV", () => {
    expect(resolveOriginalCvSource({ cv: { originalUrl: PROFILE_CV }, documents: [] }, null)).toEqual({
      url: PROFILE_CV,
      isBuilt: false,
    });
  });

  it("is the first resume document when there is no Profile CV", () => {
    const seeker = {
      documents: [
        { category: "other", url: "https://cdn/documents/cert.pdf" },
        { category: "resume", url: "https://cdn/documents/upload.pdf" },
      ],
    };
    expect(resolveOriginalCvSource(seeker, null)).toEqual({ url: "https://cdn/documents/upload.pdf", isBuilt: false });
  });

  it("ignores an application a staff view does not have, and a resume document without a file", () => {
    expect(resolveOriginalCvSource({ documents: [{ category: "resume", url: "" }] }, null)).toEqual({
      url: null,
      isBuilt: false,
    });
  });

  it("is nothing for a seeker with no CV on file", () => {
    expect(resolveOriginalCvSource({}, null)).toEqual({ url: null, isBuilt: false });
  });

  it("is built when the file is the stored copy of the CV built on Mployedin", () => {
    const seeker = { documents: [{ category: "resume", url: BUILT_COPY, builtHash: "abc" }] };
    expect(resolveOriginalCvSource(seeker, null)).toEqual({ url: BUILT_COPY, isBuilt: true });
  });
});

describe("with an application", () => {
  const seeker = { cv: { originalUrl: PROFILE_CV }, documents: [] };

  it("is the resume sent with the application, not the Profile CV", () => {
    const application = { documents: [{ name: "Tailored CV.pdf", url: SENT_CV, type: "resume" }] };
    expect(resolveOriginalCvSource(seeker, application)).toEqual({ url: SENT_CV, isBuilt: false });
  });

  it("falls back to the Profile CV for an application sent with none", () => {
    expect(resolveOriginalCvSource(seeker, { documents: [] })).toEqual({ url: PROFILE_CV, isBuilt: false });
  });

  it("does not serve a 'resume' that is a link to another site", () => {
    const application = { documents: [{ name: "Site", url: "https://behance.net/sara", type: "resume" }] };
    expect(resolveOriginalCvSource(seeker, application)).toEqual({ url: PROFILE_CV, isBuilt: false });
  });

  it("is built when the application was sent with the stored built copy", () => {
    const withBuilt = { ...seeker, documents: [{ category: "resume", url: BUILT_COPY, builtHash: "abc" }] };
    const application = { documents: [{ name: "Sara - Mployedin CV.pdf", url: BUILT_COPY, type: "resume" }] };
    expect(resolveOriginalCvSource(withBuilt, application)).toEqual({ url: BUILT_COPY, isBuilt: true });
  });

  it("is still built after the seeker's stored built copy was replaced: the sent file keeps its name", () => {
    const application = { documents: [{ name: "Sara Ali - Mployedin CV.pdf", url: SENT_CV, type: "resume" }] };
    expect(resolveOriginalCvSource(seeker, application)).toEqual({ url: SENT_CV, isBuilt: true });
  });

  it("is not built for a file the seeker uploaded, whatever the other documents are", () => {
    const withBuilt = { ...seeker, documents: [{ category: "resume", url: BUILT_COPY, builtHash: "abc" }] };
    const application = { documents: [{ name: "Tailored CV.pdf", url: SENT_CV, type: "resume" }] };
    expect(resolveOriginalCvSource(withBuilt, application)).toEqual({ url: SENT_CV, isBuilt: false });
  });

  it("is not built when the Profile CV is served because nothing was sent", () => {
    const application = { documents: [{ name: "Sara - Mployedin CV.pdf", url: "https://behance.net/x", type: "portfolio" }] };
    expect(resolveOriginalCvSource(seeker, application)).toEqual({ url: PROFILE_CV, isBuilt: false });
  });

  it("is nothing for an application sent with no CV when the seeker has none either", () => {
    expect(resolveOriginalCvSource({}, { documents: [] })).toEqual({ url: null, isBuilt: false });
  });
});
