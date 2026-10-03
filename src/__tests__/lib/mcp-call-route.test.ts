/**
 * @jest-environment node
 */

import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/security/clientIp";

jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));

import { callRoute } from "@/lib/mcp/callRoute";

const ctx = (userId: string) => ({ userId, role: "job_seeker" as const, locale: "en" });

describe("callRoute", () => {
  it("gives each user their own client-IP rate-limit bucket inside reused handlers", async () => {
    const seen: string[] = [];
    const handler = async (req: NextRequest) => {
      seen.push(getClientIp(req.headers));
      return NextResponse.json({ ok: true });
    };

    await callRoute(handler, ctx("user-a"), { path: "/api/jobs" });
    await callRoute(handler, ctx("user-a"), { path: "/api/jobs" });
    await callRoute(handler, ctx("user-b"), { path: "/api/jobs" });

    expect(seen[0]).toMatch(/^2001:db8:/);
    expect(seen[0]).toBe(seen[1]);
    expect(seen[0]).not.toBe(seen[2]);
    expect(seen).not.toContain("direct");
  });

  it("never hands a thrown error's message to the AI client", async () => {
    const handler = async (): Promise<NextResponse> => {
      throw new Error("MongoServerError: cluster0-shard-00-01.abcde.mongodb.net quota exceeded");
    };
    const result = await callRoute(handler, ctx("user-a"), { path: "/api/jobs" });
    expect(result).toEqual({
      ok: false,
      status: 500,
      body: { error: "Something went wrong. Try again later." },
    });
  });

  it("passes through an expected NextResponse thrown by validation", async () => {
    const handler = async (): Promise<NextResponse> => {
      throw NextResponse.json({ error: "Validation failed" }, { status: 400 });
    };
    const result = await callRoute(handler, ctx("user-a"), { path: "/api/jobs" });
    expect(result).toEqual({ ok: false, status: 400, body: { error: "Validation failed" } });
  });
});
