/**
 * @jest-environment node
 *
 * Rollout check 2026-10-28: "candidates who meet the must-haves and know AWS"
 * came back as AWS plus the leftover phrase as a keyword, so the list showed 0
 * of 1 while the one applicant met every must-have. The parser now has a
 * must-haves filter, and keeps only names and short keywords in `search`.
 */
import { NextRequest } from "next/server";

const mockRouteGenerate = jest.fn();

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: { userId: string; role: string; locale: string }) => Promise<Response>) =>
    (req: NextRequest) => handler(req, { userId: "employer_001", role: "employer", locale: "en" }),
}));
jest.mock("@/lib/ai/router", () => ({ routeGenerate: (...args: unknown[]) => mockRouteGenerate(...args) }));
jest.mock("@/lib/ai/gemini", () => ({ parseAIJson: (text: string) => JSON.parse(text) }));
jest.mock("@/lib/ai/sanitize", () => ({ sanitizeAIInput: (value: string) => value.trim() }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn(), actorFromCtx: () => ({}) }));
jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimitDual: jest.fn().mockResolvedValue({ allowed: true, resetAt: 0 }),
  RATE_LIMIT_CONFIGS: { ai: {} },
}));

import { POST } from "@/app/api/ai/application-search-filters/route";

function ask(query: string) {
  return POST(new NextRequest("http://localhost/api/ai/application-search-filters", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  }), {} as never);
}

describe("POST /api/ai/application-search-filters", () => {
  beforeEach(() => mockRouteGenerate.mockReset());

  it("offers the model a must-haves filter and tells it never to search for filler words", async () => {
    mockRouteGenerate.mockResolvedValue(JSON.stringify({ skills: ["AWS"], requirements: "met" }));
    await ask("candidates who meet the must-haves and know AWS");
    const prompt = mockRouteGenerate.mock.calls[0][0] as string;
    expect(prompt).toContain('"requirements": "met" | "not_met" | null');
    expect(prompt).toMatch(/must-haves/i);
    expect(prompt).toMatch(/never put .*"search"/i);
  });

  it("returns the must-haves filter the model picked", async () => {
    mockRouteGenerate.mockResolvedValue(JSON.stringify({ search: null, skills: ["AWS"], requirements: "met" }));
    const body = await (await ask("candidates who meet the must-haves and know AWS")).json();
    expect(body.filters).toEqual(expect.objectContaining({ requirements: "met", skills: ["AWS"] }));
    expect(body.filters.search).toBeUndefined();
  });

  it("drops a must-haves value the list cannot filter on", async () => {
    mockRouteGenerate.mockResolvedValue(JSON.stringify({ requirements: "mostly" }));
    const body = await (await ask("people who mostly qualify")).json();
    expect(body.filters.requirements).toBeUndefined();
  });
});
