/**
 * @jest-environment node
 *
 * CV uploads are paid AI readings: limited per minute and counted toward the
 * daily AI quota — except bytes the seeker already uploaded, which reuse the
 * earlier reading.
 */
import { NextResponse } from "next/server";

const cvExists = jest.fn();
jest.mock("@/models/CvDocument", () => ({ __esModule: true, default: { exists: (...a: unknown[]) => cvExists(...a) } }));
const checkRateLimit = jest.fn();
jest.mock("@/lib/security/rateLimit", () => ({
  RATE_LIMIT_CONFIGS: { upload: { limit: 5, windowSec: 60, prefix: "rl-upload" } },
  checkRateLimit: (...a: unknown[]) => checkRateLimit(...a),
}));
const enforceDailyAiQuota = jest.fn();
jest.mock("@/lib/ai/dailyQuota", () => ({ enforceDailyAiQuota: (...a: unknown[]) => enforceDailyAiQuota(...a) }));

import { limitCvUpload } from "@/lib/cv/uploadLimit";

const INPUT = { userId: "u1", role: "job_seeker", jobSeekerId: "s1", fingerprint: "f".repeat(64) };

beforeEach(() => {
  jest.clearAllMocks();
  cvExists.mockResolvedValue(null);
  checkRateLimit.mockResolvedValue({ allowed: true });
  enforceDailyAiQuota.mockResolvedValue(null);
});

describe("limitCvUpload", () => {
  it("lets a new file through and counts it once toward the daily AI quota", async () => {
    await expect(limitCvUpload(INPUT)).resolves.toBeNull();
    expect(cvExists).toHaveBeenCalledWith({ jobSeekerId: "s1", fingerprint: INPUT.fingerprint });
    expect(checkRateLimit).toHaveBeenCalledWith("cv-upload:u1", expect.objectContaining({ prefix: "rl-upload" }));
    expect(enforceDailyAiQuota).toHaveBeenCalledWith("u1", "job_seeker");
  });

  it("lets bytes the seeker already uploaded through without counting them", async () => {
    cvExists.mockResolvedValue({ _id: "cv1" });
    await expect(limitCvUpload(INPUT)).resolves.toBeNull();
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(enforceDailyAiQuota).not.toHaveBeenCalled();
  });

  it("refuses uploads that come too fast, in words the seeker can act on", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false });
    const res = await limitCvUpload(INPUT);
    expect(res?.status).toBe(429);
    expect((await res!.json()).error).toMatch(/Please wait a minute and try again/);
    expect(enforceDailyAiQuota).not.toHaveBeenCalled();
  });

  it("refuses once the daily AI quota is spent, keeping the retry time", async () => {
    enforceDailyAiQuota.mockResolvedValue(
      NextResponse.json({ error: "AI_DAILY_LIMIT_EXCEEDED" }, { status: 429, headers: { "Retry-After": "3600" } }),
    );
    const res = await limitCvUpload(INPUT);
    expect(res?.status).toBe(429);
    expect(res?.headers.get("Retry-After")).toBe("3600");
    // Never the raw code: the documents page shows this text as is.
    expect((await res!.json()).error).toMatch(/today's limit for reading CVs/);
  });
});
