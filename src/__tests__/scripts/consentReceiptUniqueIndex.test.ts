/**
 * @jest-environment node
 *
 * scripts/consent-receipt-unique-index.mjs makes ConsentReceipt.receiptId unique in an existing
 * database: it removes duplicate receipts (keeping the oldest per reference), drops the old
 * non-unique receiptId_1 and builds the unique one. A dry run writes nothing. The logic runs here
 * against an in-memory stand-in for the collection.
 */
import {
  CONSENT_LOG_INDEX_NAME,
  INDEX_NAME,
  planConsentLogUniqueIndex,
  planUniqueIndex,
  run,
  runConsentLogUniqueIndex,
} from "../../../scripts/lib/consentReceiptUniqueIndex.mjs";

type Doc = { _id: string; receiptId: string; createdAt: Date };
type Index = { name: string; key: Record<string, number>; unique?: boolean; expireAfterSeconds?: number };

const at = (n: number) => new Date(Date.UTC(2026, 9, n));

function fakeCollection(docs: Doc[], indexes: Index[]) {
  const calls: string[] = [];
  const collection = {
    calls,
    docs,
    indexList: indexes,
    indexes: async () => collection.indexList.map((i) => ({ ...i })),
    find: () => ({
      sort: () => {
        const sorted = [...collection.docs].sort(
          (a, b) => a.receiptId.localeCompare(b.receiptId) || a.createdAt.getTime() - b.createdAt.getTime() || a._id.localeCompare(b._id),
        );
        return {
          async *[Symbol.asyncIterator]() {
            for (const doc of sorted) yield doc;
          },
        };
      },
    }),
    deleteMany: async (filter: { _id: { $in: string[] } }) => {
      calls.push("deleteMany");
      const gone = new Set(filter._id.$in);
      const before = collection.docs.length;
      collection.docs = collection.docs.filter((d) => !gone.has(d._id));
      return { deletedCount: before - collection.docs.length };
    },
    dropIndex: async (name: string) => {
      calls.push(`dropIndex:${name}`);
      collection.indexList = collection.indexList.filter((i) => i.name !== name);
    },
    createIndex: async (key: Record<string, number>, options: { unique?: boolean; name?: string }) => {
      calls.push(`createIndex:${JSON.stringify(key)}:${options.unique ? "unique" : "plain"}`);
      if (options.unique) {
        const seen = new Set<string>();
        for (const d of collection.docs) {
          if (seen.has(d.receiptId)) throw Object.assign(new Error("E11000 duplicate key"), { code: 11000 });
          seen.add(d.receiptId);
        }
      }
      collection.indexList.push({ name: options.name ?? "receiptId_1", key, ...(options.unique ? { unique: true } : {}) });
    },
  };
  return collection;
}

const TTL: Index = { name: "createdAt_1", key: { createdAt: 1 }, expireAfterSeconds: 31536000 };
const OLD: Index = { name: "receiptId_1", key: { receiptId: 1 } };
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("planUniqueIndex", () => {
  it("counts duplicate references and the extra receipts, and says which ones would go (never the oldest)", async () => {
    const col = fakeCollection(
      [
        { _id: "a2", receiptId: ID(1), createdAt: at(2) },
        { _id: "a1", receiptId: ID(1), createdAt: at(1) },
        { _id: "a3", receiptId: ID(1), createdAt: at(3) },
        { _id: "b1", receiptId: ID(2), createdAt: at(1) },
        { _id: "c1", receiptId: ID(3), createdAt: at(5) },
        { _id: "c2", receiptId: ID(3), createdAt: at(4) },
      ],
      [OLD, TTL],
    );

    const plan = await planUniqueIndex(col);

    expect(plan.duplicateGroups).toBe(2);
    expect(plan.duplicateDocuments).toBe(3);
    expect([...plan.toDelete].sort()).toEqual(["a2", "a3", "c1"]);
    expect(plan.hasOldNonUnique).toBe(true);
    expect(plan.hasUnique).toBe(false);
  });

  it("reports a collection that is already unique", async () => {
    const col = fakeCollection([{ _id: "a1", receiptId: ID(1), createdAt: at(1) }], [{ ...OLD, unique: true }, TTL]);
    const plan = await planUniqueIndex(col);
    expect(plan).toMatchObject({ hasUnique: true, hasOldNonUnique: false, duplicateGroups: 0, toDelete: [] });
  });

  it("works on an empty collection with no receiptId index at all", async () => {
    const plan = await planUniqueIndex(fakeCollection([], [TTL]));
    expect(plan).toMatchObject({ hasUnique: false, hasOldNonUnique: false, duplicateGroups: 0, toDelete: [] });
  });
});

describe("run", () => {
  const messy = () =>
    fakeCollection(
      [
        { _id: "a1", receiptId: ID(1), createdAt: at(1) },
        { _id: "a2", receiptId: ID(1), createdAt: at(2) },
        { _id: "b1", receiptId: ID(2), createdAt: at(1) },
      ],
      [OLD, TTL],
    );

  it("is a dry run by default: it reports and writes nothing", async () => {
    const col = messy();
    const lines: string[] = [];
    const result = await run(col, { apply: false, log: (line: string) => lines.push(line) });

    expect(result).toEqual({ applied: false, deleted: 0 });
    expect(col.calls).toEqual([]);
    expect(col.docs).toHaveLength(3);
    expect(col.indexList.map((i) => i.name)).toEqual(["receiptId_1", "createdAt_1"]);
    expect(lines.join("\n")).toMatch(/dry run/i);
    expect(lines.join("\n")).toMatch(/1 duplicate/);
  });

  it("with apply: deletes duplicates (oldest kept), drops the old index, builds the unique one", async () => {
    const col = messy();
    const result = await run(col, { apply: true, log: () => undefined });

    expect(result).toEqual({ applied: true, deleted: 1 });
    expect(col.docs.map((d) => d._id).sort()).toEqual(["a1", "b1"]);
    expect(col.calls).toEqual(["deleteMany", `dropIndex:${INDEX_NAME}`, 'createIndex:{"receiptId":1}:unique']);
    expect(col.indexList.find((i) => i.key.receiptId === 1)).toMatchObject({ unique: true });
    expect(col.indexList.find((i) => i.name === "createdAt_1")).toMatchObject({ expireAfterSeconds: 31536000 });
  });

  it("builds the unique index only after the duplicates are gone, and never touches the TTL index", async () => {
    const col = messy();
    await run(col, { apply: true, log: () => undefined });
    expect(col.calls.indexOf("deleteMany")).toBeLessThan(col.calls.indexOf('createIndex:{"receiptId":1}:unique'));
    expect(col.calls.some((c) => c.includes("createdAt"))).toBe(false);
  });

  it("does nothing, and says so, when the unique index already exists", async () => {
    const col = fakeCollection([{ _id: "a1", receiptId: ID(1), createdAt: at(1) }], [{ ...OLD, unique: true }, TTL]);
    const lines: string[] = [];
    const result = await run(col, { apply: true, log: (line: string) => lines.push(line) });

    expect(result).toEqual({ applied: false, deleted: 0 });
    expect(col.calls).toEqual([]);
    expect(lines.join("\n")).toMatch(/already unique/i);
  });

  it("builds the unique index without dropping anything when there was no receiptId index", async () => {
    const col = fakeCollection([{ _id: "a1", receiptId: ID(1), createdAt: at(1) }], [TTL]);
    await run(col, { apply: true, log: () => undefined });
    expect(col.calls).toEqual(['createIndex:{"receiptId":1}:unique']);
  });

  it("deletes in batches, so a large clean-up is not one huge command", async () => {
    const docs: Doc[] = [];
    for (let n = 0; n < 2500; n++) {
      docs.push({ _id: `x${n}`, receiptId: ID(1), createdAt: at(1 + (n % 20)) });
    }
    const col = fakeCollection(docs, [OLD, TTL]);
    const result = await run(col, { apply: true, log: () => undefined });

    expect(result.deleted).toBe(2499);
    expect(col.calls.filter((c) => c === "deleteMany").length).toBe(3);
    expect(col.docs).toHaveLength(1);
  });
});

describe("run: a duplicate that arrives during the run", () => {
  const twoDuplicates = () =>
    fakeCollection(
      [
        { _id: "a1", receiptId: ID(1), createdAt: at(1) },
        { _id: "a2", receiptId: ID(1), createdAt: at(2) },
      ],
      [OLD, TTL],
    );

  it("runs one more duplicate pass right before it builds the index, so a late duplicate is removed too", async () => {
    const col = twoDuplicates();
    const realDelete = col.deleteMany;
    let first = true;
    col.deleteMany = async (filter) => {
      const result = await realDelete(filter);
      // A resend lands between the first clean-up and the build.
      if (first) col.docs.push({ _id: "a3", receiptId: ID(1), createdAt: at(3) });
      first = false;
      return result;
    };
    const result = await run(col, { apply: true, log: () => undefined });

    expect(result).toEqual({ applied: true, deleted: 2 });
    expect(col.docs.map((d) => d._id)).toEqual(["a1"]);
    expect(col.indexList.find((i) => i.key.receiptId === 1)).toMatchObject({ unique: true });
  });

  it("on E11000 says clearly to re-run the script, and puts the plain index back so lookups don't scan", async () => {
    const col = twoDuplicates();
    const realDrop = col.dropIndex;
    col.dropIndex = async (name) => {
      await realDrop(name);
      // A duplicate lands after the last clean-up, just before the build.
      col.docs.push({ _id: "a9", receiptId: ID(1), createdAt: at(9) });
    };
    const lines: string[] = [];
    const result = await run(col, { apply: true, log: (line: string) => lines.push(line) });

    expect(result).toMatchObject({ applied: false, rerun: true });
    expect(lines.join("\n")).toMatch(/re-run the script/i);
    expect(col.indexList.find((i) => i.key.receiptId === 1)).toMatchObject({ name: INDEX_NAME });
    expect(col.indexList.find((i) => i.key.receiptId === 1)?.unique).toBeFalsy();
  });

  it("lets the database sort the scan on disk (a large collection must not hit the in-memory sort limit)", async () => {
    const col = twoDuplicates();
    const seen: unknown[] = [];
    const realFind = col.find;
    col.find = ((...args: unknown[]) => {
      seen.push(args[1]);
      return realFind();
    }) as typeof col.find;
    await planUniqueIndex(col);
    expect(seen[0]).toMatchObject({ allowDiskUse: true });
  });
});

/**
 * The same script makes ConsentLog unique per (account, choice reference, category): the receipt route's
 * exists-then-insert is not atomic, so a resend racing the first delivery could write one choice twice.
 */
describe("the ConsentLog unique index", () => {
  type LogDoc = { _id: string; userId: string; receiptId?: string; consentType: string; createdAt: Date };
  function fakeLogCollection(docs: LogDoc[], indexes: Index[]) {
    const calls: string[] = [];
    const key = (d: LogDoc) => `${d.userId}|${d.receiptId}|${d.consentType}`;
    const collection = {
      calls,
      docs,
      indexList: indexes,
      indexes: async () => collection.indexList.map((i) => ({ ...i })),
      find: (filter: { receiptId?: { $type: string } }) => ({
        sort: () => {
          const rows = collection.docs
            .filter((d) => !filter.receiptId || typeof d.receiptId === "string")
            .sort((a, b) => key(a).localeCompare(key(b)) || a.createdAt.getTime() - b.createdAt.getTime() || a._id.localeCompare(b._id));
          return { async *[Symbol.asyncIterator]() { for (const d of rows) yield d; } };
        },
      }),
      deleteMany: async (filter: { _id: { $in: string[] } }) => {
        calls.push("deleteMany");
        const gone = new Set(filter._id.$in);
        const before = collection.docs.length;
        collection.docs = collection.docs.filter((d) => !gone.has(d._id));
        return { deletedCount: before - collection.docs.length };
      },
      dropIndex: async (name: string) => {
        calls.push(`dropIndex:${name}`);
        collection.indexList = collection.indexList.filter((i) => i.name !== name);
      },
      createIndex: async (k: Record<string, number>, options: { unique?: boolean; name?: string; partialFilterExpression?: unknown }) => {
        calls.push(`createIndex:${JSON.stringify(k)}:${options.unique ? "unique" : "plain"}:${JSON.stringify(options.partialFilterExpression ?? null)}`);
        collection.indexList.push({ name: options.name ?? "x", key: k, ...(options.unique ? { unique: true } : {}) });
      },
    };
    return collection;
  }
  const row = (id: string, userId: string, receiptId: string | undefined, consentType: string, day: number): LogDoc => ({
    _id: id, userId, receiptId, consentType, createdAt: at(day),
  });

  it("lists every duplicate of one choice (same account, reference and category), never the oldest, and ignores rows with no reference", async () => {
    const col = fakeLogCollection(
      [
        row("p1", "u1", ID(1), "cookies.preferences", 1),
        row("p2", "u1", ID(1), "cookies.preferences", 2),
        row("m1", "u1", ID(1), "cookies.media", 1),
        row("m2", "u1", ID(1), "cookies.media", 3),
        row("o1", "u2", ID(1), "cookies.media", 1),
        row("t1", "u1", undefined, "terms_and_privacy", 1),
        row("t2", "u1", undefined, "terms_and_privacy", 2),
      ],
      [],
    );
    const plan = await planConsentLogUniqueIndex(col);
    expect([...plan.toDelete].sort()).toEqual(["m2", "p2"]);
    expect(plan.duplicateGroups).toBe(2);
  });

  it("is a dry run by default", async () => {
    const col = fakeLogCollection([row("p1", "u1", ID(1), "cookies.preferences", 1), row("p2", "u1", ID(1), "cookies.preferences", 2)], []);
    const result = await runConsentLogUniqueIndex(col, { apply: false, log: () => undefined });
    expect(result).toEqual({ applied: false, deleted: 0 });
    expect(col.calls).toEqual([]);
  });

  it("with apply: removes the duplicates and builds the unique index, only over rows that have a reference", async () => {
    const col = fakeLogCollection([row("p1", "u1", ID(1), "cookies.preferences", 1), row("p2", "u1", ID(1), "cookies.preferences", 2)], []);
    const result = await runConsentLogUniqueIndex(col, { apply: true, log: () => undefined });
    expect(result).toEqual({ applied: true, deleted: 1 });
    expect(col.docs.map((d) => d._id)).toEqual(["p1"]);
    expect(col.calls.at(-1)).toBe(
      `createIndex:{"userId":1,"receiptId":1,"consentType":1}:unique:${JSON.stringify({ receiptId: { $type: "string" } })}`,
    );
    expect(col.indexList.at(-1)).toMatchObject({ name: CONSENT_LOG_INDEX_NAME, unique: true });
  });

  it("does nothing when the unique index is already there", async () => {
    const col = fakeLogCollection([], [{ name: CONSENT_LOG_INDEX_NAME, key: { userId: 1, receiptId: 1, consentType: 1 }, unique: true }]);
    const lines: string[] = [];
    const result = await runConsentLogUniqueIndex(col, { apply: true, log: (l: string) => lines.push(l) });
    expect(result).toEqual({ applied: false, deleted: 0 });
    expect(lines.join("\n")).toMatch(/already unique/i);
  });
});
