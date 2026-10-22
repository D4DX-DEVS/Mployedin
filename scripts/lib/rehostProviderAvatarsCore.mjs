/**
 * The decisions behind scripts/rehost-provider-avatars.mjs, with every piece of
 * I/O (fetch, upload, the two collections) passed in so the unit tests can run
 * each branch against mocks. Nothing in here connects to anything.
 *
 * The host list, the host matcher, the size cap and the capped body reader are
 * the app's own (src/lib/images/providerAvatarHosts.mjs, plain ESM with no
 * imports so Node can load it from here): the proxy and this script cannot
 * disagree about what a provider avatar is.
 */

import {
  MAX_AVATAR_BYTES,
  PROVIDER_AVATAR_HOSTS,
  isProviderAvatarHost,
  readCapped,
} from "../../src/lib/images/providerAvatarHosts.mjs";

export const FETCH_TIMEOUT_MS = 8_000;

/**
 * A run gives up after this many users in a row that failed. Failed users do not
 * use up --limit, so without a stop a dead bucket, a dead database or a provider
 * that refuses everything would walk (and wait out the timeout for) every user.
 */
export const MAX_CONSECUTIVE_FAILURES = 10;

/**
 * This many dead links in a row with nothing copied in the whole run makes the report
 * warn that the provider may be refusing this server (not just that some photos expired).
 * A warning only: it changes neither the exit status nor the run.
 */
export const DEAD_LINK_WARNING_RUN = 10;

const OBJECT_ID = /^[0-9a-f]{24}$/i;

/** True for an https URL on a provider avatar host (exact or dot-boundary subdomain). */
export function isProviderAvatarUrl(value) {
  if (typeof value !== "string" || !/^https:\/\//i.test(value)) return false;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return isProviderAvatarHost(parsed.hostname);
}

function hostOf(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** What `--help` prints. The stop-after-N number comes from the constant, never a second copy. */
export function usageLines() {
  return [
    "Usage: node scripts/rehost-provider-avatars.mjs [--apply] [--limit=N] [--user=<id>]",
    "",
    "  (no flags)    dry run: counts the provider avatars it would copy; downloads and changes nothing",
    "  --apply       copy the photos to our storage and point the users at the copies",
    "  --limit=N     copy at most N avatars; users that fail do not use up the limit",
    "  --user=<id>   only this user (24-character id)",
    "",
    `The run stops after ${MAX_CONSECUTIVE_FAILURES} users in a row fail (the provider, the bucket or the database is`,
    "probably down), says so in the report, and exits with status 1. It also exits 1 when any user failed,",
    "an uploaded copy could not be deleted, a user needs a manual check, or chat lists were not updated.",
    "",
    "Dead links (the provider answers HTTP 4xx other than 408 and 429: expired link, photo removed) are counted",
    "and listed on their own; they do not count toward the stop above, do not use up --limit and do not set exit status 1.",
    "They stay as they are and are tried again on every run. If nothing was copied and 10 or more came in a row,",
    "the report starts with a WARNING that the provider may be blocking this server (exit status unchanged).",
    "",
    "While it runs (--apply) each finished user is printed with the object key where one needs attention.",
  ];
}

/**
 * Flags: --apply, --limit=N, --user=<ObjectId>, --help (each value flag also
 * as two words). Anything else is an error rather than a guess: a typo such as
 * --aply must not quietly run as a dry run the owner thinks was an apply.
 */
export function parseArgs(argv) {
  const result = { apply: false, limit: 0, userId: null, help: false, errors: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const [flag, inline] = arg.startsWith("--") && arg.includes("=") ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)] : [arg, undefined];
    const takeValue = () => (inline !== undefined ? inline : argv[++i]);

    if (flag === "--apply") result.apply = true;
    else if (flag === "--help" || flag === "-h") result.help = true;
    else if (flag === "--limit") {
      const raw = takeValue();
      if (!/^\d+$/.test(raw ?? "") || Number(raw) < 1) result.errors.push(`--limit needs a whole number of 1 or more (got "${raw ?? ""}")`);
      else result.limit = Number(raw);
    } else if (flag === "--user") {
      const raw = takeValue();
      if (!OBJECT_ID.test(raw ?? "")) result.errors.push(`--user needs a 24-character user id (got "${raw ?? ""}")`);
      else result.userId = raw;
    } else result.errors.push(`unknown option "${arg}"`);
  }
  return result;
}

/** The image type a file really is, from its first bytes; null for anything else (SVG and HTML included). */
export function sniffImageType(bytes) {
  if (!bytes || bytes.length < 12) return null;
  const at = (i) => bytes[i];
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "image/jpeg";
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return "image/png";
  if (at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x38) return "image/gif";
  if (at(0) === 0x52 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x46 && at(8) === 0x57 && at(9) === 0x45 && at(10) === 0x42 && at(11) === 0x50) {
    return "image/webp";
  }
  return null;
}

const EXTENSIONS = { "image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp" };

/** Object key: under avatars/, with the bucket's folder prefix when it has one. */
export function buildKey({ prefix, id, ext }) {
  const root = prefix ? `${prefix.replace(/\/+$/, "")}/` : "";
  return `${root}avatars/oauth-${id}${ext}`;
}

/** Users whose stored avatar is a provider URL (optionally just one user). */
export function candidateFilter({ userId }) {
  const hosts = PROVIDER_AVATAR_HOSTS.map((host) => host.replace(/\./g, "\\.")).join("|");
  const filter = { avatar: { $regex: new RegExp(`^https://([a-z0-9-]+\\.)*(${hosts})/`, "i") } };
  if (userId) filter._id = userId;
  return filter;
}

/**
 * An HTTP 4xx from the provider says this photo will not come back (403 on an
 * expired signed LinkedIn URL, 404 and 410 on a removed one). 408 (timeout) and
 * 429 (rate limited) are the provider saying "not now", which is a sign about
 * the run, not about the photo, so they stay ordinary failures; so do 5xx.
 */
export function isPermanentRefusal(status) {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

/**
 * Download one provider avatar. Provider hosts only, https only, redirects
 * never followed, bounded in time and size, and accepted only when the bytes
 * themselves are a raster image (the Content-Type header is not trusted).
 * Never throws: a failure is `{ ok: false, reason }`, plus `dead: true` when the
 * provider refused the photo for good (see isPermanentRefusal).
 *
 * @param {string} url
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number, maxBytes?: number }} [options]
 * @returns {Promise<{ ok: boolean, reason?: string, dead?: boolean, bytes?: Uint8Array, contentType?: string, ext?: string }>}
 */
export async function downloadProviderImage(url, { fetchImpl = fetch, timeoutMs = FETCH_TIMEOUT_MS, maxBytes = MAX_AVATAR_BYTES } = {}) {
  if (!isProviderAvatarUrl(url)) return { ok: false, reason: "not a provider avatar URL" };

  let response;
  try {
    response = await fetchImpl(url, {
      headers: { Accept: "image/*" },
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { ok: false, reason: "couldn't reach the provider (timeout or network error)" };
  }

  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel().catch(() => undefined);
    return { ok: false, reason: `the provider answered with a redirect (HTTP ${response.status})` };
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    return {
      ok: false,
      reason: `HTTP ${response.status} (link expired or photo removed?)`,
      ...(isPermanentRefusal(response.status) ? { dead: true } : {}),
    };
  }

  let bytes;
  try {
    bytes = await readCapped(response, maxBytes);
  } catch {
    return { ok: false, reason: "couldn't read the image body" };
  }
  if (bytes === null) return { ok: false, reason: `image is too large (over ${maxBytes} bytes)` };
  if (bytes.byteLength === 0) return { ok: false, reason: "the image is empty" };

  const contentType = sniffImageType(bytes);
  if (!contentType) return { ok: false, reason: "the file is not a JPEG, PNG, GIF or WebP image" };
  return { ok: true, bytes, contentType, ext: EXTENSIONS[contentType] };
}
/**
 * Delete the object we uploaded when the database never came to point at it, so
 * it is not left orphaned in a public-read bucket. Never throws: a delete that
 * fails is reported (by key, so the owner can remove it by hand), not hidden.
 */
async function discardUpload(remove, key) {
  try {
    await remove({ key });
    return { cleanedUp: true };
  } catch {
    // Also the path when no remove function was given: nothing was deleted either way.
    return { cleanedUp: false, orphanedKey: key };
  }
}

/**
 * Best-effort delete for an upload that threw: the PUT may have reached the
 * bucket before the error came back, so the key is removed too. Whether it
 * existed is unknown, so an error here (including "no such key") is ignored and
 * not reported as an orphan.
 */
async function removeIfPresent(remove, key) {
  try {
    await remove?.({ key });
  } catch {
    /* nothing to report: the object may never have existed */
  }
}

/**
 * Copy one user's provider avatar to our storage and point the user (and the
 * chat lists that keep their own copy of it) at the new URL.
 *
 * Dry run (`apply: false`) contacts nobody and writes nothing.
 * A failure leaves the user's stored URL as it was, with one exception: when the
 * database update threw AND the follow-up read threw too, nobody knows whether
 * it applied (`needs-check`); the uploaded copy is then kept, not deleted.
 *
 * `upload({ key, bytes, contentType })` resolves to the public URL and
 * `remove({ key })` deletes that object again.
 * The user update is conditional on the avatar still being the one we copied,
 * so a photo the user uploaded while the script ran is never overwritten.
 * - the update did not match (the avatar changed meanwhile): the copy is deleted;
 * - the update threw: a throw does not prove the write did not apply (the
 *   connection can drop after the server committed it), so the avatar is read
 *   back. If it is the new URL the user counts as copied and the copy stays; if
 *   it is anything else the copy is deleted; if the read throws too, the copy is
 *   kept and the user is reported as `needs-check` with the object key;
 * - the upload threw: the object may exist anyway, so its key is removed
 *   best-effort and the error from that is ignored.
 * The chat lists are updated after the user: if that fails the user already
 * uses the copy, so it is kept and the user is reported (`chatsFailed`).
 */
export async function rehostUser(user, { apply, prefix = "", newId, fetchImpl, upload, remove, users, conversations }) {
  const oldUrl = user.avatar;
  if (!isProviderAvatarUrl(oldUrl)) return { outcome: "skipped", host: hostOf(oldUrl ?? "") };
  const host = hostOf(oldUrl);
  if (!apply) return { outcome: "would-copy", host };

  const downloaded = await downloadProviderImage(oldUrl, { fetchImpl });
  if (!downloaded.ok) return { outcome: downloaded.dead ? "dead-link" : "failed", host, reason: downloaded.reason };

  const key = buildKey({ prefix, id: newId(), ext: downloaded.ext });
  let newUrl;
  try {
    newUrl = await upload({ key, bytes: downloaded.bytes, contentType: downloaded.contentType });
  } catch {
    await removeIfPresent(remove, key);
    return { outcome: "failed", host, reason: "upload to storage failed" };
  }

  let updated;
  let recovered = false;
  try {
    updated = await users.updateOne({ _id: user._id, avatar: oldUrl }, { $set: { avatar: newUrl } });
  } catch {
    // A throw (a dropped connection, a timeout) does not prove the write did not
    // apply, and a copy the database already points at must not be deleted: ask
    // what the avatar is now. The driver's messages can name the cluster; the
    // report does not need them.
    let current;
    try {
      current = await users.findOne({ _id: user._id }, { projection: { avatar: 1 } });
    } catch {
      return {
        outcome: "needs-check",
        host,
        uncertainKey: key,
        reason: "the database update may or may not have applied; the uploaded copy was kept",
      };
    }
    if (current?.avatar !== newUrl) {
      return { outcome: "failed", host, reason: "database update failed", ...(await discardUpload(remove, key)) };
    }
    // It did apply: carry on exactly as if the update had answered, but remember it for the report.
    updated = { matchedCount: 1 };
    recovered = true;
  }
  if (!updated.matchedCount) return { outcome: "changed-meanwhile", host, ...(await discardUpload(remove, key)) };

  try {
    const chats = await conversations.updateMany(
      { "participantDetails.userId": user._id },
      { $set: { "participantDetails.$[p].avatar": newUrl } },
      { arrayFilters: [{ "p.userId": user._id, "p.avatar": oldUrl }] },
    );
    return { outcome: "copied", host, newUrl, conversationsUpdated: chats.modifiedCount ?? 0, ...(recovered ? { recovered: true } : {}) };
  } catch {
    return { outcome: "copied", host, newUrl, conversationsUpdated: 0, chatsFailed: true, ...(recovered ? { recovered: true } : {}) };
  }
}

/**
 * Run rehostUser over a stream of candidates (the cursor), in order.
 *
 * `limit` (0 = none) is the number of avatars to copy, and only those use it up:
 * a user that fails (an expired LinkedIn link stays expired) is passed over, tried
 * once, and does not take a place in the limit, so repeated `--limit=50` runs keep
 * moving instead of re-spending the limit on the same dead links. Candidates left
 * after the limit is reached are counted, not tried.
 *
 * It also gives up after MAX_CONSECUTIVE_FAILURES users in a row that failed
 * (`failed` or `needs-check`; a copy, a skip or a change-meanwhile starts the
 * count again), before trying the next candidate, and says so in `stoppedEarly`.
 * A `dead-link` (the provider refuses that photo for good) says nothing about the
 * health of the run: it neither counts nor starts the count again, so a long block
 * of expired links is walked through, and real failures separated by dead links
 * still add up. The rest are not
 * tried and not counted: reading them all just to count them would cost a full
 * pass over the collection for a run that is already known to be unhealthy.
 *
 * `onResult(result)` is called as each user finishes.
 *
 * @param {AsyncIterable<any> | Iterable<any>} candidates
 * @param {any} deps
 * @param {{ limit?: number, onResult?: (result: any) => void }} [options]
 * @returns {Promise<{ results: any[], notAttempted: number, stoppedEarly: { afterFailures: number } | null }>}
 */
export async function runRehost(candidates, deps, { limit = 0, onResult } = {}) {
  const results = [];
  let copies = 0;
  let notAttempted = 0;
  let failuresInARow = 0;
  let stoppedEarly = null;
  for await (const user of candidates) {
    // Checked when there is a next candidate, so a run whose last user was the
    // 10th failure is not reported as having stopped early.
    if (failuresInARow >= MAX_CONSECUTIVE_FAILURES) {
      stoppedEarly = { afterFailures: failuresInARow };
      break;
    }
    if (limit && copies >= limit) {
      notAttempted++;
      continue;
    }
    const result = { id: String(user._id), ...(await rehostUser(user, deps)) };
    results.push(result);
    onResult?.(result);
    if (result.outcome === "copied" || result.outcome === "would-copy") copies++;
    if (result.outcome === "failed" || result.outcome === "needs-check") failuresInARow++;
    else if (result.outcome !== "dead-link") failuresInARow = 0;
  }
  return { results, notAttempted, stoppedEarly };
}

/**
 * The line printed as each user finishes (apply mode). Outcome, user id and host,
 * plus the object key when the result carries one (a copy kept for a manual check,
 * or one that could not be deleted): keys are not personal data, and having them in
 * the output as it happens means they survive a crash or Ctrl-C before the report.
 * Never the reason or a URL.
 */
export function resultLine(result) {
  const key = result.uncertainKey ?? result.orphanedKey;
  return `  ${result.outcome.padEnd(17)} ${result.id}  ${result.host}${key ? `  ${key}` : ""}`;
}

/** The longest stretch of consecutive results with this outcome. */
function longestRun(results, outcome) {
  let longest = 0;
  let current = 0;
  for (const r of results) {
    current = r.outcome === outcome ? current + 1 : 0;
    if (current > longest) longest = current;
  }
  return longest;
}

/**
 * Process exit status: 1 when anything needs the owner's attention, otherwise 0.
 * @param {any[]} results
 * @param {{ stoppedEarly?: { afterFailures: number } | null }} [run]
 */
export function exitCodeFor(results, run = {}) {
  if (run.stoppedEarly) return 1;
  const needsAttention = (r) =>
    r.outcome === "failed" || r.outcome === "needs-check" || r.cleanedUp === false || r.chatsFailed === true;
  return results.some(needsAttention) ? 1 : 0;
}

/**
 * Report lines. Ids, hosts and object keys only: no e-mail addresses and no avatar
 * URLs (a signed LinkedIn URL is a credential for that photo).
 *
 * @param {any[]} results
 * @param {{ apply: boolean, limit?: number, notAttempted?: number, stoppedEarly?: { afterFailures: number } | null }} run
 * @returns {string[]}
 */
export function summarise(results, { apply, limit = 0, notAttempted = 0, stoppedEarly = null }) {
  const count = (outcome) => results.filter((r) => r.outcome === outcome).length;
  const lines = [""];
  if (stoppedEarly) {
    lines.push(
      `STOPPED EARLY: ${stoppedEarly.afterFailures} users in a row failed, so the remaining candidates were not tried. ` +
        "The provider, the bucket or the database is probably unavailable; fix the cause and run again.",
    );
  }
  // At the top, so it is not buried under a long list of dead links. A warning only: the exit status does not change.
  if (apply && count("copied") === 0 && longestRun(results, "dead-link") >= DEAD_LINK_WARNING_RUN) {
    lines.push("WARNING: Every recent photo was refused by the provider — check whether it is blocking this server.");
  }
  if (apply) {
    lines.push(`Copied: ${count("copied")}`);
    lines.push(`Recovered after a database error (counted in Copied: the update threw, a re-read showed the new photo): ${results.filter((r) => r.recovered).length}`);
    // Only users whose stored avatar is known to be untouched are "failed"; one that may have changed is "needs a manual check" below.
    lines.push(`Failed: ${count("failed")} (stored avatar not changed by this run${limit ? "; failed users do not count toward --limit" : ""})`);
    lines.push(`Dead links (the provider refuses the photo for good; stored avatar not changed, tried again on every run): ${count("dead-link")}`);
    lines.push(`Avatar changed while copying (left as the user set it): ${count("changed-meanwhile")}`);
    lines.push(`Skipped: ${count("skipped")}`);
    if (limit) lines.push(`Not attempted because --limit=${limit} was reached: ${notAttempted}`);
    for (const r of results.filter((x) => x.outcome === "failed")) lines.push(`  failed  ${r.id}  ${r.host}  ${r.reason}`);
    for (const r of results.filter((x) => x.outcome === "dead-link")) lines.push(`  dead    ${r.id}  ${r.host}  ${r.reason}`);
    for (const r of results.filter((x) => x.outcome === "changed-meanwhile")) lines.push(`  changed ${r.id}  ${r.host}`);

    const uncertain = results.filter((x) => x.outcome === "needs-check");
    if (uncertain.length) {
      lines.push(
        `Needs a manual check (the database update may or may not have applied; the uploaded copy was kept, not deleted): ${uncertain.length}`,
      );
      lines.push("  For each: if the user's avatar is not that object, delete the object; if it is, nothing to do.");
      for (const r of uncertain) lines.push(`  check   ${r.id}  ${r.host}  ${r.uncertainKey}`);
    }

    const chatsFailed = results.filter((x) => x.chatsFailed);
    if (chatsFailed.length) {
      lines.push(`Copied, but the chat lists were not updated (the user shows the new photo, old chats keep the old link): ${chatsFailed.length}`);
      for (const r of chatsFailed) lines.push(`  chats   ${r.id}  ${r.host}`);
    }
    const orphans = results.filter((x) => x.orphanedKey);
    if (orphans.length) {
      lines.push(`Uploaded copies that could not be deleted (remove these objects from the bucket by hand): ${orphans.length}`);
      for (const r of orphans) lines.push(`  object  ${r.id}  ${r.orphanedKey}`);
    }
  } else {
    lines.push(`Would copy: ${count("would-copy")}`);
    lines.push(`Skipped: ${count("skipped")}`);
    if (limit) lines.push(`Not attempted because --limit=${limit} was reached: ${notAttempted}`);
    const byHost = new Map();
    for (const r of results.filter((x) => x.outcome === "would-copy")) byHost.set(r.host, (byHost.get(r.host) ?? 0) + 1);
    for (const [host, n] of byHost) lines.push(`  ${host}: ${n}`);
    lines.push("Dry run: nothing was downloaded, uploaded or changed. Re-run with --apply to copy.");
  }
  return lines;
}
