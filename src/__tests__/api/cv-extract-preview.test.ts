/**
 * @jest-environment node
 *
 * QA retest 2026-10-06 (BUG-01, P1): "Upload CV with AI" in the CV Builder
 * replaced the seeker's saved name, summary, skills (29 → 3), experience,
 * education and CV file the moment the file was read — before the form even
 * showed what had been extracted. `mode=preview` reads the file and returns the
 * reading only; the page saves when the seeker selects "Add to Profile".
 * Onboarding and Easy Apply still send no mode and keep the one-step fill.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/auth/config", () => ({
  auth: jest.fn().mockResolvedValue({ user: { id: "seeker_user_001", role: "job_seeker" } }),
}));
jest.mock("@/lib/subscription/featureGate", () => ({ enforceFeatureGate: jest.fn().mockResolvedValue(null) }));
jest.mock("@/lib/ai/dailyQuota", () => ({ enforceDailyAiQuota: jest.fn().mockResolvedValue(null) }));
jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
  RATE_LIMIT_CONFIGS: { upload: {} },
}));
jest.mock("@/lib/security/file-validation", () => ({ validateUploadedFile: jest.fn(() => null) }));
jest.mock("@/lib/security/malware-scan", () => ({ scanForMalware: jest.fn().mockResolvedValue({ clean: true }) }));
jest.mock("@/lib/db/mongoose", () => ({ __esModule: true, default: jest.fn(), connectDB: jest.fn() }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn() }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { warn: jest.fn(), error: jest.fn(), info: jest.fn() } }));
const extractResumeText = jest.fn();
jest.mock("@/lib/ats/analyzeCv", () => ({ extractResumeText: (...a: unknown[]) => extractResumeText(...a) }));
const ocrDocument = jest.fn();
jest.mock("@/lib/ai/visionOcr", () => ({
  ocrDocument: (...a: unknown[]) => ocrDocument(...a),
  // The real class, so the route's instanceof check sees the error this test throws.
  EmptyOcrError: jest.requireActual("@/lib/ai/visionOcr").EmptyOcrError,
}));

const uploadBuffer = jest.fn().mockResolvedValue({ url: "https://files/new-cv.pdf" });
jest.mock("@/lib/storage/spaces", () => ({ uploadBuffer: (...a: unknown[]) => uploadBuffer(...a) }));
const saveReadCv = jest.fn();
jest.mock("@/lib/cv/cvDocuments", () => ({ saveReadCv: (...a: unknown[]) => saveReadCv(...a) }));

const extracted = {
  fullName: "New Name",
  headline: "Cloud engineer",
  skills: [{ name: "AWS" }, { name: "Docker" }, { name: "Linux" }],
  experience: [{ jobTitle: "Engineer", company: "Acme", from: "2020-01", to: "present", current: true }],
};
const generateText = jest.fn();
jest.mock("@/lib/ai/gemini", () => ({
  generateText: (...args: unknown[]) => generateText(...args),
  GEMINI_MODELS: { flash: "flash" },
}));

const SCAN_TEXT = "New Name\nCloud engineer\nAWS, Docker, Linux\nEngineer at Acme, 2020 - present";
const LAYER_TEXT = "New Name — Cloud engineer. AWS, Docker, Linux. Engineer at Acme since 2020. ".repeat(4);

const findOneAndUpdate = jest.fn();
const updateOne = jest.fn();
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    // A seeker whose saved CV is a different file, so this is a fresh read.
    findOne: jest.fn(() => ({ lean: () => Promise.resolve({ _id: "js_1", cv: { contentHash: "other" }, profileCompleteness: 80 }) })),
    findOneAndUpdate: (...a: unknown[]) => findOneAndUpdate(...a),
    updateOne: (...a: unknown[]) => updateOne(...a),
  },
}));
const userUpdate = jest.fn();
// The account the CV is checked against: by default the CV's own person.
const account = { name: "New Name", email: "new.name@gmail.com" };
const findUserById = jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve(account) }) }));
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    findById: (...a: unknown[]) => (findUserById as (...x: unknown[]) => unknown)(...a),
    findByIdAndUpdate: (...a: unknown[]) => userUpdate(...a),
    updateOne: jest.fn(),
  },
}));
jest.mock("@/models/CvDocument", () => ({ __esModule: true, default: { findOne: jest.fn() } }));

import { POST } from "@/app/api/ai/cv-extract/route";
import { EmptyOcrError } from "@/lib/ai/visionOcr";

function upload(mode?: string, opts: { bytes?: string; confirmOwner?: boolean } = {}) {
  const form = new FormData();
  form.append("cv", new File([Buffer.from(opts.bytes ?? "%PDF-1.7 a new CV")], "cv.pdf", { type: "application/pdf" }));
  if (mode) form.append("mode", mode);
  if (opts.confirmOwner) form.append("confirmOwner", "1");
  return new NextRequest("http://localhost/api/ai/cv-extract", { method: "POST", body: form });
}

beforeEach(() => {
  jest.clearAllMocks();
  extractResumeText.mockResolvedValue({ text: "" });
  ocrDocument.mockResolvedValue(SCAN_TEXT);
  generateText.mockResolvedValue(JSON.stringify(extracted));
  findOneAndUpdate.mockResolvedValue({ _id: "js_1", toObject: () => ({}) });
});

describe("cv-extract mode=preview", () => {
  it("returns the reading and writes nothing: no profile, no account name, no stored file", async () => {
    const res = await POST(upload("preview"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, preview: true, extracted });
    expect(findOneAndUpdate).not.toHaveBeenCalled();
    expect(updateOne).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
    expect(uploadBuffer).not.toHaveBeenCalled();
    expect(saveReadCv).not.toHaveBeenCalled();
  });

  it("without a mode still fills the profile in one step (onboarding, Easy Apply)", async () => {
    const body = await (await POST(upload())).json();

    expect(body.preview).toBeUndefined();
    expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(userUpdate).toHaveBeenCalledWith("seeker_user_001", { name: "New Name" }, expect.anything());
  });
});

describe("cv-extract reading", () => {
  it("parses a PDF's own text and never pays for OCR when the text layer is there", async () => {
    extractResumeText.mockResolvedValue({ text: LAYER_TEXT });
    await POST(upload("preview"));

    expect(ocrDocument).not.toHaveBeenCalled();
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(generateText.mock.calls[0][0]).toContain(`CV text:\n${LAYER_TEXT}`);
    // JSON mode: Qwen supports response_format json_object.
    expect(generateText.mock.calls[0][3]).toBe(true);
  });

  it("transcribes a scan, parses the transcription, and keeps it as the ATS text", async () => {
    await POST(upload());

    expect(ocrDocument).toHaveBeenCalledWith(expect.any(Buffer), "application/pdf");
    expect(generateText.mock.calls[0][0]).toContain(`CV text:\n${SCAN_TEXT}`);
    expect(findOneAndUpdate.mock.calls[0][1].$set["cv.rawText"]).toBe(SCAN_TEXT);
    expect(saveReadCv).toHaveBeenCalledWith(expect.objectContaining({ text: SCAN_TEXT, textSource: "ai_vision" }));
  });

  it("drops a malformed email and phone instead of passing them on", async () => {
    generateText.mockResolvedValue(JSON.stringify({ ...extracted, email: "new.name@gmail", phone: "20013" }));
    const body = await (await POST(upload("preview"))).json();

    expect(body.extracted.email).toBeUndefined();
    expect(body.extracted.phone).toBeUndefined();
  });

  it("joins an email OCR split apart", async () => {
    generateText.mockResolvedValue(JSON.stringify({ ...extracted, email: "new.name @ gmail . com", phone: "+971 50 123 4567" }));
    const body = await (await POST(upload("preview"))).json();

    expect(body.extracted.email).toBe("new.name@gmail.com");
    expect(body.extracted.phone).toBe("+971 50 123 4567");
  });
});

describe("cv-extract blank scan", () => {
  it("answers 422 for a scan that transcribes to nothing, and parses and saves nothing", async () => {
    ocrDocument.mockRejectedValue(new EmptyOcrError());
    // No mode: the one-step fill, which would otherwise write the profile.
    const res = await POST(upload());
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body).toEqual({
      error: "Couldn't read any text from this file. Try a clearer scan, or a PDF with selectable text.",
    });
    expect(generateText).not.toHaveBeenCalled();
    expect(findOneAndUpdate).not.toHaveBeenCalled();
    expect(updateOne).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
    expect(uploadBuffer).not.toHaveBeenCalled();
    expect(saveReadCv).not.toHaveBeenCalled();
  });

  it("parses a short text layer when the scan transcribes to nothing, instead of refusing the file", async () => {
    const SHORT_LAYER = "New Name\nCloud engineer\nnew.name@gmail.com";
    extractResumeText.mockResolvedValue({ text: SHORT_LAYER });
    ocrDocument.mockRejectedValue(new EmptyOcrError());
    const res = await POST(upload("preview"));

    expect(res.status).not.toBe(422);
    expect(res.status).toBe(200);
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(generateText.mock.calls[0][0]).toContain(`CV text:\n${SHORT_LAYER}`);
  });

  it("keeps the usual error answer when the transcription call itself fails", async () => {
    ocrDocument.mockRejectedValue(new Error("OpenRouter 502"));
    const res = await POST(upload());

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "CV extraction failed" });
    expect(generateText).not.toHaveBeenCalled();
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe("cv-extract owner check (someone else's CV)", () => {
  const friend = { ...extracted, fullName: "Rahul Sharma", email: "rahul@gmail.com" };
  beforeEach(() => {
    generateText.mockResolvedValue(JSON.stringify(friend));
    findUserById.mockImplementation(() => ({
      select: () => ({ lean: () => Promise.resolve({ name: "Ilyas Khan", email: "ilyas@example.com" }) }),
    }));
  });
  afterEach(() => {
    findUserById.mockImplementation(() => ({ select: () => ({ lean: () => Promise.resolve(account) }) }));
  });

  it("holds the one-step fill with a 409 and stores nothing", async () => {
    const res = await POST(upload(undefined, { bytes: "%PDF friend A" }));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body).toMatchObject({
      code: "cv_owner_mismatch",
      ownerMismatch: { cvName: "Rahul Sharma", accountName: "Ilyas Khan", cvEmail: "rahul@gmail.com" },
    });
    expect(findOneAndUpdate).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
    expect(saveReadCv).not.toHaveBeenCalled();
  });

  it("after 'It's my CV' saves the content, keeps the account's name, and reuses the held reading", async () => {
    await POST(upload(undefined, { bytes: "%PDF friend B" }));
    expect(generateText).toHaveBeenCalledTimes(1);

    const res = await POST(upload(undefined, { bytes: "%PDF friend B", confirmOwner: true }));
    expect(res.status).toBe(200);
    expect(generateText).toHaveBeenCalledTimes(1); // not read twice
    expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(findOneAndUpdate.mock.calls[0][1].$set.fullName).toBeUndefined();
    expect(findOneAndUpdate.mock.calls[0][1].$set.skills).toHaveLength(3);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("a confirmed upload with no held reading reads the file again", async () => {
    const res = await POST(upload(undefined, { bytes: "%PDF friend C", confirmOwner: true }));
    expect(res.status).toBe(200);
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it("preview answers with the mismatch and still writes nothing", async () => {
    const body = await (await POST(upload("preview", { bytes: "%PDF friend D" }))).json();
    expect(body.ownerMismatch).toMatchObject({ cvName: "Rahul Sharma", accountName: "Ilyas Khan" });
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("does not flag the seeker's own CV", async () => {
    generateText.mockResolvedValue(JSON.stringify({ ...extracted, fullName: "Ilyas Ahmed Khan" }));
    const res = await POST(upload(undefined, { bytes: "%PDF own" }));
    expect(res.status).toBe(200);
    expect(userUpdate).toHaveBeenCalledWith("seeker_user_001", { name: "Ilyas Ahmed Khan" }, expect.anything());
  });
});
