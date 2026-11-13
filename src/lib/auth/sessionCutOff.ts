import { connectDB } from "@/lib/db/mongoose";
import User from "@/models/User";
import McpToken from "@/models/McpToken";
import { PushSubscription } from "@/models/PushSubscription";
import logger from "@/lib/logger";

/**
 * Account-wide session cut-off: every session signed in before the account's
 * `sessionsValidAfter` ends. Set when the password is changed or reset, and
 * when a password nobody proved the mailbox for is removed
 * (lib/auth/unprovenPassword.ts).
 *
 * The comparison uses the session's sign-in time (`token.authAtMs`, stamped
 * once at sign-in; older tokens carry only `authAt` in seconds), never `iat`:
 * Auth.js rewrites `iat` every time the cookie is re-issued, so a session in
 * use always looked newer than the change.
 *
 * The jwt callback asks on every request, so the answer is cached per server
 * for RECHECK_MS; the server that made the change knows it at once
 * (noteSessionsCutOff), others within RECHECK_MS. Steps that hand out access
 * outliving the session ask sessionEndedNow, which never uses the cache
 * (withAuth's `freshSession`).
 */
const RECHECK_MS = 30_000;
const MAX_ENTRIES = 10_000;

interface Entry {
  /** Cut-off in milliseconds; 0 = none. */
  cutOffMs: number;
  checkedAt: number;
}

/** A session's sign-in time, as the jwt token and session.user carry it. */
export interface SignInTime {
  /** Milliseconds; stamped by sign-ins since the cut-off moved to ms. */
  authAtMs?: unknown;
  /** Whole seconds; all sign-ins stamp it. */
  authAt?: unknown;
}

const entries = new Map<string, Entry>();

function remember(userId: string, cutOffMs: number, checkedAt: number) {
  // Re-inserted so the Map's insertion order stays oldest-first.
  entries.delete(userId);
  entries.set(userId, { cutOffMs, checkedAt });
  if (entries.size <= MAX_ENTRIES) return;
  let drop = Math.floor(entries.size / 2);
  for (const key of entries.keys()) {
    if (drop-- <= 0) break;
    entries.delete(key);
  }
}

function toMillis(cutOff: Date | number | null | undefined): number {
  if (cutOff === null || cutOff === undefined) return 0;
  const ms = typeof cutOff === "number" ? cutOff : new Date(cutOff).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Whether a session signed in before the cut-off (a Date, or milliseconds).
 * In milliseconds when the session has `authAtMs`: every sign-in that sets a
 * cut-off stamps its own time after writing it, so it is kept, and a session
 * from earlier in the same second is not. A session with only `authAt`
 * (seconds) compares in whole seconds; one with neither counts as older.
 */
export function signedInBeforeCutOff(
  signIn: SignInTime | null | undefined,
  cutOff: Date | number | null | undefined,
): boolean {
  const cutOffMs = toMillis(cutOff);
  if (cutOffMs <= 0) return false;
  if (typeof signIn?.authAtMs === "number") return signIn.authAtMs < cutOffMs;
  if (typeof signIn?.authAt === "number") return signIn.authAt < Math.floor(cutOffMs / 1000);
  return true;
}

async function readCutOff(userId: string, known: number): Promise<number> {
  await connectDB();
  const doc = (await User.findById(userId).select("sessionsValidAfter").lean()) as {
    sessionsValidAfter?: Date;
  } | null;
  // A cut-off never moves back; a read that lags this server's own write
  // must not undo it.
  const cutOffMs = Math.max(toMillis(doc?.sessionsValidAfter), known);
  remember(userId, cutOffMs, Date.now());
  return cutOffMs;
}

/**
 * The account's cut-off in milliseconds (0 = none), cached RECHECK_MS. Fails
 * open, like the sign-out check: a database outage must not sign every user
 * out. The five-minute re-check in the jwt callback reads the field again.
 */
export async function sessionsCutOffFor(userId: string): Promise<number> {
  const known = entries.get(userId);
  if (known && Date.now() - known.checkedAt < RECHECK_MS) return known.cutOffMs;
  try {
    return await readCutOff(userId, known?.cutOffMs ?? 0);
  } catch (err) {
    logger.warn({ err }, "[auth] session cut-off check failed; allowing session");
    return known?.cutOffMs ?? 0;
  }
}

/**
 * Whether this session was ended, read from the database now, not the
 * cache: another server may have ended it seconds ago. For steps that hand out
 * access outliving the session (an MCP approval, an API key or webhook, an
 * address change). Answers "ended" when the database cannot be read: such a
 * step can wait, unlike every page view.
 */
export async function sessionEndedNow(userId: string, signIn: SignInTime | null | undefined): Promise<boolean> {
  try {
    return signedInBeforeCutOff(signIn, await readCutOff(userId, entries.get(userId)?.cutOffMs ?? 0));
  } catch (err) {
    logger.warn({ err }, "[auth] fresh session cut-off check failed; refusing the step");
    return true;
  }
}

/** This server learns a cut-off it just wrote, with no read. */
export function noteSessionsCutOff(userId: string, at: Date): void {
  const known = entries.get(userId)?.cutOffMs ?? 0;
  remember(userId, Math.max(known, toMillis(at)), Date.now());
}

/**
 * Revokes every MCP access and refresh token of the account (ChatGPT / Claude
 * connectors). Their checks also compare the grant with `passwordChangedAt`;
 * this ends them in the database too. Never throws.
 */
export async function revokeMcpGrants(userId: string): Promise<void> {
  try {
    await connectDB();
    await McpToken.updateMany({ userId, isRevoked: false }, { $set: { isRevoked: true } });
  } catch (err) {
    logger.error({ err, userId }, "[auth] could not revoke MCP grants");
  }
}

/**
 * After the caller stored `sessionsValidAfter = at` on the account: this
 * server applies it at once, app grants are revoked, and browser push stops
 * reaching the devices just signed out (a normal sign-out removes that
 * device's subscription; these devices never ran it). The owner turns push
 * back on per device. Never throws — the password is already changed.
 */
export async function endAllSessions(userId: string, at: Date): Promise<void> {
  noteSessionsCutOff(userId, at);
  await revokeMcpGrants(userId);
  try {
    await PushSubscription.deleteMany({ userId });
  } catch (err) {
    logger.error({ err, userId }, "[auth] could not remove push subscriptions after the session cut-off");
  }
}

export function __resetCutOffCacheForTests() {
  entries.clear();
}
