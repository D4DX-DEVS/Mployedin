/**
 * Will matching vectors fit? Read-only.
 *
 *   node --env-file=.env scripts/atlas-capacity-check.mjs [--quota-mb 512]
 *
 * Prints the cluster's used size, the jobs and seekers that would get a
 * vector, and an estimate of what the vectors and their indexes add. A 1024-d
 * vector is ~8 KB as BSON doubles; the Atlas vector index roughly doubles that,
 * so ~20 KB per document is used as a safe estimate. On the shared M0 cluster
 * (512 MB, shared with other projects) a full quota blocks every write,
 * logins included (2026-10-01), so this runs before the index script.
 */
import mongoose from "mongoose";

const PER_DOC_BYTES = 20 * 1024;
const quotaArg = process.argv.indexOf("--quota-mb");
const QUOTA_MB = quotaArg > -1 ? Number(process.argv[quotaArg + 1]) : 512;

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is not set. Run with: node --env-file=.env scripts/atlas-capacity-check.mjs");
  process.exit(1);
}

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1);

await mongoose.connect(uri);
try {
  const db = mongoose.connection.db;
  let usedBytes;
  try {
    // The whole cluster, which is what the M0 quota counts.
    const { databases } = await db.admin().command({ listDatabases: 1 });
    usedBytes = databases.reduce((sum, d) => sum + (d.sizeOnDisk ?? 0), 0);
  } catch {
    // Some roles can't list databases; fall back to this database alone.
    const stats = await db.stats();
    usedBytes = (stats.dataSize ?? 0) + (stats.indexSize ?? 0);
    console.log("(listDatabases not allowed; showing this database only)");
  }

  const jobs = await db.collection("jobs").countDocuments({ status: "active", deletedAt: null });
  const seekers = await db.collection("jobseekers").countDocuments({ roleArchivedAt: null });
  const addBytes = (jobs + seekers) * PER_DOC_BYTES;
  const after = usedBytes + addBytes;

  console.log(`used now:        ${mb(usedBytes)} MB of ${QUOTA_MB} MB`);
  console.log(`documents:       ${jobs} active jobs + ${seekers} seekers`);
  console.log(`vectors add:     ~${mb(addBytes)} MB`);
  console.log(`after:           ~${mb(after)} MB (${((after / (QUOTA_MB * 1024 * 1024)) * 100).toFixed(0)}% of quota)`);
  console.log(after > QUOTA_MB * 1024 * 1024 * 0.8 ? "VERDICT: not enough room. Upgrade or free space first (O2)." : "VERDICT: fits with headroom.");
} finally {
  await mongoose.disconnect();
}
