/**
 * @jest-environment node
 */
/**
 * ConsentLog.receiptId: the choice reference a cookie row is written with, which
 * ties a signed-in user's row to the anonymous ConsentReceipt that proves what
 * wording they saw.
 */
import fs from "node:fs";
import path from "node:path";
import ConsentLog from "@/models/ConsentLog";

const RECEIPT_ID = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";
const USER_ID = "507f1f77bcf86cd799439011";

const build = (extra: Record<string, unknown> = {}) =>
  new ConsentLog({ userId: USER_ID, userName: "Sam Seeker", consentType: "cookies.media", granted: false, ...extra });

describe("ConsentLog model: the choice reference", () => {
  it("carries an optional reference, trimmed and capped at 36 characters like the receipt's", () => {
    const receiptId = ConsentLog.schema.path("receiptId") as unknown as { options: Record<string, unknown> };
    expect(receiptId.options.type).toBe(String);
    expect(receiptId.options.trim).toBe(true);
    expect(receiptId.options.maxlength).toBe(36);
    expect(receiptId.options.required).toBeFalsy();
  });

  it("keeps the reference on a built row, trimmed (a server still running the older schema would drop it)", async () => {
    const row = build({ receiptId: ` ${RECEIPT_ID} ` });

    expect(row.receiptId).toBe(RECEIPT_ID);
    expect(row.toObject()).toHaveProperty("receiptId", RECEIPT_ID);
    await expect(row.validate()).resolves.toBeUndefined();
  });

  it("rejects a reference longer than 36 characters", async () => {
    const row = build({ receiptId: `${RECEIPT_ID}-extra` });

    await expect(row.validate()).rejects.toMatchObject({ errors: { receiptId: expect.anything() } });
  });

  it("still validates a row that has no reference (older rows, terms, marketing)", async () => {
    const row = build({ consentType: "marketing", granted: true });

    expect(row.receiptId).toBeUndefined();
    await expect(row.validate()).resolves.toBeUndefined();
  });

  it("is looked up by exact reference, so it is indexed in the database (autoIndex is off)", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/lib/db/indexes.ts"), "utf8");
    const start = src.indexOf('"consentlogs"');
    const block = src.slice(start, src.indexOf("]);", start));
    expect(block).toContain("{ key: { receiptId: 1 }, sparse: true }");
  });
});

describe("ConsentLog model: one row per account, choice reference and category", () => {
  const SPEC = "{ key: { userId: 1, receiptId: 1, consentType: 1 }, unique: true, partialFilterExpression: { receiptId: { $type: \"string\" } } }";

  it("declares a unique index over rows that have a reference (terms, marketing and older rows repeat legitimately)", () => {
    const found = ConsentLog.schema
      .indexes()
      .find(([key]: [Record<string, unknown>, ...unknown[]]) => JSON.stringify(key) === JSON.stringify({ userId: 1, receiptId: 1, consentType: 1 }));
    expect(found).toBeDefined();
    expect(found?.[1]).toMatchObject({ unique: true, partialFilterExpression: { receiptId: { $type: "string" } } });
  });

  it("creates it in the database too (autoIndex is off, so indexes.ts must declare it)", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/lib/db/indexes.ts"), "utf8");
    const start = src.indexOf('"consentlogs"');
    const block = src.slice(start, src.indexOf("]);", start));
    expect(block).toContain(SPEC);
  });
});
