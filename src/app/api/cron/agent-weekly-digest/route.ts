/**
 * GET /api/cron/agent-weekly-digest — Weekly cron
 *
 * Sends a weekly performance summary email to all active agents.
 * Includes: leads activity, interviews, target progress, commissions earned.
 * Modeled after Naukri RMS weekly recruiter digest.
 *
 * Cadence: Run Monday 8 AM UTC (start of work week).
 */

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { verifyCronRequest } from "@/lib/security/cron-auth";
import User from "@/models/User";
import Agent from "@/models/Agent";
import Lead from "@/models/Lead";
import Employer from "@/models/Employer";
import Placement from "@/models/Placement";
import Commission from "@/models/Commission";
import Interview from "@/models/Interview";
import { sendEmail } from "@/lib/communications/email";
import { logActivity } from "@/lib/audit/log";

export async function GET(req: NextRequest) {
  const authError = verifyCronRequest(req);
  if (authError) return authError;

  await connectDB();

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Get all active agents
  const agentUsers = await User.find({ role: "agent", isActive: true })
    .select("_id name email")
    .lean();

  if (agentUsers.length === 0) {
    return NextResponse.json({ sent: 0, message: "No active agents" });
  }

  let sentCount = 0;
  const errors: string[] = [];

  for (const user of agentUsers) {
    try {
      const userId = user._id.toString();

      // Get agent doc
      const agentDoc = await Agent.findOne({ userId }).select("_id").lean();
      if (!agentDoc) continue;
      const agentId = agentDoc._id.toString();

      // Parallel data fetch for this agent's week
      const [
        leadsCreated,
        leadsConverted,
        leadsContacted,
        employersAdded,
        placementsMade,
        commissionsEarned,
        interviewsScheduled,
        upcomingFollowUps,
      ] = await Promise.all([
        Lead.countDocuments({ agentId: agentDoc._id, createdAt: { $gte: weekAgo } }),
        Lead.countDocuments({ agentId: agentDoc._id, status: "converted", updatedAt: { $gte: weekAgo } }),
        Lead.countDocuments({ agentId: agentDoc._id, status: "contacted", updatedAt: { $gte: weekAgo } }),
        Employer.countDocuments({ agentId: agentDoc._id, createdAt: { $gte: weekAgo } }),
        Placement.countDocuments({ agentId: agentDoc._id, createdAt: { $gte: weekAgo } }),
        Commission.aggregate([
          { $match: { agentId: agentId, status: { $in: ["approved", "paid"] }, createdAt: { $gte: weekAgo } } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]).then((r) => r[0]?.total ?? 0),
        Interview.countDocuments({
          $or: [{ "employer.agentId": agentId }, { agentId: userId }],
          createdAt: { $gte: weekAgo },
        }),
        Lead.countDocuments({
          agentId: agentDoc._id,
          status: { $nin: ["converted", "lost"] },
          followUpAt: { $lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), $gte: now },
        }),
      ]);

      // Skip if no activity at all
      const totalActivity = leadsCreated + leadsConverted + employersAdded + placementsMade + interviewsScheduled;
      if (totalActivity === 0 && commissionsEarned === 0 && upcomingFollowUps === 0) continue;

      const html = buildAgentDigestEmail(user.name ?? "Agent", {
        leadsCreated,
        leadsConverted,
        leadsContacted,
        employersAdded,
        placementsMade,
        commissionsEarned,
        interviewsScheduled,
        upcomingFollowUps,
      });

      await sendEmail({
        to: user.email,
        subject: `📊 Your weekly performance — ${leadsCreated} leads, ${placementsMade} placements`,
        html,
        userId,
        source: "cron-agent-weekly-digest",
        category: "performance",
      });

      sentCount++;
    } catch (err) {
      errors.push(`${user.email}: ${err instanceof Error ? err.message : "Unknown"}`);
    }
  }

  await logActivity({
    action: "agent.cron_weekly_digest",
    resource: "agents",
    actorRole: "system",
    meta: { sentCount, totalAgents: agentUsers.length, errors: errors.length },
    req,
  });

  return NextResponse.json({
    success: true,
    sent: sentCount,
    totalAgents: agentUsers.length,
    errors: errors.length > 0 ? errors : undefined,
    timestamp: now.toISOString(),
  });
}

// ── Email Template ──────────────────────────────────────────────────

interface DigestData {
  leadsCreated: number;
  leadsConverted: number;
  leadsContacted: number;
  employersAdded: number;
  placementsMade: number;
  commissionsEarned: number;
  interviewsScheduled: number;
  upcomingFollowUps: number;
}

function buildAgentDigestEmail(agentName: string, data: DigestData): string {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? process.env.NEXTAUTH_URL ?? "https://mployedin.com";

  const metricCard = (emoji: string, label: string, value: string | number, color: string) => `
    <td style="padding:8px;width:25%;text-align:center">
      <div style="background:${color}08;border:1px solid ${color}25;border-radius:10px;padding:14px 8px">
        <p style="font-size:20px;margin:0">${emoji}</p>
        <p style="font-size:22px;font-weight:700;color:${color};margin:4px 0 2px">${value}</p>
        <p style="font-size:11px;color:#6b7280;margin:0">${label}</p>
      </div>
    </td>`;

  const commissionStr = data.commissionsEarned > 0
    ? data.commissionsEarned.toLocaleString(undefined, { maximumFractionDigits: 0 })
    : "0";

  return `
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff">
  <div style="background:linear-gradient(135deg,#0D6FD8 0%,#0A5BB8 100%);padding:28px 24px;border-radius:8px 8px 0 0;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:22px;letter-spacing:0.5px">MPLOYEDIN</h1>
    <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:13px">Weekly Performance Digest</p>
  </div>
  <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
    <p style="font-size:15px;color:#374151;margin:0 0 6px">Hi <strong>${esc(agentName)}</strong>,</p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 20px">Here's your performance snapshot for the past week. Keep up the momentum! 🚀</p>

    <!-- KPI Grid -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr>
        ${metricCard("🏢", "Leads Created", data.leadsCreated, "#2563eb")}
        ${metricCard("🤝", "Converted", data.leadsConverted, "#059669")}
        ${metricCard("👥", "Employers", data.employersAdded, "#7c3aed")}
        ${metricCard("✅", "Placements", data.placementsMade, "#0891b2")}
      </tr>
    </table>

    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr>
        ${metricCard("📞", "Contacted", data.leadsContacted, "#ea580c")}
        ${metricCard("📅", "Interviews", data.interviewsScheduled, "#4f46e5")}
        ${metricCard("💰", "Commission", commissionStr, "#059669")}
        ${metricCard("⏰", "Upcoming F/U", data.upcomingFollowUps, "#d97706")}
      </tr>
    </table>

    ${data.upcomingFollowUps > 0 ? `
    <div style="background:#fffbeb;border:1px solid #fef3c7;border-radius:8px;padding:14px;margin-bottom:20px">
      <p style="font-size:13px;color:#92400e;margin:0;font-weight:600">
        ⚡ You have ${data.upcomingFollowUps} follow-up${data.upcomingFollowUps > 1 ? "s" : ""} scheduled this week.
        <a href="${baseUrl}/en/agent/leads" style="color:#2563eb;text-decoration:underline;margin-left:4px">View leads →</a>
      </p>
    </div>` : ""}

    <!-- Quick Actions -->
    <div style="text-align:center;margin:24px 0">
      <table style="margin:0 auto;border-collapse:collapse">
        <tr>
          <td style="padding:0 6px">
            <a href="${baseUrl}/en/agent/leads" style="background:#0D6FD8;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;font-size:13px;display:inline-block">Leads</a>
          </td>
          <td style="padding:0 6px">
            <a href="${baseUrl}/en/agent/target-management" style="background:#7c3aed;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;font-size:13px;display:inline-block">Targets</a>
          </td>
          <td style="padding:0 6px">
            <a href="${baseUrl}/en/agent/commissions" style="background:#059669;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;font-size:13px;display:inline-block">Commissions</a>
          </td>
        </tr>
      </table>
    </div>

    <p style="color:#9ca3af;font-size:12px;margin:20px 0 0;text-align:center">
      This digest is sent every Monday. 
      <a href="${baseUrl}/en/agent/settings" style="color:#6b7280;text-decoration:underline">Manage notifications</a>
    </p>
  </div>
  <div style="padding:12px 24px;text-align:center">
    <p style="color:#9ca3af;font-size:11px;margin:0">© ${new Date().getFullYear()} MPLOYEDIN</p>
  </div>
</div>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
