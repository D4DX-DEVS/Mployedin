import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import ConsentLog from "@/models/ConsentLog";
import ConsentReceipt from "@/models/ConsentReceipt";
import { bannerTextHash } from "@/lib/consent/bannerTextHash";
import { isReceiptId } from "@/lib/consent/receiptId";
import {
  COOKIE_CHOICE_TYPES,
  consentAccountsById,
  groupCookieChoiceStages,
  toCookieChoiceRecord,
  type GroupedCookieChoice,
} from "@/lib/gdpr/cookieChoiceGroups";

/** How many of the account's other cookie choices the record shows. */
const OTHER_CHOICES_LIMIT = 20;

/** The two receipt fields the wording check reads; the hash itself never leaves this file. */
interface StoredReceiptText {
  bannerTextHash?: string;
  locale?: string;
}

/**
 * Whether the banner text the visitor saw is still today's text in their
 * language. "unknown" once the receipt has deleted itself (12 months): the
 * wording is only ever stored as a hash on the receipt.
 */
function wordingStatus(receipt: StoredReceiptText | null): "same" | "older" | "unknown" {
  if (!receipt) return "unknown";
  if (receipt.locale !== "en" && receipt.locale !== "ar") return "older";
  return receipt.bannerTextHash === bannerTextHash(receipt.locale) ? "same" : "older";
}

const time = (value: Date | string): number => new Date(value).getTime();

/* ------------------------------------------------------------------ */
/*  GET /api/admin/gdpr/consent/choices/[receiptId] — one record       */
/* ------------------------------------------------------------------ */

/**
 * One signed-in cookie choice by its choice reference: the grouped choice
 * (as in the list), whether a later choice by the same account replaced it,
 * that account's other cookie choices (newest first, at most 20, each marked
 * "earlier" or "later" than this one) and whether the wording shown is still
 * today's.
 *
 * 400 for anything that is not a full reference; 404 when no account row has
 * it (an anonymous choice: the lookup shows those). Never returns the text
 * hash, an IP address or a user agent.
 */
async function handler(_req: NextRequest, ctx: AuthContext, params?: Record<string, string>) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ref = (params?.receiptId ?? "").trim().toLowerCase();
  if (!isReceiptId(ref)) {
    return NextResponse.json({ error: "A full choice reference is required." }, { status: 400 });
  }

  await connectDB();

  const [choice] = (await ConsentLog.aggregate([
    { $match: { receiptId: ref, consentType: { $in: COOKIE_CHOICE_TYPES } } },
    ...groupCookieChoiceStages(),
    { $sort: { recordedAt: -1 } },
    { $limit: 1 },
  ])) as GroupedCookieChoice[];
  if (!choice) {
    return NextResponse.json({ error: "No account has a cookie choice with this reference." }, { status: 404 });
  }

  const [others, receipt, accounts] = await Promise.all([
    ConsentLog.aggregate([
      // Every other choice by the account; rows without a reference are other choices too.
      { $match: { userId: choice.userId, consentType: { $in: COOKIE_CHOICE_TYPES }, receiptId: { $ne: ref } } },
      ...groupCookieChoiceStages(),
      { $sort: { recordedAt: -1, _id: -1 } },
      { $limit: OTHER_CHOICES_LIMIT },
    ]) as Promise<GroupedCookieChoice[]>,
    ConsentReceipt.findOne({ receiptId: ref })
      .sort({ createdAt: -1 })
      .select("bannerTextHash locale")
      .lean<StoredReceiptText | null>(),
    consentAccountsById([String(choice.userId ?? "")]),
  ]);

  const recordedAt = time(choice.recordedAt);
  const otherChoices = others.slice(0, OTHER_CHOICES_LIMIT).map((other) => toCookieChoiceRecord(other, accounts));
  const isLater = (other: { recordedAt: Date | string }) => time(other.recordedAt) > recordedAt;

  return NextResponse.json({
    record: toCookieChoiceRecord(choice, accounts),
    status: otherChoices.some(isLater) ? "replaced" : "current",
    otherChoices: otherChoices.map((other) => ({
      recordedAt: other.recordedAt,
      relation: isLater(other) ? "later" : "earlier",
      outcome: other.outcome,
      preferences: other.preferences,
      media: other.media,
      source: other.source,
    })),
    wording: wordingStatus(receipt),
  });
}

export const GET = withAuth(handler, { resource: "audit_logs", action: "read" });
