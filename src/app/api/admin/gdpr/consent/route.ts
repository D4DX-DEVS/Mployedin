import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import ConsentLog from "@/models/ConsentLog";
import User from "@/models/User";
import { escapeRegex } from "@/lib/security/sanitize";
import { isReceiptId } from "@/lib/consent/receiptId";
import { CONSENT_TYPES, COOKIE_CONSENT_TYPES } from "@/lib/gdpr/consent";
import { COOKIE_CHOICE_TYPES, consentAccountsById, consentRowIdentity } from "@/lib/gdpr/cookieChoiceGroups";

const CONSENT_TYPE_VALUES: string[] = [...Object.values(CONSENT_TYPES), ...Object.values(COOKIE_CONSENT_TYPES)];

/** Enough to find a person by e-mail; a broader match should be narrowed, not paged through. */
const EMAIL_MATCH_LIMIT = 200;

/* ------------------------------------------------------------------ */
/*  GET /api/admin/gdpr/consent — consent change history               */
/* ------------------------------------------------------------------ */

/**
 * One row per stored consent entry. `type` narrows to one consent type, or
 * "other" for everything except the per-category cookie rows (the admin's
 * "Other consents": Terms & Privacy, marketing, the sign-up cookie row).
 * Pages of up to 100 rows. The IP address some rows still store (sign-up and
 * Terms acceptance) is never sent.
 */
async function handler(req: NextRequest, ctx: AuthContext) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 10)));
  const search = url.searchParams.get("search")?.trim() ?? "";
  const type = url.searchParams.get("type") ?? "";
  const sortDir = url.searchParams.get("sortOrder") === "asc" ? 1 : -1;

  const filter: Record<string, unknown> = {};
  if (CONSENT_TYPE_VALUES.includes(type)) filter.consentType = type;
  else if (type === "other") filter.consentType = { $nin: COOKIE_CHOICE_TYPES }; // the per-category cookie rows: listed as grouped choices (./choices)
  if (search) {
    const safe = escapeRegex(search);
    // Rows keep the name the user had when they consented; the e-mail lives on
    // the user, so an e-mail search goes through the users collection.
    const emailMatches = (await User.find({ email: { $regex: safe, $options: "i" } })
      .select("_id")
      .limit(EMAIL_MATCH_LIMIT)
      .lean()) as Array<{ _id: unknown }>;
    filter.$or = [
      { userName: { $regex: safe, $options: "i" } },
      { consentType: { $regex: safe, $options: "i" } },
      ...(emailMatches.length ? [{ userId: { $in: emailMatches.map((u) => u._id) } }] : []),
      // A full choice reference finds the cookie rows written with it. Exact, not a
      // regex: a partial reference matches nothing here. Lower-cased because the
      // pattern accepts either case but the app only writes lower-case ids.
      ...(isReceiptId(search) ? [{ receiptId: search.toLowerCase() }] : []),
    ];
  }

  const [items, total] = await Promise.all([
    ConsentLog.find(filter).sort({ createdAt: sortDir, _id: sortDir }).skip((page - 1) * limit).limit(limit).lean(),
    ConsentLog.countDocuments(filter),
  ]);

  const rows = items as Array<Record<string, unknown>>;
  const accounts = await consentAccountsById(rows.map((c) => String(c.userId ?? "")));

  const mapped = rows.map((c) => ({
    _id: String(c._id),
    userId: String(c.userId ?? ""),
    // "Deleted User" with no e-mail once the account is erased; the row itself stays as evidence.
    ...consentRowIdentity(String(c.userId ?? ""), typeof c.userName === "string" ? c.userName : null, accounts),
    consentType: c.consentType,
    granted: Boolean(c.granted),
    timestamp: c.createdAt,
    source: c.source ?? null,
    policyVersion: c.policyVersion ?? null,
    // The choice reference on cookie rows; older rows, terms and marketing rows have none.
    receiptId: c.receiptId ?? null,
  }));

  return NextResponse.json({ items: mapped, total });
}

export const GET = withAuth(handler, { resource: "audit_logs", action: "read" });
