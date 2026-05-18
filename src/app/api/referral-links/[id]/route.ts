import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import ReferralLink from "@/models/ReferralLink";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import { validateBody } from "@/lib/validators";
import { referralLinkUpdateSchema } from "@/lib/validators/referral-links";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import crypto from "crypto";

function generateCode(): string {
  return `MPL-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

interface AuthCtx {
  userId: string;
  role: string;
  locale: string;
}

/** Check if the super-agent owns a link (direct or via their agents) */
async function canSuperAgentAccess(userId: string, linkCreatorId: string): Promise<boolean> {
  if (linkCreatorId === userId) return true;
  const sa = await SuperAgent.findOne({ userId }).select("agentIds").lean();
  if (!sa?.agentIds?.length) return false;
  const agents = await Agent.find({ _id: { $in: sa.agentIds } }).select("userId").lean();
  return agents.some((a) => a.userId.toString() === linkCreatorId);
}

/**
 * GET /api/referral-links/[id]
 * Get a single referral link with full registration details
 */
async function handleGet(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  await connectDB();
  const id = params?.id;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const link = await ReferralLink.findById(id)
    .populate("createdBy", "name email")
    .lean();

  if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Agents can only see their own links; super-agents can see own + agents' links
  if (ctx.role === "agent" && link.createdBy?._id?.toString() !== ctx.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (ctx.role === "super_agent" && !(await canSuperAgentAccess(ctx.userId, link.createdBy?._id?.toString()))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ link });
}

/**
 * PATCH /api/referral-links/[id]
 * Update label, isActive, maxUses, expiresAt
 */
async function handlePatch(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  await connectDB();
  const id = params?.id;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const link = await ReferralLink.findById(id);
  if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Only creator, owning super-agent, or admin can update
  if (ctx.role === "admin") {
    // Admin can update any link
  } else if (ctx.role === "super_agent") {
    if (!(await canSuperAgentAccess(ctx.userId, link.createdBy.toString()))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (link.createdBy.toString() !== ctx.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await validateBody(req, referralLinkUpdateSchema);

  // If re-enabling a disabled link, create a NEW link with a fresh code instead
  if (body.isActive === true && !link.isActive) {
    // Generate unique code
    let code = generateCode();
    let attempts = 0;
    while (await ReferralLink.exists({ code })) {
      code = generateCode();
      attempts++;
      if (attempts > 10) {
        return NextResponse.json({ error: "Failed to generate unique code" }, { status: 500 });
      }
    }

    const newLink = await ReferralLink.create({
      code,
      createdBy: link.createdBy,
      creatorRole: link.creatorRole,
      ...(link.agentId ? { agentId: link.agentId } : {}),
      ...(link.superAgentId ? { superAgentId: link.superAgentId } : {}),
      label: body.label ?? link.label,
      maxUses: body.maxUses ?? link.maxUses,
      expiresAt: body.expiresAt !== undefined
        ? (body.expiresAt ? new Date(body.expiresAt) : undefined)
        : link.expiresAt,
      isActive: true,
    });

    // Update the agent/super-agent referral code to the new one
    if (link.creatorRole === "agent" && link.agentId) {
      await Agent.findByIdAndUpdate(link.agentId, { referralCode: code });
    } else if (link.creatorRole === "super_agent" && link.superAgentId) {
      await SuperAgent.findByIdAndUpdate(link.superAgentId, { referralCode: code });
    }

    await logActivity({
      ...actorFromCtx(ctx),
      action: "referral_link.regenerate",
      resource: "referral_links",
      resourceId: newLink._id.toString(),
      meta: { oldCode: link.code, newCode: code, oldLinkId: id },
      req,
    });

    return NextResponse.json({ link: newLink, regenerated: true, oldLinkId: id });
  }

  if (body.label !== undefined) link.label = body.label;
  if (body.isActive !== undefined) link.isActive = body.isActive;
  if (body.maxUses !== undefined) link.maxUses = body.maxUses;
  if (body.expiresAt !== undefined) {
    link.expiresAt = body.expiresAt ? new Date(body.expiresAt) : undefined;
  }

  await link.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "referral_link.update",
    resource: "referral_links",
    resourceId: id,
    changes: { after: { label: body.label, isActive: body.isActive, maxUses: body.maxUses, expiresAt: body.expiresAt } },
    req,
  });

  return NextResponse.json({ link });
}

/**
 * DELETE /api/referral-links/[id]
 * Soft-delete (deactivate) a referral link
 */
async function handleDelete(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  await connectDB();
  const id = params?.id;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const link = await ReferralLink.findById(id);
  if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Only creator, owning super-agent, or admin can delete
  if (ctx.role === "admin") {
    // Admin can delete any link
  } else if (ctx.role === "super_agent") {
    if (!(await canSuperAgentAccess(ctx.userId, link.createdBy.toString()))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (link.createdBy.toString() !== ctx.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  link.isActive = false;
  await link.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "referral_link.delete",
    resource: "referral_links",
    resourceId: id,
    meta: { code: link.code },
    req,
  });

  return NextResponse.json({ success: true });
}

export const GET = withAuth(handleGet);
export const PATCH = withAuth(handlePatch);
export const DELETE = withAuth(handleDelete);
