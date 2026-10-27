/**
 * Copy every stored file from DigitalOcean Spaces to Cloudflare R2 and write the
 * manifest that scripts/rewrite-storage-urls.ts uses to repoint the database.
 *
 * Where each object goes (lib/storage/storageConfig.ts):
 *   - public-read on Spaces, outside cvs/ documents/ exports/
 *                            -> public bucket (R2_PUBLIC_BUCKET | R2_BUCKET_NAME), key without the DO_SPACES_FOLDER root
 *   - anything else          -> private bucket (R2_PRIVATE_BUCKET, default mployedin-private), the same key under `private/`
 *     (a legacy public-read CV or document is made private here)
 * With --optimize-images, public JPEG/PNG/WebP/GIF images are re-encoded on the
 * way (metadata stripped, size capped: lib/storage/optimizeImage.ts), exactly as
 * new uploads are; their key may change extension (.jpg / .png).
 *
 * Usage:
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/copy-spaces-to-r2.ts             # dry run
 *   ... --apply                    copy
 *   ... --optimize-images          re-clean public images while copying
 *   ... --manifest <file>          default ./spaces-to-r2-manifest.json
 *   ... --limit <n>                stop after n objects (trial runs)
 *
 * Needs both the Spaces env (spaces.ts) and the R2 env (storageConfig.ts).
 * STORAGE_PROVIDER does not matter here. Spaces is only read, never changed.
 * Idempotent: an object already in R2 at its new key is skipped (still listed
 * in the manifest), so a failed run is simply run again.
 */

import { writeFileSync } from "fs";
import path from "path";
import {
  GetObjectAclCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { R2_REQUIRED_ENV, firstEnv, r2ApiHost, r2PrivateBucket, r2PublicBucket, r2UrlForKey } from "@/lib/storage/storageConfig";
import { isOptimizableImage, optimizeImage, AVATAR_MAX_EDGE, DEFAULT_MAX_EDGE } from "@/lib/storage/optimizeImage";
import { isPublicObject, r2KeyForSpacesKey, type ManifestEntry } from "@/lib/storage/migration/spacesToR2";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const OPTIMIZE = args.includes("--optimize-images");
const argValue = (flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const MANIFEST = path.resolve(argValue("--manifest") ?? "spaces-to-r2-manifest.json");
const LIMIT = argValue("--limit") ? Number(argValue("--limit")) : Infinity;

const out = (line: string) => process.stdout.write(`${line}\n`);

const spacesEndpoint = process.env.SPACES_ENDPOINT ?? "blr1.digitaloceanspaces.com";
const spacesBucket = process.env.SPACES_BUCKET_NAME ?? process.env.DO_SPACES_BUCKET ?? "d4dx-storage";
const spacesPrefix = process.env.DO_SPACES_FOLDER ?? "";

const spaces = new S3Client({
  region: spacesEndpoint.split(".")[0],
  endpoint: `https://${spacesEndpoint}`,
  credentials: {
    accessKeyId: process.env.SPACES_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.SPACES_SECRET_ACCESS_KEY ?? "",
  },
});

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${r2ApiHost() ?? "r2-not-configured.invalid"}`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
  forcePathStyle: true,
  // Same as lib/storage/spaces.ts: only checksums R2 requires.
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

async function* listKeys(): AsyncGenerator<{ key: string; size: number }> {
  let ContinuationToken: string | undefined;
  do {
    const res = await spaces.send(
      new ListObjectsV2Command({ Bucket: spacesBucket, Prefix: spacesPrefix ? `${spacesPrefix.replace(/\/+$/, "")}/` : undefined, ContinuationToken }),
    );
    for (const obj of res.Contents ?? []) {
      if (obj.Key && !obj.Key.endsWith("/")) yield { key: obj.Key, size: obj.Size ?? 0 };
    }
    ContinuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (ContinuationToken);
}

async function isPublicRead(key: string): Promise<boolean> {
  const acl = await spaces.send(new GetObjectAclCommand({ Bucket: spacesBucket, Key: key }));
  return (acl.Grants ?? []).some(
    (g) => g.Grantee?.URI?.endsWith("/global/AllUsers") && (g.Permission === "READ" || g.Permission === "FULL_CONTROL"),
  );
}

async function existsInR2(bucket: string, key: string): Promise<boolean> {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const missing = [
    ...(process.env.SPACES_ACCESS_KEY_ID && process.env.SPACES_SECRET_ACCESS_KEY ? [] : ["SPACES_ACCESS_KEY_ID / SPACES_SECRET_ACCESS_KEY"]),
    ...R2_REQUIRED_ENV.filter((names) => !firstEnv(process.env, names)).map((names) => names.join(" / ")),
  ];
  if (missing.length) {
    out(`Missing env: ${missing.join(", ")}`);
    process.exit(1);
  }

  out(`From:     Spaces ${spacesBucket} (${spacesEndpoint})${spacesPrefix ? `, root ${spacesPrefix}/` : ""}`);
  out(`To:       R2 ${r2PublicBucket()} (public) / ${r2PrivateBucket()} (private)`);
  out(`Mode:     ${APPLY ? "APPLY (copying)" : "DRY RUN (nothing written)"}${OPTIMIZE ? ", re-cleaning public images" : ""}`);
  out(`Manifest: ${MANIFEST}`);
  out("");

  const manifest: ManifestEntry[] = [];
  const counts = { total: 0, public: 0, private: 0, copied: 0, skipped: 0, optimized: 0, failed: 0, bytes: 0 };

  for await (const { key, size } of listKeys()) {
    if (counts.total >= LIMIT) break;
    counts.total++;
    counts.bytes += size;
    try {
      // CVs, documents and exports go private even if a legacy ACL still says public-read.
      const isPublic = isPublicObject(key, await isPublicRead(key), spacesPrefix);
      counts[isPublic ? "public" : "private"]++;

      const head = await spaces.send(new HeadObjectCommand({ Bucket: spacesBucket, Key: key }));
      const contentType = head.ContentType ?? "application/octet-stream";
      const willOptimize = OPTIMIZE && isPublic && isOptimizableImage(contentType);

      let body: Buffer | null = null;
      let newExt: string | undefined;
      let finalType = contentType;
      if (willOptimize && APPLY) {
        const got = await spaces.send(new GetObjectCommand({ Bucket: spacesBucket, Key: key }));
        body = Buffer.from(await got.Body!.transformToByteArray());
        const optimized = await optimizeImage(body, /(^|\/)avatars\//.test(key) ? AVATAR_MAX_EDGE : DEFAULT_MAX_EDGE).catch(() => null);
        if (optimized) {
          body = optimized.buffer;
          newExt = optimized.ext;
          finalType = optimized.contentType;
          counts.optimized++;
        }
      }

      const newKey = r2KeyForSpacesKey(key, { spacesPrefix, isPublic, newExt });
      const bucket = isPublic ? r2PublicBucket() : r2PrivateBucket();
      const entry: ManifestEntry = { oldKey: key, newKey, newUrl: r2UrlForKey(newKey), isPublic, optimized: Boolean(newExt), size };

      if (!APPLY) {
        out(`  [dry-run] ${isPublic ? "public " : "private"} ${key} -> ${newKey}${willOptimize ? " (re-cleaned, may become .jpg/.png)" : ""}`);
        continue;
      }
      if (await existsInR2(bucket, newKey)) {
        counts.skipped++;
        manifest.push(entry);
        continue;
      }
      if (!body) {
        const got = await spaces.send(new GetObjectCommand({ Bucket: spacesBucket, Key: key }));
        body = Buffer.from(await got.Body!.transformToByteArray());
      }
      await r2.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: newKey,
          Body: body,
          ContentType: finalType,
          ...(head.ContentDisposition && !newExt && { ContentDisposition: head.ContentDisposition }),
          ...(isPublic && { CacheControl: "public, max-age=86400" }),
        }),
      );
      counts.copied++;
      manifest.push(entry);
      if (counts.copied % 100 === 0) out(`  ${counts.copied} copied...`);
    } catch (err) {
      counts.failed++;
      out(`  FAILED: ${key}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Only a real copy writes the manifest: a dry run cannot know the extension a
  // re-cleaned image ends up with, and the rewrite must never point at an object
  // that was not copied.
  if (APPLY) writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

  out("");
  out(`Objects: ${counts.total} (${(counts.bytes / 1024 / 1024).toFixed(1)} MB): ${counts.public} public, ${counts.private} private`);
  if (APPLY) {
    out(`Copied ${counts.copied}, already in R2 ${counts.skipped}, re-cleaned ${counts.optimized}, failed ${counts.failed}.`);
    out(`Next: npx tsx --env-file=.env --tsconfig tsconfig.json scripts/rewrite-storage-urls.ts --manifest ${MANIFEST}`);
  } else {
    out("Dry run only. Re-run with --apply to copy.");
  }
  if (counts.failed) process.exit(1);
}

main().catch((err) => {
  out(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
