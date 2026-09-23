import { connectDB } from "@/lib/db/mongoose";
import RevokedSession from "@/models/RevokedSession";
import logger from "@/lib/logger";

/**
 * Sign-out revocation for JWT sessions.
 *
 * The jwt callback runs on every authenticated request, so a DB read per call
 * would tax every page and API hit. Two per-instance caches keep it cheap:
 *  - sessions revoked (or found revoked) here are refused with no DB read;
 *  - a "not revoked" answer is trusted for RECHECK_MS, so a sign-out on another
 *    instance takes effect there within that window.
 */
const RECHECK_MS = 30_000;
const MAX_ENTRIES = 10_000;

const revokedUntil = new Map<string, number>(); // sid -> expiry (ms)
const cleanCheckedAt = new Map<string, number>(); // sid -> last clean DB read (ms)

function bounded(map: Map<string, number>) {
  if (map.size <= MAX_ENTRIES) return;
  // Maps iterate in insertion order: drop the oldest half.
  let drop = Math.floor(map.size / 2);
  for (const key of map.keys()) {
    if (drop-- <= 0) break;
    map.delete(key);
  }
}

export async function revokeSession(sid: string, expiresAtSec: number, userId?: string): Promise<void> {
  const expiresAt = new Date(expiresAtSec * 1000);
  revokedUntil.set(sid, expiresAt.getTime());
  cleanCheckedAt.delete(sid);
  bounded(revokedUntil);
  try {
    await connectDB();
    await RevokedSession.updateOne(
      { sid },
      { $setOnInsert: { sid, userId, expiresAt } },
      { upsert: true },
    );
  } catch (err) {
    // This instance still refuses the session; other instances won't know.
    logger.error({ err, sid }, "[auth] could not persist session revocation");
  }
}

export async function isSessionRevoked(sid: string): Promise<boolean> {
  const now = Date.now();
  const until = revokedUntil.get(sid);
  if (until !== undefined) {
    if (until > now) return true;
    revokedUntil.delete(sid);
  }

  const checkedAt = cleanCheckedAt.get(sid);
  if (checkedAt !== undefined && now - checkedAt < RECHECK_MS) return false;

  try {
    await connectDB();
    const hit = await RevokedSession.exists({ sid });
    if (hit) {
      // Revocation is permanent. Remember it for a day; after that the DB row
      // (which lives as long as the token could) answers again.
      revokedUntil.set(sid, now + 24 * 60 * 60 * 1000);
      bounded(revokedUntil);
      return true;
    }
    cleanCheckedAt.set(sid, now);
    bounded(cleanCheckedAt);
    return false;
  } catch (err) {
    // Fail open: a database outage must not sign every user out.
    logger.warn({ err }, "[auth] session revocation check failed; allowing session");
    return false;
  }
}

export function __resetRevocationCacheForTests() {
  revokedUntil.clear();
  cleanCheckedAt.clear();
}
