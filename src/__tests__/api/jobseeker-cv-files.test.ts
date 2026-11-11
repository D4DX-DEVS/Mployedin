/**
 * @jest-environment node
 *
 * CV uploads are recorded and queued for reading, and replacing or deleting a
 * file goes through releaseSeekerFile — which keeps any file an application
 * was sent with (lib/cv/cvDocuments.ts). The routes used to delete it
 * outright, breaking the employer's "View CV" on earlier applications.
 */
import { NextRequest, NextResponse } from "next/server";

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

const limitCvUpload = jest.fn();
jest.mock("@/lib/cv/uploadLimit", () => ({ limitCvUpload: (...a: unknown[]) => limitCvUpload(...a) }));

let seekerDoc: Record<string, unknown>;
const seekerUpdateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });
// Atomic removals (lib/cv/fileClaims.ts) return the record as it was.
const seekerFindOneAndUpdate = jest.fn(async () => seekerDoc);
jest.mock("@/models/JobSeeker", () => {
  const findOne = jest.fn(() => {
    const q = Promise.resolve(seekerDoc) as Promise<unknown> & { select: () => unknown; lean: () => unknown };
    q.select = () => q;
    q.lean = () => Promise.resolve(seekerDoc);
    return q;
  });
  return {
    __esModule: true,
    default: {
      findOne,
      updateOne: (...a: unknown[]) => seekerUpdateOne(...a),
      findOneAndUpdate: (...a: unknown[]) => ({ lean: () => seekerFindOneAndUpdate(...(a as [])) }),
    },
  };
});

const pdf = (name = "Antony_CV.pdf") => new File([Buffer.from("%PDF-1.4 antony")], name, { type: "application/pdf" });

beforeEach(() => {
  jest.clearAllMocks();
  limitCvUpload.mockResolvedValue(null);
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

    // One atomic swap, read as it was (lib/cv/fileClaims.ts).
    const [, update, options] = seekerFindOneAndUpdate.mock.calls[0] as unknown as [unknown, { $set: unknown; $unset: unknown }, { new: boolean }];
    expect(update.$set).toEqual({ "cv.originalUrl": "https://cdn/cvs/march.pdf" });
    // Nothing is parsed yet: the reader sets the text and parsedAt.
    expect(update.$unset).toMatchObject({ "cv.rawText": "", "cv.parsedAt": "", "cv.attachedAt": "" });
    expect(options).toMatchObject({ new: false });

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

  it("stops a CV over the upload limit before it is stored or recorded", async () => {
    limitCvUpload.mockResolvedValue(NextResponse.json({ error: "slow down" }, { status: 429 }));
    form = new FormData();
    form.append("cv", pdf());
    const { POST } = await import("@/app/api/job-seeker/cv/route");
    const res = await POST(new NextRequest("http://localhost/api/job-seeker/cv", { method: "POST" }), { params: Promise.resolve({}) });
    expect(res.status).toBe(429);
    expect(limitCvUpload).toHaveBeenCalledWith(expect.objectContaining({ jobSeekerId: SEEKER_ID, fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/) }));
    expect(uploadFile).not.toHaveBeenCalled();
    expect(registerCvDocument).not.toHaveBeenCalled();
    expect(seekerUpdateOne).not.toHaveBeenCalled();
    expect(seekerFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("keeps the old Profile CV when an application is being saved with it right now", async () => {
    seekerDoc.cv = { originalUrl: "https://cdn/cvs/january.pdf", attachedAt: new Date() };
    form = new FormData();
    form.append("cv", pdf());
    uploadFile.mockResolvedValue({ url: "https://cdn/cvs/march.pdf" });
    const { POST } = await import("@/app/api/job-seeker/cv/route");
    const res = await POST(new NextRequest("http://localhost/api/job-seeker/cv", { method: "POST" }), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    expect(releaseSeekerFile).not.toHaveBeenCalled();
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
    // Only the resume counted toward the CV upload limit.
    expect(limitCvUpload).toHaveBeenCalledTimes(1);
  });

  it("stops a resume over the upload limit before it is stored", async () => {
    limitCvUpload.mockResolvedValue(NextResponse.json({ error: "slow down" }, { status: 429 }));
    const { POST } = await import("@/app/api/job-seeker/documents/route");
    form = new FormData();
    form.append("file", pdf("New_Resume.pdf"));
    form.append("category", "resume");
    const res = await POST(new NextRequest("http://localhost/api/job-seeker/documents", { method: "POST" }), { params: Promise.resolve({}) });
    expect(res.status).toBe(429);
    expect(uploadFile).not.toHaveBeenCalled();
    expect(seekerUpdateOne).not.toHaveBeenCalled();
  });

  it("keeps one CV built on Mployedin: a new one replaces the last", async () => {
    (seekerDoc.documents as unknown[]).push(
      { id: "b1", name: "Antony - Mployedin CV.pdf", category: "resume", url: "https://cdn/documents/built-old.pdf", size: 10, builtHash: "aaaaaaaaaaaaaa" },
    );
    const { POST } = await import("@/app/api/job-seeker/documents/route");
    uploadFile.mockResolvedValue({ url: "https://cdn/documents/built-new.pdf" });

    form = new FormData();
    form.append("file", pdf("Antony - Mployedin CV.pdf"));
    form.append("category", "resume");
    form.append("builtHash", "bbbbbbbbbbbbbb");
    const res = await POST(new NextRequest("http://localhost/api/job-seeker/documents", { method: "POST" }), { params: Promise.resolve({}) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.document).toMatchObject({ category: "resume", builtHash: "bbbbbbbbbbbbbb" });

    const pushed = seekerUpdateOne.mock.calls.find(([, u]) => u.$push)?.[1];
    expect(pushed.$push.documents).toMatchObject({ builtHash: "bbbbbbbbbbbbbb", url: "https://cdn/documents/built-new.pdf" });
    const pulled = (seekerFindOneAndUpdate.mock.calls[0] as unknown as [unknown, { $pull: unknown }])[1];
    expect(pulled.$pull).toEqual({ documents: { id: { $in: ["b1"] } } });
    // Through releaseSeekerFile: an employer who received the old one keeps it.
    expect(releaseSeekerFile).toHaveBeenCalledWith(SEEKER_ID, "https://cdn/documents/built-old.pdf");
    // The seeker's own uploads are untouched.
    expect(releaseSeekerFile).not.toHaveBeenCalledWith(SEEKER_ID, "https://cdn/documents/resume.pdf");
  });

  /**
   * Two applications sent at the same moment (two tabs) each store a built
   * copy. Clearing the other tab's copy at once deleted a file whose
   * application was still being created — it then pointed at nothing.
   */
  it("leaves a built CV stored moments ago alone, and clears one that has settled", async () => {
    (seekerDoc.documents as unknown[]).push(
      { id: "old", name: "Antony - Mployedin CV.pdf", category: "resume", url: "https://cdn/documents/built-yesterday.pdf", size: 10, builtHash: "aaaaaaaaaaaaaa", uploadedAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      { id: "other-tab", name: "Antony - Mployedin CV.pdf", category: "resume", url: "https://cdn/documents/built-just-now.pdf", size: 10, builtHash: "cccccccccccccc", uploadedAt: new Date(Date.now() - 5_000) },
    );
    const { POST } = await import("@/app/api/job-seeker/documents/route");
    uploadFile.mockResolvedValue({ url: "https://cdn/documents/built-new.pdf" });

    form = new FormData();
    form.append("file", pdf("Antony - Mployedin CV.pdf"));
    form.append("category", "resume");
    form.append("builtHash", "bbbbbbbbbbbbbb");
    const res = await POST(new NextRequest("http://localhost/api/job-seeker/documents", { method: "POST" }), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);

    const pulled = (seekerFindOneAndUpdate.mock.calls[0] as unknown as [unknown, { $pull: unknown }])[1];
    expect(pulled.$pull).toEqual({ documents: { id: { $in: ["old"] } } });
    expect(releaseSeekerFile).toHaveBeenCalledWith(SEEKER_ID, "https://cdn/documents/built-yesterday.pdf");
    expect(releaseSeekerFile).not.toHaveBeenCalledWith(SEEKER_ID, "https://cdn/documents/built-just-now.pdf");
  });

  /**
   * The race that was left: one tab applies with a settled built copy while
   * another stores a new one, which clears the settled copy. The application
   * had claimed the copy, so its file stays.
   */
  it("keeps a settled built CV an application is being saved with right now", async () => {
    (seekerDoc.documents as unknown[]).push(
      { id: "b1", name: "Antony - Mployedin CV.pdf", category: "resume", url: "https://cdn/documents/built-old.pdf", size: 10, builtHash: "aaaaaaaaaaaaaa", uploadedAt: new Date(Date.now() - 24 * 60 * 60 * 1000), attachedAt: new Date() },
    );
    const { POST } = await import("@/app/api/job-seeker/documents/route");
    uploadFile.mockResolvedValue({ url: "https://cdn/documents/built-new.pdf" });
    form = new FormData();
    form.append("file", pdf("Antony - Mployedin CV.pdf"));
    form.append("category", "resume");
    form.append("builtHash", "bbbbbbbbbbbbbb");
    const res = await POST(new NextRequest("http://localhost/api/job-seeker/documents", { method: "POST" }), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    // Off the list (one built CV), but its file is not released.
    expect((seekerFindOneAndUpdate.mock.calls[0] as unknown as [unknown, { $pull: unknown }])[1].$pull).toEqual({ documents: { id: { $in: ["b1"] } } });
    expect(releaseSeekerFile).not.toHaveBeenCalled();
  });

  it("does not count the built CV against the seeker's 20 documents", async () => {
    const own = Array.from({ length: 19 }, (_, i) => ({ id: `o${i}`, name: `Doc ${i}.pdf`, category: "other", url: `https://cdn/documents/o${i}.pdf`, size: 1 }));
    seekerDoc.documents = [
      ...own,
      { id: "b1", name: "Antony - Mployedin CV.pdf", category: "resume", url: "https://cdn/documents/built.pdf", size: 1, builtHash: "aaaaaaaaaaaaaa" },
    ];
    const { POST } = await import("@/app/api/job-seeker/documents/route");
    uploadFile.mockResolvedValue({ url: "https://cdn/documents/twentieth.pdf" });

    // 19 of their own files: the 20th still fits, the stored built CV aside.
    form = new FormData();
    form.append("file", pdf("Twentieth.pdf"));
    form.append("category", "other");
    const res = await POST(new NextRequest("http://localhost/api/job-seeker/documents", { method: "POST" }), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);

    (seekerDoc.documents as unknown[]).push({ id: "o19", name: "Doc 19.pdf", category: "other", url: "https://cdn/documents/o19.pdf", size: 1 });
    form = new FormData();
    form.append("file", pdf("TwentyFirst.pdf"));
    form.append("category", "other");
    const over = await POST(new NextRequest("http://localhost/api/job-seeker/documents", { method: "POST" }), { params: Promise.resolve({}) });
    expect(over.status).toBe(400);
  });

  it("still stores the new built CV when clearing out the old one fails", async () => {
    (seekerDoc.documents as unknown[]).push(
      { id: "b1", name: "Antony - Mployedin CV.pdf", category: "resume", url: "https://cdn/documents/built-old.pdf", size: 10, builtHash: "aaaaaaaaaaaaaa" },
    );
    releaseSeekerFile.mockRejectedValueOnce(new Error("storage down"));
    const { POST } = await import("@/app/api/job-seeker/documents/route");
    uploadFile.mockResolvedValue({ url: "https://cdn/documents/built-new.pdf" });

    form = new FormData();
    form.append("file", pdf("Antony - Mployedin CV.pdf"));
    form.append("category", "resume");
    form.append("builtHash", "bbbbbbbbbbbbbb");
    const res = await POST(new NextRequest("http://localhost/api/job-seeker/documents", { method: "POST" }), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    expect((await res.json()).document).toMatchObject({ builtHash: "bbbbbbbbbbbbbb" });
    // Recorded for reading all the same.
    expect(registerCvDocument).toHaveBeenCalledWith(expect.objectContaining({ fileUrl: "https://cdn/documents/built-new.pdf" }));
  });

  it("refuses a built-CV marker that is malformed or on a non-resume", async () => {
    const { POST } = await import("@/app/api/job-seeker/documents/route");
    for (const [category, builtHash] of [["resume", "not a hash!"], ["other", "bbbbbbbbbbbbbb"]]) {
      form = new FormData();
      form.append("file", pdf("x.pdf"));
      form.append("category", category);
      form.append("builtHash", builtHash);
      const res = await POST(new NextRequest("http://localhost/api/job-seeker/documents", { method: "POST" }), { params: Promise.resolve({}) });
      expect(res.status).toBe(400);
    }
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it("removes a document through releaseSeekerFile, never a bare delete", async () => {
    const { DELETE } = await import("@/app/api/job-seeker/documents/route");
    const res = await DELETE(new NextRequest("http://localhost/api/job-seeker/documents?id=d1", { method: "DELETE" }), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    expect(releaseSeekerFile).toHaveBeenCalledWith(SEEKER_ID, "https://cdn/documents/resume.pdf");
    expect(deleteFile).not.toHaveBeenCalled();
    // Off the record in the same write that reads it.
    expect((seekerFindOneAndUpdate.mock.calls[0] as unknown as [unknown, { $pull: unknown }])[1].$pull).toEqual({ documents: { id: { $in: ["d1"] } } });
  });

  it("keeps the file of a document deleted while an application is being saved with it", async () => {
    (seekerDoc.documents as Array<Record<string, unknown>>)[0].attachedAt = new Date();
    const { DELETE } = await import("@/app/api/job-seeker/documents/route");
    const res = await DELETE(new NextRequest("http://localhost/api/job-seeker/documents?id=d1", { method: "DELETE" }), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    expect(releaseSeekerFile).not.toHaveBeenCalled();
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

describe("GET /api/job-seeker/me", () => {
  it("tells the apply dialog whether a CV was built, and which file holds it", async () => {
    seekerDoc.cvDesign = { templateId: "modern" };
    (seekerDoc.documents as unknown[]).push(
      { id: "b1", name: "Antony - Mployedin CV.pdf", category: "resume", url: "https://cdn/documents/built.pdf", builtHash: "aaaaaaaaaaaaaa" },
    );
    const { GET } = await import("@/app/api/job-seeker/me/route");
    const res = await GET(new NextRequest("http://localhost/api/job-seeker/me"), { params: Promise.resolve({}) });
    const { jobSeeker } = await res.json();
    expect(jobSeeker.hasBuiltCv).toBe(true);
    expect(jobSeeker.documents.find((d: { id: string }) => d.id === "b1")).toMatchObject({ builtHash: "aaaaaaaaaaaaaa" });
    expect(jobSeeker.documents.find((d: { id: string }) => d.id === "d1")).not.toHaveProperty("builtHash");
  });

  it("offers no built CV to a seeker who never saved one in the builder", async () => {
    const { GET } = await import("@/app/api/job-seeker/me/route");
    const res = await GET(new NextRequest("http://localhost/api/job-seeker/me"), { params: Promise.resolve({}) });
    expect((await res.json()).jobSeeker.hasBuiltCv).toBe(false);
  });
});
