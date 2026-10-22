/**
 * The logic of scripts/consent-receipt-unique-index.mjs, kept free of any
 * connection so a test can run it against a stand-in collection.
 *
 * Two unique indexes, built the same way:
 *   - consentreceipts: one receipt per choice reference ({ receiptId: 1 });
 *   - consentlogs: one row per (account, choice reference, category)
 *     ({ userId: 1, receiptId: 1, consentType: 1 }, only over rows that HAVE a
 *     reference: terms, marketing and older rows have none and repeat legitimately).
 *
 * What it needs from a collection: indexes(), find(filter, options).sort()
 * (async-iterable), deleteMany(), dropIndex(), createIndex(). The duplicate scan
 * streams the rows in key order (sorted on disk if need be), so memory holds one
 * group's rows at a time.
 *
 * Order with apply: remove duplicates (the oldest of each group is kept), then
 * ONE MORE duplicate pass right before the build (a resend can land while the
 * script runs), drop an old non-unique index on the same key, build the unique
 * one. If the build still meets a duplicate (E11000), the plain index is put back
 * so lookups don't scan, and the log says to re-run the script.
 */

/** The default name MongoDB (and Mongoose) give an index on { receiptId: 1 }. */
export const INDEX_NAME = "receiptId_1";
/** The name MongoDB gives { userId: 1, receiptId: 1, consentType: 1 }. */
export const CONSENT_LOG_INDEX_NAME = "userId_1_receiptId_1_consentType_1";

/** Rows removed per deleteMany, so a big clean-up is not one huge command. */
const DELETE_BATCH = 1000;

const RECEIPT_TARGET = {
  label: "receiptId",
  name: INDEX_NAME,
  key: { receiptId: 1 },
  filter: {},
  options: {},
  groupOf: (doc) => String(doc.receiptId),
};

const CONSENT_LOG_TARGET = {
  label: "consent log (userId, receiptId, consentType)",
  name: CONSENT_LOG_INDEX_NAME,
  key: { userId: 1, receiptId: 1, consentType: 1 },
  filter: { receiptId: { $type: "string" } },
  options: { partialFilterExpression: { receiptId: { $type: "string" } } },
  groupOf: (doc) => `${String(doc.userId)}|${doc.receiptId}|${doc.consentType}`,
};

const sameKey = (index, key) => JSON.stringify(index.key ?? {}) === JSON.stringify(key);

/**
 * Read-only. Which index exists on the target key, and which rows are duplicates: for every group with more than
 * one row, everything except the oldest (createdAt, then _id) is listed in `toDelete`.
 */
async function plan(collection, target) {
  const indexes = await collection.indexes();
  const existing = indexes.find((index) => sameKey(index, target.key));

  const toDelete = [];
  let duplicateGroups = 0;
  let current = null;
  let rowsOfCurrent = 0;
  const projection = Object.fromEntries([...Object.keys(target.key), "createdAt"].map((field) => [field, 1]));
  const cursor = collection
    .find(target.filter, { projection, allowDiskUse: true })
    .sort({ ...target.key, createdAt: 1, _id: 1 });
  for await (const doc of cursor) {
    const group = target.groupOf(doc);
    if (group === current) {
      rowsOfCurrent += 1;
      if (rowsOfCurrent === 2) duplicateGroups += 1;
      toDelete.push(doc._id);
    } else {
      current = group;
      rowsOfCurrent = 1;
    }
  }

  return {
    indexes: indexes.map((index) => index.name),
    hasUnique: Boolean(existing?.unique),
    hasOldNonUnique: Boolean(existing && !existing.unique),
    existingName: existing?.name ?? null,
    duplicateGroups,
    duplicateDocuments: toDelete.length,
    toDelete,
  };
}

async function deleteAll(collection, ids) {
  let deleted = 0;
  for (let from = 0; from < ids.length; from += DELETE_BATCH) {
    const result = await collection.deleteMany({ _id: { $in: ids.slice(from, from + DELETE_BATCH) } });
    deleted += result.deletedCount ?? 0;
  }
  return deleted;
}

async function runTarget(collection, target, { apply, log = () => undefined }) {
  const first = await plan(collection, target);
  log(`indexes: ${first.indexes.join(", ") || "(none)"}`);
  log(`${target.label} index: ${first.hasUnique ? "unique" : first.hasOldNonUnique ? `${first.existingName} (not unique)` : "absent"}`);
  log(`${first.duplicateGroups} duplicate group(s), ${first.duplicateDocuments} extra row(s) to remove (the oldest of each is kept)`);

  if (first.hasUnique) {
    log(`${target.label} is already unique: nothing to do.`);
    return { applied: false, deleted: 0 };
  }
  if (!apply) {
    log("Dry run: nothing written. Re-run with --apply to remove the duplicates and build the unique index.");
    return { applied: false, deleted: 0 };
  }

  let deleted = await deleteAll(collection, first.toDelete);
  // One more pass right before the build: a resend may have landed since the first scan.
  const second = await plan(collection, target);
  deleted += await deleteAll(collection, second.toDelete);
  log(`removed ${deleted} duplicate row(s)${second.toDelete.length ? ` (${second.toDelete.length} in the second pass)` : ""}`);

  if (second.hasOldNonUnique) {
    await collection.dropIndex(second.existingName);
    log(`dropped ${second.existingName}`);
  }
  try {
    await collection.createIndex(target.key, { unique: true, name: target.name, ...target.options });
  } catch (err) {
    if (err?.code !== 11000) throw err;
    // A duplicate arrived after the last pass. Put the plain index back so lookups keep using an index.
    await collection.createIndex(target.key, { name: target.name, ...target.options });
    log(
      `E11000: a duplicate ${target.label} row arrived while the script ran, so the UNIQUE index was NOT built ` +
        `(the plain ${target.name} index was put back). RE-RUN THE SCRIPT with --apply.`,
    );
    return { applied: false, deleted, rerun: true };
  }
  log(`built the unique index ${target.name}`);
  return { applied: true, deleted };
}

/** Read-only plan for the receipts' unique receiptId index. */
export function planUniqueIndex(collection) {
  return plan(collection, RECEIPT_TARGET);
}

/**
 * Dry run unless `apply`. With apply: delete the duplicate receipts (oldest kept), one more pass, drop the old
 * non-unique receiptId index, build the unique one. The TTL index on createdAt is never touched.
 *
 * @param {any} collection
 * @param {{ apply: boolean, log?: (line: string) => void }} options
 */
export function run(collection, options) {
  return runTarget(collection, RECEIPT_TARGET, options);
}

/** Read-only plan for the consent log's unique (userId, receiptId, consentType) index. */
export function planConsentLogUniqueIndex(collection) {
  return plan(collection, CONSENT_LOG_TARGET);
}

/**
 * The same for consentlogs: one row per account, choice reference and category, over rows that have a reference.
 *
 * @param {any} collection
 * @param {{ apply: boolean, log?: (line: string) => void }} options
 */
export function runConsentLogUniqueIndex(collection, options) {
  return runTarget(collection, CONSENT_LOG_TARGET, options);
}
