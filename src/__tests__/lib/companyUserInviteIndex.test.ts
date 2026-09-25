/**
 * @jest-environment node
 */
/**
 * A company could hold only ONE pending team invite: the unique index on
 * (companyId, userId) was `sparse`, and sparse does not skip a compound key when
 * companyId is present, so every unclaimed invite sat under userId: null and the
 * second one failed with E11000 (audit 2026-09-24). Uniqueness must apply only
 * to claimed seats — in the schema AND in ensureIndexes(), since autoIndex is off.
 */

import fs from "node:fs";
import path from "node:path";
import { CompanyUser } from "@/models/CompanyUser";

const INDEXES_FILE = path.join(process.cwd(), "src/lib/db/indexes.ts");
const KEY = { companyId: 1, userId: 1 };
const PARTIAL = { userId: { $type: "objectId" } };

type IndexEntry = [
  Record<string, unknown>,
  { unique?: boolean; sparse?: boolean; partialFilterExpression?: Record<string, unknown> },
];

function companyUsersBlock(): string {
  const src = fs.readFileSync(INDEXES_FILE, "utf8");
  const start = src.indexOf('safeCreateIndexes(db, "companyusers"');
  expect(start).toBeGreaterThan(-1);
  const end = src.indexOf("]);", start);
  return src.slice(start, end).replace(/\/\/.*$/gm, "").replace(/\s+/g, " ");
}

describe("company member uniqueness index", () => {
  it("the schema makes (companyId, userId) unique for claimed seats only", () => {
    const declared = (CompanyUser.schema.indexes() as IndexEntry[])
      .find(([key]) => JSON.stringify(key) === JSON.stringify(KEY));
    expect(declared).toBeDefined();
    const [, options] = declared!;
    expect(options.unique).toBe(true);
    expect(options.sparse).toBeUndefined();
    expect(options.partialFilterExpression).toEqual(PARTIAL);
  });

  it("ensureIndexes() builds the same partial index, not the sparse one", () => {
    const block = companyUsersBlock();
    const at = block.indexOf("key: { companyId: 1, userId: 1 }");
    expect(at).toBeGreaterThan(-1);
    const next = block.indexOf("key:", at + 10);
    const spec = block.slice(at, next === -1 ? undefined : next);
    expect(spec).toContain("unique: true");
    expect(spec).toContain('partialFilterExpression: { userId: { $type: "objectId" } }');
    expect(spec).not.toContain("sparse");
  });
});
