import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { validateBody, commonSchemas } from "@/lib/validators";
import { checkRateLimitDual } from "@/lib/security/rateLimit";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { notify } from "@/lib/notifications/trigger";
import { listAssignableAgents } from "@/lib/agentTasks/assigned";
import { ensurePairConversation, postPairMessage } from "@/lib/dm/teamMessage";
import User from "@/models/User";
import logger from "@/lib/logger";

/**
 * A super agent messaging their agents: everyone at once, or the agents they
 * pick. Each agent gets the text in their own private chat with the super
 * agent (the thread Messages already shows), so they reply one-to-one, plus a
 * notification (bell, email, push). Recipients are limited to the super
 * agent's team (getSuperAgentScope via listAssignableAgents); anyone else in
 * the list is skipped, never messaged.
 */

const sendSchema = z.object({
  content: z.string().trim().min(1).max(2000),
  recipients: z.union([z.literal("all"), z.array(commonSchemas.objectId).min(1).max(500)]),
});

/** Messages run per agent; a handful at a time keeps the DB and realtime calm. */
const BATCH = 10;

/** GET — the agents this super agent can message (their team), by name. */
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  if (ctx.role !== "super_agent") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await connectDB();
  return NextResponse.json({ agents: await listAssignableAgents(ctx) });
});

/** POST — send one message to all of the team, or to the chosen agents. */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_agent") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rl = await checkRateLimitDual(req, ctx.userId, { limit: 10, windowSec: 600, prefix: "sa-team-message" });
  if (!rl.allowed) return NextResponse.json({ error: "Too many messages sent. Please try again in a few minutes." }, { status: 429 });

  const { content, recipients } = await validateBody(req, sendSchema);
  await connectDB();

  const team = await listAssignableAgents(ctx);
  const teamIds = new Set(team.map((a) => a.userId));
  const targetIds = recipients === "all" ? [...teamIds] : [...new Set(recipients)].filter((id) => teamIds.has(id));
  if (targetIds.length === 0) {
    return NextResponse.json({ error: "None of these agents are in your team." }, { status: 400 });
  }

  const sender = await User.findById(ctx.userId).select("_id name email role avatar").lean<{ _id: unknown; name?: string; email?: string; role: string; avatar?: string }>();
  if (!sender) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  const agents = await User.find({ _id: { $in: targetIds } })
    .select("_id name email role avatar")
    .lean<Array<{ _id: unknown; name?: string; email?: string; role: string; avatar?: string }>>();

  const senderPerson = { ...sender, _id: String(sender._id) };
  const senderName = sender.name || sender.email || "";
  const preview = content.length > 140 ? `${content.slice(0, 140)}…` : content;
  let sent = 0;
  const failed: string[] = [];

  for (let i = 0; i < agents.length; i += BATCH) {
    await Promise.all(agents.slice(i, i + BATCH).map(async (agent) => {
      const agentId = String(agent._id);
      try {
        const { conversation } = await ensurePairConversation(senderPerson, { ...agent, _id: agentId });
        await postPairMessage(conversation, senderPerson, content);
        sent += 1;
        await notify({
          userId: agentId,
          type: "message",
          title: `New message from ${senderName}`,
          message: preview,
          link: "/agent/messages",
          sendEmail: true,
          sendPush: true,
          titleKey: "teamMessageTitle",
          bodyKey: "teamMessageBody",
          params: { name: senderName, preview },
          metadata: { conversationId: String(conversation._id), category: "super_agent_message" },
          actorId: ctx.userId,
        }).catch((err) => logger.error({ err, agentId }, "team message notify failed"));
      } catch (err) {
        logger.error({ err, agentId }, "team message send failed");
        failed.push(agentId);
      }
    }));
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "super_agent.message_agents",
    resource: "direct_messages",
    meta: { mode: recipients === "all" ? "all" : "selected", requested: recipients === "all" ? teamIds.size : recipients.length, sent, failed: failed.length },
    req,
  });

  return NextResponse.json({ sent, failed: failed.length }, { status: sent > 0 ? 201 : 500 });
});
