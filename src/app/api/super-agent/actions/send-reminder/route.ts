import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import SuperAgent from "@/models/SuperAgent";
import Agent from "@/models/Agent";
import Notification from "@/models/Notification";
import AuditLog from "@/models/AuditLog";

/**
 * POST /api/super-agent/actions/send-reminder
 *
 * Send a performance reminder notification to one or more managed agents.
 *
 * Body: { agentUserIds: string[], message?: string }
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const body = await req.json();
  const { agentUserIds, message } = body;

  if (!Array.isArray(agentUserIds) || agentUserIds.length === 0) {
    return NextResponse.json({ error: "agentUserIds array required" }, { status: 400 });
  }

  // Cap to 10 agents per request
  const targetIds = agentUserIds.slice(0, 10);

  await connectDB();

  // Verify all agents belong to this super-agent's roster
  const saProfile = await SuperAgent.findOne({ userId: ctx.userId }).select("agentIds").lean();
  const assignedAgentDocIds = (saProfile?.agentIds ?? []).map((id: unknown) => String(id));

  const agentDocs = await Agent.find({ _id: { $in: assignedAgentDocIds } }).select("userId").lean();
  const rosterUserIds = new Set(agentDocs.map((a) => a.userId.toString()));

  const validIds = targetIds.filter((id: string) => rosterUserIds.has(id));

  if (validIds.length === 0) {
    return NextResponse.json({ error: "No valid agents in your roster" }, { status: 403 });
  }

  const reminderBody = typeof message === "string" && message.trim().length > 0
    ? message.trim().slice(0, 500)
    : "Your super-agent has flagged your pipeline for review. Please check your leads and follow-ups to keep conversion momentum.";

  // Create notifications for each agent
  const notifications = validIds.map((userId: string) => ({
    userId,
    type: "system" as const,
    title: "Performance reminder from your super-agent",
    body: reminderBody,
    channels: ["in_app" as const],
    isRead: false,
    isSent: true,
    sentAt: new Date(),
    actionUrl: "/agent/leads",
    meta: { sentBy: ctx.userId, category: "performance_reminder" },
  }));

  await Notification.insertMany(notifications);

  // Audit trail
  await AuditLog.create({
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: "super_agent.send_reminder",
    resource: "notification",
    meta: {
      targetAgentUserIds: validIds,
      reminderType: "performance",
      count: validIds.length,
    },
  });

  return NextResponse.json({
    sent: validIds.length,
    message: `Reminder sent to ${validIds.length} agent${validIds.length > 1 ? "s" : ""}.`,
  });
}, { resource: "users", action: "update" });
