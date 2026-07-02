/**
 * GET /api/cron/lead-followup-reminder — Daily cron
 *
 * Sends email reminders to agents who have leads with overdue follow-ups
 * or follow-ups due today. Batches reminders into a single email per agent
 * (Naukri-style daily follow-up digest) to avoid notification fatigue.
 *
 * Cadence: Run daily at 8 AM UTC.
 */

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { verifyCronRequest } from "@/lib/security/cron-auth";
import Lead from "@/models/Lead";
import Agent from "@/models/Agent";
import User from "@/models/User";
import { sendEmail } from "@/lib/communications/email";
import { logActivity } from "@/lib/audit/log";
import { forEachBounded, byId } from "@/lib/cron/scale";
import logger from "@/lib/logger";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const authError = verifyCronRequest(req);
  if (authError) return authError;

  await connectDB();

  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setUTCHours(23, 59, 59, 999);
  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);

  // Exclude leads recently reminded (within last 20 hours)
  const twentyHoursAgo = new Date(now.getTime() - 20 * 60 * 60 * 1000);

  // Find leads with follow-ups due today or overdue (not converted/lost)
  const overdueLeads = await Lead.find({
    status: { $nin: ["converted", "lost"] },
    followUpAt: { $lte: endOfToday, $exists: true },
    $or: [
      { lastFollowupReminderAt: { $exists: false } },
      { lastFollowupReminderAt: { $lt: twentyHoursAgo } },
    ],
  })
    .select("_id agentId companyName contactPerson status followUpAt country industry")
    .lean();

  if (overdueLeads.length === 0) {
    return NextResponse.json({ sent: 0, message: "No overdue follow-ups" });
  }

  // Group by agentId (Agent document _id)
  const byAgent = new Map<string, typeof overdueLeads>();
  for (const lead of overdueLeads) {
    const key = lead.agentId.toString();
    if (!byAgent.has(key)) byAgent.set(key, []);
    byAgent.get(key)!.push(lead);
  }

  // Batch fetch all agents
  const agentIds = Array.from(byAgent.keys());
  const agents = await Agent.find({ _id: { $in: agentIds } })
    .select("_id userId")
    .lean();
  const agentMap = byId(agents);

  // Batch fetch all users
  const userIds = agents.map((a) => a.userId);
  const users = await User.find({ _id: { $in: userIds } })
    .select("_id name email isActive")
    .lean();
  const userMap = byId(users);

  // Group agent+leads for notification send
  const agentGroups: { agentDocId: string; user: typeof users[0]; leads: typeof overdueLeads }[] = [];
  for (const [agentDocId, leads] of byAgent) {
    const agentDoc = agentMap.get(agentDocId);
    if (!agentDoc) continue;
    const user = userMap.get(String(agentDoc.userId));
    if (!user?.email || !user.isActive) continue;
    agentGroups.push({ agentDocId, user, leads });
  }

  // Send emails with bounded concurrency, mark reminder sent BEFORE sending
  const sentCount = (
    await forEachBounded(
      agentGroups,
      5,
      async ({ agentDocId, user, leads }) => {
        // Mark all leads for this agent as reminded before sending
        const leadIds = leads.map((l) => l._id);
        await Lead.updateMany(
          { _id: { $in: leadIds } },
          { $set: { lastFollowupReminderAt: now } }
        );

        // Build the reminder email
        const overdue = leads.filter((l) => new Date(l.followUpAt!).getTime() < startOfToday.getTime());
        const dueToday = leads.filter(
          (l) => new Date(l.followUpAt!).getTime() >= startOfToday.getTime()
            && new Date(l.followUpAt!).getTime() <= endOfToday.getTime()
        );

        const html = buildFollowUpReminderEmail(
          user.name ?? "Agent",
          overdue,
          dueToday,
        );

        const totalCount = leads.length;
        const subject = overdue.length > 0
          ? `⚡ ${overdue.length} overdue follow-up${overdue.length > 1 ? "s" : ""} need attention`
          : `📋 ${totalCount} lead follow-up${totalCount > 1 ? "s" : ""} due today`;

        await sendEmail({
          to: user.email,
          subject,
          html,
          userId: user._id?.toString(),
          source: "cron-lead-followup",
          category: "leads",
        });
      },
      "lead-followup-reminder"
    )
  ).ok;

  await logActivity({
    action: "lead.cron_followup_reminder",
    resource: "leads",
    actorRole: "system",
    meta: { sentCount, totalLeads: overdueLeads.length, agentCount: byAgent.size },
    req,
  });

  return NextResponse.json({
    success: true,
    sent: sentCount,
    leadsProcessed: overdueLeads.length,
    timestamp: now.toISOString(),
  });
}

// ── Email template ──────────────────────────────────────────────────

function buildFollowUpReminderEmail(
  agentName: string,
  overdue: Array<{ companyName: string; contactPerson: string; status: string; followUpAt?: Date; country?: string }>,
  dueToday: Array<{ companyName: string; contactPerson: string; status: string; followUpAt?: Date; country?: string }>,
): string {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? process.env.NEXTAUTH_URL ?? "https://mployedin.com";

  const renderLeadRow = (lead: { companyName: string; contactPerson: string; status: string; followUpAt?: Date; country?: string }, isOverdue: boolean) => {
    const dateStr = lead.followUpAt ? new Date(lead.followUpAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "";
    const statusColor = isOverdue ? "#dc2626" : "#d97706";
    return `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:14px;font-weight:600;color:#111827">${esc(lead.companyName)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#6b7280">${esc(lead.contactPerson)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#6b7280">${lead.country ?? "—"}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6"><span style="background:${statusColor}15;color:${statusColor};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">${dateStr}</span></td>
      </tr>`;
  };

  const overdueRows = overdue.map((l) => renderLeadRow(l, true)).join("");
  const todayRows = dueToday.map((l) => renderLeadRow(l, false)).join("");

  return `
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff">
  <div style="background:linear-gradient(135deg,#0D6FD8 0%,#0A5BB8 100%);padding:28px 24px;border-radius:8px 8px 0 0;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:22px;letter-spacing:0.5px">MPLOYEDIN</h1>
    <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:13px">Lead Follow-up Reminder</p>
  </div>
  <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
    <p style="font-size:15px;color:#374151;margin:0 0 16px">Hi <strong>${esc(agentName)}</strong>,</p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 20px">You have leads that need your attention. Quick follow-ups keep the pipeline moving!</p>

    ${overdue.length > 0 ? `
    <div style="margin-bottom:20px">
      <h3 style="color:#dc2626;font-size:14px;margin:0 0 10px">🔴 Overdue (${overdue.length})</h3>
      <table style="width:100%;border-collapse:collapse;border:1px solid #fee2e2;border-radius:6px;overflow:hidden">
        <tr style="background:#fef2f2">
          <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#991b1b;text-transform:uppercase">Company</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#991b1b;text-transform:uppercase">Contact</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#991b1b;text-transform:uppercase">Country</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#991b1b;text-transform:uppercase">Due</th>
        </tr>
        ${overdueRows}
      </table>
    </div>` : ""}

    ${dueToday.length > 0 ? `
    <div style="margin-bottom:20px">
      <h3 style="color:#d97706;font-size:14px;margin:0 0 10px">🟡 Due Today (${dueToday.length})</h3>
      <table style="width:100%;border-collapse:collapse;border:1px solid #fef3c7;border-radius:6px;overflow:hidden">
        <tr style="background:#fffbeb">
          <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#92400e;text-transform:uppercase">Company</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#92400e;text-transform:uppercase">Contact</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#92400e;text-transform:uppercase">Country</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#92400e;text-transform:uppercase">Due</th>
        </tr>
        ${todayRows}
      </table>
    </div>` : ""}

    <div style="text-align:center;margin:24px 0">
      <a href="${baseUrl}/en/agent/leads" style="background:#0D6FD8;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;display:inline-block">Open Lead Pipeline</a>
    </div>

    <p style="color:#9ca3af;font-size:12px;margin:20px 0 0;text-align:center">
      Tip: Mark leads as "contacted" or update the follow-up date to stop receiving reminders.
    </p>
  </div>
  <div style="padding:12px 24px;text-align:center">
    <p style="color:#9ca3af;font-size:11px;margin:0">
      <a href="${baseUrl}/en/agent/settings" style="color:#6b7280;text-decoration:underline">Notification settings</a> · © ${new Date().getFullYear()} MPLOYEDIN
    </p>
  </div>
</div>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
