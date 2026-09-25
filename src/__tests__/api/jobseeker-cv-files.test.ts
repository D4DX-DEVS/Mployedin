/**
 * @jest-environment node
 *
 * CV uploads are recorded and queued for reading, and replacing or deleting a
 * file goes through releaseSeekerFile — which keeps any file an application
 * was sent with (lib/cv/cvDocuments.ts). The routes used to delete it
 * outright, breaking the employer's "View CV" on earlier applications.
 */
import { NextRequest } from "next/server";

const USER_ID = "64e000000000000000000001";
const SEEKER_ID = "64e0000000000000000000aa";

jest.mock("@/lib/db/mongoose", () => {
  const connectDB = jest.fn().mockResolvedValue(undefined);
  return { __esModule: true, default: connectDB, connectDB };
});
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) =>
    (req: NextRequest) => handler(req, { userId: USER_ID, role: "job_seeker", locale: "en" }),
}));
jest.mock("@/lib/audit/log", () => ({ actorFromCtx: jest.fn(() => ({})), logActivity: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));
jest.mock("@/lib/security/file-validation", () => ({ validateUploadedFile: jest.fn(() => null) }));

let form: FormData;
jest.mock("@/lib/storage/uploadErrors", () => ({
  readUploadForm: jest.fn(async () => form),
  uploadErrorResponse: jest.fn(),
}));
const uploadFile = jest.fn();
const deleteFile = jest.fn();
jest.mock("@/lib/storage/spaces", () => ({
  uploadFile: (...a: unknown[]) => uploadFile(...a),
  deleteFile: (...a: unknown[]) => deleteFile(...a),
}));

const registerCvDocument = jest.fn().mockResolvedValue({ id: "cv1", status: "uploaded" });
const releaseSeekerFile = jest.fn().mockResolvedValue(false);
const cvStatusesFor = jest.fn();
jest.mock("@/lib/cv/cvDocuments", () => ({
  registerCvDocument: (...a: unknown[]) => registerCvDocument(...a),
  releaseSeekerFile: (...a: unknown[]) => releaseSeekerFile(...a),
  cvStatusesFor: (...a: unknown[]) => cvStatusesFor(...a),
}));

let seekerDoc: Record<string, unknown>;
const seekerUpdateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });
jest.mock("@/models/JobSeeker", () => {
  const findOne = jest.fn(() => {
    const q = Promise.resolve(seekerDoc) as Promise<unknown> & { select: () => unknown; lean: () => unknown };
    q.select = () => q;
    q.lean = () => Promise.resolve(seekerDoc);
    return q;
  });
  return { __esModule: true, default: { findOne, updateOne: (...a: unknown[]) => seekerUpdateOne(...a) } };
});

const pdf = (name = "Antony_CV.pdf") => new File([Buffer.from("%PDF-1.4 antony")], name, { type: "application/pdf" });

beforeEach(() => {
  jest.clearAllMocks();
  seekerDoc = {
    _id: SEEKER_ID,
    cv: { originalUrl: "https://cdn/cvs/january.pdf" },
    documents: [
      { id: "d1", name: "Resume.pdf", category: "resume", url: "https://cdn/documents/resume.pdf", size: 10 },
      { id: "d2", name: "Degree.pdf", category: "college_certificate", url: "https://cdn/documents/degree.pdf", size: 10 },
    ],
  };
});

describe("POST /api/job-seeker/cv", () => {
  it("records the new CV for reading and keeps the old one if an application used it", async () => {
    form = new FormData();
    form.append("cv", pdf());
    uploadFile.mockResolvedValue({ url: "https://cdn/cvs/march.pdf" });
    const { POST } = await import("@/app/api/job-seeker/cv/route");
    const res = await POST(new NextRequest("http://localhost/api/job-seeker/cv", { method: "POST" }), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);

    const [, update] = seekerUpdateOne.mock.calls[0];
    expect(update.$set).toEqual({ "cv.originalUrl": "https://cdn/cvs/march.pdf" });
    // Nothing is parsed yet: the reader sets the text and parsedAt.
    expect(update.$unset).toMatchObject({ "cv.rawText": "", "cv.parsedAt": "" });

    expect(registerCvDocument).toHaveBeenCalledWith(expect.objectContaining({
      jobSeekerId: SEEKER_ID,
      fileUrl: "https://cdn/cvs/march.pdf",
      fileName: "Antony_CV.pdf",
      mimeType: "application/pdf",
      source: "profile",
      fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
    }));
    expect(releaseSeekerFile).toHaveBeenCalledWith(SEEKER_ID, "https://cdn/cvs/january.pdf");
    expect(deleteFile).not.toHaveBeenCalled();
  });
});

describe("/api/job-seeker/documents", () => {
  it("records an uploaded resume for reading, but not a certificate", async () => {
    const { POST } = await import("@/app/api/job-seeker/documents/route");
    uploadFile.mockResolvedValue({ url: "https://cdn/documents/new-resume.pdf" });

    form = new FormData();
    form.append("file", pdf("New_Resume.pdf"));
    form.append("category", "resume");
    const res = await POST(new NextRequest("http://localhost/api/job-seeker/documents", { method: "POST" }), { params: Promise.resolve({}) });
    const body = await res.json();
    expect(body.document).toMatchObject({ name: "New_Resume.pdf", category: "resume", cvStatus: "uploaded" });
    expect(registerCvDocument).toHaveBeenCalledWith(expect.objectContaining({ fileUrl: "https://cdn/documents/new-resume.pdf", source: "document" }));

    registerCvDocument.mockClear();
    form = new FormData();
    form.append("file", pdf("Degree.pdf"));
    form.append("category", "college_certificate");
    const cert = await POST(new NextRequest("http://localhost/api/job-seeker/documents", { method: "POST" }), { params: Promise.resolve({}) });
    expect((await cert.json()).document).not.toHaveProperty("cvStatus");
    expect(registerCvDocument).not.toHaveBeenCalled();
  });

  it("removes a document through releaseSeekerFile, never a bare delete", async () => {
    const { DELETE } = await import("@/app/api/job-seeker/documents/route");
    const res = await DELETE(new NextRequest("http://localhost/api/job-seeker/documents?id=d1", { method: "DELETE" }), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    expect(releaseSeekerFile).toHaveBeenCalledWith(SEEKER_ID, "https://cdn/documents/resume.pdf");
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it("lists whether each resume and the profile CV have been read", async () => {
    cvStatusesFor.mockResolvedValue(new Map([["https://cdn/cvs/january.pdf", { status: "failed", error: "unreadable" }]]));
    const { GET } = await import("@/app/api/job-seeker/documents/route");
    const res = await GET(new NextRequest("http://localhost/api/job-seeker/documents"), { params: Promise.resolve({}) });
    const body = await res.json();
    expect(cvStatusesFor).toHaveBeenCalledWith(SEEKER_ID, ["https://cdn/documents/resume.pdf", "https://cdn/cvs/january.pdf"]);
    // No record yet: waiting to be read.
    expect(body.documents[0]).toMatchObject({ id: "d1", cvStatus: "uploaded" });
    expect(body.documents[1]).not.toHaveProperty("cvStatus");
    expect(body.profileCv).toEqual({ cvStatus: "failed" });
  });
});
