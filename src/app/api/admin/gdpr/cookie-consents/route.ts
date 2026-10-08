import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import CookieConsentRecord from "@/models/CookieConsentRecord";
import { CONSENT_METHODS, CONSENT_POLICY_VERSION } from "@/lib/consent/config";

/* ------------------------------------------------------------------ */
/*  GET /api/admin/gdpr/cookie-consents                                */
/*  Proof-of-consent records + aggregate stats for the last N days.    */
/* ------------------------------------------------------------------ */

async function handler(req: NextRequest, ctx: AuthContext) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 10) || 10));
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days") ?? 30) || 30));
  const method = url.searchParams.get("method") ?? "";
  const consentId = (url.searchParams.get("consentId") ?? "").trim();

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const filter: Record<string, unknown> = { createdAt: { $gte: since } };
  if ((CONSENT_METHODS as readonly string[]).includes(method)) filter.method = method;
  if (/^[A-Za-z0-9-]{8,64}$/.test(consentId)) filter.consentId = consentId;

  const [items, total, byMethod, categoryTotals] = await Promise.all([
    CookieConsentRecord.find(filter)
      .select("consentId userId policyVersion choices method gpc locale country pageUrl createdAt")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    CookieConsentRecord.countDocuments(filter),
    CookieConsentRecord.aggregate<{ _id: string; count: number }>([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: "$method", count: { $sum: 1 } } },
    ]),
    CookieConsentRecord.aggregate<{ _id: null; total: number; functional: number; analytics: number; marketing: number; gpc: number }>([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          functional: { $sum: { $cond: ["$choices.functional", 1, 0] } },
          analytics: { $sum: { $cond: ["$choices.analytics", 1, 0] } },
          marketing: { $sum: { $cond: ["$choices.marketing", 1, 0] } },
          gpc: { $sum: { $cond: ["$gpc", 1, 0] } },
        },
      },
    ]),
  ]);

  const totals = categoryTotals[0] ?? { total: 0, functional: 0, analytics: 0, marketing: 0, gpc: 0 };

  return NextResponse.json({
    policyVersion: CONSENT_POLICY_VERSION,
    days,
    stats: {
      total: totals.total,
      byMethod: Object.fromEntries(byMethod.map((m) => [m._id, m.count])),
      granted: { functional: totals.functional, analytics: totals.analytics, marketing: totals.marketing },
      gpc: totals.gpc,
    },
    items: items.map((r) => ({
      _id: String(r._id),
      consentId: r.consentId,
      signedIn: Boolean(r.userId),
      policyVersion: r.policyVersion,
      choices: r.choices,
      method: r.method,
      gpc: r.gpc,
      locale: r.locale,
      country: r.country,
      pageUrl: r.pageUrl,
      createdAt: r.createdAt,
    })),
    total,
  });
}

export const GET = withAuth(handler, { resource: "audit_logs", action: "read" });
