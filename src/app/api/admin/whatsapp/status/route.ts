import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import WhatsAppMessageLog, { WHATSAPP_MESSAGE_STATUSES } from "@/models/WhatsAppMessageLog";
import { getWhatsAppSettings } from "@/models/SystemConfig";
import { isWhatsAppEnabled, whatsAppMode } from "@/lib/communications/whatsapp/config";
import { getPhoneNumberInfo } from "@/lib/communications/whatsapp/cloudApi";
import { WhatsAppApiError, type WhatsAppErrorKind } from "@/lib/communications/whatsapp/errors";
import { redactSecrets } from "@/lib/communications/whatsapp/redact";

interface AuthCtx { userId: string; role: string; locale: string }

type Status = (typeof WHATSAPP_MESSAGE_STATUSES)[number];

/**
 * Why the phone lookup failed, without Meta's wording: a Graph answer is reduced to its
 * kind and codes (the page maps the kind to its own copy); any other failure is a network
 * or config problem whose message is relayed once credentials are scrubbed from it.
 */
function describePhoneError(err: unknown): { phoneError: string; phoneErrorKind?: WhatsAppErrorKind } {
  if (err instanceof WhatsAppApiError) {
    const detail = [err.kind, ...(err.code !== undefined ? [`code ${err.code}`] : []), `HTTP ${err.httpStatus}`];
    return { phoneError: `Meta API error (${detail.join(", ")})`, phoneErrorKind: err.kind };
  }
  return { phoneError: err instanceof Error ? redactSecrets(err.message) : "Unknown error" };
}

/** GET /api/admin/whatsapp/status — the Overview tab in one call. */
async function getHandler(_req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await connectDB();

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [settings, byStatus, skipRows] = await Promise.all([
    getWhatsAppSettings(),
    WhatsAppMessageLog.aggregate([{ $match: { sentAt: { $gte: since } } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    WhatsAppMessageLog.aggregate([
      { $match: { sentAt: { $gte: since }, status: "skipped" } },
      { $group: { _id: "$skipReason", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 6 },
    ]),
  ]);

  const last24h = Object.fromEntries(WHATSAPP_MESSAGE_STATUSES.map((s) => [s, 0])) as Record<Status, number>;
  for (const row of byStatus as Array<{ _id: string; count: number }>) {
    if ((WHATSAPP_MESSAGE_STATUSES as readonly string[]).includes(row._id)) last24h[row._id as Status] = row.count;
  }

  let phone: Awaited<ReturnType<typeof getPhoneNumberInfo>> | null = null;
  let phoneError: string | null = null;
  let phoneErrorKind: WhatsAppErrorKind | undefined;
  if (isWhatsAppEnabled()) {
    try {
      phone = await getPhoneNumberInfo();
    } catch (err) {
      ({ phoneError, phoneErrorKind } = describePhoneError(err));
    }
  }

  return NextResponse.json({
    configured: isWhatsAppEnabled(),
    mode: whatsAppMode(),
    enabled: settings.enabled,
    phone,
    phoneError,
    // Only present when Meta answered with a classified error; JSON drops it otherwise.
    phoneErrorKind,
    last24h,
    skipReasons: (skipRows as Array<{ _id: string | null; count: number }>).map((r) => ({ reason: r._id ?? "unknown", count: r.count })),
  });
}

export const GET = withAuth(getHandler, { resource: "notifications", action: "read" });
