/**
 * Migration: set ACL=private on existing job-seeker documents and CVs.
 *
 * Context (audit M5): document/CV uploads were previously stored with a
 * `public-read` ACL, exposing them via raw CDN URLs. New uploads are now
 * private and served only through authorized download routes. This script
 * retro-fits existing objects so the historical files are protected too.
 *
 * Scope (INTENTIONALLY narrow):
 *   - {PREFIX}/documents/**   (job-seeker profile + application documents)
 *   - {PREFIX}/cvs/**         (parsed CV originals)
 * It does NOT touch avatars, company logos, banners, or media — those are
 * public by design.
 *
 * Safety:
 *   - Dry-run by default. Pass `--apply` to actually change ACLs.
 *   - Existing public URLs remain valid until this runs; after it runs they
 *     return 403 and must be accessed through the gated download routes.
 *
 * Env (same as src/lib/storage/spaces.ts):
 *   SPACES_ACCESS_KEY_ID, SPACES_SECRET_ACCESS_KEY,
 *   SPACES_BUCKET_NAME, SPACES_ENDPOINT, DO_SPACES_FOLDER (optional prefix)
 *
 * Usage:
 *   node scripts/migrate-documents-private.mjs            # dry run
 *   node scripts/migrate-documents-private.mjs --apply    # perform changes
 */

import {
  S3Client,
  ListObjectsV2Command,
  PutObjectAclCommand,
} from "@aws-sdk/client-s3";

const APPLY = process.argv.includes("--apply");

const endpoint = process.env.SPACES_ENDPOINT ?? "blr1.digitaloceanspaces.com";
const bucket = process.env.SPACES_BUCKET_NAME ?? process.env.DO_SPACES_BUCKET ?? "d4dx-storage";
const prefix = process.env.DO_SPACES_FOLDER ?? "";

const client = new S3Client({
  region: endpoint.split(".")[0],
  endpoint: `https://${endpoint}`,
  credentials: {
    accessKeyId: process.env.SPACES_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.SPACES_SECRET_ACCESS_KEY ?? "",
  },
  forcePathStyle: false,
});

/** Build a bucket key prefix, joining the optional root folder. */
function withPrefix(folder) {
  return prefix ? `${prefix.replace(/\/$/, "")}/${folder}` : folder;
}

const TARGET_PREFIXES = [withPrefix("documents/"), withPrefix("cvs/")];

async function listAllKeys(keyPrefix) {
  const keys = [];
  let ContinuationToken;
  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: keyPrefix,
        ContinuationToken,
      }),
    );
    for (const obj of res.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key);
    }
    ContinuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return keys;
}

async function main() {
  if (!process.env.SPACES_ACCESS_KEY_ID || !process.env.SPACES_SECRET_ACCESS_KEY) {
    console.error("Missing SPACES_ACCESS_KEY_ID / SPACES_SECRET_ACCESS_KEY env vars.");
    process.exit(1);
  }

  console.log(`Bucket: ${bucket}`);
  console.log(`Mode:   ${APPLY ? "APPLY (will set ACL=private)" : "DRY RUN (no changes)"}`);
  console.log("");

  let total = 0;
  let changed = 0;
  let failed = 0;

  for (const keyPrefix of TARGET_PREFIXES) {
    const keys = await listAllKeys(keyPrefix);
    console.log(`Prefix "${keyPrefix}": ${keys.length} object(s)`);
    total += keys.length;

    for (const Key of keys) {
      if (!APPLY) {
        console.log(`  [dry-run] would set private: ${Key}`);
        continue;
      }
      try {
        await client.send(
          new PutObjectAclCommand({ Bucket: bucket, Key, ACL: "private" }),
        );
        changed++;
        console.log(`  set private: ${Key}`);
      } catch (err) {
        failed++;
        console.error(`  FAILED: ${Key} — ${err?.message ?? err}`);
      }
    }
  }

  console.log("");
  console.log(`Done. ${total} object(s) scanned.`);
  if (APPLY) {
    console.log(`  ${changed} set to private, ${failed} failed.`);
  } else {
    console.log("  Dry run only. Re-run with --apply to perform changes.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
