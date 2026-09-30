/**
 * Which version of the Terms of Service + Privacy Policy users must accept.
 *
 * The version lives in `SystemSettings.legalTermsVersion`, so an admin can ask
 * everyone to accept again after a material change (admin GDPR page → Consent
 * Logs). Until one is stored, TERMS_BASELINE_VERSION applies: the version in
 * force when acceptance started being recorded per user. Accounts older than
 * that, and accounts staff create for someone (agents, super agents, team
 * members, converted leads, bulk imports), have no accepted version and are
 * asked once, on /accept-terms, before they reach their dashboard.
 *
 * Cached like the subscription-enforcement flag: one read per minute per
 * instance, concurrent cold reads coalesced. `bumpTermsVersion` refreshes the
 * cache of the instance that bumps; the others follow within the TTL.
 */
import connectDB from "@/lib/db/mongoose";
import SystemSettings from "@/models/SystemSettings";
import User from "@/models/User";

export const TERMS_BASELINE_VERSION = "2026-09-29";

const CACHE_TTL_MS = 60_000;

let cachedValue: string | null = null;
let cachedAt = 0;
let inflight: Promise<string | null> | null = null;

async function loadFromDb(): Promise<string | null> {
  try {
    await connectDB();
    const settings = await SystemSettings.findOne()
      .select("legalTermsVersion")
      .lean<{ legalTermsVersion?: string } | null>();
    cachedValue = settings?.legalTermsVersion || TERMS_BASELINE_VERSION;
    cachedAt = Date.now();
    return cachedValue;
  } catch {
    // Not cached: the next caller retries. Callers treat null as "cannot tell"
    // and gate nobody, so a database hiccup never locks users out.
    return null;
  }
}

/** The version every user must have accepted, or null when it cannot be read. */
export async function getCurrentTermsVersion(): Promise<string | null> {
  if (cachedValue !== null && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedValue;
  }
  if (!inflight) {
    inflight = loadFromDb().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

export function clearTermsVersionCache(): void {
  cachedValue = null;
  cachedAt = 0;
  inflight = null;
}

/**
 * Whether a user still owes an acceptance. Admins run the platform and are not
 * asked; an unreadable current version gates nobody.
 */
export function termsPendingFor(
  role: string | undefined,
  acceptedVersion: string | null | undefined,
  currentVersion: string | null,
): boolean {
  if (role === "admin" || currentVersion === null) return false;
  return acceptedVersion !== currentVersion;
}

/** Reads the user's stored role and accepted version; a missing user is not gated. */
export async function isTermsAcceptancePending(userId: string, role?: string): Promise<boolean> {
  if (role === "admin") return false;
  await connectDB();
  const [user, current] = await Promise.all([
    User.findById(userId)
      .select("role termsAcceptedVersion")
      .lean<{ role?: string; termsAcceptedVersion?: string } | null>(),
    getCurrentTermsVersion(),
  ]);
  if (!user) return false;
  return termsPendingFor(user.role ?? role, user.termsAcceptedVersion, current);
}

/**
 * Start a new version: every non-admin user is asked to accept again on their
 * next page load (live sessions pick it up at their next 5-minute re-check).
 */
export async function bumpTermsVersion(now: Date = new Date()): Promise<string> {
  const version = now.toISOString();
  await connectDB();
  await SystemSettings.findOneAndUpdate(
    {},
    { $set: { legalTermsVersion: version } },
    { upsert: true, returnDocument: "after" },
  ).lean();
  cachedValue = version;
  cachedAt = Date.now();
  inflight = null;
  return version;
}
