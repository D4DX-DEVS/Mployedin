/**
 * @jest-environment node
 *
 * autoIndex is off: only ensureIndexes() creates anything. These are the
 * WhatsApp lookups that run on every send, read off the file as the
 * index-coverage test does.
 */
import fs from "node:fs";
import path from "node:path";

const src = fs.readFileSync(path.join(process.cwd(), "src/lib/db/indexes.ts"), "utf8");

/** The index list of one safeCreateIndexes block, whitespace collapsed. */
function block(collection: string): string {
  const start = src.indexOf(`safeCreateIndexes(db, "${collection}"`);
  if (start < 0) return "";
  return src.slice(start, src.indexOf("]);", start)).replace(/\s+/g, " ");
}

describe("WhatsApp indexes", () => {
  it("serves the per-number daily cap: WhatsAppMessageLog by recipient and time", () => {
    expect(block("whatsappmessagelogs")).toContain("{ key: { to: 1, sentAt: -1 } }");
  });

  // The personal START code: the webhook finds the account by it, and two accounts must never share one. Accounts
  // without a code (most of them) stay out of the index.
  it("keeps START codes unique among the users that have one", () => {
    expect(block("users")).toContain('{ key: { "whatsapp.startCode": 1 }, unique: true, partialFilterExpression: { "whatsapp.startCode": { $type: "string" } }');
  });

  it("keeps one suppression entry per number", () => {
    expect(block("whatsappsuppressions")).toContain("{ key: { number: 1 }, unique: true }");
  });
});
