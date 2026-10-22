/**
 * @jest-environment node
 */
/**
 * The cookie-choice grouping, run for real: the admin routes against a MongoDB
 * the test owns, so $group, $facet and the outcome filter are checked by the
 * database itself rather than by reading the pipeline.
 *
 * Skipped unless CONSENT_CHOICES_DB_URI names a throwaway LOCAL database, e.g.
 *   mongod --dbpath <scratch>/db --port 27999
 *   CONSENT_CHOICES_DB_URI=mongodb://127.0.0.1:27999/consent_choices_verify npx jest admin-gdpr-consent-choices.db
 * It refuses any other host (the app's .env points at a shared database), refuses
 * a database whose name doesn't contain "test" or "verify", and drops its database
 * when it finishes.
 */
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { bannerTextHash } from "@/lib/consent/bannerTextHash";

const URI = process.env.CONSENT_CHOICES_DB_URI ?? "";
const LOCAL = /^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(URI);
// The suite drops its database when it ends, so the name must say it is throwaway.
const DB_NAME = /^mongodb:\/\/[^/]+\/([^/?]+)/.exec(URI)?.[1] ?? "";
const THROWAWAY = /test|verify|throwaway|scratch/i.test(DB_NAME);
if (URI && LOCAL && !THROWAWAY) {
  throw new Error(
    `CONSENT_CHOICES_DB_URI database "${DB_NAME}" is not marked throwaway: this suite drops it. ` +
      `Use a name containing "test" or "verify", e.g. consent_choices_verify.`,
  );
}
const describeDb = URI && LOCAL && THROWAWAY ? describe : describe.skip;

jest.mock("@/lib/db/mongoose", () => ({
  connectDB: jest.fn(async () => {
    const m = jest.requireActual("mongoose") as typeof import("mongoose");
    if (m.connection.readyState !== 1) await m.connect(process.env.CONSENT_CHOICES_DB_URI as string);
  }),
}));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown, params?: Record<string, string>) => Promise<Response>) =>
    async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
      const params = context ? await context.params : {};
      try {
        return await handler(req, { userId: "64d000000000000000000001", role: "admin", locale: "en" }, params);
      } catch (err) {
        if (err instanceof NextResponse) return err;
        throw err;
      }
    },
}));

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const at = (msAgo: number) => new Date(NOW - msAgo);

const SARA = new mongoose.Types.ObjectId();
const OMAR = new mongoose.Types.ObjectId();
const LINA = new mongoose.Types.ObjectId(); // no user document: an erased account

const REF_A = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed"; // Sara, Reject all, a day ago
const REF_B = "0f8fad5b-d9cb-469f-a165-70867728950e"; // Sara, Accept all from Cookie settings, 2 hours ago
const REF_C = "7c9e6679-7425-40de-944b-e07fc1f90ae7"; // Lina, only the videos row was written
const REF_D = "16fd2706-8baf-433b-82eb-8c7fada847da"; // Omar, 40 days ago
const REF_E = "9b2f6c3e-5d1a-4c8b-a7e2-3f4d5c6b7a81"; // Omar, 200 days ago: two Display settings rows that disagree

const row = (userId: mongoose.Types.ObjectId, userName: string, consentType: string, granted: boolean, createdAt: Date, extra: Record<string, unknown> = {}) => ({
  userId,
  userName,
  consentType,
  granted,
  source: "banner",
  policyVersion: "cookie-v1",
  ipAddress: "203.0.113.9",
  createdAt,
  updatedAt: createdAt,
  ...extra,
});

/** Both category rows of one choice, written a few milliseconds apart like insertMany does. */
const choice = (userId: mongoose.Types.ObjectId, userName: string, prefs: boolean, media: boolean, createdAt: Date, extra: Record<string, unknown> = {}) => [
  row(userId, userName, "cookies.preferences", prefs, createdAt, extra),
  row(userId, userName, "cookies.media", media, new Date(createdAt.getTime() + 3), extra),
];

/** 100 ms into a second, so a choice's second row (3 ms later) lands in the same second. */
const inSecond = (d: Date) => new Date(Math.floor(d.getTime() / 1000) * 1000 + 100);
// Two pre-reference choices by Lina, a minute apart: two choices, not one.
const LINA_OLD_1 = inSecond(at(6 * DAY));
const LINA_OLD_2 = new Date(LINA_OLD_1.getTime() + 60_000);
// Omar's pre-reference choice: the two rows land in the same second.
const OMAR_OLD = inSecond(at(3 * DAY));
const OMAR_STRAY = at(200 * DAY);

const ROWS = [
  ...choice(SARA, "Sara Ahmed", false, false, at(1 * DAY), { receiptId: REF_A }),
  ...choice(SARA, "Sara Ahmed", true, true, at(2 * 60 * 60 * 1000), { receiptId: REF_B, source: "settings" }),
  ...choice(OMAR, "Omar Khan", true, false, OMAR_OLD),
  row(LINA, "Lina Haddad", "cookies.media", true, at(5 * DAY), { receiptId: REF_C }),
  ...choice(LINA, "Lina Haddad", false, false, LINA_OLD_1),
  ...choice(LINA, "Lina Haddad", true, true, LINA_OLD_2),
  ...choice(OMAR, "Omar Khan", false, true, at(40 * DAY), { receiptId: REF_D }),
  // A stray duplicate: one choice whose two Display settings rows disagree. It must never read as On.
  row(OMAR, "Omar Khan", "cookies.preferences", true, OMAR_STRAY, { receiptId: REF_E }),
  row(OMAR, "Omar Khan", "cookies.preferences", false, new Date(OMAR_STRAY.getTime() + 2), { receiptId: REF_E }),
  row(OMAR, "Omar Khan", "cookies.media", true, new Date(OMAR_STRAY.getTime() + 3), { receiptId: REF_E }),
  // Not cookie choices: never in this list.
  row(SARA, "Sara Ahmed", "terms_and_privacy", true, at(1 * DAY), { source: "registration", policyVersion: "2026-09-29" }),
  row(OMAR, "Omar Khan", "cookies", true, at(3 * DAY), { source: "registration" }),
];

interface Row {
  userName: string;
  userEmail: string | null;
  receiptId: string | null;
  preferences: boolean | null;
  media: boolean | null;
  outcome: string;
  source: string | null;
  recordedAt: string;
}
interface Page {
  data: Row[];
  total: number;
  totalPages: number;
}

async function list(query = ""): Promise<Page> {
  const { GET } = await import("@/app/api/admin/gdpr/consent/choices/route");
  const res = await GET(new NextRequest(`http://localhost:3000/api/admin/gdpr/consent/choices?${query}`), { params: Promise.resolve({}) });
  expect(res.status).toBe(200);
  return res.json();
}

const refs = (page: Page) => page.data.map((r) => r.receiptId ?? `${r.userName}@${r.recordedAt}`);

describeDb("cookie choices against a real database", () => {
  beforeAll(async () => {
    const { connectDB } = await import("@/lib/db/mongoose");
    await connectDB();
    const db = mongoose.connection.db!;
    await db.dropDatabase();
    await db.collection("consentlogs").insertMany(ROWS);
    await db.collection("users").insertMany([
      { _id: SARA, name: "Sara Ahmed", email: "sara@example.com" },
      { _id: OMAR, name: "Omar Khan", email: "omar@example.com" },
    ]);
    await db.collection("consentreceipts").insertOne({
      receiptId: REF_A, preferences: false, media: false, version: 1, locale: "en",
      bannerTextHash: bannerTextHash("en"), source: "banner", createdAt: at(1 * DAY),
    });
  });

  afterAll(async () => {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.db!.dropDatabase();
      await mongoose.disconnect();
    }
  });

  it("turns each saved choice into one row: 11 cookie rows in the last 30 days are 6 choices", async () => {
    const page = await list();

    expect(page.total).toBe(6);
    expect(page.data).toHaveLength(6);
    expect(refs(page).filter((r) => r === REF_A)).toHaveLength(1);
  });

  it("joins the two rows of a choice: Reject all reads as rejected with both categories off", async () => {
    const page = await list(`search=${REF_A}`);

    expect(page.data).toEqual([
      expect.objectContaining({ receiptId: REF_A, userName: "Sara Ahmed", userEmail: "sara@example.com", preferences: false, media: false, outcome: "rejected", source: "banner" }),
    ]);
  });

  it("groups rows written before references existed by account and second", async () => {
    const page = await list("search=omar%40example");

    expect(page.data).toEqual([
      expect.objectContaining({ receiptId: null, userName: "Omar Khan", preferences: true, media: false, outcome: "custom", recordedAt: OMAR_OLD.toISOString() }),
    ]);
  });

  it("keeps two pre-reference choices a minute apart as two choices", async () => {
    const page = await list("search=Lina");

    expect(page.total).toBe(3);
    expect(page.data.filter((r) => r.receiptId === null).map((r) => r.outcome).sort()).toEqual(["accepted", "rejected"]);
  });

  it("shows a lone single-category row as custom, with the missing category not recorded", async () => {
    const page = await list(`search=${REF_C}`);

    expect(page.data).toEqual([expect.objectContaining({ receiptId: REF_C, preferences: null, media: true, outcome: "custom", userEmail: null })]);
  });

  it.each([
    ["accepted", [REF_B, "Lina Haddad@" + LINA_OLD_2.toISOString()]],
    ["rejected", [REF_A, "Lina Haddad@" + LINA_OLD_1.toISOString()]],
    ["custom", ["Omar Khan@" + OMAR_OLD.toISOString(), REF_C]],
  ])("filters %s choices", async (outcome, expected) => {
    const page = await list(`outcome=${outcome}`);

    expect(refs(page).sort()).toEqual([...expected].sort());
    expect(page.total).toBe(expected.length);
  });

  it("never overstates a category: two Display settings rows that disagree read as not recorded", async () => {
    const page = await list(`search=${REF_E}&days=365`);

    expect(page.data).toEqual([expect.objectContaining({ receiptId: REF_E, preferences: null, media: true, outcome: "custom" })]);
  });

  it("finds a full reference outside the period: Omar's choice from 40 days ago, in the default 30-day view", async () => {
    expect(refs(await list(`search=${REF_D}`))).toEqual([REF_D]);
    expect(refs(await list(`search=${REF_E}&days=7`))).toEqual([REF_E]);
  });

  it("keeps the period for a name search", async () => {
    expect(refs(await list("search=Omar&days=365"))).toEqual(expect.arrayContaining([REF_D, REF_E]));
    expect(refs(await list("search=Omar"))).not.toContain(REF_D);
  });

  it("filters by source", async () => {
    expect(refs(await list("source=settings"))).toEqual([REF_B]);
  });

  it("moves the window with the period", async () => {
    expect((await list("days=7")).total).toBe(6);
    expect(refs(await list("days=90"))).toContain(REF_D);
    expect((await list("days=90")).total).toBe(7);
    expect(refs(await list("days=365"))).toContain(REF_D);
  });

  it("finds a choice by its reference typed in upper case", async () => {
    expect(refs(await list(`search=${REF_B.toUpperCase()}`))).toEqual([REF_B]);
  });

  it("sorts newest first by default and oldest first on request", async () => {
    const newest = await list();
    expect(newest.data[0].receiptId).toBe(REF_B);
    const oldest = await list("order=asc");
    expect(oldest.data[0].recordedAt).toBe(LINA_OLD_1.toISOString());
  });

  it("pages through choices, with the total counting choices on every page", async () => {
    const first = await list("pageSize=10&page=1&days=90");
    const second = await list("pageSize=10&page=2&days=90");

    expect(first.data).toHaveLength(7);
    expect(first.totalPages).toBe(1);
    expect(second.data).toEqual([]);
    expect(second.total).toBe(7);
  });

  it("never returns an IP address", async () => {
    const { GET } = await import("@/app/api/admin/gdpr/consent/choices/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/admin/gdpr/consent/choices?days=365"), { params: Promise.resolve({}) });
    expect(await res.text()).not.toContain("203.0.113.9");
  });

  describe("one consent record", () => {
    async function record(ref: string) {
      const { GET } = await import("@/app/api/admin/gdpr/consent/choices/[receiptId]/route");
      const res = await GET(new NextRequest(`http://localhost:3000/api/admin/gdpr/consent/choices/${ref}`), { params: Promise.resolve({ receiptId: ref }) });
      return { status: res.status, body: res.status === 200 ? await res.json() : null };
    }

    it("marks an earlier choice as replaced and lists the later one, tagged later", async () => {
      const { status, body } = await record(REF_A);

      expect(status).toBe(200);
      expect(body.status).toBe("replaced");
      expect(body.record).toEqual(expect.objectContaining({ receiptId: REF_A, outcome: "rejected", userEmail: "sara@example.com" }));
      expect(body.otherChoices).toEqual([
        expect.objectContaining({ relation: "later", outcome: "accepted", preferences: true, media: true, source: "settings" }),
      ]);
      expect(body.wording).toBe("same");
    });

    it("marks the newest choice as current; with no stored details the wording is unknown", async () => {
      const { body } = await record(REF_B);

      expect(body.status).toBe("current");
      expect(body.otherChoices).toEqual([expect.objectContaining({ relation: "earlier", outcome: "rejected" })]);
      expect(body.wording).toBe("unknown");
    });

    it("answers 404 for a reference no account row has", async () => {
      expect((await record("6ba7b810-9dad-41d1-80b4-00c04fd430c8")).status).toBe(404);
    });
  });

  describe("lookup by reference: first choice or a later change", () => {
    async function lookup(ref: string) {
      const { GET } = await import("@/app/api/admin/gdpr/consent/receipt/route");
      const res = await GET(new NextRequest(`http://localhost:3000/api/admin/gdpr/consent/receipt?ref=${ref}`), { params: Promise.resolve({}) });
      return res.json();
    }

    it("calls Sara's first choice her first, and the next one a later change", async () => {
      expect((await lookup(REF_A)).linkedAccount).toEqual(expect.objectContaining({ firstChoice: true, source: "banner" }));
      expect((await lookup(REF_B)).linkedAccount).toEqual(expect.objectContaining({ firstChoice: false, source: "settings" }));
    });
  });
});
