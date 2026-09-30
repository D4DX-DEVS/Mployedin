/**
 * @jest-environment node
 *
 * GET /api/taxonomy?type=roles — the Preferred Roles suggestions (job-seeker
 * preferences, onboarding). They listed every live job title A–Z ahead of the
 * curated roles, so an empty box showed test postings ("AUDIT-T9-PROBE-…").
 */
import { NextRequest } from "next/server";
import { TAXONOMY_SEEDS } from "@/lib/taxonomy/seeds";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/security/rateLimit", () => ({ checkRateLimit: jest.fn(async () => ({ allowed: true, resetAt: 0 })) }));

const mockDistinct = jest.fn();
jest.mock("@/models/Job", () => ({ __esModule: true, default: { distinct: (...a: unknown[]) => mockDistinct(...a) } }));

async function roles(q = "") {
  const { GET } = await import("@/app/api/taxonomy/route");
  const res = await GET(new NextRequest(`http://localhost/api/taxonomy?type=roles&q=${encodeURIComponent(q)}&limit=12`));
  return ((await res.json()) as { items: string[] }).items;
}

beforeEach(() => {
  mockDistinct.mockReset();
  mockDistinct.mockResolvedValue(["AUDIT-T9-PROBE-1787661672601", "AUDIT Pending Approval Job", "Welding Inspector"]);
});

it("shows the curated roles in an empty box, not live job titles", async () => {
  const items = await roles();
  expect(items).toEqual(TAXONOMY_SEEDS.roles.slice(0, 12));
  expect(mockDistinct).not.toHaveBeenCalled();
});

it("puts curated matches before live titles while typing", async () => {
  mockDistinct.mockResolvedValue(["React Developer Kochi 1790676536139", "React Developer (Remote)"]);
  const items = await roles("react");
  const curated = TAXONOMY_SEEDS.roles.filter((r) => r.toLowerCase().startsWith("react"));
  expect(curated.length).toBeGreaterThan(0);
  expect(items.slice(0, curated.length)).toEqual(curated);
  expect(items).toContain("React Developer (Remote)");
});

it("never suggests a generated test title, and asks only for jobs on the public board", async () => {
  mockDistinct.mockResolvedValue(["AUDIT-T9-PROBE-1787661672601", "Welding Inspector"]);
  const items = await roles("w");
  expect(items.join("|")).not.toContain("PROBE-1787");
  const filter = mockDistinct.mock.calls[0][1] as Record<string, unknown>;
  expect(filter.status).toBe("active");
  expect(filter.$or).toEqual([{ expiresAt: null }, { expiresAt: { $gte: expect.any(Date) } }]);
});
