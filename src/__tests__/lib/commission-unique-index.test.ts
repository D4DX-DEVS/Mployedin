/**
 * @jest-environment node
 */
/**
 * `createCommissionRecordsForInvoice()` is check-then-create (countDocuments,
 * then create) and relies on a unique (invoiceId, agentId, type) index to make
 * that safe under concurrency. The Commission schema declares that index, but
 * `autoIndex` is off, so only `ensureIndexes()` in `src/lib/db/indexes.ts`
 * creates anything. This test fails if the two ever disagree — which is the
 * state that let duplicate commission records slip through a double-submitted
 * approve / verify-payment call.
 */

import fs from "node:fs";
import path from "node:path";
import { Commission } from "@/models/Commission";

const INDEXES_FILE = path.join(process.cwd(), "src/lib/db/indexes.ts");
const UNIQUE_KEY = { invoiceId: 1, agentId: 1, type: 1 };

type IndexEntry = [
  Record<string, unknown>,
  { unique?: boolean; partialFilterExpression?: Record<string, unknown> },
];

function commissionsBlock(): string {
  const src = fs.readFileSync(INDEXES_FILE, "utf8");
  const start = src.indexOf('safeCreateIndexes(db, "commissions"');
  expect(start).toBeGreaterThan(-1);
  const end = src.indexOf("]);", start);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end).replace(/\s+/g, " ");
}

describe("commission idempotency index", () => {
  it("the Commission schema declares a unique partial (invoiceId, agentId, type) index", () => {
    const declared = (Commission.schema.indexes() as IndexEntry[])
      .find(([key]) => JSON.stringify(key) === JSON.stringify(UNIQUE_KEY));
    expect(declared).toBeDefined();
    const [, options] = declared!;
    expect(options.unique).toBe(true);
    expect(options.partialFilterExpression).toEqual({ invoiceId: { $exists: true } });
  });

  it("ensureIndexes() registers that same unique index, because autoIndex is off", () => {
    const block = commissionsBlock();
    const at = block.indexOf("key: { invoiceId: 1, agentId: 1, type: 1 }");
    expect(at).toBeGreaterThan(-1);
    const next = block.indexOf("key:", at + 10);
    const spec = block.slice(at, next === -1 ? undefined : next);
    expect(spec).toContain("unique: true");
    expect(spec).toContain("partialFilterExpression: { invoiceId: { $exists: true } }");
  });
});
