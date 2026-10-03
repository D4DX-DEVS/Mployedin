import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import AuditLog from "@/models/AuditLog";
import User from "@/models/User";
import { logActivity } from "@/lib/audit/log";
import { validateBody } from "@/lib/validators";
import { communicationSchema } from "@/lib/validators/admin";
import { inngest } from "@/lib/inngest/client";
import { broadcastRecipientQuery } from "@/lib/communications/broadcastAudience";
import { getWhatsAppSettings } from "@/models/SystemConfig";

interface AuthCtx { userId: string; role: string; locale: string; }

/** What POST below writes into the audit entry of each broadcast. */
interface BroadcastAuditMeta {
  title?: string;
  message?: string;
  channels?: string[];
  recipientCount?: number;
  targetRoles?: string[] | "all";
  targetAll?: boolean;
  /** Set only when the WhatsApp channel was selected. */
  whatsappTemplate?: string;
}

/** How long a second identical broadcast by the same admin is refused. */
const DUPLICATE_WINDOW_MS = 60_000;

/**
 * A broadcast's identity for the duplicate guard: subject, message, audience
 * (`targetRoles` and `targetAll`), channels and, with the WhatsApp channel, the
 * template, as its audit entry records them, order-insensitive. An empty role
 * list is the same as "all". Another template is another broadcast.
 */
function broadcastKey(meta: BroadcastAuditMeta): string {
  const roles = Array.isArray(meta.targetRoles) && meta.targetRoles.length > 0 ? [...meta.targetRoles].sort() : "all";
  const channels = [...(meta.channels ?? [])].sort();
  const template = channels.includes("whatsapp") ? (meta.whatsappTemplate ?? "") : "";
  return JSON.stringify([meta.title ?? "", meta.message ?? "", roles, channels, Boolean(meta.targetAll), template]);
}

async function getHandler(_req: NextRequest, ctx: AuthCtx) {
  // The broadcast history is platform-wide with no scoping, and POST below is
  // already admin-only — a role that cannot send a broadcast has no reason to
  // read every broadcast ever sent. The only consumer is the admin
  // communications page.
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();
  // One audit entry per broadcast, written by POST below. This used to read
  // `type: "system"` notifications, but every automated notice (review
  // requests, invoice reminders, renewals) uses that type too, and a single
  // broadcast writes one per recipient in batches of 50 — so the history
  // listed reminders and receipts and never an actual broadcast.
  const entries = await AuditLog.find({ action: "communication.broadcast" })
    .sort({ createdAt: -1 })
    .limit(100)
    .select("meta createdAt")
    .lean();

  const broadcasts = entries.map((entry) => {
    const meta = (entry.meta ?? {}) as BroadcastAuditMeta;
    return {
      _id: String(entry._id),
      title: meta.title ?? "",
      // Entries written before the message was recorded have none.
      body: meta.message ?? "",
      channels: meta.channels?.length ? meta.channels : ["in_app"],
      recipientCount: typeof meta.recipientCount === "number" ? meta.recipientCount : null,
      audience: meta.targetRoles ?? "all",
      createdAt: entry.createdAt,
    };
  });

  return NextResponse.json({ broadcasts });
}

async function handler(req: NextRequest, ctx: AuthCtx) {
  // Broadcasting to all users (targetAll) is an admin-only superpower — a
  // super_agent/agent must never be able to mass-mail the whole platform.
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();

  if (req.method === "POST") {
    const { targetRoles, targetAll, message, title, channels, whatsapp } = await validateBody(req, communicationSchema);

    if (!message || !title) {
      return NextResponse.json({ error: "title and message required" }, { status: 400 });
    }

    const selectedChannels = channels ?? ["in_app"];
    // With the master switch off the WhatsApp leg would skip every recipient: say so instead of queuing a silent no-op.
    if (selectedChannels.includes("whatsapp") && !(await getWhatsAppSettings()).enabled) {
      return NextResponse.json({ error: "whatsapp_disabled" }, { status: 409 });
    }

    // A double click, a retry after a slow answer or a second tab must not mail every user twice. Each send
    // writes one audit entry (the History tab's): the same broadcast by this admin within the window is refused.
    const key = broadcastKey({
      title,
      message,
      targetRoles: targetRoles ?? "all",
      targetAll: Boolean(targetAll),
      channels: selectedChannels,
      whatsappTemplate: selectedChannels.includes("whatsapp") ? whatsapp?.templateName : undefined,
    });
    const recent = await AuditLog.find({ action: "communication.broadcast", actorId: ctx.userId, createdAt: { $gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) } })
      .select("meta")
      .lean();
    if (recent.some((entry) => broadcastKey((entry.meta ?? {}) as BroadcastAuditMeta) === key)) {
      return NextResponse.json({ error: "duplicate_broadcast" }, { status: 409 });
    }

    const broadcastId = randomUUID();
    // A template that arrived without the channel is not part of this send.
    const waLeg = selectedChannels.includes("whatsapp") ? whatsapp : undefined;

    // Count recipients cheaply (index-only) for the response; the actual
    // per-user notification + email fan-out is offloaded to Inngest so a
    // targetAll broadcast (100k+ users) never runs on the request path
    // (which would blow the serverless timeout + memory).
    const recipientCount = await User.countDocuments(broadcastRecipientQuery(Boolean(targetAll), targetRoles));

    await inngest.send({
      name: "admin/broadcast",
      data: { title, message, targetRoles, targetAll: Boolean(targetAll), channels: selectedChannels, broadcastId, whatsapp: waLeg },
    });

    await logActivity({
      actorId: ctx.userId,
      actorRole: ctx.role,
      action: "communication.broadcast",
      resource: "notifications",
      // The History tab is built from this entry, message included.
      meta: { title, message, targetRoles: targetRoles ?? "all", targetAll: Boolean(targetAll), recipientCount, channels: selectedChannels, broadcastId, whatsappTemplate: waLeg?.templateName },
      req,
    });

    return NextResponse.json({
      success: true,
      sent: recipientCount,
      queued: true,
      message: `Broadcast queued for ${recipientCount} users`,
    });
  }

  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}

export const GET = withAuth(getHandler, { resource: "notifications", action: "read" });
export const POST = withAuth(handler, { resource: "notifications", action: "create" });
