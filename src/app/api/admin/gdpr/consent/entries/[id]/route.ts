import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import ConsentLog from "@/models/ConsentLog";
import { CONSENT_TYPES } from "@/lib/gdpr/consent";
import { COOKIE_CHOICE_TYPES, consentAccountsById, consentRowIdentity } from "@/lib/gdpr/cookieChoiceGroups";
import { getCurrentTermsVersion } from "@/lib/gdpr/termsVersion";

/** How many of the account's other answers of the same type the details show. */
const HISTORY_LIMIT = 20;

/** The stored fields the details read; the IP address some rows keep is never selected. */
interface StoredConsentEntry {
  _id: unknown;
  userId?: unknown;
  userName?: string;
  consentType: string;
  granted: boolean;
  source?: string | null;
  policyVersion?: string | null;
  createdAt: Date | string;
}

const ENTRY_FIELDS = "userId userName consentType granted source policyVersion createdAt";
const time = (value: Date | string): number => new Date(value).getTime();

/* ------------------------------------------------------------------ */
/*  GET /api/admin/gdpr/consent/entries/[id] — one Other consents row  */
/* ------------------------------------------------------------------ */

/**
 * One Other consents entry (Terms & Privacy, marketing, the sign-up cookie row)
 * in full: who, the answer, where and when, whether a later answer of the same
 * type by the same account replaced it, for a Terms row whether it accepted the
 * version in force today, and the account's other answers of this type (newest
 * first, at most 20, each "earlier" or "later" than this one).
 *
 * 400 for an id that is not an ObjectId; 404 when there is no such row, or it is
 * a per-category cookie row (those are cookie choices: ./choices/[receiptId]).
 * Never returns an IP address or a user agent.
 */
async function handler(_req: NextRequest, ctx: AuthContext, params?: Record<string, string>) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = params?.id ?? "";
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid consent entry id." }, { status: 400 });
  }

  await connectDB();

  const entry = await ConsentLog.findById(id).select(ENTRY_FIELDS).lean<StoredConsentEntry | null>();
  if (!entry || COOKIE_CHOICE_TYPES.includes(entry.consentType)) {
    return NextResponse.json({ error: "No consent entry with this id." }, { status: 404 });
  }

  const userId = String(entry.userId ?? "");
  const isTerms = entry.consentType === CONSENT_TYPES.termsAndPrivacy;
  const [others, accounts, currentTermsVersion] = await Promise.all([
    ConsentLog.find({ userId: entry.userId, consentType: entry.consentType, _id: { $ne: entry._id } })
      .select(ENTRY_FIELDS)
      .sort({ createdAt: -1, _id: -1 })
      .limit(HISTORY_LIMIT)
      .lean<StoredConsentEntry[]>(),
    consentAccountsById([userId]),
    isTerms ? getCurrentTermsVersion() : Promise.resolve(null),
  ]);

  const recordedAt = time(entry.createdAt);
  const isLater = (other: StoredConsentEntry) => time(other.createdAt) > recordedAt;

  return NextResponse.json({
    entry: {
      _id: String(entry._id),
      // "Deleted User" with no e-mail once the account is erased; the row itself stays as evidence.
      ...consentRowIdentity(userId, entry.userName, accounts),
      consentType: entry.consentType,
      granted: Boolean(entry.granted),
      timestamp: entry.createdAt,
      source: entry.source ?? null,
      policyVersion: entry.policyVersion ?? null,
    },
    status: others.some(isLater) ? "replaced" : "current",
    // Terms rows only: "current" when it accepted today's version, "older" otherwise, null when unknown.
    termsVersion: isTerms && currentTermsVersion && entry.policyVersion
      ? entry.policyVersion === currentTermsVersion ? "current" : "older"
      : null,
    history: others.map((other) => ({
      _id: String(other._id),
      timestamp: other.createdAt,
      relation: isLater(other) ? "later" : "earlier",
      granted: Boolean(other.granted),
      source: other.source ?? null,
      policyVersion: other.policyVersion ?? null,
    })),
  });
}

export const GET = withAuth(handler, { resource: "audit_logs", action: "read" });
