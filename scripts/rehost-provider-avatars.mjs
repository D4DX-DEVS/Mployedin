/**
 * Copy Google / LinkedIn profile photos onto our own Spaces bucket and point
 * the stored avatar at the copy.
 *
 * Why: a photo stored as a provider URL is served to browsers through our
 * /api/proxy-image, which fetches it from Google or LinkedIn on each cache
 * miss. A LinkedIn URL is signed and expires after a few weeks (HTTP 403), and
 * the copy is permanent and first-party. Sign-in already does this for new
 * users (src/lib/storage/rehost-avatar.ts); this fixes the users that exist.
 *
 * Usage (from the repo root, with MONGODB_URI in .env):
 *   node scripts/rehost-provider-avatars.mjs                 dry run (default)
 *   node scripts/rehost-provider-avatars.mjs --apply         copy and update
 *   node scripts/rehost-provider-avatars.mjs --apply --limit=50
 *   node scripts/rehost-provider-avatars.mjs --apply --user=<24-char user id>
 *
 * Dry run: reads the users collection, prints how many provider avatars it
 * would copy and from which host. It downloads nothing, uploads nothing and
 * writes nothing. It needs MONGODB_URI only.
 *
 * --apply also needs SPACES_ACCESS_KEY_ID and SPACES_SECRET_ACCESS_KEY (and
 * optionally SPACES_ENDPOINT, SPACES_BUCKET_NAME, DO_SPACES_FOLDER,
 * DO_SPACES_CDN_ENDPOINT, the same variables src/lib/storage/spaces.ts reads).
 * For each user it downloads the photo (provider host, https, no redirects,
 * 8 s, 5 MB, must really be a JPEG/PNG/GIF/WebP), uploads it as
 * avatars/oauth-<random>.<ext> and sets users.avatar to the new URL, but only
 * if the avatar is still the URL it copied. The chat lists that keep their own
 * copy of the avatar (conversations.participantDetails) are updated to match.
 *
 * Anything that fails (a network error, a 5xx, a bad image, a storage or database
 * error) keeps the stored avatar it had and is listed at the end by user id.
 * A photo the provider refuses for good (HTTP 4xx other than 408/429: an expired
 * LinkedIn link, a removed photo) is a "dead link": counted and listed on its own,
 * the stored avatar untouched, not a failure of the run (it does not count toward
 * the stop below and does not set exit status 1). It stays selected, so every run
 * tries it once more. Safe to re-run: users already on our storage are not selected.
 * If nothing at all was copied and 10 or more dead links came in a row, the
 * report starts with a WARNING that the provider may be blocking this server
 * (a warning only: the exit status is not changed).
 *
 * --limit=N copies at most N avatars. Users that fail do not use up the limit
 * (an expired LinkedIn link stays expired, and would otherwise take the same
 * places on every run); each is tried once per run, and the report says how many
 * candidates were left untried. A run gives up after 10 users in a row fail
 * (MAX_CONSECUTIVE_FAILURES in the core), says so, and exits 1: otherwise a dead
 * bucket or database would be walked user by user.
 *
 * Uploaded copies: one that was uploaded but never pointed at (the user changed
 * their avatar meanwhile, or the database update did not apply) is deleted again
 * so it is not left in the public bucket; if even that fails the object key is
 * listed for removal by hand. An update that THROWS is not taken as "did not
 * apply": the avatar is read back first.
 *   - New URL there: counted as copied (and in its own "Recovered" line); the
 *     copy stays.
 *   - Anything else: the copy is deleted.
 *   - The read throws too: the copy is kept and the user is listed for a manual
 *     check with the object key.
 * An upload that throws may still have written the object, so its key is
 * removed best-effort.
 *
 * Exit status: 0 when nothing failed, 1 when any user failed or needs a manual
 * check, a copy could not be deleted, chat lists were not updated, or the run
 * stopped early (the report says which).
 *
 * The output carries user ids, host names and object keys only, never an
 * address or URL.
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { candidateFilter, exitCodeFor, parseArgs, resultLine, runRehost, summarise, usageLines } from "./lib/rehostProviderAvatarsCore.mjs";

dotenv.config();

const out = (line) => process.stdout.write(`${line}\n`);
const args = parseArgs(process.argv.slice(2));

if (args.help || args.errors.length) {
  for (const error of args.errors) process.stderr.write(`${error}\n`);
  for (const line of usageLines()) out(line);
  process.exit(args.errors.length ? 1 : 0);
}

if (!process.env.MONGODB_URI) {
  process.stderr.write("MONGODB_URI is not set.\n");
  process.exit(1);
}

let upload = async () => {
  throw new Error("upload is only available with --apply");
};
let remove = async () => {
  throw new Error("remove is only available with --apply");
};
const prefix = process.env.DO_SPACES_FOLDER ?? "";

if (args.apply) {
  if (!process.env.SPACES_ACCESS_KEY_ID || !process.env.SPACES_SECRET_ACCESS_KEY) {
    process.stderr.write("--apply needs SPACES_ACCESS_KEY_ID and SPACES_SECRET_ACCESS_KEY.\n");
    process.exit(1);
  }
  const endpoint = process.env.SPACES_ENDPOINT ?? "blr1.digitaloceanspaces.com";
  const bucket = process.env.SPACES_BUCKET_NAME ?? process.env.DO_SPACES_BUCKET ?? "d4dx-storage";
  const cdnBase = process.env.DO_SPACES_CDN_ENDPOINT ?? `https://${bucket}.${endpoint}`;
  const s3 = new S3Client({
    region: endpoint.split(".")[0],
    endpoint: `https://${endpoint}`,
    credentials: {
      accessKeyId: process.env.SPACES_ACCESS_KEY_ID,
      secretAccessKey: process.env.SPACES_SECRET_ACCESS_KEY,
    },
    forcePathStyle: false,
  });
  upload = async ({ key, bytes, contentType }) => {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: Buffer.from(bytes),
        ContentType: contentType,
        ACL: "public-read",
      }),
    );
    return `${cdnBase}/${key}`;
  };
  remove = async ({ key }) => {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  };
}

await mongoose.connect(process.env.MONGODB_URI);
out(`[rehost-provider-avatars] Mode: ${args.apply ? "APPLY (writes enabled)" : "DRY RUN (nothing is downloaded or changed)"}`);

const db = mongoose.connection.db;
const users = db.collection("users");
const conversations = db.collection("conversations");

const filter = candidateFilter({ userId: args.userId ? new mongoose.Types.ObjectId(args.userId) : null });
// The cursor is not cut at --limit: that counts copies, not users looked at (see runRehost).
const cursor = users.find(filter, { projection: { avatar: 1 } }).sort({ _id: 1 });

const { results, notAttempted, stoppedEarly } = await runRehost(
  cursor,
  {
    apply: args.apply,
    prefix,
    newId: randomUUID,
    fetchImpl: fetch,
    upload,
    remove,
    users,
    conversations,
  },
  {
    limit: args.limit,
    onResult: (result) => {
      if (args.apply) out(resultLine(result));
    },
  },
);

for (const line of summarise(results, { apply: args.apply, limit: args.limit, notAttempted, stoppedEarly })) out(line);

await mongoose.disconnect();
process.exit(exitCodeFor(results, { stoppedEarly }));
