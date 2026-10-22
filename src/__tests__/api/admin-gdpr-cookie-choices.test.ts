/**
 * @jest-environment node
 */
/**
 * Admin > GDPR > Consent Logs: finding one visitor's cookie choice by the
 * reference they quote, and the counts of what visitors chose over a period.
 * Both routes are admin-only and read the anonymous ConsentReceipt records.
 */
import { NextRequest, NextResponse } from "next/server";
import { bannerTextHash } from "@/lib/consent/bannerTextHash";

let ctxRole: "admin" | "super_agent" = "admin";
const ADMIN_ID = "64d000000000000000000001";
const USER_ID = "64d000000000000000000003";
const REF = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";

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

const receiptFind = jest.fn((..._args: unknown[]) => chain([]));
const receiptAggregate = jest.fn((..._args: unknown[]) => Promise.resolve([] as unknown[]));
jest.mock("@/models/ConsentReceipt", () => ({
  __esModule: true,
  default: {
    find: (...a: unknown[]) => receiptFind(...a),
    aggregate: (...a: unknown[]) => receiptAggregate(...a),
  },
}));

const logFindOne = jest.fn((..._args: unknown[]) => chain(null));
const logExists = jest.fn((..._args: unknown[]) => Promise.resolve(null as unknown));
jest.mock("@/models/ConsentLog", () => ({
  __esModule: true,
  default: {
    findOne: (...a: unknown[]) => logFindOne(...a),
    exists: (...a: unknown[]) => logExists(...a),
  },
}));

const userFind = jest.fn((..._args: unknown[]) => chain([]));
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { find: (...a: unknown[]) => userFind(...a) },
}));

const CURRENT_EN_HASH = bannerTextHash("en");

/** What the database holds, including fields the API must never pass on. */
const storedReceipt = {
  _id: "64d0000000000000000000b1",
  receiptId: REF,
  preferences: false,
  media: false,
  version: 1,
  locale: "en",
  bannerTextHash: CURRENT_EN_HASH,
  createdAt: new Date("2026-10-18T09:30:00Z"),
  ip: "203.0.113.9",
  ipAddress: "203.0.113.9",
  userAgent: "Mozilla/5.0 (secret)",
  userId: USER_ID,
};

const ctx = { params: Promise.resolve({}) };
const lookupReq = (ref?: string) =>
  new NextRequest(`http://localhost:3000/api/admin/gdpr/consent/receipt${ref === undefined ? "" : `?ref=${encodeURIComponent(ref)}`}`);

async function lookup(ref?: string): Promise<Response> {
  const { GET } = await import("@/app/api/admin/gdpr/consent/receipt/route");
  return GET(lookupReq(ref), ctx);
}

beforeEach(() => {
  ctxRole = "admin";
  jest.clearAllMocks();
  jest.restoreAllMocks();
  receiptFind.mockImplementation(() => chain([storedReceipt]));
  receiptAggregate.mockImplementation(() => Promise.resolve([]));
  logFindOne.mockImplementation(() => chain(null));
  logExists.mockImplementation(() => Promise.resolve(null));
  userFind.mockImplementation(() => chain([]));
});

/** The account row the lookup reads: the newest log row written with the reference. */
const LOG_ROW = { userId: USER_ID, userName: "Sara Ahmed", source: "banner", createdAt: new Date("2026-10-18T09:30:00Z") };

describe("GET /api/admin/gdpr/consent/receipt (look up a cookie choice by its reference)", () => {
  it("is admin-only: another role gets 403 and nothing is read", async () => {
    ctxRole = "super_agent";
    const res = await lookup(REF);

    expect(res.status).toBe(403);
    expect(receiptFind).not.toHaveBeenCalled();
    expect(logFindOne).not.toHaveBeenCalled();
    expect(userFind).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["not a reference", "not-a-uuid"],
    ["a start of a reference", REF.slice(0, 8)],
    ["too long", `${REF}-extra`],
    ["a Mongo operator", "$ne"],
  ])("answers 400 for a %s reference and reads nothing", async (_label, ref) => {
    const res = await lookup(ref);

    expect(res.status).toBe(400);
    expect(receiptFind).not.toHaveBeenCalled();
    expect(logFindOne).not.toHaveBeenCalled();
  });

  it("finds an anonymous choice: the choice and when, no linked account", async () => {
    const res = await lookup(REF);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(receiptFind).toHaveBeenCalledWith({ receiptId: REF });
    expect(payload).toEqual({
      receipts: [
        {
          receiptId: REF,
          preferences: false,
          media: false,
          version: 1,
          locale: "en",
          createdAt: "2026-10-18T09:30:00.000Z",
          wordingMatchesCurrent: true,
          source: null,
        },
      ],
      linkedAccount: null,
    });
    expect(userFind).not.toHaveBeenCalled();
    expect(logExists).not.toHaveBeenCalled();
  });

  it("says where a choice was made when the receipt recorded it, and null for older receipts", async () => {
    receiptFind.mockImplementation(() => chain([
      { ...storedReceipt, source: "settings" },
      { ...storedReceipt, createdAt: new Date("2026-10-01T09:30:00Z") },
    ]));
    const payload = await (await lookup(REF)).json();

    expect(payload.receipts.map((r: { source: string | null }) => r.source)).toEqual(["settings", null]);
  });

  it("takes the newest first and at most ten", async () => {
    const q = chain([storedReceipt]);
    receiptFind.mockImplementationOnce(() => q);
    await lookup(REF);

    expect(q.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(q.limit).toHaveBeenCalledWith(10);
  });

  it("trims the reference before using it", async () => {
    const { GET } = await import("@/app/api/admin/gdpr/consent/receipt/route");
    const res = await GET(new NextRequest(`http://localhost:3000/api/admin/gdpr/consent/receipt?ref=%20${REF}%20`), ctx);

    expect(res.status).toBe(200);
    expect(receiptFind).toHaveBeenCalledWith({ receiptId: REF });
  });

  it("finds a reference pasted in upper case: the app writes lower-case ids, so it is lower-cased first", async () => {
    logFindOne.mockImplementation(() => chain({ userId: USER_ID, userName: "Sara Ahmed" }));
    userFind.mockImplementation(() => chain([{ _id: USER_ID, email: "sara@example.com" }]));
    const res = await lookup(REF.toUpperCase());

    expect(res.status).toBe(200);
    expect(receiptFind).toHaveBeenCalledWith({ receiptId: REF });
    expect(logFindOne).toHaveBeenCalledWith({ receiptId: REF });
    expect((await res.json()).linkedAccount.userName).toBe("Sara Ahmed");
  });

  it("names one account, deterministically: the newest log row for the reference wins", async () => {
    const q = chain({ userId: USER_ID, userName: "Sara Ahmed" });
    logFindOne.mockImplementation(() => q);
    userFind.mockImplementation(() => chain([{ _id: USER_ID, email: "sara@example.com" }]));
    await lookup(REF);

    expect(q.sort).toHaveBeenCalledWith({ createdAt: -1 });
  });

  it("names the account a signed-in choice was logged against, with its e-mail", async () => {
    logFindOne.mockImplementation(() => chain({ userId: USER_ID, userName: "Sara Ahmed" }));
    userFind.mockImplementation(() => chain([{ _id: USER_ID, email: "sara@example.com" }]));
    const payload = await (await lookup(REF)).json();

    expect(logFindOne).toHaveBeenCalledWith({ receiptId: REF });
    expect(userFind).toHaveBeenCalledWith({ _id: { $in: [USER_ID] } });
    expect(payload.linkedAccount).toEqual({ userId: USER_ID, userName: "Sara Ahmed", userEmail: "sara@example.com", source: null, firstChoice: true });
    expect(payload.receipts).toHaveLength(1);
  });

  describe("a signed-in choice: where it was made, and whether it was the account's first", () => {
    beforeEach(() => {
      logFindOne.mockImplementation(() => chain(LOG_ROW));
      userFind.mockImplementation(() => chain([{ _id: USER_ID, email: "sara@example.com" }]));
    });

    it("names the source from the account row", async () => {
      const payload = await (await lookup(REF)).json();
      expect(payload.linkedAccount.source).toBe("banner");
    });

    it("calls it the first choice when the account has no earlier cookie choice", async () => {
      const payload = await (await lookup(REF)).json();

      expect(payload.linkedAccount.firstChoice).toBe(true);
      expect(logExists).toHaveBeenCalledWith({
        userId: USER_ID,
        consentType: { $in: ["cookies.preferences", "cookies.media"] },
        receiptId: { $ne: REF },
        createdAt: { $lt: LOG_ROW.createdAt },
      });
    });

    it("calls it a later change when the account chose before", async () => {
      logExists.mockImplementation(() => Promise.resolve({ _id: "64d0000000000000000000c1" }));
      const payload = await (await lookup(REF)).json();

      expect(payload.linkedAccount.firstChoice).toBe(false);
    });

    it("shows no source for a value it does not know", async () => {
      logFindOne.mockImplementation(() => chain({ ...LOG_ROW, source: "registration" }));
      const payload = await (await lookup(REF)).json();
      expect(payload.linkedAccount.source).toBeNull();
    });
  });

  it("still names the account when the receipt itself has expired (it deletes itself after 12 months)", async () => {
    receiptFind.mockImplementation(() => chain([]));
    logFindOne.mockImplementation(() => chain({ userId: USER_ID, userName: "Sara Ahmed" }));
    userFind.mockImplementation(() => chain([{ _id: USER_ID, email: "sara@example.com" }]));
    const payload = await (await lookup(REF)).json();

    expect(payload.receipts).toEqual([]);
    expect(payload.linkedAccount).toEqual({ userId: USER_ID, userName: "Sara Ahmed", userEmail: "sara@example.com", source: null, firstChoice: true });
  });

  it("keeps the name from the log and shows no e-mail once the account is erased", async () => {
    logFindOne.mockImplementation(() => chain({ userId: USER_ID, userName: "Sara Ahmed" }));
    userFind.mockImplementation(() => chain([]));
    const payload = await (await lookup(REF)).json();

    expect(payload.linkedAccount).toEqual({ userId: USER_ID, userName: "Sara Ahmed", userEmail: null, source: null, firstChoice: true });
  });

  it("names an erased account Deleted User with no e-mail, even when its log row still has the old name", async () => {
    logFindOne.mockImplementation(() => chain({ userId: USER_ID, userName: "Sara Ahmed" }));
    userFind.mockImplementation(() => chain([{ _id: USER_ID, email: "deleted_x@anonymized.mployedin.com", deletedAt: new Date("2026-10-01") }]));
    const payload = await (await lookup(REF)).json();

    expect(payload.linkedAccount).toEqual(expect.objectContaining({ userId: USER_ID, userName: "Deleted User", userEmail: null }));
  });

  it("answers an unknown reference with 200 and nothing, not an error", async () => {
    receiptFind.mockImplementation(() => chain([]));
    const res = await lookup(REF);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ receipts: [], linkedAccount: null });
  });

  describe("wordingMatchesCurrent", () => {
    it("is true when the stored text hash is today's for the receipt's language", async () => {
      receiptFind.mockImplementation(() => chain([
        { ...storedReceipt, locale: "en", bannerTextHash: bannerTextHash("en") },
        { ...storedReceipt, locale: "ar", bannerTextHash: bannerTextHash("ar") },
      ]));
      const payload = await (await lookup(REF)).json();

      expect(payload.receipts.map((r: { wordingMatchesCurrent: boolean }) => r.wordingMatchesCurrent)).toEqual([true, true]);
    });

    it("is false for an older wording", async () => {
      receiptFind.mockImplementation(() => chain([{ ...storedReceipt, bannerTextHash: "0".repeat(64) }]));
      const payload = await (await lookup(REF)).json();

      expect(payload.receipts[0].wordingMatchesCurrent).toBe(false);
    });

    it("compares against the receipt's own language, not English", async () => {
      receiptFind.mockImplementation(() => chain([{ ...storedReceipt, locale: "ar", bannerTextHash: bannerTextHash("en") }]));
      const payload = await (await lookup(REF)).json();

      expect(payload.receipts[0].wordingMatchesCurrent).toBe(false);
    });
  });

  it("never returns the text hash, an IP address, a user agent or a user id on a receipt", async () => {
    logFindOne.mockImplementation(() => chain({ userId: USER_ID, userName: "Sara Ahmed", ipAddress: "198.51.100.7" }));
    userFind.mockImplementation(() => chain([{ _id: USER_ID, email: "sara@example.com" }]));
    const res = await lookup(REF);
    const text = await res.text();
    const payload = JSON.parse(text);

    expect(text).not.toContain(CURRENT_EN_HASH);
    expect(text).not.toContain("203.0.113.9");
    expect(text).not.toContain("198.51.100.7");
    expect(text).not.toContain("Mozilla");
    expect(Object.keys(payload.receipts[0]).sort()).toEqual([
      "createdAt", "locale", "media", "preferences", "receiptId", "source", "version", "wordingMatchesCurrent",
    ]);
    expect(Object.keys(payload.linkedAccount).sort()).toEqual(["firstChoice", "source", "userEmail", "userId", "userName"]);
  });

  it("reads only the log fields it needs (no IP address from the account row)", async () => {
    const q = chain({ userId: USER_ID, userName: "Sara Ahmed" });
    logFindOne.mockImplementation(() => q);
    userFind.mockImplementation(() => chain([{ _id: USER_ID, email: "sara@example.com" }]));
    await lookup(REF);

    expect(q.select).toHaveBeenCalledWith("userId userName source createdAt");
  });
});

describe("GET /api/admin/gdpr/consent/summary (what visitors chose over a period, 30 days by default)", () => {
  async function summary(query = ""): Promise<Response> {
    const { GET } = await import("@/app/api/admin/gdpr/consent/summary/route");
    return GET(new NextRequest(`http://localhost:3000/api/admin/gdpr/consent/summary${query ? `?${query}` : ""}`), ctx);
  }

  const group = (preferences: boolean, media: boolean, count: number) => ({ _id: { preferences, media }, count });

  it("is admin-only: another role gets 403 and nothing is read", async () => {
    ctxRole = "super_agent";
    const res = await summary();

    expect(res.status).toBe(403);
    expect(receiptAggregate).not.toHaveBeenCalled();
  });

  it("counts accepted all, rejected all and the rest, with a total", async () => {
    receiptAggregate.mockResolvedValue([group(true, true, 7), group(false, false, 4), group(true, false, 2), group(false, true, 1)]);
    const res = await summary();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ days: 30, total: 14, acceptedAll: 7, rejectedAll: 4, custom: 3 });
  });

  it("answers zeros, not nulls, when nobody chose", async () => {
    receiptAggregate.mockResolvedValue([]);
    expect(await (await summary()).json()).toEqual({ days: 30, total: 0, acceptedAll: 0, rejectedAll: 0, custom: 0 });
  });

  it("counts a group that only exists on one side (nobody rejected)", async () => {
    receiptAggregate.mockResolvedValue([group(true, true, 3)]);
    expect(await (await summary()).json()).toEqual({ days: 30, total: 3, acceptedAll: 3, rejectedAll: 0, custom: 0 });
  });

  it("uses one aggregation: match the last 30 days, group on the two choices", async () => {
    const now = Date.UTC(2026, 9, 21, 12, 0, 0);
    jest.spyOn(Date, "now").mockReturnValue(now);
    await summary();

    expect(receiptAggregate).toHaveBeenCalledTimes(1);
    const [pipeline] = receiptAggregate.mock.calls[0] as [Array<Record<string, Record<string, unknown>>>];
    expect(pipeline).toHaveLength(2);
    // Exactly 30 x 24 hours back: a receipt written at that instant is in, one a millisecond older is out.
    expect(pipeline[0].$match).toEqual({ createdAt: { $gte: new Date(now - 30 * 24 * 60 * 60 * 1000) } });
    expect(pipeline[0].$match.createdAt).toEqual({ $gte: new Date("2026-09-21T12:00:00.000Z") });
    expect(pipeline[1].$group).toEqual({
      _id: { preferences: "$preferences", media: "$media" },
      count: { $sum: 1 },
    });
  });

  it("moves the window with the clock", async () => {
    jest.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 11, 31, 0, 0, 0));
    await summary();

    const [pipeline] = receiptAggregate.mock.calls[0] as [Array<Record<string, { createdAt?: { $gte: Date } }>>];
    expect(pipeline[0].$match.createdAt?.$gte.toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });

  it.each([7, 30, 90, 365])("counts the last %i days when asked", async (days) => {
    const now = Date.UTC(2026, 9, 21, 12, 0, 0);
    jest.spyOn(Date, "now").mockReturnValue(now);
    const res = await summary(`days=${days}`);

    expect(res.status).toBe(200);
    expect((await res.json()).days).toBe(days);
    const [pipeline] = receiptAggregate.mock.calls[0] as [Array<Record<string, { createdAt?: { $gte: Date } }>>];
    expect(pipeline[0].$match.createdAt?.$gte).toEqual(new Date(now - days * 24 * 60 * 60 * 1000));
  });

  it.each([
    ["a period that is not offered", "days=14"],
    ["zero", "days=0"],
    ["a word", "days=month"],
    ["an empty value", "days="],
    ["a fraction", "days=30.5"],
  ])("answers 400 for %s and counts nothing", async (_label, query) => {
    const res = await summary(query);

    expect(res.status).toBe(400);
    expect(receiptAggregate).not.toHaveBeenCalled();
  });
});
