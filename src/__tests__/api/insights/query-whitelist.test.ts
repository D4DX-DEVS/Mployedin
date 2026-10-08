/**
 * @jest-environment node
 */
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));

const aggregate = jest.fn();
jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: { aggregate: (...a: unknown[]) => aggregate(...a) },
  Application: { aggregate: (...a: unknown[]) => aggregate(...a) },
}));

import { runQuery, parseFilterString } from "@/lib/insights/query";
import { InsightsError } from "@/lib/insights/errors";
import { getEntity } from "@/lib/insights/entities";
import { parseListParams } from "@/lib/insights/params";

const access = { pii: false };

async function expectBadRequest(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toBeInstanceOf(InsightsError);
  await p.catch((e: InsightsError) => {
    expect(e.status).toBe(400);
    expect(e.code).toBe(code);
  });
}

beforeEach(() => {
  aggregate.mockReset();
  aggregate.mockReturnValue({ option: () => Promise.resolve([{ _id: { status: "hired" }, value: 3, records: 3 }]) });
});

describe("insights query whitelist", () => {
  it("rejects a groupBy outside the entity whitelist (e.g. a PII or free-text path)", async () => {
    await expectBadRequest(runQuery({ entity: "applications", groupBy: "employerNotes" }, access), "invalid_group_by");
    await expectBadRequest(runQuery({ entity: "applications", groupBy: "$where" }, access), "invalid_group_by");
  });

  it("rejects non-numeric / unknown metric fields and unknown ops", async () => {
    await expectBadRequest(runQuery({ entity: "applications", metric: "sum:status" }, access), "invalid_metric");
    await expectBadRequest(runQuery({ entity: "applications", metric: "$function:aiMatchScore" }, access), "invalid_metric");
  });

  it("rejects filters that are not declared params (no Mongo operators)", async () => {
    await expectBadRequest(runQuery({ entity: "applications", filters: "$where:sleep(1000)" }, access), "unknown_filter");
    await expectBadRequest(runQuery({ entity: "applications", filters: { "status.$ne": "x" } }, access), "unknown_filter");
  });

  it("rejects unknown entities and too many group fields", async () => {
    await expectBadRequest(runQuery({ entity: "passwords" }, access), "invalid_entity");
    await expectBadRequest(runQuery({ entity: "applications", groupBy: "status,source,agentId" }, access), "invalid_group_by");
  });

  it("builds a fixed pipeline from whitelisted input", async () => {
    const res = await runQuery(
      { entity: "applications", groupBy: "status", metric: "avg:aiMatchScore", filters: "source:easy_apply|full_form", limit: 10 },
      access,
    );
    const pipeline = aggregate.mock.calls[0][0] as Record<string, unknown>[];
    expect(pipeline[0]).toEqual({ $match: { source: { $in: ["easy_apply", "full_form"] } } });
    expect(pipeline[1]).toEqual({
      $group: { _id: { status: "$status" }, value: { $avg: { $ifNull: ["$aiMatchScore", null] } }, records: { $sum: 1 } },
    });
    expect(pipeline).toContainEqual({ $limit: 11 });
    expect(res.data).toEqual([{ status: "hired", value: 3, records: 3 }]);
  });

  it("supports date bucketing on the entity's dateField only", async () => {
    await runQuery({ entity: "applications", groupBy: "createdAt:month" }, access);
    const group = (aggregate.mock.calls[0][0] as Record<string, Record<string, unknown>>[])[1]!.$group as Record<string, unknown>;
    expect(group._id).toEqual({
      createdAt_month: { $dateTrunc: { date: "$createdAt", unit: "month", startOfWeek: "monday", timezone: "UTC" } },
    });
    await expectBadRequest(runQuery({ entity: "applications", groupBy: "appliedAt:month" }, access), "invalid_group_by");
  });

  it("parses filter strings and escapes regex input for case-insensitive filters", () => {
    expect(parseFilterString("status:active|paused, country:UAE")).toEqual({ status: "active|paused", country: "UAE" });
    expect(() => parseFilterString("nocolon")).toThrow(InsightsError);
  });

  it("list params reject unknown filters, bad sorts and oversized limits are capped", () => {
    const jobs = getEntity("jobs")!;
    expect(() => parseListParams(new URLSearchParams("password=x"), jobs)).toThrow(InsightsError);
    expect(() => parseListParams(new URLSearchParams("sort=-passwordHash"), jobs)).toThrow(InsightsError);
    expect(() => parseListParams(new URLSearchParams("fields=title,keyHash"), jobs)).toThrow(InsightsError);
    expect(parseListParams(new URLSearchParams("limit=9999"), jobs).limit).toBe(200);
    expect(parseListParams(new URLSearchParams(""), jobs).limit).toBe(50);
  });

  it("PII-gated filters need pii:read", async () => {
    const { buildFilter } = await import("@/lib/insights/params");
    const users = getEntity("users")!;
    expect(() => buildFilter(users, { filters: { email: "a@b.co" } }, { pii: false })).toThrow(/pii:read/);
    expect(buildFilter(users, { filters: { email: "a@b.co" } }, { pii: true })).toEqual({ email: /^a@b\.co$/i });
  });
});
