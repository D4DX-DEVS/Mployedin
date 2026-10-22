import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import ConsentReceipt from "@/models/ConsentReceipt";
import {
  DEFAULT_COOKIE_CHOICE_PERIOD,
  cookieChoiceOutcome,
  isCookieChoicePeriod,
  periodStart,
  type CookieChoicePeriod,
} from "@/lib/gdpr/cookieChoiceOutcome";

interface ChoiceGroup {
  _id: { preferences?: boolean; media?: boolean };
  count: number;
}

/** `days` from the whitelist (7, 30, 90, 365); absent means 30. Null for anything else. */
function readDays(raw: string | null): CookieChoicePeriod | null {
  if (raw === null) return DEFAULT_COOKIE_CHOICE_PERIOD;
  if (!/^\d+$/.test(raw)) return null;
  const days = Number(raw);
  return isCookieChoicePeriod(days) ? days : null;
}

/* ------------------------------------------------------------------ */
/*  GET /api/admin/gdpr/consent/summary?days= — what visitors chose    */
/* ------------------------------------------------------------------ */

/**
 * Counts of the cookie choices made in the last `days` days (7, 30, 90 or 365;
 * 30 when absent, 400 for anything else), by outcome: rejectedAll (display
 * settings off and videos off), acceptedAll (both on) and custom (the rest),
 * decided by the shared cookieChoiceOutcome. One receipt is one choice, from
 * visitors and signed-in users alike: someone who changes their mind is
 * counted again, because every choice gets a new reference.
 */
async function handler(req: NextRequest, ctx: AuthContext) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const days = readDays(new URL(req.url).searchParams.get("days"));
  if (days === null) {
    return NextResponse.json({ error: "The period must be 7, 30, 90 or 365 days." }, { status: 400 });
  }

  await connectDB();

  const groups = (await ConsentReceipt.aggregate([
    { $match: { createdAt: { $gte: periodStart(days) } } },
    { $group: { _id: { preferences: "$preferences", media: "$media" }, count: { $sum: 1 } } },
  ])) as ChoiceGroup[];

  const counts = { accepted: 0, rejected: 0, custom: 0 };
  for (const group of groups) {
    const outcome = cookieChoiceOutcome({
      preferences: typeof group._id.preferences === "boolean" ? group._id.preferences : null,
      media: typeof group._id.media === "boolean" ? group._id.media : null,
    });
    counts[outcome] += Number(group.count) || 0;
  }

  return NextResponse.json({
    days,
    total: counts.accepted + counts.rejected + counts.custom,
    acceptedAll: counts.accepted,
    rejectedAll: counts.rejected,
    custom: counts.custom,
  });
}

export const GET = withAuth(handler, { resource: "audit_logs", action: "read" });
