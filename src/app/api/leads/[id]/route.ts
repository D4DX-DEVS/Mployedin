import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Lead from "@/models/Lead";
import Agent from "@/models/Agent";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { validateBody } from "@/lib/validators";
import { leadUpdateSchema } from "@/lib/validators/leads";
import { isValidObjectId } from "@/lib/security/sanitize";
import { calculateLeadScore, deriveQualification } from "@/lib/leads/scoring";
import { autoRouteLead } from "@/lib/leads/autoRouter";
import { getSuperAgentScope } from "@/lib/auth/agentRestrictions";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

/** Verify agent owns this lead, or user is super_agent/admin */
async function verifyLeadAccess(leadId: string, ctx: AuthCtx) {
  const lead = await Lead.findById(leadId).lean() as { agentId?: unknown; superAgentId?: unknown } | null;
  if (!lead) return { lead: null, error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  if (ctx.role === "agent") {
    const agentDoc = await Agent.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!agentDoc || String(lead.agentId) !== String(agentDoc._id)) {
      return { lead: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }
  } else if (ctx.role === "super_agent") {
    // Scope super-agents to their own team/region. Without this a super_agent
    // could read/modify/delete/convert leads owned by another team's agents
    // (cross-team data + commission fraud).
    const scope = await getSuperAgentScope(ctx.userId);
    const inScope = Boolean(
      scope && (
        String(lead.superAgentId ?? "") === String(scope.saProfileId) ||
        scope.effectiveAgentIds.map(String).includes(String(lead.agentId ?? ""))
      )
    );
    if (!inScope) {
      return { lead: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }
  }
  // admin (and any other leads-permitted role) falls through to full access.
  return { lead, error: null };
}

export const GET = withAuth(async (req: NextRequest, ctx: AuthCtx) => {
  const id = req.nextUrl.pathname.split("/").at(-1);
  if (!isValidObjectId(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();
  const { lead, error } = await verifyLeadAccess(id!, ctx);
  if (error) return error;
  return NextResponse.json(lead);
}, { resource: "leads", action: "read" });

export const PATCH = withAuth(async (req: NextRequest, ctx: AuthCtx) => {
  const id = req.nextUrl.pathname.split("/").at(-1);
  if (!isValidObjectId(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();
  const { error } = await verifyLeadAccess(id!, ctx);
  if (error) return error;

  const body = await validateBody(req, leadUpdateSchema);
  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) if (v !== undefined) update[k] = v;

  // Auto-set convertedAt when status transitions to "converted"
  const current = await Lead.findById(id).lean() as Record<string, unknown> | null;
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (update.status === "converted" && current.status !== "converted") {
    update.convertedAt = new Date();
  }

  // Re-route if country changed and lead has no manual superAgent assignment
  if (update.country && !current.superAgentId) {
    const routeResult = await autoRouteLead({
      country: update.country as string,
      city: (update.city ?? current.city) as string | undefined,
      superAgentId: undefined,
    });
    if (routeResult) {
      update.territoryId = routeResult.territoryId;
      update.superAgentId = routeResult.superAgentId;
      update.autoRouted = true;
    }
  }

  // Recalculate score with merged state
  const mergedStatus = (update.status ?? current.status) as string;
  const mergedEmail = update.contactEmail ?? current.contactEmail;
  const mergedPhone = update.contactPhone ?? current.contactPhone;
  const mergedRevenue = update.expectedRevenue ?? current.expectedRevenue;
  const mergedIndustry = update.industry ?? current.industry;
  const activityCount = Array.isArray(current.activityLog) ? current.activityLog.length : 0;

  const score = calculateLeadScore({
    status: mergedStatus as Parameters<typeof calculateLeadScore>[0]["status"],
    hasEmail: !!mergedEmail,
    hasPhone: !!mergedPhone,
    hasExpectedRevenue: !!mergedRevenue,
    hasIndustry: !!mergedIndustry,
    activityCount,
  });
  update.score = score;
  update.qualificationLevel = deriveQualification(score);

  const lead = await Lead.findByIdAndUpdate(id, { $set: update }, { returnDocument: "after" });
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "lead.update",
    resource: "leads",
    resourceId: id,
    changes: { after: update },
    req,
  });

  return NextResponse.json(lead);
}, { resource: "leads", action: "update" });

export const DELETE = withAuth(async (req: NextRequest, ctx: AuthCtx) => {
  const id = req.nextUrl.pathname.split("/").at(-1);
  if (!isValidObjectId(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();
  const { error } = await verifyLeadAccess(id!, ctx);
  if (error) return error;

  await Lead.findByIdAndDelete(id);

  await logActivity({
    ...actorFromCtx(ctx),
    action: "lead.delete",
    resource: "leads",
    resourceId: id,
    req,
  });

  return NextResponse.json({ message: "Lead deleted" });
}, { resource: "leads", action: "delete" });
