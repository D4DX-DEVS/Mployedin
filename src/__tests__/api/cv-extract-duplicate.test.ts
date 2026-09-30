/**
 * @jest-environment node
 *
 * Uploading a CV that was already read skips the paid AI read. The reply used
 * to carry no reading, so onboarding showed "Could not extract data from this
 * CV" for a file it had read perfectly well a minute earlier (2026-09-30).
 */
import { createHash } from "crypto";
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
jest.mock("@/lib/storage/spaces", () => ({ uploadBuffer: jest.fn() }));
jest.mock("@/lib/cv/cvDocuments", () => ({ saveReadCv: jest.fn() }));

const generateMultimodal = jest.fn();
const generateText = jest.fn();
jest.mock("@/lib/ai/gemini", () => ({
  generateMultimodal: (...args: unknown[]) => generateMultimodal(...args),
  generateText: (...args: unknown[]) => generateText(...args),
  GEMINI_MODELS: { flash: "flash" },
}));

const bytes = Buffer.from("%PDF-1.7 the same CV");
const contentHash = createHash("sha256").update(bytes).digest("hex");

jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => ({
      lean: () => Promise.resolve({ _id: "js_1", cv: { contentHash, originalUrl: "https://files/cv.pdf" }, profileCompleteness: 40 }),
    })),
  },
}));
jest.mock("@/models/User", () => ({ __esModule: true, default: {} }));

const reading = { fullName: "Sam", totalExperienceYears: 6, experience: [{ jobTitle: "Manager", company: "Acme" }] };
const cvFindOne = jest.fn();
jest.mock("@/models/CvDocument", () => ({
  __esModule: true,
  default: { findOne: (...args: unknown[]) => cvFindOne(...args) },
}));

import { POST } from "@/app/api/ai/cv-extract/route";

function upload() {
  const form = new FormData();
  form.append("cv", new File([bytes], "cv.pdf", { type: "application/pdf" }));
  return new NextRequest("http://localhost/api/ai/cv-extract", { method: "POST", body: form });
}

const chain = (result: unknown) => ({ sort: () => ({ select: () => ({ lean: () => Promise.resolve(result) }) }) });

beforeEach(() => {
  cvFindOne.mockReset();
  generateMultimodal.mockReset();
  generateText.mockReset();
});

describe("cv-extract with a CV that was already read", () => {
  it("returns the saved reading, without reading the file again", async () => {
    cvFindOne.mockReturnValue(chain({ parsed: reading }));
    const res = await POST(upload());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, duplicate: true, extracted: reading });
    expect(cvFindOne).toHaveBeenCalledWith(expect.objectContaining({ jobSeekerId: "js_1", fingerprint: contentHash }));
    expect(generateMultimodal).not.toHaveBeenCalled();
    expect(generateText).not.toHaveBeenCalled();
  });

  it("still answers as a duplicate when no reading was saved", async () => {
    cvFindOne.mockReturnValue(chain(null));
    const body = await (await POST(upload())).json();
    expect(body).toMatchObject({ success: true, duplicate: true, extracted: null });
  });

  it("still answers when looking the reading up fails", async () => {
    cvFindOne.mockImplementation(() => { throw new Error("db down"); });
    const res = await POST(upload());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ duplicate: true, extracted: null });
  });
});
