/**
 * @jest-environment node
 */
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));

const authMock = jest.fn();
jest.mock("@/lib/auth/config", () => ({ auth: (...args: unknown[]) => authMock(...args) }));

const rateLimitMock = jest.fn();
jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimit: (...args: unknown[]) => rateLimitMock(...args),
}));

/** ConsentReceipt.updateOne(filter, update, options): the route upserts one receipt per choice reference. */
const receiptUpsertMock = jest.fn();
jest.mock("@/models/ConsentReceipt", () => ({
  __esModule: true,
  default: { updateOne: (...args: unknown[]) => receiptUpsertMock(...args) },
}));

const insertManyMock = jest.fn();
const logExistsMock = jest.fn();
jest.mock("@/models/ConsentLog", () => ({
  __esModule: true,
  default: {
    insertMany: (...args: unknown[]) => insertManyMock(...args),
    exists: (...args: unknown[]) => logExistsMock(...args),
  },
}));

const findByIdMock = jest.fn();
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { findById: (...args: unknown[]) => findByIdMock(...args) },
}));

/** The mpl_consent cookie the request carries; undefined = no cookie. Read by lib/consent/server through next/headers. */
let consentCookie: string | undefined;
jest.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "mpl_consent" && consentCookie !== undefined ? { name, value: consentCookie } : undefined),
  }),
}));

const RECEIPT_ID = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";
const USER_ID = "507f1f77bcf86cd799439011";

function makeRequest(body: unknown, raw?: string, extraHeaders: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost:3000/api/consent/receipt", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: raw ?? JSON.stringify(body),
  });
}

const validBody = { receiptId: RECEIPT_ID, preferences: true, media: false, version: 1, locale: "en", source: "banner" };

/** The cookie writeConsent() leaves in the browser for a choice: same id, same two answers. */
function cookieFor(choice: { receiptId: string; preferences: boolean; media: boolean }, over: Record<string, unknown> = {}): string {
  return encodeURIComponent(
    JSON.stringify({ v: 1, id: choice.receiptId, preferences: choice.preferences, media: choice.media, at: "2026-10-21T09:00:00.000Z", ...over }),
  );
}

/** The document the route writes when the receipt is new ($setOnInsert of the nth upsert). */
function storedDoc(call = 0): Record<string, unknown> {
  const [, update] = receiptUpsertMock.mock.calls[call] as [unknown, { $setOnInsert: Record<string, unknown> }, unknown];
  return update.$setOnInsert;
}

async function post(req: NextRequest): Promise<Response> {
  const { POST } = await import("@/app/api/consent/receipt/route");
  return POST(req);
}

describe("POST /api/consent/receipt", () => {
  const originalTrustedHeader = process.env.TRUSTED_CLIENT_IP_HEADER;

  afterEach(() => {
    if (originalTrustedHeader === undefined) delete process.env.TRUSTED_CLIENT_IP_HEADER;
    else process.env.TRUSTED_CLIENT_IP_HEADER = originalTrustedHeader;
  });

  beforeEach(() => {
    delete process.env.TRUSTED_CLIENT_IP_HEADER;
    jest.clearAllMocks();
    authMock.mockResolvedValue(null);
    rateLimitMock.mockResolvedValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000 });
    receiptUpsertMock.mockResolvedValue({ acknowledged: true, upsertedCount: 1, matchedCount: 0 });
    logExistsMock.mockResolvedValue(null);
    insertManyMock.mockResolvedValue([]);
    consentCookie = cookieFor(validBody);
    findByIdMock.mockReturnValue({ select: () => ({ lean: () => Promise.resolve({ name: "Sam Seeker" }) }) });
  });

  it("stores a minimised receipt and answers 204", async () => {
    const res = await post(makeRequest(validBody));

    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(receiptUpsertMock).toHaveBeenCalledTimes(1);
    const doc = storedDoc();
    expect(doc).toEqual({
      receiptId: RECEIPT_ID,
      preferences: true,
      media: false,
      version: 1,
      locale: "en",
      source: "banner",
      bannerTextHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it("stores where the choice was made (Cookie settings)", async () => {
    const res = await post(makeRequest({ ...validBody, source: "settings" }));

    expect(res.status).toBe(204);
    expect(storedDoc()).toEqual(expect.objectContaining({ source: "settings" }));
  });

  describe("the receipt must match the choice this browser stored", () => {
    it("answers 409 and stores nothing when the request carries no choice cookie (cookies blocked)", async () => {
      authMock.mockResolvedValue({ user: { id: USER_ID } });
      consentCookie = undefined;
      const res = await post(makeRequest(validBody));

      expect(res.status).toBe(409);
      expect(receiptUpsertMock).not.toHaveBeenCalled();
      expect(insertManyMock).not.toHaveBeenCalled();
    });

    it.each([
      ["a different reference", () => cookieFor({ ...validBody, receiptId: "0f8fad5b-d9cb-469f-a165-70867728950e" })],
      ["display settings the other way", () => cookieFor({ ...validBody, preferences: false })],
      ["videos the other way", () => cookieFor({ ...validBody, media: true })],
      ["an older consent version (the browser has no valid choice)", () => cookieFor(validBody, { v: 0 })],
      ["a value that is not a choice", () => "not-json"],
    ])("answers 409 and stores nothing when the cookie holds %s", async (_label, cookie) => {
      authMock.mockResolvedValue({ user: { id: USER_ID } });
      consentCookie = cookie();
      const res = await post(makeRequest(validBody));

      expect(res.status).toBe(409);
      expect(receiptUpsertMock).not.toHaveBeenCalled();
      expect(insertManyMock).not.toHaveBeenCalled();
    });

    it("compares the reference exactly: the cookie's id is lower-case, an upper-case body does not match", async () => {
      const res = await post(makeRequest({ ...validBody, receiptId: RECEIPT_ID.toUpperCase() }));

      expect(res.status).toBe(409);
      expect(receiptUpsertMock).not.toHaveBeenCalled();
    });

    it("answers 400 for a choice made under an older consent version, and stores nothing", async () => {
      consentCookie = cookieFor(validBody);
      const res = await post(makeRequest({ ...validBody, version: 2 }));

      expect(res.status).toBe(400);
      expect(receiptUpsertMock).not.toHaveBeenCalled();
    });
  });

  it("never stores an IP, user agent or user id, even when the body sends them", async () => {
    const res = await post(
      makeRequest({ ...validBody, ip: "203.0.113.9", ipAddress: "203.0.113.9", userAgent: "Mozilla", userId: USER_ID }),
    );

    expect(res.status).toBe(204);
    const doc = storedDoc();
    expect(Object.keys(doc).sort()).toEqual(["bannerTextHash", "locale", "media", "preferences", "receiptId", "source", "version"]);
  });

  it("is rate limited per client: 10 a minute in its own bucket", async () => {
    rateLimitMock.mockResolvedValue({ allowed: false, remaining: 0, resetAt: Date.now() + 60_000 });
    process.env.TRUSTED_CLIENT_IP_HEADER = "cf-connecting-ip";
    const res = await post(makeRequest(validBody, undefined, { "cf-connecting-ip": "203.0.113.9" }));

    expect(res.status).toBe(429);
    expect(rateLimitMock).toHaveBeenCalledWith("203.0.113.9", { limit: 10, windowSec: 60, prefix: "consent-receipt" });
    expect(receiptUpsertMock).not.toHaveBeenCalled();
  });

  it("does not give a forged cf-connecting-ip its own bucket when no client-IP header is trusted", async () => {
    const res = await post(makeRequest(validBody, undefined, { "cf-connecting-ip": "203.0.113.9" }));

    expect(res.status).toBe(204);
    expect(rateLimitMock).toHaveBeenCalledTimes(1);
    expect(rateLimitMock).toHaveBeenCalledWith("direct", { limit: 600, windowSec: 60, prefix: "consent-receipt-global" });
  });

  it("uses a generous shared limit when no client address can be trusted (everyone is \"direct\")", async () => {
    // getClientIp answers the constant "direct" without a trusted proxy; ten a
    // minute for the whole site would silently drop real visitors' receipts.
    const res = await post(makeRequest(validBody));

    expect(res.status).toBe(204);
    expect(rateLimitMock).toHaveBeenCalledTimes(1);
    expect(rateLimitMock).toHaveBeenCalledWith("direct", { limit: 600, windowSec: 60, prefix: "consent-receipt-global" });
  });

  it("still answers 429 when even the shared limit is spent", async () => {
    rateLimitMock.mockResolvedValue({ allowed: false, remaining: 0, resetAt: Date.now() + 60_000 });
    const res = await post(makeRequest(validBody));

    expect(res.status).toBe(429);
    expect(receiptUpsertMock).not.toHaveBeenCalled();
  });

  it.each([
    ["no receipt id", { ...validBody, receiptId: undefined }],
    ["a receipt id that is not a uuid", { ...validBody, receiptId: "not-a-uuid" }],
    ["a receipt id longer than 36", { ...validBody, receiptId: `${RECEIPT_ID}-extra` }],
    ["a string for a boolean", { ...validBody, media: "yes" }],
    ["an unknown locale", { ...validBody, locale: "fr" }],
    ["a version that is not a number", { ...validBody, version: "1" }],
    ["an unknown source", { ...validBody, source: "api" }],
  ])("answers 400 for %s and stores nothing", async (_label, body) => {
    const res = await post(makeRequest(body));

    expect(res.status).toBe(400);
    expect(receiptUpsertMock).not.toHaveBeenCalled();
    expect(insertManyMock).not.toHaveBeenCalled();
  });

  it("answers 400 for a body that is not JSON", async () => {
    const res = await post(makeRequest(undefined, "{not json"));
    expect(res.status).toBe(400);
    expect(receiptUpsertMock).not.toHaveBeenCalled();
  });

  it("writes no ConsentLog rows for an anonymous visitor", async () => {
    authMock.mockResolvedValue(null);
    const res = await post(makeRequest(validBody));

    expect(res.status).toBe(204);
    expect(insertManyMock).not.toHaveBeenCalled();
  });

  it("writes cookies.preferences and cookies.media ConsentLog rows, without an IP, when signed in", async () => {
    authMock.mockResolvedValue({ user: { id: USER_ID, role: "job_seeker" } });
    consentCookie = cookieFor({ ...validBody, media: true });
    const res = await post(makeRequest({ ...validBody, source: "settings", media: true }));

    expect(res.status).toBe(204);
    expect(insertManyMock).toHaveBeenCalledTimes(1);
    const rows = insertManyMock.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(rows).toEqual([
      { userId: USER_ID, userName: "Sam Seeker", consentType: "cookies.preferences", granted: true, source: "settings", policyVersion: "cookie-v1", receiptId: RECEIPT_ID },
      { userId: USER_ID, userName: "Sam Seeker", consentType: "cookies.media", granted: true, source: "settings", policyVersion: "cookie-v1", receiptId: RECEIPT_ID },
    ]);
    for (const row of rows) expect(row).not.toHaveProperty("ipAddress");
  });

  it("puts the choice reference on both account rows, the same one the receipt holds", async () => {
    authMock.mockResolvedValue({ user: { id: USER_ID, role: "job_seeker" } });
    consentCookie = cookieFor({ ...validBody, preferences: false, media: false });
    await post(makeRequest({ ...validBody, preferences: false, media: false }));

    const receipt = storedDoc() as { receiptId: string };
    const rows = insertManyMock.mock.calls[0][0] as Array<{ consentType: string; granted: boolean; receiptId?: string }>;
    expect(rows.map((r) => [r.consentType, r.granted, r.receiptId])).toEqual([
      ["cookies.preferences", false, receipt.receiptId],
      ["cookies.media", false, receipt.receiptId],
    ]);
  });

  it("takes the reference pattern and the shared-client key from their shared modules, not local copies", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/app/api/consent/receipt/route.ts"), "utf8");
    expect(src).toContain('from "@/lib/consent/receiptId"');
    expect(src).toContain("FALLBACK_CLIENT");
    expect(src).not.toContain("UNKNOWN_CLIENT");
    expect(src).not.toMatch(/\[0-9a-f\]\{8\}/i);
  });

  it("defaults the ConsentLog source to banner", async () => {
    authMock.mockResolvedValue({ user: { id: USER_ID } });
    const { source: _source, ...withoutSource } = validBody;
    await post(makeRequest(withoutSource));

    const rows = insertManyMock.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(rows.map((r) => r.source)).toEqual(["banner", "banner"]);
  });

  it("stores no source on the receipt when the client sent none: Not recorded, never assumed", async () => {
    const { source: _source, ...withoutSource } = validBody;
    const res = await post(makeRequest(withoutSource));

    expect(res.status).toBe(204);
    expect(storedDoc()).not.toHaveProperty("source");
  });

  it("stores the source on the receipt exactly as sent", async () => {
    await post(makeRequest({ ...validBody, source: "banner" }));

    expect(storedDoc()).toEqual(expect.objectContaining({ source: "banner" }));
  });

  it("still answers 204 when the account log can't be written (the receipt is the evidence)", async () => {
    authMock.mockResolvedValue({ user: { id: USER_ID } });
    insertManyMock.mockRejectedValue(new Error("db down"));
    const res = await post(makeRequest(validBody));

    expect(res.status).toBe(204);
    expect(receiptUpsertMock).toHaveBeenCalledTimes(1);
  });

  it("answers 500 without details when the receipt can't be stored", async () => {
    receiptUpsertMock.mockRejectedValue(new Error("write blocked: secret detail"));
    const res = await post(makeRequest(validBody));

    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("secret detail");
  });

  describe("sending the same receipt again (a retry, or a resend on the next page load)", () => {
    it("upserts one receipt per choice reference: filter on receiptId, fields written only on insert", async () => {
      await post(makeRequest(validBody));

      const [filter, update, options] = receiptUpsertMock.mock.calls[0];
      expect(filter).toEqual({ receiptId: RECEIPT_ID });
      expect(Object.keys(update)).toEqual(["$setOnInsert"]);
      expect(options).toEqual({ upsert: true, runValidators: true });
    });

    it("answers 204 both times and writes one receipt for two identical POSTs", async () => {
      // A tiny in-memory stand-in for the collection: the second upsert finds the first one.
      const rows = new Map<string, unknown>();
      receiptUpsertMock.mockImplementation(async (filter: { receiptId: string }, update: { $setOnInsert: unknown }) => {
        if (rows.has(filter.receiptId)) return { acknowledged: true, upsertedCount: 0, matchedCount: 1 };
        rows.set(filter.receiptId, update.$setOnInsert);
        return { acknowledged: true, upsertedCount: 1, matchedCount: 0 };
      });

      const first = await post(makeRequest(validBody));
      const second = await post(makeRequest(validBody));

      expect(first.status).toBe(204);
      expect(second.status).toBe(204);
      expect(rows.size).toBe(1);
    });

    it("counts a duplicate-key error (two requests racing to insert the same receipt) as success", async () => {
      receiptUpsertMock.mockRejectedValue(Object.assign(new Error("E11000 duplicate key error"), { code: 11000 }));
      const res = await post(makeRequest(validBody));

      expect(res.status).toBe(204);
      expect(await res.text()).toBe("");
    });

    it("still answers 500 for other database errors, such as a write blocked by the storage quota", async () => {
      receiptUpsertMock.mockRejectedValue(Object.assign(new Error("over your space quota"), { code: 8000 }));
      const res = await post(makeRequest(validBody));

      expect(res.status).toBe(500);
    });

    it("writes the account's two ConsentLog rows once: a repeat finds them and writes none", async () => {
      authMock.mockResolvedValue({ user: { id: USER_ID } });
      await post(makeRequest(validBody));
      expect(insertManyMock).toHaveBeenCalledTimes(1);
      expect(logExistsMock).toHaveBeenCalledWith({
        userId: USER_ID,
        receiptId: RECEIPT_ID,
        consentType: { $in: ["cookies.preferences", "cookies.media"] },
      });

      logExistsMock.mockResolvedValue({ _id: "row" });
      const again = await post(makeRequest(validBody));

      expect(again.status).toBe(204);
      expect(insertManyMock).toHaveBeenCalledTimes(1);
    });

    it("still writes the account rows when the first delivery was anonymous and the resend is signed in", async () => {
      receiptUpsertMock.mockResolvedValue({ acknowledged: true, upsertedCount: 0, matchedCount: 1 });
      authMock.mockResolvedValue({ user: { id: USER_ID } });
      const res = await post(makeRequest(validBody));

      expect(res.status).toBe(204);
      expect(insertManyMock).toHaveBeenCalledTimes(1);
    });

    it("still rejects a mismatching resend with 409 and writes nothing", async () => {
      consentCookie = cookieFor({ ...validBody, receiptId: "0f8fad5b-d9cb-469f-a165-70867728950e" });
      const res = await post(makeRequest(validBody));

      expect(res.status).toBe(409);
      expect(receiptUpsertMock).not.toHaveBeenCalled();
    });
  });

  it("hashes the banner text per locale, so en and ar receipts differ", async () => {
    await post(makeRequest(validBody));
    await post(makeRequest({ ...validBody, locale: "ar" }));
    await post(makeRequest(validBody));

    const [en1, ar, en2] = [0, 1, 2].map((n) => (storedDoc(n) as { bannerTextHash: string }).bannerTextHash);
    expect(en1).toBe(en2);
    expect(en1).not.toBe(ar);
  });
});

describe("ConsentReceipt model", () => {
  const { default: ConsentReceipt, CONSENT_RECEIPT_TTL_S } = jest.requireActual("@/models/ConsentReceipt") as typeof import("@/models/ConsentReceipt");

  it("holds the choice, where it was made and the text version, nothing that identifies a person", () => {
    const paths = Object.keys(ConsentReceipt.schema.paths).filter((p) => !["_id", "__v"].includes(p)).sort();
    expect(paths).toEqual(["bannerTextHash", "createdAt", "locale", "media", "preferences", "receiptId", "source", "version"]);
    for (const banned of ["ip", "ipAddress", "userAgent", "userId", "email"]) {
      expect(ConsentReceipt.schema.path(banned)).toBeUndefined();
    }
  });

  it("caps the receipt id at 36 characters, makes it unique (one receipt per choice) and allows only en/ar", () => {
    const receiptId = ConsentReceipt.schema.path("receiptId") as unknown as { options: Record<string, unknown> };
    expect(receiptId.options.maxlength).toBe(36);
    // The index comes from schema.index(), not from the path option, so it can be unique.
    expect(receiptId.options.index).toBeUndefined();
    const indexes = ConsentReceipt.schema.indexes() as Array<[Record<string, unknown>, Record<string, unknown> | undefined]>;
    expect(indexes.find(([fields]) => fields.receiptId === 1 && Object.keys(fields).length === 1)?.[1]).toMatchObject({ unique: true });
    const locale = ConsentReceipt.schema.path("locale") as unknown as { options: { enum: string[] } };
    expect(locale.options.enum).toEqual(["en", "ar"]);
  });

  it("keeps the source optional (older receipts have none) and allows only banner or settings", async () => {
    const source = ConsentReceipt.schema.path("source") as unknown as { options: { enum: string[]; required?: boolean } };
    expect(source.options.enum).toEqual(["banner", "settings"]);
    expect(source.options.required).toBeFalsy();

    const base = { receiptId: RECEIPT_ID, preferences: true, media: false, version: 1, locale: "en", bannerTextHash: "0".repeat(64) };
    await expect(new ConsentReceipt(base).validate()).resolves.toBeUndefined();
    await expect(new ConsentReceipt({ ...base, source: "api" }).validate()).rejects.toMatchObject({ errors: { source: expect.anything() } });
  });

  it("expires receipts a year after they are written (TTL on createdAt)", () => {
    expect(CONSENT_RECEIPT_TTL_S).toBe(365 * 24 * 60 * 60);
    const indexes = ConsentReceipt.schema.indexes() as Array<[Record<string, unknown>, { expireAfterSeconds?: number } | undefined]>;
    expect(indexes.find(([fields, opts]) => fields.createdAt === 1 && opts?.expireAfterSeconds === CONSENT_RECEIPT_TTL_S)).toBeDefined();
  });

  it("creates the same TTL in the database (autoIndex is off, so indexes.ts must declare it)", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/lib/db/indexes.ts"), "utf8");
    const block = src.slice(src.indexOf('"consentreceipts"'), src.indexOf("]);", src.indexOf('"consentreceipts"')));
    expect(block).toContain("{ key: { receiptId: 1 }, unique: true }");
    expect(block).toContain("{ key: { createdAt: 1 }, expireAfterSeconds: 365 * 24 * 60 * 60 }");
  });
});
