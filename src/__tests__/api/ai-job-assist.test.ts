/**
 * @jest-environment node
 *
 * POST /api/ai/job-assist — the job form's AI assistant. Only people who post
 * jobs may call it; the model's answer comes back as a reply plus checked
 * field changes, never written to the job here.
 */
import { NextRequest, NextResponse } from "next/server";

let caller: { userId: string; role: string } = { userId: "650000000000000000000001", role: "employer" };

jest.mock("@/lib/subscription/featureGate", () => ({ enforceFeatureGate: jest.fn().mockResolvedValue(null) }));
jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimitDual: jest.fn().mockResolvedValue({ allowed: true, remaining: 5, resetAt: Date.now() + 1000 }),
  RATE_LIMIT_CONFIGS: { ai: { limit: 10, windowSec: 60 } },
}));
const generateText = jest.fn();
jest.mock("@/lib/ai/gemini", () => ({
  generateText: (...args: unknown[]) => generateText(...args),
  GEMINI_MODELS: { flash: "flash" },
}));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) =>
    async (req: NextRequest) => {
      try {
        return await handler(req, { ...caller, locale: "en" });
      } catch (err) {
        if (err instanceof NextResponse) return err;
        throw err;
      }
    },
}));

import { POST } from "@/app/api/ai/job-assist/route";

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/ai/job-assist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({}) },
  );
}

const validBody = { instruction: "Add three benefits", job: { title: "Warehouse Supervisor" } };

beforeEach(() => {
  caller = { userId: "650000000000000000000001", role: "employer" };
  generateText.mockReset();
});

describe("POST /api/ai/job-assist", () => {
  it("returns the reply and the checked changes", async () => {
    generateText.mockResolvedValue(JSON.stringify({
      reply: "Added three benefits.",
      changes: { benefits: ["Health cover", "Annual flight", "Overtime pay"], status: "active" },
    }));
    const res = await post(validBody);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      reply: "Added three benefits.",
      changes: { benefits: ["Health cover", "Annual flight", "Overtime pay"] },
    });
    // JSON mode, so the answer is parseable.
    expect(generateText.mock.calls[0][3]).toBe(true);
  });

  it.each(["agent", "admin"])("lets a %s use it", async (role) => {
    caller = { ...caller, role };
    generateText.mockResolvedValue('{"reply":"Done.","changes":{}}');
    expect((await post(validBody)).status).toBe(200);
  });

  it.each(["job_seeker", "super_agent"])("refuses a %s before calling the model", async (role) => {
    caller = { ...caller, role };
    const res = await post(validBody);
    expect(res.status).toBe(403);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("rejects an empty instruction", async () => {
    const res = await post({ instruction: "  ", job: {} });
    expect(res.status).toBe(400);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("answers 502 when the model's answer cannot be read", async () => {
    generateText.mockResolvedValue("not json");
    expect((await post(validBody)).status).toBe(502);
  });

  it("answers 502 when the model call fails", async () => {
    generateText.mockRejectedValue(new Error("provider down"));
    expect((await post(validBody)).status).toBe(502);
  });
});
