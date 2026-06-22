/**
 * Backfill: re-host existing external OAuth avatars onto our own DigitalOcean
 * Spaces bucket so the URLs never expire.
 *
 * Context: Google (`lh3.googleusercontent.com`) and LinkedIn (`media.licdn.com`)
 * avatar URLs were stored verbatim at login. LinkedIn URLs are signed and expire
 * (HTTP 403 `deny-expired-url`), breaking profile photos on employer-facing
 * candidate lists. Going forward, login re-hosts these (see
 * src/lib/storage/rehost-avatar.ts). This script fixes the users that already
 * exist.
 *
 * Behaviour:
 *   - Targets users whose `avatar` is an http(s) URL NOT already on our storage.
 *   - Downloads each image (8s timeout, image/* only, <= 5MB) and re-uploads it
 *     with a permanent key, then points `User.avatar` at our CDN URL.
 *   - Expired/unreachable URLs (e.g. dead LinkedIn signatures) are left UNCHANGED
 *     and reported — they cannot be recovered.
 *
 * Env (same as src/lib/storage/spaces.ts): MONGODB_URI, SPACES_ACCESS_KEY_ID,
 *   SPACES_SECRET_ACCESS_KEY, SPACES_BUCKET_NAME, SPACES_ENDPOINT,
 *   DO_SPACES_FOLDER (optional prefix), DO_SPACES_CDN_ENDPOINT (optional).
 *
 * Usage:
 *   node scripts/rehost-avatars.mjs                 # dry run (no writes)
 *   node scripts/rehost-avatars.mjs --apply         # perform re-hosting
 *   node scripts/rehost-avatars.mjs --apply --email=foo@bar.com   # single user
 *   node scripts/rehost-avatars.mjs --apply --limit=50
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

dotenv.config();

const APPLY = process.argv.includes("--apply");
const emailArg = process.argv.find((a) => a.startsWith("--email="));
const EMAIL = emailArg ? emailArg.slice("--email=".length).toLowerCase() : null;
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? Number(limitArg.slice("--limit=".length)) : 0;

const FETCH_TIMEOUT_MS = 8_000;
const MAX_BYTES = 5 * 1024 * 1024;

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("MONGODB_URI not set");
  process.exit(1);
}
if (!process.env.SPACES_ACCESS_KEY_ID || !process.env.SPACES_SECRET_ACCESS_KEY) {
  console.error("Missing SPACES_ACCESS_KEY_ID / SPACES_SECRET_ACCESS_KEY env vars.");
  process.exit(1);
}

const endpoint = process.env.SPACES_ENDPOINT ?? "blr1.digitaloceanspaces.com";
const bucket = process.env.SPACES_BUCKET_NAME ?? process.env.DO_SPACES_BUCKET ?? "d4dx-storage";
const prefix = process.env.DO_SPACES_FOLDER ?? "";

const s3 = new S3Client({
  region: endpoint.split(".")[0],
  endpoint: `https://${endpoint}`,
  credentials: {
    accessKeyId: process.env.SPACES_ACCESS_KEY_ID,
    secretAccessKey: process.env.SPACES_SECRET_ACCESS_KEY,
  },
  forcePathStyle: false,
});

function cdnBase() {
  if (process.env.DO_SPACES_CDN_ENDPOINT) return process.env.DO_SPACES_CDN_ENDPOINT;
  return `https://${bucket}.${endpoint}`;
}

function extFor(contentType) {
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("webp")) return ".webp";
  if (contentType.includes("gif")) return ".gif";
  return ".jpg";
}

/** Download an external avatar and re-upload to Spaces. Returns our URL or null. */
async function rehost(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, { signal: controller.signal, redirect: "follow" });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) return null;

  const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!contentType.startsWith("image/")) return null;

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0 || buf.length > MAX_BYTES) return null;

  const ext = extFor(contentType);
  const key = prefix
    ? `${prefix.replace(/\/$/, "")}/avatars/${randomUUID()}${ext}`
    : `avatars/${randomUUID()}${ext}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buf,
      ContentType: contentType,
      ACL: "public-read",
    }),
  );
  return `${cdnBase()}/${key}`;
}

await mongoose.connect(MONGODB_URI);
console.log("[rehost-avatars] Connected to MongoDB");
console.log(`[rehost-avatars] Mode: ${APPLY ? "APPLY (writes enabled)" : "DRY RUN (no writes)"}`);

const users = mongoose.connection.db.collection("users");

// External http(s) avatars that are NOT already on our own storage.
const query = {
  avatar: { $regex: "^https?://", $options: "i" },
  $nor: [{ avatar: { $regex: "digitaloceanspaces\\.com", $options: "i" } }],
  ...(EMAIL ? { email: EMAIL } : {}),
};

const cursor = users.find(query, { projection: { email: 1, avatar: 1 } });

let total = 0;
let rehosted = 0;
let failed = 0;
const failures = [];

for await (const u of cursor) {
  if (LIMIT && total >= LIMIT) break;
  total += 1;
  const url = u.avatar;
  const host = (() => {
    try { return new URL(url).host; } catch { return "?"; }
  })();

  if (!APPLY) {
    // Dry run: just report what would be processed.
    console.log(`  would re-host  ${u.email}  (${host})`);
    continue;
  }

  const newUrl = await rehost(url);
  if (newUrl) {
    await users.updateOne({ _id: u._id }, { $set: { avatar: newUrl } });
    rehosted += 1;
    console.log(`  ✓ re-hosted    ${u.email}  ${host} -> ${newUrl}`);
  } else {
    failed += 1;
    failures.push({ email: u.email, host });
    console.log(`  ✗ failed       ${u.email}  (${host}) — left unchanged (likely expired/unreachable)`);
  }
}

console.log("");
console.log(`[rehost-avatars] Candidates: ${total}`);
if (APPLY) {
  console.log(`[rehost-avatars] Re-hosted:  ${rehosted}`);
  console.log(`[rehost-avatars] Failed:     ${failed}`);
  if (failures.length) {
    console.log("[rehost-avatars] Failed (unchanged):");
    for (const f of failures) console.log(`    - ${f.email} (${f.host})`);
  }
} else {
  console.log("[rehost-avatars] Re-run with --apply to perform re-hosting.");
}

await mongoose.disconnect();
process.exit(0);
