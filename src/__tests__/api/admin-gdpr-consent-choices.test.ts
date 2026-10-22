/**
 * @jest-environment node
 */
/**
 * Admin > GDPR > Consent Logs > Cookie choices: one row per saved choice.
 *
 * A signed-in user's choice is two ConsentLog rows (cookies.preferences and
 * cookies.media) with one choice reference; the list groups them in the
 * database so a page and its total count choices, not rows. These tests check
 * the query the routes build and what they send back; the grouping itself runs
 * against a real database in admin-gdpr-consent-choices.db.test.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { bannerTextHash } from "@/lib/consent/bannerTextHash";
import { categoriesFromStages } from "../helpers/aggregationEval";

let ctxRole: "admin" | "super_agent" = "admin";
const ADMIN_ID = "64d000000000000000000001";
const USER_ID = "64d000000000000000000003";
const REF = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";
const OTHER_REF = "0f8fad5b-d9cb-469f-a165-70867728950e";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown, params?: Record<string, string>) => Promise<Response>) =>
    async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
      const params = context ? await context.params : {};
      try {
        return await handler(req, { userId: ADMIN_ID, role: ctxRole, locale: "en" }, params);
      } catch (err) {
        if (err instanceof NextResponse) return err;
        throw err;
      }
    },
}));

function chain(result: unknown) {
  const c: Record<string, jest.Mock> = {};
  for (const m of ["sort", "skip", "limit", "select", "populate"]) c[m] = jest.fn(() => c);
  c.lean = jest.fn().mockResolvedValue(result);
  return c;
}

type Stage = Record<string, unknown>;
const logAggregate = jest.fn((..._args: unknown[]) => Promise.resolve([] as unknown[]));
jest.mock("@/models/ConsentLog", () => ({
  __esModule: true,
  default: { aggregate: (...a: unknown[]) => logAggregate(...a) },
}));

const receiptFindOne = jest.fn((..._args: unknown[]) => chain(null));
jest.mock("@/models/ConsentReceipt", () => ({
  __esModule: true,
  default: { findOne: (...a: unknown[]) => receiptFindOne(...a) },
}));

const userFind = jest.fn((..._args: unknown[]) => chain([]));
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { find: (...a: unknown[]) => userFind(...a) },
}));

/** One grouped choice as the aggregation hands it back (the stored row also had an IP the API must drop). */
const grouped = (over: Record<string, unknown> = {}) => ({
  _id: { receiptId: REF, userId: USER_ID },
  userId: USER_ID,
  userName: "Sara Ahmed",
  receiptId: REF,
  recordedAt: new Date("2026-10-18T09:30:00Z"),
  source: "banner",
  policyVersion: "cookie-v1",
  preferences: false,
  media: false,
  ipAddress: "203.0.113.9",
  ...over,
});

const facet = (rows: unknown[], total: number) => [{ data: rows, total: total ? [{ count: total }] : [] }];

const ctx = (params: Record<string, string> = {}) => ({ params: Promise.resolve(params) });

async function list(query = ""): Promise<Response> {
  const { GET } = await import("@/app/api/admin/gdpr/consent/choices/route");
  return GET(new NextRequest(`http://localhost:3000/api/admin/gdpr/consent/choices${query ? `?${query}` : ""}`), ctx());
}

async function record(ref: string): Promise<Response> {
  const { GET } = await import("@/app/api/admin/gdpr/consent/choices/[receiptId]/route");
  return GET(new NextRequest(`http://localhost:3000/api/admin/gdpr/consent/choices/${encodeURIComponent(ref)}`), ctx({ receiptId: ref }));
}

const pipelineOf = (call = 0) => logAggregate.mock.calls[call][0] as Stage[];
const stage = (pipeline: Stage[], name: string) => pipeline.find((s) => name in s)?.[name] as Record<string, unknown> | undefined;
const stages = (pipeline: Stage[], name: string) => pipeline.filter((s) => name in s).map((s) => s[name] as Record<string, unknown>);
/** One group's preferences and media, as this pipeline's $group and $project make them from `rows`. */
const categoriesOf = (pipeline: Stage[], rows: Array<Record<string, unknown>>) =>
  categoriesFromStages(stage(pipeline, "$group")!, stages(pipeline, "$project").find((p) => "preferences" in p)!, rows);

beforeEach(() => {
  ctxRole = "admin";
  jest.clearAllMocks();
  jest.restoreAllMocks();
  logAggregate.mockImplementation(() => Promise.resolve(facet([grouped()], 1)));
  receiptFindOne.mockImplementation(() => chain(null));
  userFind.mockImplementation(() => chain([{ _id: USER_ID, email: "sara@example.com" }]));
});

describe("GET /api/admin/gdpr/consent/choices (one row per saved cookie choice)", () => {
  it("is admin-only: another role gets 403 and nothing is read", async () => {
    ctxRole = "super_agent";
    const res = await list();

    expect(res.status).toBe(403);
    expect(logAggregate).not.toHaveBeenCalled();
    expect(userFind).not.toHaveBeenCalled();
  });

  it.each([
    ["page 0", "page=0"],
    ["a page that is not a number", "page=two"],
    ["a page size the list does not offer", "pageSize=15"],
    ["a page size over 100", "pageSize=500"],
    ["an unknown outcome", "outcome=maybe"],
    ["an unknown source", "source=registration"],
    ["a period that is not offered", "days=14"],
    ["an unknown order", "order=up"],
    ["an unknown parameter", "limit=10"],
    ["a Mongo operator as outcome", "outcome=%24ne"],
  ])("answers 400 for %s and reads nothing", async (_label, query) => {
    const res = await list(query);

    expect(res.status).toBe(400);
    expect(logAggregate).not.toHaveBeenCalled();
  });

  it.each([10, 20, 25, 50, 100])("accepts a page size of %i (every size the rows-per-page menu offers)", async (size) => {
    const res = await list(`pageSize=${size}`);
    expect(res.status).toBe(200);
  });

  it("returns the listing contract: data, page, pageSize, total, totalPages", async () => {
    logAggregate.mockImplementation(() => Promise.resolve(facet([grouped()], 41)));
    const res = await list("page=2&pageSize=20");
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload).toEqual({
      data: [
        {
          userId: USER_ID,
          userName: "Sara Ahmed",
          userEmail: "sara@example.com",
          receiptId: REF,
          recordedAt: "2026-10-18T09:30:00.000Z",
          source: "banner",
          policyVersion: "cookie-v1",
          preferences: false,
          media: false,
          outcome: "rejected",
        },
      ],
      page: 2,
      pageSize: 20,
      total: 41,
      totalPages: 3,
    });
  });

  it("answers the same shape with zeros when nothing matches", async () => {
    logAggregate.mockImplementation(() => Promise.resolve(facet([], 0)));
    const payload = await (await list()).json();

    expect(payload).toEqual({ data: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
    expect(userFind).not.toHaveBeenCalled();
  });

  it("reads only the two cookie categories, within the last 30 days by default", async () => {
    const now = Date.UTC(2026, 9, 21, 12, 0, 0);
    jest.spyOn(Date, "now").mockReturnValue(now);
    await list();

    const match = stage(pipelineOf(), "$match")!;
    expect(match.consentType).toEqual({ $in: ["cookies.preferences", "cookies.media"] });
    expect(match.createdAt).toEqual({ $gte: new Date("2026-09-21T12:00:00.000Z") });
  });

  it.each([7, 90, 365])("moves the window to the last %i days", async (days) => {
    const now = Date.UTC(2026, 9, 21, 12, 0, 0);
    jest.spyOn(Date, "now").mockReturnValue(now);
    await list(`days=${days}`);

    expect(stage(pipelineOf(), "$match")!.createdAt).toEqual({ $gte: new Date(now - days * 24 * 60 * 60 * 1000) });
  });

  it("groups by the choice reference, and by account and second for rows written before references existed", async () => {
    await list();

    const group = stage(pipelineOf(), "$group")!;
    const key = JSON.stringify(group._id);
    expect(key).toContain('"$receiptId"');
    expect(key).toContain('"$userId"');
    expect(key).toContain('"%Y-%m-%dT%H:%M:%S"');
    expect(group.recordedAt).toEqual({ $min: "$createdAt" });
  });

  describe("what a category comes out as", () => {
    const prefs = (granted: unknown) => ({ consentType: "cookies.preferences", granted });
    const media = (granted: unknown) => ({ consentType: "cookies.media", granted });

    it.each([
      ["one row on", [prefs(true), media(false)], { preferences: true, media: false }],
      ["one row off", [prefs(false), media(true)], { preferences: false, media: true }],
      ["no row for it", [media(true)], { preferences: null, media: true }],
      ["two rows that agree", [prefs(true), prefs(true), media(true)], { preferences: true, media: true }],
      ["two rows that disagree: not recorded, never On", [prefs(true), prefs(false), media(true)], { preferences: null, media: true }],
      ["two video rows that disagree", [prefs(false), media(false), media(true)], { preferences: false, media: null }],
    ])("%s", async (_label, rows, expected) => {
      await list();

      expect(categoriesOf(pipelineOf(), rows)).toEqual(expected);
    });
  });

  it("finds a full choice reference whatever the period, so an older choice is still found", async () => {
    await list(`search=${REF}&days=7`);

    const match = stage(pipelineOf(), "$match")!;
    expect(match.receiptId).toBe(REF);
    expect(match).not.toHaveProperty("createdAt");
    expect(match.consentType).toEqual({ $in: ["cookies.preferences", "cookies.media"] });
  });

  it("keeps the period for a name or e-mail search", async () => {
    await list("search=sara&days=7");

    expect(stage(pipelineOf(), "$match")!.createdAt).toEqual({ $gte: expect.any(Date) });
  });

  it("counts choices, not rows: one $facet gives the page and the total after grouping", async () => {
    await list("page=3&pageSize=10");

    const pipeline = pipelineOf();
    const facetStage = stage(pipeline, "$facet") as { data: Stage[]; total: Stage[] };
    expect(pipeline.findIndex((s) => "$facet" in s)).toBeGreaterThan(pipeline.findIndex((s) => "$group" in s));
    expect(facetStage.data).toEqual([{ $skip: 20 }, { $limit: 10 }]);
    expect(facetStage.total).toEqual([{ $count: "count" }]);
  });

  it.each([
    ["accepted", { preferences: true, media: true }],
    ["rejected", { preferences: false, media: false }],
    ["custom", { $nor: [{ preferences: true, media: true }, { preferences: false, media: false }] }],
  ])("filters %s choices after grouping", async (outcome, filter) => {
    await list(`outcome=${outcome}`);

    const pipeline = pipelineOf();
    const groupAt = pipeline.findIndex((s) => "$group" in s);
    const after = pipeline.slice(groupAt + 1).filter((s) => "$match" in s).map((s) => s.$match);
    expect(after).toContainEqual(filter);
  });

  it("filters by where the choice was made", async () => {
    await list("source=settings");
    expect(stage(pipelineOf(), "$match")!.source).toBe("settings");
  });

  it("sorts newest first by default and oldest first on request", async () => {
    await list();
    expect(stage(pipelineOf(0), "$sort")).toEqual(expect.objectContaining({ recordedAt: -1 }));

    await list("order=asc");
    expect(stage(pipelineOf(1), "$sort")).toEqual(expect.objectContaining({ recordedAt: 1 }));
  });

  it("finds a full choice reference typed in upper case: matched exactly, lower-cased", async () => {
    await list(`search=${REF.toUpperCase()}`);

    const match = stage(pipelineOf(), "$match")!;
    expect(match.receiptId).toBe(REF);
    expect(match).not.toHaveProperty("$or");
    // A reference is not a name or an e-mail: no user lookup for it.
    expect(userFind).not.toHaveBeenCalledWith(expect.objectContaining({ email: expect.anything() }));
  });

  it("searches names and e-mails otherwise, with the input escaped", async () => {
    userFind.mockImplementation(() => chain([{ _id: USER_ID, email: "sara@example.com" }]));
    await list("search=sara%2B1%40example");

    expect(userFind).toHaveBeenCalledWith({ email: { $regex: "sara\\+1@example", $options: "i" } });
    const match = stage(pipelineOf(), "$match")!;
    expect(match.$or).toEqual([
      { userName: { $regex: "sara\\+1@example", $options: "i" } },
      { userId: { $in: [USER_ID] } },
    ]);
    expect(match).not.toHaveProperty("receiptId");
  });

  it("shows a lone single-category row as a custom choice with the missing category not recorded", async () => {
    logAggregate.mockImplementation(() => Promise.resolve(facet([grouped({ preferences: true, media: null })], 1)));
    const payload = await (await list()).json();

    expect(payload.data[0]).toEqual(expect.objectContaining({ preferences: true, media: null, outcome: "custom" }));
  });

  it("returns null for a reference on a choice written before references existed", async () => {
    logAggregate.mockImplementation(() =>
      Promise.resolve(facet([grouped({ _id: { userId: USER_ID, second: "2026-09-01T10:00:00" }, receiptId: null, preferences: true, media: true })], 1)),
    );
    const payload = await (await list()).json();

    expect(payload.data[0]).toEqual(expect.objectContaining({ receiptId: null, outcome: "accepted" }));
  });

  it("looks the e-mails up in one query for the whole page, and keeps the name when the account is gone", async () => {
    const OTHER_USER = "64d000000000000000000009";
    logAggregate.mockImplementation(() =>
      Promise.resolve(facet([grouped(), grouped({ receiptId: OTHER_REF, userId: OTHER_USER, userName: "Omar Khan" }), grouped({ receiptId: null })], 3)),
    );
    const payload = await (await list()).json();

    expect(userFind).toHaveBeenCalledTimes(1);
    expect(userFind).toHaveBeenCalledWith({ _id: { $in: [USER_ID, OTHER_USER] } });
    expect(payload.data.map((r: { userEmail: string | null }) => r.userEmail)).toEqual(["sara@example.com", null, "sara@example.com"]);
    expect(payload.data[1].userName).toBe("Omar Khan");
  });

  it("shows an erased account as Deleted User with no e-mail", async () => {
    logAggregate.mockImplementation(() => Promise.resolve(facet([grouped()], 1)));
    userFind.mockImplementation(() => chain([{ _id: USER_ID, email: "deleted_x@anonymized.mployedin.com", deletedAt: new Date("2026-10-01") }]));
    const payload = await (await list()).json();

    expect(payload.data[0]).toEqual(expect.objectContaining({ userName: "Deleted User", userEmail: null, receiptId: REF }));
  });

  it("never returns an IP address", async () => {
    const res = await list();
    const text = await res.text();

    expect(text).not.toContain("203.0.113.9");
    expect(text).not.toContain("ipAddress");
  });
});

describe("GET /api/admin/gdpr/consent/choices/[receiptId] (one consent record)", () => {
  const newer = grouped({ receiptId: OTHER_REF, recordedAt: new Date("2026-10-19T08:00:00Z"), preferences: true, media: true, source: "settings" });
  const older = grouped({ receiptId: null, recordedAt: new Date("2026-09-01T10:00:00Z"), preferences: true, media: false });

  /** The record query matches the reference; the history query matches everything else for that account. */
  function arrange(others: unknown[], current: unknown[] = [grouped()]) {
    logAggregate.mockImplementation((pipeline: unknown) => {
      const match = (pipeline as Stage[])[0].$match as Record<string, unknown>;
      return Promise.resolve(match.receiptId === REF ? current : others);
    });
  }

  beforeEach(() => arrange([]));

  it("is admin-only", async () => {
    ctxRole = "super_agent";
    const res = await record(REF);

    expect(res.status).toBe(403);
    expect(logAggregate).not.toHaveBeenCalled();
  });

  it.each([
    ["not a reference", "not-a-ref"],
    ["the start of a reference", REF.slice(0, 8)],
    ["a Mongo operator", "$ne"],
  ])("answers 400 for %s", async (_label, ref) => {
    const res = await record(ref);

    expect(res.status).toBe(400);
    expect(logAggregate).not.toHaveBeenCalled();
  });

  it("answers 404 when no account row has the reference (an anonymous choice)", async () => {
    arrange([], []);
    const res = await record(REF);

    expect(res.status).toBe(404);
  });

  it("finds a reference pasted in upper case", async () => {
    const res = await record(REF.toUpperCase());

    expect(res.status).toBe(200);
    expect(pipelineOf()[0].$match).toEqual({ receiptId: REF, consentType: { $in: ["cookies.preferences", "cookies.media"] } });
  });

  it("returns the grouped record with the account's e-mail", async () => {
    const payload = await (await record(REF)).json();

    expect(payload.record).toEqual({
      userId: USER_ID,
      userName: "Sara Ahmed",
      userEmail: "sara@example.com",
      receiptId: REF,
      recordedAt: "2026-10-18T09:30:00.000Z",
      source: "banner",
      policyVersion: "cookie-v1",
      preferences: false,
      media: false,
      outcome: "rejected",
    });
  });

  it("is the current choice when the account made no later one", async () => {
    arrange([older]);
    const payload = await (await record(REF)).json();

    expect(payload.status).toBe("current");
  });

  it("is replaced when the account made a later choice", async () => {
    arrange([newer, older]);
    const payload = await (await record(REF)).json();

    expect(payload.status).toBe("replaced");
  });

  it("lists the account's other choices newest first, each marked earlier or later than this one", async () => {
    arrange([newer, older]);
    const payload = await (await record(REF)).json();

    expect(payload.otherChoices).toEqual([
      { recordedAt: "2026-10-19T08:00:00.000Z", relation: "later", outcome: "accepted", preferences: true, media: true, source: "settings" },
      { recordedAt: "2026-09-01T10:00:00.000Z", relation: "earlier", outcome: "custom", preferences: true, media: false, source: "banner" },
    ]);
    const history = pipelineOf(1);
    expect(history[0].$match).toEqual({
      userId: USER_ID,
      consentType: { $in: ["cookies.preferences", "cookies.media"] },
      receiptId: { $ne: REF },
    });
    expect(stage(history, "$sort")).toEqual(expect.objectContaining({ recordedAt: -1 }));
  });

  it("caps the history at 20 choices", async () => {
    arrange(Array.from({ length: 25 }, (_, i) => grouped({ receiptId: null, recordedAt: new Date(Date.UTC(2026, 8, 1 + i)) })));
    const payload = await (await record(REF)).json();

    expect(stages(pipelineOf(1), "$limit")).toContainEqual(20);
    expect(payload.otherChoices).toHaveLength(20);
  });

  describe("shown wording", () => {
    it("is the same as today when the stored text matches today's text in that language", async () => {
      receiptFindOne.mockImplementation(() => chain({ bannerTextHash: bannerTextHash("ar"), locale: "ar" }));
      const payload = await (await record(REF)).json();

      expect(receiptFindOne).toHaveBeenCalledWith({ receiptId: REF });
      expect(payload.wording).toBe("same");
    });

    it("is older when the text has changed since", async () => {
      receiptFindOne.mockImplementation(() => chain({ bannerTextHash: "0".repeat(64), locale: "en" }));
      expect((await (await record(REF)).json()).wording).toBe("older");
    });

    it("is unknown once the details have been deleted (after 12 months)", async () => {
      receiptFindOne.mockImplementation(() => chain(null));
      expect((await (await record(REF)).json()).wording).toBe("unknown");
    });
  });

  it("never returns the text hash, an IP address or a user agent", async () => {
    receiptFindOne.mockImplementation(() =>
      chain({ bannerTextHash: bannerTextHash("en"), locale: "en", ip: "198.51.100.7", userAgent: "Mozilla/5.0 (secret)" }),
    );
    arrange([grouped({ receiptId: OTHER_REF, userAgent: "Mozilla/5.0 (secret)" })]);
    const res = await record(REF);
    const text = await res.text();

    expect(text).not.toContain(bannerTextHash("en"));
    expect(text).not.toContain("203.0.113.9");
    expect(text).not.toContain("198.51.100.7");
    expect(text).not.toContain("Mozilla");
    expect(Object.keys(JSON.parse(text)).sort()).toEqual(["otherChoices", "record", "status", "wording"]);
  });
});
