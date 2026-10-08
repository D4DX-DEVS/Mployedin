import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Lead from "@/models/Lead";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { validateBody } from "@/lib/validators";
import { leadUpdateSchema } from "@/lib/validators/leads";
import { isValidObjectId } from "@/lib/security/sanitize";
import { calculateLeadScore, deriveQualification } from "@/lib/leads/scoring";
import { autoRouteLead } from "@/lib/leads/autoRouter";
import { canAccessLead } from "@/lib/leads/access";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

/** Load the lead and refuse anyone outside its scope (see canAccessLead). */
async function verifyLeadAccess(leadId: string, ctx: AuthCtx) {
  const lead = await Lead.findById(leadId).lean() as { agentId?: unknown; superAgentId?: unknown } | null;
  if (!lead) return { lead: null, error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  if (!(await canAccessLead(ctx, lead))) {
    return { lead: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
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

  const current = await Lead.findById(id).lean() as Record<string, unknown> | null;
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // LD-2: a converted lead is linked to an employer account — its status is
  // final. (The validator already refuses "converted" as a target, LD-1.)
  if (update.status !== undefined && current.status === "converted") {
    return NextResponse.json(
      { error: "invalid_transition", message: "A converted lead's status cannot be changed" },
      { status: 409 },
    );
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

  // Status guard in the write itself, so a concurrent convert cannot be undone.
  const writeFilter: Record<string, unknown> = { _id: id };
  if (update.status !== undefined) writeFilter.status = { $ne: "converted" };
  const lead = await Lead.findOneAndUpdate(writeFilter, { $set: update }, { returnDocument: "after" });
  if (!lead) {
    return update.status !== undefined
      ? NextResponse.json({ error: "invalid_transition", message: "A converted lead's status cannot be changed" }, { status: 409 })
      : NextResponse.json({ error: "Not found" }, { status: 404 });
  }

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
