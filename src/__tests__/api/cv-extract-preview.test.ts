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
jest.mock("@/lib/ats/analyzeCv", () => ({ extractResumeText: jest.fn().mockResolvedValue({ text: "" }) }));

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
const generateMultimodal = jest.fn();
jest.mock("@/lib/ai/gemini", () => ({
  generateMultimodal: (...args: unknown[]) => generateMultimodal(...args),
  generateText: jest.fn(),
  GEMINI_MODELS: { flash: "flash" },
}));

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
jest.mock("@/models/User", () => ({ __esModule: true, default: { findByIdAndUpdate: (...a: unknown[]) => userUpdate(...a) } }));
jest.mock("@/models/CvDocument", () => ({ __esModule: true, default: { findOne: jest.fn() } }));

import { POST } from "@/app/api/ai/cv-extract/route";

function upload(mode?: string) {
  const form = new FormData();
  form.append("cv", new File([Buffer.from("%PDF-1.7 a new CV")], "cv.pdf", { type: "application/pdf" }));
  if (mode) form.append("mode", mode);
  return new NextRequest("http://localhost/api/ai/cv-extract", { method: "POST", body: form });
}

beforeEach(() => {
  jest.clearAllMocks();
  generateMultimodal.mockResolvedValue(JSON.stringify(extracted));
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
