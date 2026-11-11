/**
 * @jest-environment node
 *
 * One rule decides which CV an application carries (lib/applications/cvChoice.ts).
 * The two apply screens used to preselect different CVs, and the file pickers
 * offered a format (.doc) every upload route refused.
 */
import fs from "node:fs";
import path from "node:path";
import {
  BUILT_CV_KEY,
  CV_UPLOAD_ACCEPT,
  CV_UPLOAD_MIME_TYPES,
  PROFILE_CV_KEY,
  defaultApplicationCv,
  defaultCvKey,
  isAcceptedCvFile,
  uploadedResumes,
} from "@/lib/applications/cvChoice";
import { ALLOWED_FILE_TYPES } from "@/lib/security/file-validation";

const older = { id: "d1", name: "Old.pdf", category: "resume", url: "https://cdn/documents/old.pdf" };
const newer = { id: "d2", name: "New.pdf", category: "resume", url: "https://cdn/documents/new.pdf" };
const built = { id: "b1", name: "Antony - Mployedin CV.pdf", category: "resume", url: "https://cdn/documents/built.pdf", builtHash: "aaaaaaaaaaaaaa" };
const degree = { id: "c1", name: "Degree.pdf", category: "college_certificate", url: "https://cdn/documents/degree.pdf" };

describe("defaultCvKey — what an apply screen preselects", () => {
  it("is the Profile CV when there is one, whatever else exists", () => {
    expect(defaultCvKey({ documents: [older, newer, built], hasProfileCv: true, hasBuiltCv: true })).toBe(PROFILE_CV_KEY);
  });

  it("is otherwise the resume uploaded most recently, never a certificate or the stored built copy", () => {
    expect(defaultCvKey({ documents: [older, newer, degree, built], hasProfileCv: false, hasBuiltCv: true })).toBe("d2");
  });

  it("is the built CV only when nothing was uploaded", () => {
    expect(defaultCvKey({ documents: [degree, built], hasProfileCv: false, hasBuiltCv: true })).toBe(BUILT_CV_KEY);
  });

  it("is empty when the seeker has no CV", () => {
    expect(defaultCvKey({ documents: [degree], hasProfileCv: false, hasBuiltCv: false })).toBe("");
    expect(defaultCvKey({ documents: null, hasProfileCv: false, hasBuiltCv: false })).toBe("");
  });
});

describe("defaultApplicationCv — what is attached when the seeker chose nothing", () => {
  it("follows the same order and attaches exactly one CV", () => {
    expect(defaultApplicationCv({ cv: { originalUrl: "https://cdn/cvs/profile.pdf" }, documents: [older, newer, built] }))
      .toEqual([{ name: "CV", url: "https://cdn/cvs/profile.pdf", type: "resume" }]);
    expect(defaultApplicationCv({ documents: [older, newer, degree, built] }))
      .toEqual([{ name: "New.pdf", url: "https://cdn/documents/new.pdf", type: "resume" }]);
    expect(defaultApplicationCv({ documents: [degree, built] }))
      .toEqual([{ name: "Antony - Mployedin CV.pdf", url: "https://cdn/documents/built.pdf", type: "resume" }]);
  });

  it("attaches nothing when there is no CV file — never a certificate", () => {
    expect(defaultApplicationCv({ documents: [degree] })).toEqual([]);
    expect(defaultApplicationCv(null)).toEqual([]);
  });

  it("reads legacy documents that carry `type` instead of `category`", () => {
    expect(defaultApplicationCv({ documents: [{ name: "Legacy.pdf", type: "resume", url: "https://cdn/documents/legacy.pdf" }] }))
      .toEqual([{ name: "Legacy.pdf", url: "https://cdn/documents/legacy.pdf", type: "resume" }]);
  });
});

describe("uploadedResumes", () => {
  it("lists the seeker's own resumes, not the stored built copy", () => {
    expect(uploadedResumes([older, built, degree, newer]).map((d) => d.id)).toEqual(["d1", "d2"]);
  });
});

describe("accepted CV files — pickers and routes agree", () => {
  it("is the list the upload validation enforces", () => {
    expect([...CV_UPLOAD_MIME_TYPES].sort()).toEqual([...ALLOWED_FILE_TYPES.cv].sort());
  });

  it("takes PDF, DOCX and images, and refuses legacy .doc", () => {
    expect(isAcceptedCvFile({ name: "cv.pdf", type: "application/pdf" })).toBe(true);
    expect(isAcceptedCvFile({ name: "cv.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })).toBe(true);
    expect(isAcceptedCvFile({ name: "cv.png", type: "image/png" })).toBe(true);
    expect(isAcceptedCvFile({ name: "cv.doc", type: "application/msword" })).toBe(false);
    // Some browsers report no type: the extension decides.
    expect(isAcceptedCvFile({ name: "CV.DOCX", type: "" })).toBe(true);
    expect(isAcceptedCvFile({ name: "cv.doc", type: "" })).toBe(false);
  });

  it("offers no legacy .doc in any CV file picker", () => {
    expect(CV_UPLOAD_ACCEPT.split(",")).not.toContain(".doc");
    const root = path.resolve(__dirname, "../../..");
    for (const rel of [
      "src/components/features/job-seeker/feed/EasyApplyFlowDialog.tsx",
      "src/components/features/public/EasyApply.tsx",
    ]) {
      const src = fs.readFileSync(path.join(root, rel), "utf8");
      expect(src).not.toMatch(/accept="[^"]*\.doc[,"]/);
      expect(src).toContain("CV_UPLOAD_ACCEPT");
    }
  });

  it("has the documents route enforce the shared list", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../..", "src/app/api/job-seeker/documents/route.ts"), "utf8");
    expect(src).toContain("CV_UPLOAD_MIME_TYPES");
  });
});
