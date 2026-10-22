import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import ConsentReceipt from "@/models/ConsentReceipt";
import ConsentLog from "@/models/ConsentLog";
import { bannerTextHash } from "@/lib/consent/bannerTextHash";
import { isReceiptId } from "@/lib/consent/receiptId";
import { COOKIE_CHOICE_TYPES, consentAccountsById, consentRowIdentity } from "@/lib/gdpr/cookieChoiceGroups";
import { asCookieChoiceSource, type CookieChoiceSource } from "@/lib/gdpr/cookieChoiceOutcome";

/** One reference normally has one receipt; the cap only bounds a forged repeat. */
const RECEIPT_LIMIT = 10;

interface StoredReceipt {
  receiptId: string;
  preferences: boolean;
  media: boolean;
  version: number;
  locale: string;
  bannerTextHash: string;
  /** Where the choice was made; receipts written before it was stored have none. */
  source?: string;
  createdAt: Date;
}

/** The ConsentLog fields the lookup selects (never the row's IP address). */
interface StoredLogRow {
  userId?: unknown;
  userName?: string;
  source?: string;
  createdAt?: Date;
}

/** Whether the text the visitor saw is still today's text in their language. */
function wordingMatchesCurrent(receipt: StoredReceipt): boolean {
  if (receipt.locale !== "en" && receipt.locale !== "ar") return false;
  return receipt.bannerTextHash === bannerTextHash(receipt.locale);
}

/* ------------------------------------------------------------------ */
/*  GET /api/admin/gdpr/consent/receipt?ref=<choice reference>         */
/* ------------------------------------------------------------------ */

/**
 * Look up one cookie choice by the reference the visitor quotes (their "Your
 * choice reference" in Cookie settings). This is how an admin sees what a
 * visitor who never signed in chose, and whether it was Reject all.
 *
 * Answers the choice, when and where it was made (banner or Cookie settings;
 * null on receipts written before that was stored), whether the wording is
 * still today's, and the account the choice was logged against, if any: its
 * name, e-mail, the source on its log row, and whether this was the account's
 * first recorded cookie choice or a later change. The text hash itself is never
 * returned, and the receipt holds no IP address, user agent or user id; the
 * user collection is read only to name a linked account.
 *
 * An unknown reference is a 200 with nothing in it: receipts delete themselves
 * 12 months after they are written, so "not found" is a normal answer.
 */
async function handler(req: NextRequest, ctx: AuthContext) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // The pattern accepts either case, but the app only ever writes lower-case ids
  // (crypto.randomUUID in writeConsent), so a pasted upper-case reference is
  // lower-cased before it is matched.
  const ref = (new URL(req.url).searchParams.get("ref")?.trim() ?? "").toLowerCase();
  if (!isReceiptId(ref)) {
    return NextResponse.json({ error: "A full choice reference is required." }, { status: 400 });
  }

  await connectDB();

  const [receipts, log] = await Promise.all([
    ConsentReceipt.find({ receiptId: ref }).sort({ createdAt: -1 }).limit(RECEIPT_LIMIT).lean<StoredReceipt[]>(),
    // Only the fields needed to name the account and place the choice; never the row's IP address.
    // Newest row first, so the same reference always names the same account.
    ConsentLog.findOne({ receiptId: ref })
      .sort({ createdAt: -1 })
      .select("userId userName source createdAt")
      .lean<StoredLogRow | null>(),
  ]);

  let linkedAccount: {
    userId: string;
    userName: string;
    userEmail: string | null;
    source: CookieChoiceSource | null;
    /** False when the account has an earlier cookie choice (this one changed it). */
    firstChoice: boolean;
  } | null = null;
  if (log) {
    const userId = String(log.userId ?? "");
    const [accounts, earlier] = await Promise.all([
      consentAccountsById([userId]),
      // Any cookie-choice row of the same account, written before this one under another (or no) reference.
      log.createdAt
        ? ConsentLog.exists({
            userId: log.userId,
            consentType: { $in: COOKIE_CHOICE_TYPES },
            receiptId: { $ne: ref },
            createdAt: { $lt: log.createdAt },
          })
        : Promise.resolve(null),
    ]);
    linkedAccount = {
      userId,
      // "Deleted User" with no e-mail once the account is erased; otherwise the name the row was written with.
      ...consentRowIdentity(userId, log.userName, accounts),
      source: asCookieChoiceSource(log.source),
      firstChoice: !earlier,
    };
  }

  return NextResponse.json({
    receipts: receipts.map((r) => ({
      receiptId: r.receiptId,
      preferences: r.preferences,
      media: r.media,
      version: r.version,
      locale: r.locale,
      createdAt: r.createdAt,
      wordingMatchesCurrent: wordingMatchesCurrent(r),
      source: asCookieChoiceSource(r.source),
    })),
    linkedAccount,
  });
}

export const GET = withAuth(handler, { resource: "audit_logs", action: "read" });
