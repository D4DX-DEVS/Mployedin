/**
 * Repoint the database from Spaces to R2 after scripts/copy-spaces-to-r2.ts.
 *
 * Walks EVERY document of EVERY collection (no hand-kept field list to go stale)
 * and replaces, from the copy manifest:
 *   - a string that is exactly an old object key (Resource.files[].key,
 *     exhibition attachments, offer letters, download logs...) -> the new key;
 *   - any Spaces URL inside a string (avatar/logo/CV fields, CMS HTML with
 *     <img src>) -> the new R2 URL.
 * Only changed top-level fields are $set. Nothing else is touched.
 *
 * Usage:
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/rewrite-storage-urls.ts --manifest spaces-to-r2-manifest.json            # dry run
 *   ... --apply       write the changes
 *
 * Order: copy (apply) -> this (dry run, read the report) -> this (apply) ->
 * set STORAGE_PROVIDER=r2 and redeploy. Run it again after the switch to catch
 * anything written to Spaces in between (it is idempotent: R2 URLs never match).
 * Rollback: keep the manifest; Spaces stays read-only for 30 days, so pointing
 * back is the same walk with old and new swapped.
 */

import { readFileSync } from "fs";
import mongoose from "mongoose";
import type { AnyBulkWriteOperation } from "mongodb";
import { connectDB } from "@/lib/db/mongoose";
import { createRewriter, spacesHosts, type ManifestEntry } from "@/lib/storage/migration/spacesToR2";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const MANIFEST = args.includes("--manifest") ? args[args.indexOf("--manifest") + 1] : undefined;
const WRITE_BATCH = 50;

const out = (line: string) => process.stdout.write(`${line}\n`);

async function main(): Promise<void> {
  if (!MANIFEST) {
    out("Pass --manifest <file> (written by scripts/copy-spaces-to-r2.ts --apply).");
    process.exit(1);
  }
  const entries = JSON.parse(readFileSync(MANIFEST, "utf8")) as ManifestEntry[];
  const hosts = spacesHosts();
  const rewriter = createRewriter(entries, hosts);
  const hostPattern = new RegExp([...hosts].map((h) => h.replace(/\./g, "\\.")).join("|"), "i");

  out(`Manifest: ${entries.length} objects from ${MANIFEST}`);
  out(`Spaces hosts: ${[...hosts].join(", ")}`);
  out(`Mode: ${APPLY ? "APPLY (writing)" : "DRY RUN (nothing written)"}`);
  out("");

  await connectDB();
  const db = mongoose.connection.db!;
  const collections = (await db.listCollections({}, { nameOnly: true }).toArray())
    .map((c) => c.name)
    .filter((name) => !name.startsWith("system."))
    .sort();

  let totalDocs = 0;
  let totalReplacements = 0;
  let leftovers = 0;

  for (const name of collections) {
    const collection = db.collection(name);
    let docs = 0;
    let replacements = 0;
    let stillOnSpaces = 0;
    let ops: AnyBulkWriteOperation[] = [];

    const cursor = collection.find({}).batchSize(50);
    for await (const doc of cursor) {
      const { _id, ...rest } = doc;
      const { value, changed } = rewriter.rewrite(rest as Record<string, unknown>);
      if (hostPattern.test(JSON.stringify(value))) stillOnSpaces++;
      if (!changed) continue;

      const set: Record<string, unknown> = {};
      for (const [field, v] of Object.entries(value)) {
        if (v !== (rest as Record<string, unknown>)[field]) set[field] = v;
      }
      docs++;
      replacements += changed;
      if (APPLY) {
        ops.push({ updateOne: { filter: { _id }, update: { $set: set } } });
        if (ops.length >= WRITE_BATCH) {
          await collection.bulkWrite(ops, { ordered: false });
          ops = [];
        }
      }
    }
    if (APPLY && ops.length) await collection.bulkWrite(ops, { ordered: false });

    if (docs || stillOnSpaces) {
      out(`${name}: ${docs} document(s), ${replacements} value(s)${APPLY ? " rewritten" : " would change"}` +
        (stillOnSpaces ? `; ${stillOnSpaces} still mention Spaces (object not in the manifest)` : ""));
    }
    totalDocs += docs;
    totalReplacements += replacements;
    leftovers += stillOnSpaces;
  }

  out("");
  out(`Total: ${totalDocs} document(s), ${totalReplacements} value(s)${APPLY ? " rewritten" : " would change"}.`);
  if (leftovers) {
    out(`${leftovers} document(s) still point at Spaces after the rewrite: their objects were not copied`);
    out("(deleted from Spaces, or added after the copy). Re-run the copy, then this script.");
  }
  if (!APPLY) out("Dry run only. Re-run with --apply to write.");
  await mongoose.disconnect();
}

main().catch(async (err) => {
  out(err instanceof Error ? err.stack ?? err.message : String(err));
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
