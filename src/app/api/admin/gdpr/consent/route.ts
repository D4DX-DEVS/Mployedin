import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import ConsentLog from "@/models/ConsentLog";
import User from "@/models/User";
import { escapeRegex } from "@/lib/security/sanitize";
import { CONSENT_TYPES } from "@/lib/gdpr/consent";

const CONSENT_TYPE_VALUES: string[] = Object.values(CONSENT_TYPES);

/** Enough to find a person by e-mail; a broader match should be narrowed, not paged through. */
const EMAIL_MATCH_LIMIT = 200;

/* ------------------------------------------------------------------ */
/*  GET /api/admin/gdpr/consent — consent change history               */
/* ------------------------------------------------------------------ */

async function handler(req: NextRequest, ctx: AuthContext) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 10)));
  const search = url.searchParams.get("search") ?? "";
  const type = url.searchParams.get("type") ?? "";
  const sortDir = url.searchParams.get("sortOrder") === "asc" ? 1 : -1;

  const filter: Record<string, unknown> = {};
  if (CONSENT_TYPE_VALUES.includes(type)) filter.consentType = type;
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
    ];
  }

  const [items, total] = await Promise.all([
    ConsentLog.find(filter).sort({ createdAt: sortDir, _id: sortDir }).skip((page - 1) * limit).limit(limit).lean(),
    ConsentLog.countDocuments(filter),
  ]);

  const rows = items as Array<Record<string, unknown>>;
  const userIds = [...new Set(rows.map((c) => String(c.userId ?? "")).filter(Boolean))];
  const users = userIds.length
    ? ((await User.find({ _id: { $in: userIds } }).select("email").lean()) as Array<{ _id: unknown; email?: string }>)
    : [];
  const emailById = new Map(users.map((u) => [String(u._id), u.email]));

  const mapped = rows.map((c) => ({
    _id: String(c._id),
    userId: String(c.userId ?? ""),
    userName: c.userName ?? "Unknown",
    // Absent once the account is erased; the row itself stays as evidence.
    userEmail: emailById.get(String(c.userId ?? "")) ?? null,
    consentType: c.consentType,
    granted: Boolean(c.granted),
    timestamp: c.createdAt,
    ipAddress: c.ipAddress,
    source: c.source ?? null,
    policyVersion: c.policyVersion ?? null,
  }));

  return NextResponse.json({ items: mapped, total });
}

export const GET = withAuth(handler, { resource: "audit_logs", action: "read" });
