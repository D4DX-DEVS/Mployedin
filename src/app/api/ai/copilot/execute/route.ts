import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { connectDB } from "@/lib/db/mongoose";
import { validateBody } from "@/lib/validators";
import { copilotExecuteSchema } from "@/lib/validators/ai";
import { isValidObjectId } from "@/lib/security/sanitize";
import CopilotProposal from "@/models/CopilotProposal";
import { getToolByName, getToolsForUser } from "@/lib/ai/copilot/registry";
import type { CopilotToolContext } from "@/lib/ai/copilot/types";
import { logActivity } from "@/lib/audit/log";
import type { UserRole, PermissionMode, CustomPermissions } from "@/types/user";
import logger from "@/lib/logger";

/**
 * Confirms and runs a pending Copilot write proposal.
 *
 * The client sends back only the proposalId — never the raw args — so the
 * arguments actually executed are always the ones the model produced and the
 * user was shown, not anything the client could tamper with. Permission is
 * re-verified here from the live session (not from anything cached on the
 * proposal), so a role change or permission revocation between "propose" and
 * "confirm" is caught.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id!;
    const role = (session.user as unknown as { role: UserRole }).role;
    const locale = (session.user as unknown as { locale: string }).locale ?? "en";
    const permissionMode = ((session.user as unknown as { permissionMode?: PermissionMode }).permissionMode) ?? "role_default";
    const customPermissions = (session.user as unknown as { customPermissions?: CustomPermissions }).customPermissions;

    const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
    const { allowed, resetAt } = await checkRateLimit(`ai-copilot-execute:${userId ?? ip}`, RATE_LIMIT_CONFIGS.ai);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil((resetAt - Date.now()) / 1000)) } }
      );
    }

    const { proposalId } = await validateBody(req, copilotExecuteSchema);
    if (!isValidObjectId(proposalId)) {
      return NextResponse.json({ error: "Invalid proposalId" }, { status: 400 });
    }

    await connectDB();
    const proposal = await CopilotProposal.findById(proposalId);
    if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
    if (String(proposal.userId) !== String(userId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (proposal.status !== "pending") {
      return NextResponse.json({ error: `This action was already ${proposal.status}.`, status: proposal.status }, { status: 409 });
    }
    if (proposal.expiresAt < new Date()) {
      proposal.status = "expired";
      await proposal.save();
      return NextResponse.json({ error: "This action has expired — ask the copilot to try again." }, { status: 410 });
    }

    const tool = getToolByName(proposal.toolName);
    const permittedTools = getToolsForUser(role, permissionMode, customPermissions);
    if (!tool || !permittedTools.some((t) => t.name === tool.name)) {
      proposal.status = "failed";
      proposal.error = "Tool no longer permitted for this account.";
      await proposal.save();
      return NextResponse.json({ error: "This action is no longer permitted for your account." }, { status: 403 });
    }

    const toolCtx: CopilotToolContext = { userId, role, locale, permissionMode, customPermissions, req };

    let result;
    try {
      result = await tool.execute(proposal.args, toolCtx);
    } catch (err) {
      logger.error({ err, tool: tool.name, proposalId }, "[AI Copilot Execute] tool threw");
      proposal.status = "failed";
      proposal.error = "Internal error while executing this action.";
      await proposal.save();
      return NextResponse.json({ error: "Something went wrong executing this action." }, { status: 500 });
    }

    proposal.status = result.ok ? "executed" : "failed";
    proposal.result = result.data;
    if (!result.ok) proposal.error = result.message;
    proposal.executedAt = new Date();
    await proposal.save();

    await logActivity({
      actorId: userId,
      actorRole: role,
      action: `copilot.${tool.name}`,
      resource: tool.resource,
      meta: { args: proposal.args, ok: result.ok, message: result.message },
      req,
    });

    return NextResponse.json({ ok: result.ok, message: result.message, data: result.data });
  } catch (error) {
    if (error instanceof NextResponse) return error;
    logger.error({ error }, "[AI Copilot Execute Error]");
    return NextResponse.json({ error: "AI service error" }, { status: 500 });
  }
}

/** Cancel a pending proposal without executing it. */
export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id!;
    const { proposalId } = await validateBody(req, copilotExecuteSchema);
    if (!isValidObjectId(proposalId)) {
      return NextResponse.json({ error: "Invalid proposalId" }, { status: 400 });
    }
    await connectDB();
    const proposal = await CopilotProposal.findById(proposalId);
    if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
    if (String(proposal.userId) !== String(userId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (proposal.status === "pending") {
      proposal.status = "cancelled";
      await proposal.save();
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof NextResponse) return error;
    logger.error({ error }, "[AI Copilot Cancel Error]");
    return NextResponse.json({ error: "AI service error" }, { status: 500 });
  }
}
